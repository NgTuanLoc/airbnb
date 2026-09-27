using Airbnb.Api.Messaging;
using Airbnb.Modules.Experiences.Contracts;
using Airbnb.Modules.Reviews.Contracts;
using Airbnb.Modules.Stays.Contracts;

namespace Airbnb.UnitTests.Api;

public sealed class ReviewSubmittedHandlerTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static ReviewSubmitted Review(ReviewSubjectType type, string subjectId) =>
        new("r1", type, subjectId, 4, DateTimeOffset.UnixEpoch);

    [Fact]
    public async Task A_stay_review_reaches_the_listing_stats_only()
    {
        var listings = new FakeStats();
        var experiences = new FakeStats();

        await StaysReviewSubmittedHandler.HandleAsync(Review(ReviewSubjectType.Stay, "l3"), listings, Ct);
        await ExperiencesReviewSubmittedHandler.HandleAsync(Review(ReviewSubjectType.Stay, "l3"), experiences, Ct);

        Assert.Equal(["r1 l3 4"], listings.Applied);
        Assert.Empty(experiences.Applied);
    }

    [Fact]
    public async Task An_experience_review_reaches_the_experience_stats_only()
    {
        var listings = new FakeStats();
        var experiences = new FakeStats();

        await StaysReviewSubmittedHandler.HandleAsync(Review(ReviewSubjectType.Experience, "e2"), listings, Ct);
        await ExperiencesReviewSubmittedHandler.HandleAsync(Review(ReviewSubjectType.Experience, "e2"), experiences, Ct);

        Assert.Empty(listings.Applied);
        Assert.Equal(["r1 e2 4"], experiences.Applied);
    }

    private sealed class FakeStats : IListingReviewStats, IExperienceReviewStats
    {
        public List<string> Applied { get; } = [];

        public Task ApplyReviewAsync(string reviewId, string subjectId, int rating, CancellationToken cancellationToken)
        {
            Applied.Add($"{reviewId} {subjectId} {rating}");
            return Task.CompletedTask;
        }
    }
}
