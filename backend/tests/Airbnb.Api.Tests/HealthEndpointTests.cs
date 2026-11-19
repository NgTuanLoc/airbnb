using System.Net;
using Microsoft.AspNetCore.Hosting;
using Airbnb.Api.Tests.Infrastructure;

namespace Airbnb.Api.Tests;

public sealed class HealthEndpointTests(InfrastructureFixture infrastructure)
{
    // Port 1 refuses connections immediately; Timeout=2 bounds the check if anything hangs.
    private const string UnreachableDatabase = "Host=127.0.0.1;Port=1;Username=u;Password=p;Database=airbnb;Timeout=2";

    [Fact]
    public async Task Health_is_healthy_when_postgres_is_reachable()
    {
        var (status, body) = await GetAsync(infrastructure.PostgresConnectionString, "/health");

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal("Healthy", body);
    }

    [Fact]
    public async Task Health_is_unhealthy_when_postgres_is_unreachable()
    {
        var (status, body) = await GetAsync(UnreachableDatabase, "/health");

        Assert.Equal(HttpStatusCode.ServiceUnavailable, status);
        Assert.Equal("Unhealthy", body);
    }

    [Fact]
    public async Task Alive_ignores_dependencies()
    {
        var (status, body) = await GetAsync(UnreachableDatabase, "/alive");

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal("Healthy", body);
    }

    // The cluster's pods run as Production, and Kubernetes probes them there.
    [Fact]
    public async Task Alive_is_served_outside_development()
    {
        var (status, body) = await GetAsync(UnreachableDatabase, "/alive", environment: "Production");

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal("Healthy", body);
    }

    private async Task<(HttpStatusCode Status, string Body)> GetAsync(string connectionString, string path,
        string environment = "Development")
    {
        await using var factory = new ApiFactory(infrastructure, postgresConnectionString: connectionString, withMessaging: false);
        using var client = factory.WithWebHostBuilder(host => host.UseEnvironment(environment)).CreateClient();

        using var response = await client.GetAsync(path, TestContext.Current.CancellationToken);

        return (response.StatusCode, await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
    }
}
