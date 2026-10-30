using System.Net.Http.Json;
using System.Text.Json;
using Airbnb.Payments.Tests.Integration;
using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Containers;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using RabbitMQ.Client;
using Testcontainers.PostgreSql;

[assembly: AssemblyFixture(typeof(PaymentsFixture))]

namespace Airbnb.Payments.Tests.Integration;

// The service against a real Postgres and AMQP broker (LavinMQ, like the AppHost); readiness by port.
public sealed class PaymentsFixture : IAsyncLifetime
{
    public const string ServiceKey = "test-service-key";
    private const int AmqpPort = 5672;

    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:18.3").Build();

    private readonly IContainer _broker = new ContainerBuilder("cloudamqp/lavinmq:2.10.3")
        .WithPortBinding(AmqpPort, assignRandomHostPort: true)
        .WithWaitStrategy(Wait.ForUnixContainer().UntilInternalTcpPortIsAvailable(AmqpPort))
        .Build();

    public WebApplicationFactory<Program> Service { get; private set; } = null!;

    public string PostgresConnectionString => _postgres.GetConnectionString();

    private string MessagingConnectionString => $"amqp://guest:guest@{_broker.Hostname}:{_broker.GetMappedPublicPort(AmqpPort)}";

    public async ValueTask InitializeAsync()
    {
        await _postgres.StartAsync();
        await _broker.StartAsync();
        Service = new WebApplicationFactory<Program>().WithWebHostBuilder(builder => builder
            .UseSetting("ConnectionStrings:paymentsdb", _postgres.GetConnectionString())
            .UseSetting("ConnectionStrings:messaging", MessagingConnectionString)
            .UseSetting("Payments:ServiceKey", ServiceKey)
            .UseSetting("Payments:SlowCardDelay", "00:00:01"));
        // Starts the host: migrations, Wolverine's tables, the queue and its binding to the bookings exchange.
        Service.CreateClient().Dispose();
    }

    public HttpClient Client()
    {
        var client = Service.CreateClient();
        client.DefaultRequestHeaders.Add("X-Service-Key", ServiceKey);
        return client;
    }

    // Publishes the way the monolith's Wolverine does: to the bookings exchange, the identity as the AMQP type, camelCase JSON.
    public async Task PublishAsync(string type, object message, CancellationToken ct)
    {
        await using var connection = await new ConnectionFactory { Uri = new Uri(MessagingConnectionString) }.CreateConnectionAsync(ct);
        await using var channel = await connection.CreateChannelAsync(cancellationToken: ct);
        var body = JsonSerializer.SerializeToUtf8Bytes(message, JsonSerializerOptions.Web);
        var properties = new BasicProperties { Type = type, MessageId = Guid.NewGuid().ToString(), ContentType = "application/json", Persistent = true };
        await channel.BasicPublishAsync("bookings", routingKey: "", mandatory: false, properties, body, ct);
    }

    public static async Task<JsonElement> JsonAsync(HttpResponseMessage response, CancellationToken ct) =>
        await response.Content.ReadFromJsonAsync<JsonElement>(ct);

    public async ValueTask DisposeAsync()
    {
        await Service.DisposeAsync();
        await _broker.DisposeAsync();
        await _postgres.DisposeAsync();
    }
}
