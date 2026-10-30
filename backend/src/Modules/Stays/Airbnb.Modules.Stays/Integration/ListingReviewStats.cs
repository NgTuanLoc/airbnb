using Airbnb.Modules.Stays.Contracts;
using Airbnb.Modules.Stays.Data;
using Airbnb.SharedKernel.Persistence;
using Microsoft.Extensions.Caching.Hybrid;

namespace Airbnb.Modules.Stays.Listings;

internal sealed class ListingReviewStats(StaysDbContext db, HybridCache cache) : IListingReviewStats
{
    public async Task ApplyReviewAsync(string reviewId, string listingId, int rating, CancellationToken cancellationToken)
    {
        await ReviewStatistics.ApplyOnceAsync(db, StaysModule.Schema, StaysDbContext.ListingsTable, reviewId, listingId, rating, cancellationToken);
        // After the commit, and on a redelivery too, so a read racing the update can't keep the old values cached.
        await cache.RemoveByTagAsync(StaysModule.CacheTag, cancellationToken);
    }
}
