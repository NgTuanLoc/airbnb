using System.Text.Json;
using Microsoft.AspNetCore.SignalR.Client;
using static Airbnb.Chat.Tests.Integration.ChatFixture;
using static Airbnb.Chat.Tests.Integration.HubTests;

namespace Airbnb.Chat.Tests.Integration;

// Seed listings' hosts have no accounts: the service answers once for them, live, so one person can try chat.
public sealed class DemoHostTests(ChatFixture fixture)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    // Long enough after the delay that a second reply, if any, would have arrived.
    private static readonly TimeSpan Quiet = AutoReplyDelay * 5;

    [Fact]
    public async Task A_demo_host_replies_once()
    {
        var (host, guest) = (NewUserId(), NewUserId());
        var id = await fixture.StartConversationAsync(NewListingId(), host, guest, Ct, hostIsDemo: true);
        await using var connection = await fixture.ConnectAsync(TokenFor(guest, "Gus Guest"), Ct);
        var received = Events(connection, "message");

        await Task.WhenAll(
            connection.InvokeAsync<JsonElement>("Send", id, "Is it free in May?", Ct),
            connection.InvokeAsync<JsonElement>("Send", id, "And June?", Ct));
        var events = new List<JsonElement>();
        for (var i = 0; i < 3; i++)
        {
            events.Add(await NextAsync(received));
        }
        await Task.Delay(Quiet, Ct);

        var reply = Assert.Single(events, e => e.GetProperty("senderId").GetString() == host);
        Assert.Contains("Gus Guest", reply.GetProperty("text").GetString());
        Assert.False(received.TryRead(out _), "a second automatic reply arrived");
        Assert.Equal(3, (await connection.InvokeAsync<List<JsonElement>>("GetMessages", id, Ct)).Count);
        Assert.Equal(1, (await connection.InvokeAsync<List<JsonElement>>("ListConversations", Ct))[0].GetProperty("unread").GetInt32());
    }

    [Fact]
    public async Task Real_hosts_get_no_automatic_reply()
    {
        var (host, guest) = (NewUserId(), NewUserId());
        var id = await fixture.StartConversationAsync(NewListingId(), host, guest, Ct, hostIsDemo: false);
        await using var connection = await fixture.ConnectAsync(TokenFor(guest), Ct);

        await connection.InvokeAsync<JsonElement>("Send", id, "Hello?", Ct);
        await Task.Delay(Quiet, Ct);

        Assert.Single(await connection.InvokeAsync<List<JsonElement>>("GetMessages", id, Ct));
    }
}
