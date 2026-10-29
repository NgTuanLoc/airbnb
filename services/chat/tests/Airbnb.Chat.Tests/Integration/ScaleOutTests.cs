using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;
using static Airbnb.Chat.Tests.Integration.ChatFixture;
using static Airbnb.Chat.Tests.Integration.HubTests;

namespace Airbnb.Chat.Tests.Integration;

// Two instances, as in the AppHost: people connected to different ones still hear each other (Redis backplane).
public sealed class ScaleOutTests(ChatFixture fixture)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task A_message_reaches_a_client_on_the_other_instance()
    {
        await using var other = fixture.StartInstance();
        var (host, guest) = (NewUserId(), NewUserId());
        var id = await fixture.StartConversationAsync(NewListingId(), host, guest, Ct);
        await using var guestHere = await fixture.ConnectAsync(TokenFor(guest), Ct);
        await using var hostThere = await ConnectAsync(AddressOf(other), TokenFor(host), Ct);
        var toHost = Events(hostThere, "message");

        var sent = await guestHere.InvokeAsync<JsonElement>("Send", id, "Hello from the other instance", Ct);

        Assert.Equal(sent.GetProperty("id").GetString(), (await NextAsync(toHost)).GetProperty("id").GetString());
    }

    [Fact]
    public async Task Sending_too_fast_is_refused()
    {
        await using var strict = fixture.StartInstance(builder => builder.UseSetting("Chat:MessagesPerMinute", "3"));
        var (host, guest) = (NewUserId(), NewUserId());
        var id = await fixture.StartConversationAsync(NewListingId(), host, guest, Ct);
        await using var connection = await ConnectAsync(AddressOf(strict), TokenFor(guest), Ct);

        for (var i = 1; i <= 3; i++)
        {
            await connection.InvokeAsync<JsonElement>("Send", id, $"Message {i}", Ct);
        }
        var refused = await Assert.ThrowsAsync<HubException>(() => connection.InvokeAsync<JsonElement>("Send", id, "One too many", Ct));

        Assert.Contains("too fast", refused.Message);
        Assert.Equal(3, (await connection.InvokeAsync<List<JsonElement>>("GetMessages", id, Ct)).Count);
    }
}
