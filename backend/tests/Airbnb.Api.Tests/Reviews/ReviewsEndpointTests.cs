using System.Net;
using Airbnb.Api.Tests.Infrastructure;

namespace Airbnb.Api.Tests.Reviews;

public sealed class ReviewsEndpointTests(InfrastructureFixture infrastructure)
{
    [Fact]
    public async Task Listing_reviews_come_newest_first_with_paging_meta()
    {
        var (status, body) = await infrastructure.GetJsonAsync("/api/reviews?subjectId=l1");

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal(new[] { "l1-r1", "l1-r2", "l1-r3", "l1-r4" }, body.Ids());
        Assert.Equal(4, body.GetProperty("meta").GetProperty("total").GetInt32());
    }

    [Fact]
    public async Task Review_json_carries_subject_and_iso_created_at()
    {
        var (status, body) = await infrastructure.GetJsonAsync("/api/reviews?subjectId=e1");

        Assert.Equal(HttpStatusCode.OK, status);
        var review = body.GetProperty("data")[0];
        Assert.Equal("re1", review.GetProperty("id").GetString());
        Assert.Equal("experience", review.GetProperty("subjectType").GetString());
        Assert.Equal("e1", review.GetProperty("subjectId").GetString());
        Assert.Equal("Priya", review.GetProperty("authorName").GetString());
        Assert.Equal(5, review.GetProperty("rating").GetInt32());
        Assert.Equal(new DateTimeOffset(2026, 3, 1, 0, 0, 0, TimeSpan.Zero), review.GetProperty("createdAt").GetDateTimeOffset());
        Assert.False(review.TryGetProperty("listingId", out _));
    }

    [Fact]
    public async Task A_subject_without_reviews_gets_an_empty_list_not_a_404()
    {
        var (status, body) = await infrastructure.GetJsonAsync("/api/reviews?subjectId=s1");

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Empty(body.Ids());
        Assert.Equal(0, body.GetProperty("meta").GetProperty("total").GetInt32());
    }

    [Fact]
    public async Task A_missing_subject_id_gets_the_400_envelope_naming_the_field()
    {
        var (status, body) = await infrastructure.GetJsonAsync("/api/reviews");

        Assert.Equal(HttpStatusCode.BadRequest, status);
        Assert.StartsWith("SubjectId:", body.GetProperty("error").GetString());
    }
}
