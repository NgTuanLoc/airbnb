using Airbnb.Modules.Insights.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;

namespace Airbnb.Modules.Insights;

internal static partial class GetListingViews
{
    // Short-lived as well as invalidated after every batch: a read that races a batch can't keep a stale count for long.
    private static readonly HybridCacheEntryOptions Freshness = new()
    {
        Expiration = TimeSpan.FromSeconds(5),
        LocalCacheExpiration = TimeSpan.FromSeconds(5),
    };

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
}
