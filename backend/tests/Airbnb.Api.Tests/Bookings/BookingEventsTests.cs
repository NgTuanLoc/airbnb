using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Airbnb.Api.Tests.Infrastructure;
using RabbitMQ.Client;
using static Airbnb.Api.Tests.Bookings.BookingRequests;

namespace Airbnb.Api.Tests.Bookings;

// What the notification service (and anyone else) hears from Bookings: events on the "bookings" fanout exchange.
// Each test binds its own throwaway queue, so it sees every event published after it starts listening.
public sealed class BookingEventsTests(InfrastructureFixture infrastructure)
{
    private static readonly TimeSpan EventTimeout = TimeSpan.FromSeconds(20);

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private sealed class Listener : IAsyncDisposable
    {
        private readonly IConnection _connection;
        private readonly IChannel _channel;
        private readonly string _queue;

        private Listener(IConnection connection, IChannel channel, string queue) =>
            (_connection, _channel, _queue) = (connection, channel, queue);

        public static async Task<Listener> StartAsync(string connectionString)
        {
            var connection = await new ConnectionFactory { Uri = new Uri(connectionString) }.CreateConnectionAsync(Ct);
            var channel = await connection.CreateChannelAsync(cancellationToken: Ct);
            // The API declares the exchange at startup; declaring it here too (same settings) makes the order irrelevant.
            await channel.ExchangeDeclareAsync("bookings", ExchangeType.Fanout, durable: true, cancellationToken: Ct);
            var queue = (await channel.QueueDeclareAsync(exclusive: true, cancellationToken: Ct)).QueueName;
            await channel.QueueBindAsync(queue, "bookings", routingKey: "", cancellationToken: Ct);
            return new Listener(connection, channel, queue);
        }

        // The events of one booking, by message type, waiting up to the timeout for the expected count.
        public Task<List<(string Type, JsonElement Body)>> EventsForAsync(string bookingId, int expected) =>
            EventsAsync(body => body.TryGetProperty("bookingId", out var id) && id.GetString() == bookingId, expected, EventTimeout);

        public async Task<List<(string Type, JsonElement Body)>> EventsAsync(Func<JsonElement, bool> matches, int expected, TimeSpan timeout)
        {
            var found = new List<(string, JsonElement)>();
            var deadline = DateTime.UtcNow + timeout;
            while (found.Count < expected && DateTime.UtcNow < deadline)
            {
                var result = await _channel.BasicGetAsync(_queue, autoAck: true, Ct);
                if (result is null)
                {
                    await Task.Delay(100, Ct);
                    continue;
                }
                var body = JsonDocument.Parse(result.Body).RootElement;
                if (matches(body))
                {
                    // Wolverine sends the message identity as AMQP's standard type property.
                    var type = result.BasicProperties.Type!;
                    found.Add((type, body));
                }
            }
            return found;
        }

        public async ValueTask DisposeAsync()
        {
            await _channel.DisposeAsync();
            await _connection.DisposeAsync();
        }
    }

    private static async Task<string> BookingIdAsync(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("data").GetProperty("id").GetString()!;
    }

    [Fact]
    public async Task Confirming_publishes_booking_confirmed()
    {
        await using var factory = Factory(infrastructure);
        using var client = factory.CreateClient();
        await using var listener = await Listener.StartAsync(infrastructure.MessagingConnectionString);
        var guest = await AuthHelpers.RegisterAsync(client, "Gus");
        var checkIn = RandomMonth();

        using var booked = await BookAsync(client, guest.Token, Stay("l13", checkIn, 3));
        var id = await BookingIdAsync(booked);

        var (type, body) = Assert.Single(await listener.EventsForAsync(id, 1));
        Assert.Equal("booking-confirmed", type);
        Assert.Equal(
            ["bookingId", "listingId", "listingTitle", "guestName", "guestEmail", "checkIn", "checkOut", "adults", "children", "total", "confirmedAt"],
            body.EnumerateObject().Select(p => p.Name).ToArray());
        Assert.Equal("l13", body.GetProperty("listingId").GetString());
        Assert.False(string.IsNullOrWhiteSpace(body.GetProperty("listingTitle").GetString()));
        Assert.Equal("Gus", body.GetProperty("guestName").GetString());
        Assert.Equal(guest.Email, body.GetProperty("guestEmail").GetString());
        Assert.Equal(checkIn.ToString("yyyy-MM-dd"), body.GetProperty("checkIn").GetString());
        Assert.Equal(checkIn.AddDays(3).ToString("yyyy-MM-dd"), body.GetProperty("checkOut").GetString());
        Assert.Equal(2, body.GetProperty("adults").GetInt32());
    }

