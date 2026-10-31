using System.Net;
using System.Net.Http.Json;
using System.Net.Sockets;
using System.Text.Json;
using Airbnb.Notifications.Tests.Integration;
using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Containers;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using RabbitMQ.Client;
using Testcontainers.PostgreSql;

[assembly: AssemblyFixture(typeof(ServiceFixture))]

namespace Airbnb.Notifications.Tests.Integration;

// The service against real infrastructure: Postgres, an AMQP broker (LavinMQ, like the AppHost) and Mailpit. Containers
// start one after the other and are checked by port (log checks fail when the host and Docker clocks disagree).
public sealed class ServiceFixture : IAsyncLifetime
{
    public const string AdminKey = "test-admin-key";
    private const int AmqpPort = 5672;
    private const int SmtpPort = 1025;
    private const int MailpitHttpPort = 8025;

    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:18.3").Build();

    private readonly IContainer _broker = new ContainerBuilder("cloudamqp/lavinmq:2.10.3")
        .WithPortBinding(AmqpPort, assignRandomHostPort: true)
        .WithWaitStrategy(Wait.ForUnixContainer().UntilInternalTcpPortIsAvailable(AmqpPort))
        .Build();

    // A fixed host port for SMTP, so stopping and starting Mailpit (the outage test) keeps the address the service knows.
    private readonly int _smtpHostPort = FreePort();
    private readonly IContainer _mailpit;

    public ServiceFixture() =>
        _mailpit = new ContainerBuilder("axllent/mailpit:v1.32.0")
            .WithPortBinding(_smtpHostPort, SmtpPort)
            .WithPortBinding(MailpitHttpPort, assignRandomHostPort: true)
            .WithWaitStrategy(Wait.ForUnixContainer().UntilInternalTcpPortIsAvailable(SmtpPort))
            .Build();

    public WebApplicationFactory<Program> Service { get; private set; } = null!;

    public string MessagingConnectionString => $"amqp://guest:guest@{_broker.Hostname}:{_broker.GetMappedPublicPort(AmqpPort)}";

    private Uri MailpitApi => new($"http://{_mailpit.Hostname}:{_mailpit.GetMappedPublicPort(MailpitHttpPort)}/");

    public async ValueTask InitializeAsync()
    {
        await _postgres.StartAsync();
        await _broker.StartAsync();
        await _mailpit.StartAsync();
        Service = Factory(adminKey: AdminKey);
        // Starts the host: migrations, Wolverine's tables, the queue and its binding to the bookings exchange.
        Service.CreateClient().Dispose();
    }

    public WebApplicationFactory<Program> Factory(string? adminKey, Action<IWebHostBuilder>? configure = null) =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder
                .UseSetting("ConnectionStrings:notificationsdb", _postgres.GetConnectionString())
                .UseSetting("ConnectionStrings:messaging", MessagingConnectionString)
                .UseSetting("ConnectionStrings:mailpit", $"Endpoint=smtp://{_mailpit.Hostname}:{_smtpHostPort}")
                .UseSetting("Notifications:FrontendUrl", "http://localhost:3000")
                .UseSetting("Notifications:ReminderSweepInterval", "00:00:01")
                // A ping a second, so a test can tell an event stream is open and listening before it broadcasts.
                .UseSetting("Notifications:HeartbeatInterval", "00:00:01");
            if (adminKey is not null)
            {
                builder.UseSetting("Notifications:AdminKey", adminKey);
            }
            configure?.Invoke(builder);
        });

    // Publishes the way the monolith's Wolverine does: to the bookings exchange, the identity as the AMQP type, camelCase JSON.
    public async Task PublishAsync(string type, object message, CancellationToken ct)
    {
        await using var connection = await new ConnectionFactory { Uri = new Uri(MessagingConnectionString) }.CreateConnectionAsync(ct);
        await using var channel = await connection.CreateChannelAsync(cancellationToken: ct);
        var body = JsonSerializer.SerializeToUtf8Bytes(message, JsonSerializerOptions.Web);
        var properties = new BasicProperties { Type = type, MessageId = Guid.NewGuid().ToString(), ContentType = "application/json", Persistent = true };
        await channel.BasicPublishAsync("bookings", routingKey: "", mandatory: false, properties, body, ct);
    }

    public async Task<List<MailpitMessage>> EmailsToAsync(string address, CancellationToken ct)
    {
        using var http = new HttpClient { BaseAddress = MailpitApi };
        var result = await http.GetFromJsonAsync<MailpitSearch>($"api/v1/search?query={Uri.EscapeDataString($"to:{address}")}", ct);
        return result?.Messages ?? [];
    }

    // Straight to the service's database, for states a test can't reach through events (ids here are generated, not input).
    public async Task<long> ScalarAsync(string sql, CancellationToken ct)
    {
        await using var connection = new Npgsql.NpgsqlConnection(_postgres.GetConnectionString());
        await connection.OpenAsync(ct);
        await using var command = new Npgsql.NpgsqlCommand(sql, connection);
        return Convert.ToInt64(await command.ExecuteScalarAsync(ct));
    }

    public Task StopMailpitAsync(CancellationToken ct) => _mailpit.StopAsync(ct);

    public Task StartMailpitAsync(CancellationToken ct) => _mailpit.StartAsync(ct);

    public async ValueTask DisposeAsync()
    {
        await Service.DisposeAsync();
        await _mailpit.DisposeAsync();
        await _broker.DisposeAsync();
        await _postgres.DisposeAsync();
    }

    private static int FreePort()
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        return ((IPEndPoint)listener.LocalEndpoint).Port;
    }
}

public sealed record MailpitSearch(List<MailpitMessage> Messages);

public sealed record MailpitMessage(string ID, string Subject);
