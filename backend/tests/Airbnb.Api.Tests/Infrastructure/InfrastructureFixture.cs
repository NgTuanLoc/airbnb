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
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Testcontainers.Azurite;
using Testcontainers.Kafka;
using Testcontainers.PostgreSql;
using Testcontainers.RabbitMq;
using Testcontainers.Redis;

[assembly: AssemblyFixture(typeof(InfrastructureFixture))]

namespace Airbnb.Api.Tests.Infrastructure;

// One Postgres, one Redis and one RabbitMQ container for the whole test run; xUnit injects this into any test class
// constructor that asks for it. The containers start one after the other: starting them from two fixtures in
// parallel races Testcontainers' resource reaper and intermittently fails with "No such container".
public sealed class InfrastructureFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:18.3").Build();
    private readonly RedisContainer _redis = new RedisBuilder("redis:8.6").Build();

    // Readiness by port, not the default log check: log checks miss RabbitMQ's startup line when the Docker VM's clock
    // lags the host's. RabbitMQ opens 5672 last, once it is ready.
    private readonly RabbitMqContainer _rabbitMq = new RabbitMqBuilder("rabbitmq:4.3-management")
        .WithWaitStrategy(Wait.ForUnixContainer().UntilInternalTcpPortIsAvailable(5672))
        .Build();

    // Blob storage for the Media module's photos; the photo-processor function itself is not hosted here.
    private readonly AzuriteContainer _azurite = new AzuriteBuilder("mcr.microsoft.com/azure-storage/azurite:3.37.0").Build();

    // The listing-views topic; KRaft, so there's no ZooKeeper container. Readiness by port, like RabbitMQ: the default
    // log check misses the broker's startup line when the host's and the Docker VM's clocks disagree.
    private readonly KafkaContainer _kafka = new KafkaBuilder("confluentinc/cp-kafka:7.9.10")
        .WithKRaft()
        .WithWaitStrategy(Wait.ForUnixContainer().UntilInternalTcpPortIsAvailable(9092))
        .Build();

    public string PostgresConnectionString => _postgres.GetConnectionString();

    public string RedisConnectionString => _redis.GetConnectionString();

    public string RabbitMqConnectionString => _rabbitMq.GetConnectionString();

    public string BlobConnectionString => _azurite.GetConnectionString();

    public string KafkaBootstrapAddress => _kafka.GetBootstrapAddress();

    public async ValueTask InitializeAsync()
    {
        await _postgres.StartAsync();
        await _redis.StartAsync();
        await _rabbitMq.StartAsync();
        await _azurite.StartAsync();
        await _kafka.StartAsync();
        await MigrateAndSeedAsync();
    }

    public async ValueTask DisposeAsync()
    {
        await _kafka.DisposeAsync();
        await _azurite.DisposeAsync();
        await _rabbitMq.DisposeAsync();
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
