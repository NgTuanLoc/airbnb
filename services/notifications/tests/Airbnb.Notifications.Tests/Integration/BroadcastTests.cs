using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using System.Net.ServerSentEvents;
using System.Text.Json;
using Airbnb.Notifications.Broadcasts;
using Microsoft.AspNetCore.Hosting;

namespace Airbnb.Notifications.Tests.Integration;

// The announcements stream (GET /events, Server-Sent Events) and the admin broadcast (POST /broadcasts), read the way a
// browser's EventSource reads them.
public sealed class BroadcastTests(ServiceFixture fixture)
{
    private static readonly TimeSpan ReadTimeout = TimeSpan.FromSeconds(30);

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task A_broadcast_reaches_every_open_page()
    {
        using var client = fixture.Service.CreateClient();
        await using var first = await OpenAsync(client);
        await using var second = await OpenAsync(client);
        // A ping proves each stream is open and listening.
        await first.NextAsync(BroadcastHub.PingType);
        await second.NextAsync(BroadcastHub.PingType);

        using var sent = await BroadcastAsync(client, "  Maintenance tonight at 10pm  ");

        Assert.Equal(HttpStatusCode.OK, sent.StatusCode);
        Assert.True((await sent.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("listeners").GetInt32() >= 2);
        foreach (var page in new[] { first, second })
        {
            var item = await page.NextAsync(BroadcastHub.EventType);
            var broadcast = JsonSerializer.Deserialize<JsonElement>(item.Data);
            Assert.Equal("Maintenance tonight at 10pm", broadcast.GetProperty("text").GetString());
            Assert.Equal(broadcast.GetProperty("id").GetInt64().ToString(CultureInfo.InvariantCulture), item.EventId);
        }
    }

    [Fact]
    public async Task A_page_that_reconnects_gets_what_it_missed()
    {
        using var client = fixture.Service.CreateClient();
        using var seen = await BroadcastAsync(client, "Seen before the reconnect");
        using var missed = await BroadcastAsync(client, "Sent while the page was away");
        var seenId = (await seen.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("id").GetInt64();

        await using var page = await OpenAsync(client, lastEventId: seenId.ToString(CultureInfo.InvariantCulture));

        var replayed = JsonSerializer.Deserialize<JsonElement>((await page.NextAsync(BroadcastHub.EventType)).Data);
        Assert.Equal("Sent while the page was away", replayed.GetProperty("text").GetString());
    }

    [Fact]
    public async Task Broadcasting_needs_the_admin_key()
    {
        using var client = fixture.Service.CreateClient();
        using var noKey = await BroadcastAsync(client, "Hello", key: null);
        using var wrongKey = await BroadcastAsync(client, "Hello", key: "not-the-key");
        await using var keyless = fixture.Factory(adminKey: null);
        using var keylessClient = keyless.CreateClient();
        using var unconfigured = await BroadcastAsync(keylessClient, "Hello");

        Assert.Equal(HttpStatusCode.Unauthorized, noKey.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, wrongKey.StatusCode);
        // Without a configured key the endpoint doesn't exist.
        Assert.Equal(HttpStatusCode.NotFound, unconfigured.StatusCode);
    }

    [Theory]
    [InlineData("   ")]
    [InlineData(null)]
    public async Task An_empty_message_is_refused(string? text)
    {
        using var client = fixture.Service.CreateClient();

        using var response = await BroadcastAsync(client, text);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("invalid_message", (await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task A_message_over_500_characters_is_refused()
    {
        using var client = fixture.Service.CreateClient();

        using var response = await BroadcastAsync(client, new string('a', 501));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Pages_past_the_listener_limit_are_turned_away()
    {
        await using var limited = fixture.Factory(ServiceFixture.AdminKey,
            builder => builder.UseSetting("Notifications:MaxListeners", "1"));
        using var client = limited.CreateClient();
        await using var first = await OpenAsync(client);
        await first.NextAsync(BroadcastHub.PingType);

        using var second = await client.GetAsync("/events", HttpCompletionOption.ResponseHeadersRead, Ct);

        Assert.Equal(HttpStatusCode.ServiceUnavailable, second.StatusCode);
    }

    private static async Task<HttpResponseMessage> BroadcastAsync(HttpClient client, string? text, string? key = ServiceFixture.AdminKey)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/broadcasts") { Content = JsonContent.Create(new { text }) };
        if (key is not null)
        {
            request.Headers.Add("X-Admin-Key", key);
        }
        return await client.SendAsync(request, Ct);
    }

    private static async Task<EventStream> OpenAsync(HttpClient client, string? lastEventId = null)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "/events");
        if (lastEventId is not null)
        {
            request.Headers.Add("Last-Event-ID", lastEventId);
        }
        var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, Ct);
        response.EnsureSuccessStatusCode();
        Assert.Equal("text/event-stream", response.Content.Headers.ContentType?.MediaType);
        var timeout = CancellationTokenSource.CreateLinkedTokenSource(Ct);
        timeout.CancelAfter(ReadTimeout);
        var stream = await response.Content.ReadAsStreamAsync(Ct);
        return new EventStream(response, timeout, SseParser.Create(stream).EnumerateAsync(timeout.Token).GetAsyncEnumerator(timeout.Token));
    }

    // An open page: reads its events in order and skips the ones a test isn't waiting for.
    private sealed class EventStream(HttpResponseMessage response, CancellationTokenSource timeout, IAsyncEnumerator<SseItem<string>> events)
        : IAsyncDisposable
    {
        public async Task<SseItem<string>> NextAsync(string eventType)
        {
            while (await events.MoveNextAsync())
            {
                if (events.Current.EventType == eventType)
                {
                    return events.Current;
                }
            }
            throw new InvalidOperationException($"The stream ended before a '{eventType}' event");
        }

        public async ValueTask DisposeAsync()
        {
            await events.DisposeAsync();
            response.Dispose();
            timeout.Dispose();
        }
    }
}
