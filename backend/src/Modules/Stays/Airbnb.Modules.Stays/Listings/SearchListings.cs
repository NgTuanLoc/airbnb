using System.ComponentModel.DataAnnotations;
using System.Globalization;
using Airbnb.Modules.Stays.Data;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;

namespace Airbnb.Modules.Stays.Listings;

internal static class SearchListings
{
    // public for the validation generator; still invisible outside the assembly because the class is internal.
    public sealed record Query(
        [property: StringLength(100)] string? Location,
        [property: StringLength(50)] string? Category,
        [property: Range(0d, 100_000d)] decimal? MinPrice,
        [property: Range(0d, 100_000d)] decimal? MaxPrice,
        [property: Range(1, 50)] int? Guests,
        [property: Range(0, 50)] int? Bedrooms,
        [property: Range(0, 50)] int? Beds,
        [property: Range(0d, 50d)] decimal? Baths,
        [property: Range(1, int.MaxValue)] int Page = Paging.DefaultPage,
        [property: Range(1, Paging.MaxLimit)] int Limit = Paging.DefaultLimit);

    internal sealed class Handler(StaysDbContext db, HybridCache cache)
    {
        public ValueTask<ApiResponse<IReadOnlyList<ListingDto>>> HandleAsync(Query query, CancellationToken cancellationToken) =>
            cache.GetOrCreateAsync(
                CacheKey(query),
                async token => await Filter(db.Listings.AsNoTracking(), query)
                    .OrderBy(l => l.SortOrder)
                    .Select(ListingDto.Projection)
                    .ToPageAsync(query.Page, query.Limit, token),
                tags: [StaysModule.CacheTag],
                cancellationToken: cancellationToken);
    }

    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/listings", async ([AsParameters] Query query, Handler handler, CancellationToken cancellationToken) =>
            TypedResults.Ok(await handler.HandleAsync(query, cancellationToken)));

    // Same semantics as the frontend's mockListingRepository: case-insensitive exact city, exact category, inclusive ranges.
    private static IQueryable<Listing> Filter(IQueryable<Listing> listings, Query query)
    {
        if (!string.IsNullOrWhiteSpace(query.Location))
        {
            var city = query.Location.ToLowerInvariant();
            listings = listings.Where(l => l.Location.City.ToLower() == city);
        }

        if (!string.IsNullOrWhiteSpace(query.Category))
        {
            listings = listings.Where(l => l.Category == query.Category);
        }

        if (query.MinPrice is { } minPrice)
        {
            listings = listings.Where(l => l.PricePerNight >= minPrice);
        }

        if (query.MaxPrice is { } maxPrice)
        {
            listings = listings.Where(l => l.PricePerNight <= maxPrice);
        }

        if (query.Guests is { } guests)
        {
            listings = listings.Where(l => l.MaxGuests >= guests);
        }

        if (query.Bedrooms is { } bedrooms)
        {
            listings = listings.Where(l => l.Bedrooms >= bedrooms);
        }

        if (query.Beds is { } beds)
        {
            listings = listings.Where(l => l.Beds >= beds);
        }

        if (query.Baths is { } baths)
        {
            listings = listings.Where(l => l.Baths >= baths);
        }

        return listings;
    }

    private static string CacheKey(Query q) => string.Create(
        CultureInfo.InvariantCulture,
        $"stays:listings:{q.Location?.ToLowerInvariant()}|{q.Category}|{q.MinPrice}|{q.MaxPrice}|{q.Guests}|{q.Bedrooms}|{q.Beds}|{q.Baths}|{q.Page}|{q.Limit}");
}
