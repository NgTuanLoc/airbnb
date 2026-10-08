using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Airbnb.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Airbnb.Api.Tests.Bookings;

// Helpers shared by the booking tests. They book only l13–l16 or fresh hl- listings, in random far-future months.
internal static class BookingRequests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    internal static DateOnly RandomMonth() =>
        DateOnly.FromDateTime(DateTime.UtcNow).AddMonths(Random.Shared.Next(13, 600));

    internal static WebApplicationFactory<Program> Factory(InfrastructureFixture infrastructure) =>
        new ApiFactory(infrastructure).WithWebHostBuilder(builder => builder.UseSetting("RateLimiting:WritesPerMinute", "1000"));

    internal static async Task<HttpResponseMessage> BookAsync(HttpClient client, string token, object body)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/bookings")
        {
            Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json"),
        }.Authorized(token);
        return await client.SendAsync(request, Ct);
    }

    internal static object Stay(string listingId, DateOnly checkIn, int nights, int adults = 2, object? quote = null) => new
    {
        listingId,
        checkIn = checkIn.ToString("yyyy-MM-dd"),
        checkOut = checkIn.AddDays(nights).ToString("yyyy-MM-dd"),
        adults,
        children = 0,
        quote,
    };

    internal static async Task<string> ErrorAsync(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("error").GetString()!;
}
