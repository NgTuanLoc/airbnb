using System.Net;
using Airbnb.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Airbnb.Api.Tests;

public sealed class RateLimitingTests(InfrastructureFixture infrastructure)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Reads_over_the_limit_get_the_429_envelope()
    {
        await using var factory = CreateFactory(readsPerMinute: 1, writesPerMinute: 10);
        using var client = factory.CreateClient();

        using var first = await client.GetAsync("/api/anything", Ct);
        using var second = await client.GetAsync("/api/anything", Ct);

        Assert.Equal(HttpStatusCode.NotFound, first.StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, second.StatusCode);
        Assert.Equal("""{"success":false,"error":"Too Many Requests"}""", await second.Content.ReadAsStringAsync(Ct));
    }

    [Fact]
    public async Task Writes_have_their_own_budget()
    {
        await using var factory = CreateFactory(readsPerMinute: 10, writesPerMinute: 1);
        using var client = factory.CreateClient();

        using var firstWrite = await client.PostAsync("/api/anything", content: null, Ct);
        using var secondWrite = await client.PostAsync("/api/anything", content: null, Ct);
        using var read = await client.GetAsync("/api/anything", Ct);

        Assert.Equal(HttpStatusCode.NotFound, firstWrite.StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, secondWrite.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, read.StatusCode);
    }

    [Fact]
    public async Task Health_probes_are_never_limited()
    {
        await using var factory = CreateFactory(readsPerMinute: 1, writesPerMinute: 1);
        using var client = factory.CreateClient();

        using var first = await client.GetAsync("/alive", Ct);
        using var second = await client.GetAsync("/alive", Ct);

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
    }

    private WebApplicationFactory<Program> CreateFactory(int readsPerMinute, int writesPerMinute) =>
        new ApiFactory(infrastructure).WithWebHostBuilder(builder => builder
            .UseSetting("RateLimiting:ReadsPerMinute", readsPerMinute.ToString())
            .UseSetting("RateLimiting:WritesPerMinute", writesPerMinute.ToString()));
}
