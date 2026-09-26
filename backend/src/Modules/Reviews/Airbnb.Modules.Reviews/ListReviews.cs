using System.ComponentModel.DataAnnotations;
using System.Globalization;
using Airbnb.Modules.Reviews.Data;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;

namespace Airbnb.Modules.Reviews;

internal sealed record ReviewDto(
    string Id,
    string SubjectType,
    string SubjectId,
    string AuthorName,
    string AuthorAvatar,
    int Rating,
    string Body,
    DateTimeOffset CreatedAt);

internal static class ListReviews
{
    // public for the validation generator; still invisible outside the assembly because the class is internal.
    // SubjectId is nullable so a missing value reaches validation and gets a field-level message.
    public sealed record Query(
        [property: Required, StringLength(50, MinimumLength = 1)] string? SubjectId,
        [property: Range(1, int.MaxValue)] int Page = Paging.DefaultPage,
        [property: Range(1, Paging.MaxLimit)] int Limit = Paging.DefaultLimit);

    internal sealed class Handler(ReviewsDbContext db, HybridCache cache)
    {
        public ValueTask<ApiResponse<IReadOnlyList<ReviewDto>>> HandleAsync(Query query, CancellationToken cancellationToken) =>
            cache.GetOrCreateAsync(
                string.Create(CultureInfo.InvariantCulture, $"reviews:list:{query.SubjectId}|{query.Page}|{query.Limit}"),
                async token => await db.Reviews.AsNoTracking()
                    .Where(r => r.SubjectId == query.SubjectId)
                    .OrderByDescending(r => r.CreatedAt)
                    .ThenBy(r => r.Id)
                    .Select(r => new ReviewDto(r.Id, r.SubjectType, r.SubjectId, r.AuthorName, r.AuthorAvatar, r.Rating, r.Body, r.CreatedAt))
                    .ToPageAsync(query.Page, query.Limit, token),
                tags: [ReviewsModule.CacheTag],
                cancellationToken: cancellationToken);
    }

    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/reviews", async ([AsParameters] Query query, Handler handler, CancellationToken cancellationToken) =>
            TypedResults.Ok(await handler.HandleAsync(query, cancellationToken)));
}
