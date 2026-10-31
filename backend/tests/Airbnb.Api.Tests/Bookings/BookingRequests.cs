using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Airbnb.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace Airbnb.Api.Tests.Bookings;

// Helpers shared by the booking tests. They book only l13–l16 or fresh hl- listings, in far-future months.
internal static class BookingRequests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    // Months from now: a random start, then one more per call.
    private static int _monthsAhead = Random.Shared.Next(13, 300);

    // A far-future month no other call in this test run gets. Every stay is shorter than a month, so tests booking the same
    // listing never overlap (two random months could match, and the second booking then got a 409).
    internal static DateOnly RandomMonth() =>
        DateOnly.FromDateTime(DateTime.UtcNow).AddMonths(Interlocked.Increment(ref _monthsAhead));

    internal const string QuoteKey = "test-quote-key";

    // Every booking factory charges through its own fake payment service; the reconciler stays off (ApiFactory).
    internal static WebApplicationFactory<Program> Factory(InfrastructureFixture infrastructure, string? quoteKey = QuoteKey, FakePaymentService? payments = null) =>
        new ApiFactory(infrastructure).WithWebHostBuilder(builder =>
        {
            builder.UseSetting("RateLimiting:WritesPerMinute", "1000")
                .UseSetting("Bookings:Payments:AttemptTimeout", "00:00:00.5");
            if (quoteKey is not null)
            {
                builder.UseSetting("Bookings:QuoteKey", quoteKey);
            }
            var service = payments ?? new FakePaymentService();
            builder.ConfigureTestServices(services =>
                services.AddHttpClient("payments").ConfigurePrimaryHttpMessageHandler(() => service));
        });

    internal static async Task<HttpResponseMessage> BookAsync(HttpClient client, string token, object body, string? quoteKey = QuoteKey)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/bookings")
        {
            Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json"),
        }.Authorized(token);
        if (quoteKey is not null)
        {
            request.Headers.Add("X-Quote-Key", quoteKey);
        }
        return await client.SendAsync(request, Ct);
    }

    internal static object Stay(string listingId, DateOnly checkIn, int nights, int adults = 2, object? quote = null, string card = FakePaymentService.Good) => new
    {
        listingId,
        checkIn = checkIn.ToString("yyyy-MM-dd"),
        checkOut = checkIn.AddDays(nights).ToString("yyyy-MM-dd"),
        adults,
        children = 0,
        quote,
        card = new { number = card, expMonth = 12, expYear = 2030, cvc = "123" },
    };

    internal static async Task<string> ErrorAsync(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("error").GetString()!;
}
