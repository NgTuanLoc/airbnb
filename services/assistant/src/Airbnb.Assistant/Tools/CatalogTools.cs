using System.ComponentModel;
using Microsoft.Extensions.AI;

namespace Airbnb.Assistant.Tools;

// The places the last search found, for the answer's listing cards: the cards come from here, never from the model's
// text, so a place the model invents never gets a link.
public sealed class FoundListings
{
    public IReadOnlyList<CatalogListing> Last { get; private set; } = [];

    public void Record(IReadOnlyList<CatalogListing> listings) => Last = listings;
}

// What the model may look up: read-only, public catalog data. A lookup that fails tells the model so in words, so it
// says it can't check rather than guessing.
public sealed class CatalogTools(CatalogClient catalog, FoundListings found, ILogger<CatalogTools> logger)
{
    public const int MaxResults = 5;
    private const string Unavailable =
        "The listings are unavailable right now. Tell the guest you can't look this up at the moment; don't guess.";

    public IList<AITool> All() =>
    [
        AIFunctionFactory.Create(SearchListingsAsync, "search_listings",
            "Search the site's places to stay. Use it whenever the guest wants to find, compare or be recommended places. " +
            "Only mention places it returns."),
        AIFunctionFactory.Create(GetListingAsync, "get_listing",
            "One place's details: description, rooms, beds, baths, amenities, price per night, rating."),
        AIFunctionFactory.Create(QuoteStayAsync, "quote_stay",
            "Whether a place is free for the given dates and what the stay costs, with the same fees as booking."),
    ];

    public async Task<object> SearchListingsAsync(
        [Description("A city the site has, e.g. Aspen")] string? city = null,
        [Description("A category the site has, e.g. Cabins")] string? category = null,
        [Description("How many guests are coming")] int? guests = null,
        [Description("Lowest price per night, in US dollars")] int? minPrice = null,
        [Description("Highest price per night, in US dollars")] int? maxPrice = null,
        [Description("Fewest bedrooms")] int? bedrooms = null,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var matches = (await catalog.SearchAsync(new ListingSearch(city, category, guests, minPrice, maxPrice, bedrooms), cancellationToken))
                .OrderByDescending(l => l.Rating)
                .Take(MaxResults)
                .ToList();
            found.Record(matches);
            if (matches.Count == 0)
            {
                return new { message = "No places match. Suggest loosening a filter." };
            }
            return matches.Select(l => new
            {
                id = l.Id,
                title = l.Title,
                city = l.Location.City,
                category = l.Category,
                pricePerNight = l.PricePerNight,
                maxGuests = l.MaxGuests,
                bedrooms = l.Bedrooms,
                rating = l.Rating,
                amenities = l.Amenities,
            }).ToList();
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException && !cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning("The catalog search failed: {Error}", exception.GetType().Name);
            return new { message = Unavailable };
        }
    }

    public async Task<object> GetListingAsync(
        [Description("The listing's id, like l13 or hl-…")] string listingId,
        CancellationToken cancellationToken = default)
    {
        try
        {
            return await catalog.GetAsync(listingId, cancellationToken) is { } l
                ? new
                {
                    id = l.Id,
                    title = l.Title,
                    city = l.Location.City,
                    country = l.Location.Country,
                    category = l.Category,
                    propertyType = l.PropertyType,
                    description = l.Description,
                    maxGuests = l.MaxGuests,
                    bedrooms = l.Bedrooms,
                    beds = l.Beds,
                    baths = l.Baths,
                    amenities = l.Amenities,
                    pricePerNight = l.PricePerNight,
                    rating = l.Rating,
                    reviewCount = l.ReviewCount,
                }
                : new { message = $"There's no listing with the id {listingId}." };
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException && !cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning("The listing lookup failed: {Error}", exception.GetType().Name);
            return new { message = Unavailable };
        }
    }

    public async Task<object> QuoteStayAsync(
        [Description("The listing's id, like l13 or hl-…")] string listingId,
        [Description("Check-in date, YYYY-MM-DD")] string checkIn,
        [Description("Check-out date, YYYY-MM-DD")] string checkOut,
        [Description("How many guests are coming")] int guests,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var result = await catalog.QuoteAsync(listingId, checkIn, checkOut, guests, cancellationToken);
            return result.Quote is { } quote ? quote : new { message = result.Problem };
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException && !cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning("The quote failed: {Error}", exception.GetType().Name);
            return new { message = Unavailable };
        }
    }
}
