using System.Text.Json;
using System.Threading.Channels;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;
using static Airbnb.Chat.Tests.Integration.ChatFixture;

namespace Airbnb.Chat.Tests.Integration;

// The hub as browsers use it: a JWT from the Identity module, WebSockets, membership checked on every call.
public sealed class HubTests(ChatFixture fixture)
{
    private static readonly TimeSpan EventTimeout = TimeSpan.FromSeconds(10);

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    // Every `name` event the connection receives, in order.
    internal static ChannelReader<JsonElement> Events(HubConnection connection, string name)
    {
        var events = Channel.CreateUnbounded<JsonElement>();
        connection.On<JsonElement>(name, payload => events.Writer.TryWrite(payload));
        return events.Reader;
    }

    internal static async Task<JsonElement> NextAsync(ChannelReader<JsonElement> events)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(Ct);
        timeout.CancelAfter(EventTimeout);
        return await events.ReadAsync(timeout.Token);
    }

    private async Task<(string Id, string Host, string Guest)> ConversationAsync()
    {
        var (host, guest) = (NewUserId(), NewUserId());
        return (await fixture.StartConversationAsync(NewListingId(), host, guest, Ct), host, guest);
    }

    public static TheoryData<string> BadTokens() =>
    [
        "none",
        "expired",
        "wrong audience",
        "wrong key",
    ];

    [Theory]
    [MemberData(nameof(BadTokens))]
    public async Task The_hub_refuses_bad_tokens(string kind)
    {
        var user = NewUserId();
        var token = kind switch
        {
            "expired" => TokenFor(user, lifetime: TimeSpan.FromMinutes(-2)),
            "wrong audience" => TokenFor(user, audience: "payments"),
            "wrong key" => TokenFor(user, key: "another-signing-key-0123456789abcdef"),
            _ => "",
        };

        // Refused by authentication (401), not merely unreachable.
        var refused = await Assert.ThrowsAnyAsync<Exception>(() => fixture.ConnectAsync(token, Ct));
        Assert.Contains("401", refused.Message);
    }

    [Fact]
    public async Task The_hub_takes_the_token_from_the_query_string()
    {
        // Browsers can't set headers on a WebSocket, so the JavaScript client sends access_token in the URL.
        var token = TokenFor(NewUserId());
        await using var connection = new HubConnectionBuilder()
            .WithUrl(new Uri(fixture.BaseAddress, $"/hub?access_token={Uri.EscapeDataString(token)}"), options =>
            {
                options.SkipNegotiation = true;
                options.Transports = HttpTransportType.WebSockets;
            })
            .Build();

        await connection.StartAsync(Ct);

        Assert.Empty(await connection.InvokeAsync<List<JsonElement>>("ListConversations", Ct));
    }

    [Fact]
    public async Task An_expired_token_closes_the_connection()
    {
        await using var connection = await fixture.ConnectAsync(TokenFor(NewUserId(), lifetime: TimeSpan.FromSeconds(3)), Ct);
        var closed = new TaskCompletionSource();
        connection.Closed += _ =>
        {
            closed.TrySetResult();
            return Task.CompletedTask;
        };

        await closed.Task.WaitAsync(TimeSpan.FromSeconds(20), Ct);

        Assert.Equal(HubConnectionState.Disconnected, connection.State);
    }

    [Fact]
    public async Task Participants_see_their_conversations_and_messages()
    {
        var (host, guest) = (NewUserId(), NewUserId());
        var older = await fixture.StartConversationAsync(NewListingId(), host, guest, Ct);
        var newer = await fixture.StartConversationAsync(NewListingId(), host, guest, Ct);
        await using var guestConnection = await fixture.ConnectAsync(TokenFor(guest, "Gus Guest"), Ct);
        await using var hostConnection = await fixture.ConnectAsync(TokenFor(host, "Hana Host"), Ct);

        await guestConnection.InvokeAsync<JsonElement>("Send", older, "First about the older one", Ct);
        await guestConnection.InvokeAsync<JsonElement>("Send", newer, "Hello", Ct);
        await hostConnection.InvokeAsync<JsonElement>("Send", newer, "Hi there", Ct);

        var asGuest = await guestConnection.InvokeAsync<List<JsonElement>>("ListConversations", Ct);
        Assert.Equal([newer, older], asGuest.Select(c => c.GetProperty("id").GetString()));
        var latest = asGuest[0];
        Assert.Equal("guest", latest.GetProperty("role").GetString());
        Assert.Equal("Hana Host", latest.GetProperty("otherName").GetString());
        Assert.Equal("Sunny cabin", latest.GetProperty("listingTitle").GetString());
        Assert.Equal("Hi there", latest.GetProperty("lastMessageText").GetString());
        Assert.Equal(1, latest.GetProperty("unread").GetInt32());

        var asHost = await hostConnection.InvokeAsync<List<JsonElement>>("ListConversations", Ct);
        Assert.Equal("host", asHost[0].GetProperty("role").GetString());
        Assert.Equal("Gus Guest", asHost[0].GetProperty("otherName").GetString());

        var thread = await hostConnection.InvokeAsync<List<JsonElement>>("GetMessages", newer, Ct);
        Assert.Equal(["Hello", "Hi there"], thread.Select(m => m.GetProperty("text").GetString()));
        Assert.Equal([guest, host], thread.Select(m => m.GetProperty("senderId").GetString()));
    }

    [Fact]
    public async Task Strangers_get_not_found()
    {
        var (id, _, _) = await ConversationAsync();
        await using var stranger = await fixture.ConnectAsync(TokenFor(NewUserId()), Ct);

        var read = await Assert.ThrowsAsync<HubException>(() => stranger.InvokeAsync<List<JsonElement>>("GetMessages", id, Ct));
        var write = await Assert.ThrowsAsync<HubException>(() => stranger.InvokeAsync<JsonElement>("Send", id, "Let me in", Ct));
        var mark = await Assert.ThrowsAsync<HubException>(() => stranger.InvokeAsync("MarkRead", id, Ct));

        Assert.All([read, write, mark], e => Assert.Contains("Conversation not found", e.Message));
        Assert.Empty(await stranger.InvokeAsync<List<JsonElement>>("ListConversations", Ct));
    }

    [Fact]
    public async Task A_message_reaches_both_people()
    {
        var (id, host, guest) = await ConversationAsync();
        await using var guestTab = await fixture.ConnectAsync(TokenFor(guest), Ct);
        await using var guestOtherTab = await fixture.ConnectAsync(TokenFor(guest), Ct);
        await using var hostTab = await fixture.ConnectAsync(TokenFor(host), Ct);
        var toGuest = Events(guestOtherTab, "message");
        var toHost = Events(hostTab, "message");

        var sent = await guestTab.InvokeAsync<JsonElement>("Send", id, "Is the cabin free in May?", Ct);

        Assert.StartsWith("msg_", sent.GetProperty("id").GetString());
        foreach (var received in new[] { await NextAsync(toGuest), await NextAsync(toHost) })
        {
            Assert.Equal(sent.GetProperty("id").GetString(), received.GetProperty("id").GetString());
            Assert.Equal(id, received.GetProperty("conversationId").GetString());
            Assert.Equal("Is the cabin free in May?", received.GetProperty("text").GetString());
            Assert.Equal(guest, received.GetProperty("senderId").GetString());
        }
    }

    [Fact]
    public async Task Unread_counts_and_mark_read()
    {
        var (id, host, guest) = await ConversationAsync();
        await using var guestTab = await fixture.ConnectAsync(TokenFor(guest), Ct);
        await using var hostTab = await fixture.ConnectAsync(TokenFor(host), Ct);
        await using var hostOtherTab = await fixture.ConnectAsync(TokenFor(host), Ct);
        var readElsewhere = Events(hostOtherTab, "read");

        await guestTab.InvokeAsync<JsonElement>("Send", id, "One", Ct);
        await guestTab.InvokeAsync<JsonElement>("Send", id, "Two", Ct);
        Assert.Equal(2, (await hostTab.InvokeAsync<List<JsonElement>>("ListConversations", Ct))[0].GetProperty("unread").GetInt32());
        Assert.Equal(0, (await guestTab.InvokeAsync<List<JsonElement>>("ListConversations", Ct))[0].GetProperty("unread").GetInt32());

        await hostTab.InvokeAsync("MarkRead", id, Ct);

        Assert.Equal(id, (await NextAsync(readElsewhere)).GetProperty("conversationId").GetString());
        Assert.Equal(0, (await hostTab.InvokeAsync<List<JsonElement>>("ListConversations", Ct))[0].GetProperty("unread").GetInt32());
    }

    [Fact]
    public async Task Text_is_validated()
    {
        var (id, _, guest) = await ConversationAsync();
        await using var connection = await fixture.ConnectAsync(TokenFor(guest), Ct);

        foreach (var bad in new[] { "", "   ", new string('a', 2001) })
        {
            await Assert.ThrowsAsync<HubException>(() => connection.InvokeAsync<JsonElement>("Send", id, bad, Ct));
        }
        var trimmed = await connection.InvokeAsync<JsonElement>("Send", id, "  hi  ", Ct);

        Assert.Equal("hi", trimmed.GetProperty("text").GetString());
        Assert.Single(await connection.InvokeAsync<List<JsonElement>>("GetMessages", id, Ct));
    }
}
