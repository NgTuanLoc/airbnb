using Airbnb.Api.Tests.Infrastructure;
using Airbnb.Modules.Bookings;
using Airbnb.Modules.Experiences;
using Airbnb.Modules.Hosts;
using Airbnb.Modules.Identity;
using Airbnb.Modules.Insights;
using Airbnb.Modules.Reviews;
using Airbnb.Modules.Services;
using Airbnb.Modules.Stays;
using Airbnb.SharedKernel;
using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Containers;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Testcontainers.Azurite;
using Testcontainers.Kafka;
using Testcontainers.PostgreSql;
using Testcontainers.RabbitMq;
using Testcontainers.Redis;

[assembly: AssemblyFixture(typeof(InfrastructureFixture))]

namespace Airbnb.Api.Tests.Infrastructure;

// One container per dependency for the whole test run; xUnit injects this into any test class constructor that asks
// for it. The containers start one after the other: starting them from two fixtures in parallel races Testcontainers'
// resource reaper and intermittently fails with "No such container".
public sealed class InfrastructureFixture : IAsyncLifetime
{
    private const int AmqpPort = 5672;

    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:18.3").Build();
    private readonly RedisContainer _redis = new RedisBuilder("redis:8.6").Build();

    // The AMQP broker, as in the AppHost: LavinMQ, or RabbitMQ with MESSAGING_BROKER=RabbitMQ. Readiness by port, not the
    // default log check: log checks miss the startup line when the host's and the Docker VM's clocks disagree, and
    // both open 5672 last, once they are ready.
    private readonly bool _isRabbitMq =
        string.Equals(Environment.GetEnvironmentVariable("MESSAGING_BROKER"), "RabbitMQ", StringComparison.OrdinalIgnoreCase);

    private readonly IContainer _broker;

    public InfrastructureFixture() =>
        _broker = _isRabbitMq
            ? new RabbitMqBuilder("rabbitmq:4.3-management")
                .WithWaitStrategy(Wait.ForUnixContainer().UntilInternalTcpPortIsAvailable(AmqpPort))
                .Build()
            : new ContainerBuilder("cloudamqp/lavinmq:2.10.3")
                .WithPortBinding(AmqpPort, assignRandomHostPort: true)
                .WithWaitStrategy(Wait.ForUnixContainer().UntilInternalTcpPortIsAvailable(AmqpPort))
                .Build();

    // Blob storage for the Media module's photos; the photo-processor function itself is not hosted here. Readiness by
    // the blob port, like the broker: the default log check hung the whole run when the clocks disagreed.
    private readonly AzuriteContainer _azurite = new AzuriteBuilder("mcr.microsoft.com/azure-storage/azurite:3.37.0")
        .WithWaitStrategy(Wait.ForUnixContainer().UntilInternalTcpPortIsAvailable(AzuriteBuilder.BlobPort))
        .Build();

    // The listing-views topic; KRaft, so there's no ZooKeeper container. Readiness by port, like RabbitMQ: the default
    // log check misses the broker's startup line when the host's and the Docker VM's clocks disagree.
    private readonly KafkaContainer _kafka = new KafkaBuilder("confluentinc/cp-kafka:7.9.10")
        .WithKRaft()
        .WithWaitStrategy(Wait.ForUnixContainer().UntilInternalTcpPortIsAvailable(9092))
        .Build();

    public string PostgresConnectionString => _postgres.GetConnectionString();

    public string RedisConnectionString => _redis.GetConnectionString();

    // LavinMQ's image keeps the default guest user.
    public string MessagingConnectionString => _broker is RabbitMqContainer rabbitMq
        ? rabbitMq.GetConnectionString()
        : $"amqp://guest:guest@{_broker.Hostname}:{_broker.GetMappedPublicPort(AmqpPort)}";

    public string BlobConnectionString => _azurite.GetConnectionString();

    public string KafkaBootstrapAddress => _kafka.GetBootstrapAddress();

    public async ValueTask InitializeAsync()
    {
        await _postgres.StartAsync();
        await _redis.StartAsync();
        await _broker.StartAsync();
        await _azurite.StartAsync();
        await _kafka.StartAsync();
        await MigrateAndSeedAsync();
    }

    public async ValueTask DisposeAsync()
    {
        await _kafka.DisposeAsync();
        await _azurite.DisposeAsync();
        await _broker.DisposeAsync();
        await _redis.DisposeAsync();
        await _postgres.DisposeAsync();
    }

    // Migrates and seeds every module once, exactly as the MigrationService does.
    private async Task MigrateAndSeedAsync()
    {
        var builder = Host.CreateApplicationBuilder();
        builder.Configuration["ConnectionStrings:airbnb"] = PostgresConnectionString;
        builder.AddNpgsqlDataSource("airbnb");
        builder.AddStaysModuleDatabase();
        builder.AddHostsModuleDatabase();
        builder.AddExperiencesModuleDatabase();
        builder.AddServicesModuleDatabase();
        builder.AddReviewsModuleDatabase();
        builder.AddIdentityModuleDatabase();
        builder.AddBookingsModuleDatabase();
        builder.AddInsightsModuleDatabase();

        using var host = builder.Build();
        foreach (var migrator in host.Services.GetServices<IModuleMigrator>())
        {
            await migrator.MigrateAsync(CancellationToken.None);
        }
    }
}
