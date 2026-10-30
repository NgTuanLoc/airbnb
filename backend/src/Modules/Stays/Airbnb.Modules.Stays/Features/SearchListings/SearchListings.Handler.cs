using System.Globalization;
using Airbnb.Modules.Stays.Data;
using Airbnb.SharedKernel;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;

namespace Airbnb.Modules.Stays.Listings;

internal static partial class SearchListings
{
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
