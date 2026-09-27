using System.Net.Http.Json;
using System.Text.Json;
using Airbnb.Api.Tests.Infrastructure;
using Airbnb.Modules.Experiences.Contracts;
using Microsoft.Extensions.DependencyInjection;

namespace Airbnb.Api.Tests.Experiences;

// Uses experiences no read test asserts on (e3, e5): these tests change their rating and review count.
// Concurrency is covered once, for the shared ReviewStatistics helper, in ListingReviewStatsTests.
public sealed class ExperienceReviewStatsTests(InfrastructureFixture infrastructure)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Applying_a_review_updates_the_experience_and_its_cached_copy()
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();
        var before = await GetExperienceAsync(client, "e3"); // also puts the experience in the cache

        await ApplyAsync(factory, Guid.CreateVersion7().ToString(), "e3", rating: 3);

        var after = await GetExperienceAsync(client, "e3");
        Assert.Equal(before.ReviewCount + 1, after.ReviewCount);
        Assert.Equal(ExpectedRating(before, 3), after.Rating);
    }

    [Fact]
    public async Task The_same_review_applied_twice_counts_once()
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();
        var before = await GetExperienceAsync(client, "e5");
        var reviewId = Guid.CreateVersion7().ToString();

        await ApplyAsync(factory, reviewId, "e5", rating: 4);
        await ApplyAsync(factory, reviewId, "e5", rating: 4);

        var after = await GetExperienceAsync(client, "e5");
        Assert.Equal(before.ReviewCount + 1, after.ReviewCount);
        Assert.Equal(ExpectedRating(before, 4), after.Rating);
    }

    [Fact]
    public async Task The_lookup_finds_seeded_experiences_only()
    {
        await using var factory = new ApiFactory(infrastructure);
        await using var scope = factory.Services.CreateAsyncScope();
        var lookup = scope.ServiceProvider.GetRequiredService<IExperienceLookup>();

        Assert.True(await lookup.ExistsAsync("e1", Ct));
        Assert.False(await lookup.ExistsAsync("e999", Ct));
    }

    private static async Task ApplyAsync(ApiFactory factory, string reviewId, string experienceId, int rating)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<IExperienceReviewStats>().ApplyReviewAsync(reviewId, experienceId, rating, Ct);
    }

    private static async Task<(int ReviewCount, decimal Rating)> GetExperienceAsync(HttpClient client, string id)
    {
        var experience = (await client.GetFromJsonAsync<JsonElement>($"/api/experiences/{id}", Ct)).GetProperty("data");
        return (experience.GetProperty("reviewCount").GetInt32(), experience.GetProperty("rating").GetDecimal());
    }

    // What the database computes: the new average rounded to 2 places, half away from zero like Postgres round().
    private static decimal ExpectedRating((int ReviewCount, decimal Rating) before, int rating) =>
        Math.Round((before.Rating * before.ReviewCount + rating) / (before.ReviewCount + 1), 2, MidpointRounding.AwayFromZero);
}
