using System.ComponentModel.DataAnnotations;
using Airbnb.Modules.Stays.Data;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;

namespace Airbnb.Modules.Stays.Listings;

internal static class GetListing
{
    // public for the validation generator; still invisible outside the assembly because the class is internal.
    public sealed record Query([property: StringLength(50, MinimumLength = 1)] string Id);

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

    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/listings/{id}", async Task<Results<Ok<ApiResponse<ListingDto>>, NotFound<ApiResponse<object>>>> (
            [AsParameters] Query query, Handler handler, CancellationToken cancellationToken) =>
            await handler.HandleAsync(query, cancellationToken) is { } listing
                ? TypedResults.Ok(ApiResponse.Ok(listing))
                : TypedResults.NotFound(ApiResponse.Fail($"Listing '{query.Id}' was not found")));
}
