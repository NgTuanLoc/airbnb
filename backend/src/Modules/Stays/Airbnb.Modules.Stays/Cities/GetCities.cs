using Airbnb.Modules.Stays.Data;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;

namespace Airbnb.Modules.Stays.Cities;

// Wire shape of the frontend's City type.
internal sealed record CityDto(string Id, string Name, string SubLabel, string Image, int ListingCount);

internal static class GetCities
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

    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/cities", async (Handler handler, CancellationToken cancellationToken) =>
            TypedResults.Ok(await handler.HandleAsync(cancellationToken)));
}
