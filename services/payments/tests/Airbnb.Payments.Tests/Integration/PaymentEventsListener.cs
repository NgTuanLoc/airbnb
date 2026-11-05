using System.Text.Json;
using RabbitMQ.Client;

namespace Airbnb.Payments.Tests.Integration;

// What Bookings hears from this service: events on the "payments" fanout exchange. Each listener binds its own
// throwaway queue, so it sees every event published after it starts.
public sealed class PaymentEventsListener : IAsyncDisposable
{
    private readonly IConnection _connection;
    private readonly IChannel _channel;
    private readonly string _queue;

    private PaymentEventsListener(IConnection connection, IChannel channel, string queue) =>
        (_connection, _channel, _queue) = (connection, channel, queue);

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public static async Task<PaymentEventsListener> StartAsync(string connectionString)
    {
        var connection = await new ConnectionFactory { Uri = new Uri(connectionString) }.CreateConnectionAsync(Ct);
        var channel = await connection.CreateChannelAsync(cancellationToken: Ct);
        // The service declares the exchange at startup; declaring it here too (same settings) makes the order irrelevant.
        await channel.ExchangeDeclareAsync("payments", ExchangeType.Fanout, durable: true, cancellationToken: Ct);
        var queue = (await channel.QueueDeclareAsync(exclusive: true, cancellationToken: Ct)).QueueName;
        await channel.QueueBindAsync(queue, "payments", routingKey: "", cancellationToken: Ct);
        return new PaymentEventsListener(connection, channel, queue);
    }

    // One booking's events, by message type, waiting up to the timeout for the expected count.
    public async Task<List<(string Type, JsonElement Body)>> EventsForAsync(string bookingId, int expected, TimeSpan timeout)
    {
        var found = new List<(string, JsonElement)>();
        var deadline = DateTime.UtcNow + timeout;
        while (found.Count < expected && DateTime.UtcNow < deadline)
        {
            var result = await _channel.BasicGetAsync(_queue, autoAck: true, Ct);
            if (result is null)
            {
                await Task.Delay(50, Ct);
                continue;
            }
            var body = JsonDocument.Parse(result.Body).RootElement;
            if (body.TryGetProperty("bookingId", out var id) && id.GetString() == bookingId)
            {
                // Wolverine sends the message identity as AMQP's standard type property.
                found.Add((result.BasicProperties.Type!, body));
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
