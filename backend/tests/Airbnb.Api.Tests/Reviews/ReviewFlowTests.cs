using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Airbnb.Api.Tests.Infrastructure;

namespace Airbnb.Api.Tests.Reviews;

// The whole write flow: POST → outbox → RabbitMQ → module handler → rating update (spec §3).
// Uses l10, l11 and e10, which no read test asserts on.
public sealed class ReviewFlowTests(InfrastructureFixture infrastructure)
{
    private static readonly TimeSpan DeliveryTimeout = TimeSpan.FromSeconds(20);

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task A_stay_review_updates_the_listing_rating_and_count()
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();
        var before = await GetStatsAsync(client, "/api/listings/l10");

        await PostReviewAsync(client, "stay", "l10", rating: 1);

        var after = await WaitForStatsAsync(client, "/api/listings/l10", stats => stats.ReviewCount == before.ReviewCount + 1);
        Assert.Equal(ExpectedRating(before, 1), after.Rating);
    }

    [Fact]
    public async Task An_experience_review_updates_the_experience_rating_and_count()
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();
        var before = await GetStatsAsync(client, "/api/experiences/e10");

        await PostReviewAsync(client, "experience", "e10", rating: 2);

        var after = await WaitForStatsAsync(client, "/api/experiences/e10", stats => stats.ReviewCount == before.ReviewCount + 1);
        Assert.Equal(ExpectedRating(before, 2), after.Rating);
    }

    [Fact]
    public async Task Concurrent_reviews_of_one_listing_are_all_counted()
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();
        var before = await GetStatsAsync(client, "/api/listings/l11");

        // Three writes stay under the 10-per-minute write limit of one API instance.
        await Task.WhenAll(Enumerable.Range(0, 3).Select(_ => PostReviewAsync(client, "stay", "l11", rating: 5)));

        await WaitForStatsAsync(client, "/api/listings/l11", stats => stats.ReviewCount == before.ReviewCount + 3);
    }

    private static async Task PostReviewAsync(HttpClient client, string subjectType, string subjectId, int rating)
    {
        var json = JsonSerializer.Serialize(new { subjectType, subjectId, authorName = "Flow test", rating, body = "End to end." });
        using var response = await client.PostAsync("/api/reviews", new StringContent(json, Encoding.UTF8, "application/json"), Ct);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    private static async Task<(int ReviewCount, decimal Rating)> GetStatsAsync(HttpClient client, string path)
    {
        var item = (await client.GetFromJsonAsync<JsonElement>(path, Ct)).GetProperty("data");
        return (item.GetProperty("reviewCount").GetInt32(), item.GetProperty("rating").GetDecimal());
    }

    // The update is asynchronous (RabbitMQ in between), so poll until it lands or the timeout passes.
    private static async Task<(int ReviewCount, decimal Rating)> WaitForStatsAsync(
        HttpClient client, string path, Func<(int ReviewCount, decimal Rating), bool> isDone)
    {
        var stopwatch = Stopwatch.StartNew();
        while (true)
        {
            var stats = await GetStatsAsync(client, path);
            if (isDone(stats))
            {
                return stats;
            }

            Assert.True(stopwatch.Elapsed < DeliveryTimeout, $"{path} still shows {stats} after {DeliveryTimeout}");
            await Task.Delay(200, Ct);
        }
    }

    // What the database computes: the new average rounded to 2 places, half away from zero like Postgres round().
    private static decimal ExpectedRating((int ReviewCount, decimal Rating) before, int rating) =>
        Math.Round((before.Rating * before.ReviewCount + rating) / (before.ReviewCount + 1), 2, MidpointRounding.AwayFromZero);
}
