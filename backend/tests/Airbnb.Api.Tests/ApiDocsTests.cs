using System.Net;
using Airbnb.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Hosting;

namespace Airbnb.Api.Tests;

public sealed class ApiDocsTests(PostgresFixture postgres)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Theory]
    [InlineData("/openapi/v1.json", "application/json")]
    [InlineData("/scalar", "text/html")]
    public async Task Docs_are_served_in_development(string path, string mediaType)
    {
        await using var factory = new ApiFactory(postgres.ConnectionString);
        using var client = factory.CreateClient();

        using var response = await client.GetAsync(path, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(mediaType, response.Content.Headers.ContentType?.MediaType);
    }

    [Theory]
    [InlineData("/openapi/v1.json")]
    [InlineData("/scalar")]
    public async Task Docs_are_not_served_outside_development(string path)
    {
        await using var factory = new ApiFactory(postgres.ConnectionString)
            .WithWebHostBuilder(builder => builder.UseEnvironment("Production"));
        using var client = factory.CreateClient();

        using var response = await client.GetAsync(path, Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