    [Fact]
    public async Task Cancelling_publishes_booking_cancelled()
    {
        await using var factory = Factory(infrastructure);
        using var client = factory.CreateClient();
        await using var listener = await Listener.StartAsync(infrastructure.MessagingConnectionString);
        var guest = await AuthHelpers.RegisterAsync(client);
        using var booked = await BookAsync(client, guest.Token, Stay("l13", RandomMonth(), 2));
        var id = await BookingIdAsync(booked);

        using var cancel = new HttpRequestMessage(HttpMethod.Post, $"/api/bookings/{id}/cancel").Authorized(guest.Token);
        using var cancelled = await client.SendAsync(cancel, Ct);
        Assert.Equal(HttpStatusCode.OK, cancelled.StatusCode);

        var events = await listener.EventsForAsync(id, 2);
        Assert.Equal(["booking-confirmed", "booking-cancelled"], events.Select(e => e.Type).ToArray());
        Assert.Equal(
            ["bookingId", "listingId", "listingTitle", "guestName", "guestEmail", "checkIn", "checkOut", "cancelledAt"],
            events[1].Body.EnumerateObject().Select(p => p.Name).ToArray());
    }

    [Fact]
    public async Task Overlapping_booking_publishes_nothing()
    {
        await using var factory = Factory(infrastructure);
        using var client = factory.CreateClient();
        await using var listener = await Listener.StartAsync(infrastructure.MessagingConnectionString);
        var first = await AuthHelpers.RegisterAsync(client);
        var second = await AuthHelpers.RegisterAsync(client);
        var month = RandomMonth();
        using var booked = await BookAsync(client, first.Token, Stay("l13", month, 3));
        var id = await BookingIdAsync(booked);

        using var refused = await BookAsync(client, second.Token, Stay("l13", month.AddDays(1), 3));
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);

        // The first booking's event arrives; nothing about the refused guest's booking ever does.
        Assert.Single(await listener.EventsForAsync(id, 1));
        Assert.Empty(await listener.EventsAsync(
            body => body.GetProperty("guestEmail").GetString() == second.Email, expected: 1, timeout: TimeSpan.FromSeconds(3)));
    }

    [Fact]
    public async Task Quote_without_title_still_books()
    {
        await using var factory = Factory(infrastructure);
        using var client = factory.CreateClient();
        await using var listener = await Listener.StartAsync(infrastructure.MessagingConnectionString);
        var host = await AuthHelpers.RegisterAsync(client);
        var guest = await AuthHelpers.RegisterAsync(client);

        using var booked = await BookAsync(client, guest.Token,
            Stay($"hl-{Guid.NewGuid()}", RandomMonth(), 2, quote: new { hostId = host.UserId, pricePerNight = 100, maxGuests = 4 }));
        var id = await BookingIdAsync(booked);

        var (_, body) = Assert.Single(await listener.EventsForAsync(id, 1));
        Assert.Equal("", body.GetProperty("listingTitle").GetString());
    }

    [Fact]
    public async Task A_quoted_title_travels_with_the_event()
    {
        await using var factory = Factory(infrastructure);
        using var client = factory.CreateClient();
        await using var listener = await Listener.StartAsync(infrastructure.MessagingConnectionString);
        var host = await AuthHelpers.RegisterAsync(client);
        var guest = await AuthHelpers.RegisterAsync(client);

        using var booked = await BookAsync(client, guest.Token,
            Stay($"hl-{Guid.NewGuid()}", RandomMonth(), 2, quote: new { hostId = host.UserId, pricePerNight = 100, maxGuests = 4, title = "Sunny cabin" }));
        var id = await BookingIdAsync(booked);

        var (_, body) = Assert.Single(await listener.EventsForAsync(id, 1));
        Assert.Equal("Sunny cabin", body.GetProperty("listingTitle").GetString());
    }
}
