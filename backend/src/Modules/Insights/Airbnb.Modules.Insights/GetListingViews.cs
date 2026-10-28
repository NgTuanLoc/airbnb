using Airbnb.Modules.Insights.Data;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;

namespace Airbnb.Modules.Insights;

internal static class GetListingViews
{
    // Short-lived as well as invalidated after every batch: a read that races a batch can't keep a stale count for long.
    private static readonly HybridCacheEntryOptions Freshness = new()
    {
        Expiration = TimeSpan.FromSeconds(5),
        LocalCacheExpiration = TimeSpan.FromSeconds(5),
    };

    internal static string NotFound(string id) => $"Listing '{id}' was not found";

    internal sealed class Handler(InsightsDbContext db, HybridCache cache, TimeProvider time)
    {
        public ValueTask<WeeklyViews> HandleAsync(string id, CancellationToken cancellationToken) =>
            cache.GetOrCreateAsync(
                $"insights:listing-views:{id}",
                async token =>
                {
                    var today = DateOnly.FromDateTime(time.GetUtcNow().UtcDateTime);
                    var from = today.AddDays(-13);
                    var days = await db.DailyViews.AsNoTracking()
                        .Where(v => v.ListingId == id && v.Day >= from && v.Day <= today)
                        .Select(v => new { v.Day, v.Views })
                        .ToListAsync(token);
                    return WeeklyViews.From(id, days.Select(d => (d.Day, d.Views)), today);
                },
                Freshness,
                tags: [InsightsModule.CacheTag],
                cancellationToken: cancellationToken);
    }

    // Public: guests see the counts on listing pages.
    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/listings/{id}/views", async Task<Results<Ok<ApiResponse<WeeklyViews>>, NotFound<ApiResponse<object>>>> (
            string id, Handler handler, CancellationToken cancellationToken) =>
            ListingIds.IsValid(id)
                ? TypedResults.Ok(ApiResponse.Ok(await handler.HandleAsync(id, cancellationToken)))
                : TypedResults.NotFound(ApiResponse.Fail(NotFound(id))));
}
