using System.Net;
using Airbnb.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
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

    [Fact]
    public async Task Browsers_behind_the_local_next_server_get_their_own_write_budgets()
    {
        await using var factory = CreateFactory(readsPerMinute: 10, writesPerMinute: 1);

        var first = await PostFromAsync(factory, IPAddress.Loopback, forwardedFor: "203.0.113.7");
        var otherBrowser = await PostFromAsync(factory, IPAddress.Loopback, forwardedFor: "203.0.113.8");
        var firstAgain = await PostFromAsync(factory, IPAddress.Loopback, forwardedFor: "203.0.113.7");

        Assert.Equal(HttpStatusCode.NotFound, first);
        Assert.Equal(HttpStatusCode.NotFound, otherBrowser);
        Assert.Equal(HttpStatusCode.TooManyRequests, firstAgain);
    }

    [Fact]
    public async Task A_forwarded_for_header_from_a_non_local_caller_is_ignored()
    {
        await using var factory = CreateFactory(readsPerMinute: 10, writesPerMinute: 1);
        var stranger = IPAddress.Parse("198.51.100.20");

        var first = await PostFromAsync(factory, stranger, forwardedFor: "203.0.113.7");
        var spoofed = await PostFromAsync(factory, stranger, forwardedFor: "203.0.113.99");

        Assert.Equal(HttpStatusCode.NotFound, first);
        Assert.Equal(HttpStatusCode.TooManyRequests, spoofed);
    }

    private static async Task<HttpStatusCode> PostFromAsync(WebApplicationFactory<Program> factory, IPAddress remote, string forwardedFor)
    {
        var context = await factory.Server.SendAsync(http =>
        {
            http.Connection.RemoteIpAddress = remote;
            http.Request.Method = HttpMethods.Post;
            http.Request.Path = "/api/anything";
            http.Request.Headers["X-Forwarded-For"] = forwardedFor;
        }, Ct);
        return (HttpStatusCode)context.Response.StatusCode;
    }

    private WebApplicationFactory<Program> CreateFactory(int readsPerMinute, int writesPerMinute) =>
        new ApiFactory(infrastructure).WithWebHostBuilder(builder => builder
            .UseSetting("RateLimiting:ReadsPerMinute", readsPerMinute.ToString())
            .UseSetting("RateLimiting:WritesPerMinute", writesPerMinute.ToString()));
}
