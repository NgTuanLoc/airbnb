using System.Diagnostics;
using System.Net.Http.Json;
using System.Text.Json;
using Airbnb.Api.Tests.Infrastructure;

namespace Airbnb.Api.Tests;

// Every response names its trace, to find the call in the dashboard's Traces when debugging: the X-Trace-Id header on
// all of them, and traceId in the envelope.
public sealed class TraceIdTests(InfrastructureFixture infrastructure)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Theory]
    [InlineData("/api/listings")]
    [InlineData("/api/does-not-exist")]
    public async Task The_envelope_and_its_header_name_the_same_trace(string path)
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();

        using var response = await client.GetAsync(path, Ct);

        var traceId = TraceIdOf(response);
        Assert.Matches("^[0-9a-f]{32}$", traceId);
        var envelope = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
        Assert.Equal(traceId, envelope.GetProperty("traceId").GetString());
    }

    [Fact]
    public async Task A_callers_trace_is_continued()
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();
        // The Next server sends a traceparent with its calls, so its trace id finds the API's work too.
        var traceId = ActivityTraceId.CreateRandom().ToHexString();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/listings");
        request.Headers.Add("traceparent", $"00-{traceId}-{ActivitySpanId.CreateRandom().ToHexString()}-01");

        using var response = await client.SendAsync(request, Ct);

        Assert.Equal(traceId, TraceIdOf(response));
    }

    [Fact]
    public async Task Responses_outside_the_envelope_name_it_too()
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/health", Ct);

        Assert.Matches("^[0-9a-f]{32}$", TraceIdOf(response));
    }

    private static string TraceIdOf(HttpResponseMessage response) =>
        Assert.Single(response.Headers.GetValues(Envelope.TraceIdHeader));
}
