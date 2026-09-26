using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Airbnb.Api.Tests.Infrastructure;

public sealed class ApiFactory(string postgresConnectionString, string redisConnectionString) : WebApplicationFactory<Program>
{
    public ApiFactory(InfrastructureFixture infrastructure)
        : this(infrastructure.PostgresConnectionString, infrastructure.RedisConnectionString)
    {
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder) => builder
        .UseSetting("ConnectionStrings:airbnb", postgresConnectionString)
        .UseSetting("ConnectionStrings:redis", redisConnectionString);
}
