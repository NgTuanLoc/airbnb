using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace Airbnb.Api.Tests.Infrastructure;

public static class AuthHelpers
{
    // Registers a fresh account and returns its bearer token, user id and email.
    public static async Task<(string Token, string UserId, string Email)> RegisterAsync(HttpClient client, string? name = null)
    {
        var email = $"u-{Guid.NewGuid():N}@example.com";
        var body = JsonSerializer.Serialize(new { name = name ?? "Guest", email, password = "correct-horse" });
        using var response = await client.PostAsync("/api/auth/register", new StringContent(body, Encoding.UTF8, "application/json"), TestContext.Current.CancellationToken);
        response.EnsureSuccessStatusCode();
        var data = (await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken)).GetProperty("data");
        return (data.GetProperty("token").GetString()!, data.GetProperty("user").GetProperty("id").GetString()!, email);
    }

    public static HttpRequestMessage Authorized(this HttpRequestMessage request, string token)
    {
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return request;
    }
}
