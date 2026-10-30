using Airbnb.Modules.Stays.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;

namespace Airbnb.Modules.Stays.Listings;

internal static partial class GetListing
{
    internal sealed class Handler(StaysDbContext db, HybridCache cache)
    {
        public ValueTask<ListingDto?> HandleAsync(Query query, CancellationToken cancellationToken) =>
            cache.GetOrCreateAsync(
                $"stays:listing:{query.Id}",
                async token => await db.Listings.AsNoTracking()
                    .Where(l => l.Id == query.Id)
                    .Select(ListingDto.Projection)
                    .FirstOrDefaultAsync(token),
                tags: [StaysModule.CacheTag],
                cancellationToken: cancellationToken);
    }
}
