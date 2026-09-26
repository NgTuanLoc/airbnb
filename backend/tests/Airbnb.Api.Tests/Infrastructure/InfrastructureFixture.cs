using Airbnb.Api.Tests.Infrastructure;
using Airbnb.Modules.Experiences;
using Airbnb.Modules.Hosts;
using Airbnb.Modules.Reviews;
using Airbnb.Modules.Services;
using Airbnb.Modules.Stays;
using Airbnb.SharedKernel;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Testcontainers.PostgreSql;
using Testcontainers.Redis;

[assembly: AssemblyFixture(typeof(InfrastructureFixture))]

namespace Airbnb.Api.Tests.Infrastructure;

// One Postgres and one Redis container for the whole test run; xUnit injects this into any test class constructor
// that asks for it. The containers start one after the other: starting them from two fixtures in parallel races
// Testcontainers' resource reaper and intermittently fails with "No such container".
public sealed class InfrastructureFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:18.3").Build();
    private readonly RedisContainer _redis = new RedisBuilder("redis:8.6").Build();

    public string PostgresConnectionString => _postgres.GetConnectionString();

    public string RedisConnectionString => _redis.GetConnectionString();

    public async ValueTask InitializeAsync()
    {
        await _postgres.StartAsync();
        await _redis.StartAsync();
        await MigrateAndSeedAsync();
    }

    public async ValueTask DisposeAsync()
    {
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

        using var host = builder.Build();
        foreach (var migrator in host.Services.GetServices<IModuleMigrator>())
        {
            await migrator.MigrateAsync(CancellationToken.None);
        }
    }
}
