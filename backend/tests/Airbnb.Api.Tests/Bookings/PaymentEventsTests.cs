using System.Net;
using System.Text.Json;
using Airbnb.Api.Tests.Infrastructure;
using RabbitMQ.Client;
using static Airbnb.Api.Tests.Bookings.BookingRequests;

namespace Airbnb.Api.Tests.Bookings;

// What Bookings hears from the payment service: payment-succeeded and payment-declined on the "payments" fanout
// exchange, which settle a booking left pending. The reconciler stays off (ApiFactory), so only the events settle.
public sealed class PaymentEventsTests(InfrastructureFixture infrastructure)
{
    // Only one booking-confirmed: this long for a second one to show up.
    private static readonly TimeSpan EventWait = TimeSpan.FromSeconds(3);

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    // Publishes the way the payment service's Wolverine does: to the payments exchange, the identity as the AMQP type,
    // camelCase JSON, persistent.
    private async Task PublishAsync(string type, object message)
    {
        await using var connection = await new ConnectionFactory { Uri = new Uri(infrastructure.MessagingConnectionString) }.CreateConnectionAsync(Ct);
        await using var channel = await connection.CreateChannelAsync(cancellationToken: Ct);
        await channel.ExchangeDeclareAsync("payments", ExchangeType.Fanout, durable: true, cancellationToken: Ct);
        var body = JsonSerializer.SerializeToUtf8Bytes(message, JsonSerializerOptions.Web);
        var properties = new BasicProperties { Type = type, MessageId = Guid.NewGuid().ToString(), ContentType = "application/json", Persistent = true };
        await channel.BasicPublishAsync("payments", routingKey: "", mandatory: false, properties, body, Ct);
    }

    private static async Task<string> PendingAsync(HttpClient client, string token)
    {
        using var booked = await BookAsync(client, token, Stay("l15", RandomMonth(), 2, card: FakePaymentService.Processing));
        Assert.Equal(HttpStatusCode.Accepted, booked.StatusCode);
        return await PaymentFlowTests.IdAsync(booked);
    }

    private static Task<List<(string Type, JsonElement Body)>> AnnouncedAsync(BookingEventsTests.Listener listener, string bookingId) =>
        listener.EventsAsync(body => body.TryGetProperty("bookingId", out var id) && id.GetString() == bookingId, 2, EventWait);

    [Fact]
    public async Task Payment_succeeded_confirms_a_pending_booking_once()
    {
        await using var factory = Factory(infrastructure);
        using var client = factory.CreateClient();
        await using var listener = await BookingEventsTests.Listener.StartAsync(infrastructure.MessagingConnectionString);
        var guest = await AuthHelpers.RegisterAsync(client);
        var id = await PendingAsync(client, guest.Token);

        await PublishAsync("payment-succeeded", new { bookingId = id });
        await PublishAsync("payment-succeeded", new { bookingId = id });

        Assert.Equal("confirmed", await PaymentFlowTests.WaitForStatusAsync(client, guest.Token, id, "confirmed"));
        Assert.Equal("booking-confirmed", Assert.Single(await AnnouncedAsync(listener, id)).Type);
    }

    [Fact]
    public async Task Payment_declined_declines_a_pending_booking()
    {
        await using var factory = Factory(infrastructure);
        using var client = factory.CreateClient();
        await using var listener = await BookingEventsTests.Listener.StartAsync(infrastructure.MessagingConnectionString);
        var guest = await AuthHelpers.RegisterAsync(client);
        var id = await PendingAsync(client, guest.Token);

        await PublishAsync("payment-declined", new { bookingId = id, declineReason = "insufficient_funds" });

        Assert.Equal("declined", await PaymentFlowTests.WaitForStatusAsync(client, guest.Token, id, "declined"));
        Assert.Empty(await AnnouncedAsync(listener, id));
    }

    [Fact]
    public async Task Events_for_settled_bookings_change_nothing()
    {
        await using var factory = Factory(infrastructure);
        using var client = factory.CreateClient();
        var guest = await AuthHelpers.RegisterAsync(client);
        using var booked = await BookAsync(client, guest.Token, Stay("l15", RandomMonth(), 2));
        Assert.Equal(HttpStatusCode.Created, booked.StatusCode);
        var id = await PaymentFlowTests.IdAsync(booked);

        await PublishAsync("payment-declined", new { bookingId = id, declineReason = "card_declined" });
        await Task.Delay(TimeSpan.FromSeconds(2), Ct);

        Assert.Equal("confirmed", await PaymentFlowTests.StatusAsync(client, guest.Token, id));
    }
}
