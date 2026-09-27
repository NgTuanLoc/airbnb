using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Airbnb.Api.Tests.Infrastructure;

public static class ApiRequests
{
    // GETs a path on a fresh API instance and returns the status code and parsed JSON body.
    public static async Task<(HttpStatusCode Status, JsonElement Body)> GetJsonAsync(this InfrastructureFixture infrastructure, string path)
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();

        using var response = await client.GetAsync(path, TestContext.Current.CancellationToken);

        return (response.StatusCode, await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken));
    }

    // The "id" of every item in an envelope's data array, in order.
    public static string[] Ids(this JsonElement envelope) =>
        envelope.GetProperty("data").EnumerateArray().Select(item => item.GetProperty("id").GetString()!).ToArray();
}
