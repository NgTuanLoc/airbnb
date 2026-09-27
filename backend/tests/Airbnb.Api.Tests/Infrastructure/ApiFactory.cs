using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Wolverine;

namespace Airbnb.Api.Tests.Infrastructure;

// The API against the shared test containers; a test overrides a connection string to simulate a dead dependency.
public sealed class ApiFactory(
    InfrastructureFixture infrastructure,
    string? postgresConnectionString = null,
    string? redisConnectionString = null,
    bool withMessaging = true) : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder
            .UseSetting("ConnectionStrings:airbnb", postgresConnectionString ?? infrastructure.PostgresConnectionString)
            .UseSetting("ConnectionStrings:redis", redisConnectionString ?? infrastructure.RedisConnectionString)
            .UseSetting("ConnectionStrings:rabbitmq", infrastructure.RabbitMqConnectionString);

        // Wolverine can't start without a reachable Postgres; tests that point the API at a dead database switch it off.
        if (!withMessaging)
        {
            builder.ConfigureTestServices(services =>
            {
                services.DisableAllWolverineMessagePersistence();
                services.DisableAllExternalWolverineTransports();
            });
        }
    }
}
