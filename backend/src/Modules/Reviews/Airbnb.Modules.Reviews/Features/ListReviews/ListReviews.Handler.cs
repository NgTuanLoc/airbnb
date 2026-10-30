using System.Globalization;
using Airbnb.Modules.Reviews.Data;
using Airbnb.SharedKernel;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;

namespace Airbnb.Modules.Reviews;

internal static partial class ListReviews
{
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
}
