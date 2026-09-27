using System.Net.Http.Json;
using System.Text.Json;
using Airbnb.Api.Tests.Infrastructure;
using Airbnb.Modules.Stays.Contracts;
using Microsoft.Extensions.DependencyInjection;

namespace Airbnb.Api.Tests.Stays;

// Uses listings no read test asserts on (l3, l5, l9): these tests change their rating and review count.
public sealed class ListingReviewStatsTests(InfrastructureFixture infrastructure)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Applying_a_review_updates_the_listing_and_its_cached_copy()
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();
        var before = await GetListingAsync(client, "l3"); // also puts the listing in the cache

        await ApplyAsync(factory, NewReviewId(), "l3", rating: 1);

        var after = await GetListingAsync(client, "l3");
        Assert.Equal(before.ReviewCount + 1, after.ReviewCount);
        Assert.Equal(ExpectedRating(before, 1), after.Rating);
    }

    [Fact]
    public async Task The_same_review_applied_twice_counts_once()
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();
        var before = await GetListingAsync(client, "l5");
        var reviewId = NewReviewId();

        await ApplyAsync(factory, reviewId, "l5", rating: 2);
        await ApplyAsync(factory, reviewId, "l5", rating: 2);

        var after = await GetListingAsync(client, "l5");
        Assert.Equal(before.ReviewCount + 1, after.ReviewCount);
        Assert.Equal(ExpectedRating(before, 2), after.Rating);
    }

    [Fact]
    public async Task Concurrent_reviews_are_all_counted()
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();
        var before = await GetListingAsync(client, "l9");

        // Same rating each time, so the expected average doesn't depend on the order the UPDATEs run in.
        await Task.WhenAll(Enumerable.Range(0, 5).Select(_ => ApplyAsync(factory, NewReviewId(), "l9", rating: 5)));

        var expected = before;
        for (var i = 0; i < 5; i++)
        {
            expected = (expected.ReviewCount + 1, ExpectedRating(expected, 5));
        }

        var after = await GetListingAsync(client, "l9");
        Assert.Equal(expected, after);
    }

    [Fact]
    public async Task The_lookup_finds_seeded_listings_only()
    {
        await using var factory = new ApiFactory(infrastructure);
        await using var scope = factory.Services.CreateAsyncScope();
        var lookup = scope.ServiceProvider.GetRequiredService<IListingLookup>();

        Assert.True(await lookup.ExistsAsync("l1", Ct));
        Assert.False(await lookup.ExistsAsync("l999", Ct));
    }

    // Each call gets its own scope, as each message handler does, so parallel calls never share a DbContext.
    private static async Task ApplyAsync(ApiFactory factory, string reviewId, string listingId, int rating)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<IListingReviewStats>().ApplyReviewAsync(reviewId, listingId, rating, Ct);
    }

    private static string NewReviewId() => Guid.CreateVersion7().ToString();

    private static async Task<(int ReviewCount, decimal Rating)> GetListingAsync(HttpClient client, string id)
    {
        var listing = (await client.GetFromJsonAsync<JsonElement>($"/api/listings/{id}", Ct)).GetProperty("data");
        return (listing.GetProperty("reviewCount").GetInt32(), listing.GetProperty("rating").GetDecimal());
    }

    // What the database computes: the new average rounded to 2 places, half away from zero like Postgres round().
    private static decimal ExpectedRating((int ReviewCount, decimal Rating) before, int rating) =>
        Math.Round((before.Rating * before.ReviewCount + rating) / (before.ReviewCount + 1), 2, MidpointRounding.AwayFromZero);
}
