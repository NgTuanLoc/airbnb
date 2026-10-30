using Airbnb.Modules.Stays.Data;
using Airbnb.SharedKernel;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;

namespace Airbnb.Modules.Stays.Cities;

internal static partial class GetCities
{
    internal sealed class Handler(StaysDbContext db, HybridCache cache)
    {
        // Curated reference data (6 rows) returned whole — the one list without paging (spec §2).
        public ValueTask<ApiResponse<IReadOnlyList<CityDto>>> HandleAsync(CancellationToken cancellationToken) =>
            cache.GetOrCreateAsync(
                "stays:cities",
                async token => ApiResponse.Ok<IReadOnlyList<CityDto>>(await db.Cities.AsNoTracking()
                    .OrderBy(c => c.SortOrder)
                    .Select(c => new CityDto(c.Id, c.Name, c.SubLabel, c.Image, c.ListingCount))
                    .ToListAsync(token)),
                tags: [StaysModule.CacheTag],
                cancellationToken: cancellationToken);
    }
}
