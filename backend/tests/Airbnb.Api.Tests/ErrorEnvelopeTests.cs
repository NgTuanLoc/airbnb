using System.Net;
using Airbnb.Api.Tests.Infrastructure;

namespace Airbnb.Api.Tests;

public sealed class ErrorEnvelopeTests(InfrastructureFixture infrastructure)
{
    [Theory]
    [InlineData("application/json")]
    [InlineData("text/html")]
    [InlineData("*/*")]
    public async Task Unknown_api_route_returns_the_404_envelope_whatever_the_client_accepts(string accept)
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/does-not-exist");
        request.Headers.Accept.ParseAdd(accept);

        using var response = await client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal(
            """{"success":false,"error":"Not Found"}""",
            await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
    }

    [Theory]
    [InlineData("/api/listings?page=abc")]
    [InlineData("/api/listings?guests=many")]
    public async Task Unparsable_query_values_get_the_400_envelope(string path)
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();

        using var response = await client.GetAsync(path, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(
            """{"success":false,"error":"Bad Request"}""",
            await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
    }
}
