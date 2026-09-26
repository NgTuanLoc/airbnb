using System.Net;
using Airbnb.Api.Tests.Infrastructure;

namespace Airbnb.Api.Tests;

public sealed class ErrorEnvelopeTests(PostgresFixture postgres)
{
    [Theory]
    [InlineData("application/json")]
    [InlineData("text/html")]
    [InlineData("*/*")]
    public async Task Unknown_api_route_returns_the_404_envelope_whatever_the_client_accepts(string accept)
    {
        await using var factory = new ApiFactory(postgres.ConnectionString);
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
}
