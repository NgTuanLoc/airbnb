using System.ComponentModel;
using System.Diagnostics.CodeAnalysis;
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

    // Ollama's tool format (as OllamaSharp sends it) takes one type per parameter, so optional parameters are written
    // as "nullable": true rather than the type list ["string", "null"] Microsoft.Extensions.AI uses by default.
    private static readonly AIJsonSchemaCreateOptions OllamaSchemas = new()
    {
        TransformOptions = new AIJsonSchemaTransformOptions { UseNullableKeyword = true },
    };

    [SuppressMessage("Sonar", "S2325", Justification = "The tools are delegates to this instance's methods")]
    public IList<AITool> All() =>
    [
        Tool(SearchListingsAsync, "search_listings",
            "Search the site's places to stay. Use it whenever the guest wants to find, compare or be recommended places. " +
            "Only mention places it returns."),
        Tool(GetListingAsync, "get_listing",
            "One place's details: description, rooms, beds, baths, amenities, price per night, rating."),
        Tool(QuoteStayAsync, "quote_stay",
            "Whether a place is free for the given dates and what the stay costs, with the same fees as booking."),
    ];

    private static AIFunction Tool(Delegate method, string name, string description) =>
        AIFunctionFactory.Create(method, new AIFunctionFactoryOptions { Name = name, Description = description, JsonSchemaCreateOptions = OllamaSchemas });

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
            var facets = await catalog.FacetsAsync(cancellationToken);
            var search = new ListingSearch(Known(city, facets.Cities), Known(category, facets.Categories), guests, minPrice, maxPrice, bedrooms);
            var matches = await TopAsync(search, cancellationToken);
            string? note = null;
            // Small models fill in filters nobody asked for: rather than hide every match behind a wrong category,
            // search without it and say so.
            if (matches.Count == 0 && search.Category is { } dropped)
            {
                matches = await TopAsync(search with { Category = null }, cancellationToken);
                note = matches.Count > 0 ? $"Nothing in the category {dropped}; these places fit the other filters." : null;
            }
            found.Record(matches);
            if (matches.Count == 0)
            {
                return new { message = "No places match. Suggest loosening a filter." };
            }
            var places = matches.Select(l => new
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
            return note is null ? places : new { note, places };
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException && !cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning(exception, "The catalog search failed");
            return new { message = Unavailable };
        }
    }

    private async Task<List<CatalogListing>> TopAsync(ListingSearch search, CancellationToken cancellationToken) =>
        [.. (await catalog.SearchAsync(search, cancellationToken)).OrderByDescending(l => l.Rating).Take(MaxResults)];

    // A city or category as the catalog writes it, so "cabin", "CABINS" or "aspen, colorado" match: the same name
    // ignoring case, then ignoring a plural "s", then a known name inside what was given. Anything else stays as given
    // (a city the site doesn't have finds nothing, which is the honest answer).
    private static string? Known(string? given, IReadOnlyList<string> known)
    {
        if (string.IsNullOrWhiteSpace(given))
        {
            return null;
        }
        var wanted = given.Trim();
        static string Singular(string name) => name.EndsWith('s') || name.EndsWith('S') ? name[..^1] : name;
        return known.FirstOrDefault(name => string.Equals(name, wanted, StringComparison.OrdinalIgnoreCase))
            ?? known.FirstOrDefault(name => string.Equals(Singular(name), Singular(wanted), StringComparison.OrdinalIgnoreCase))
            ?? known.FirstOrDefault(name => wanted.Contains(name, StringComparison.OrdinalIgnoreCase))
            ?? wanted;
    }

    private const string ListingIdDescription = "The listing's id, from search_listings, \"Places shown\" or the listing the guest is on";

    public async Task<object> GetListingAsync(
        [Description(ListingIdDescription)] string listingId,
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
                    // Labelled as the host's words (the prompt says they're data, never instructions).
                    hostDescription = l.Description,
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
            logger.LogWarning(exception, "The listing lookup failed");
            return new { message = Unavailable };
        }
    }

    public async Task<object> QuoteStayAsync(
        [Description(ListingIdDescription)] string listingId,
        [Description("Check-in date, YYYY-MM-DD")] string checkIn,
        [Description("Check-out date, YYYY-MM-DD")] string checkOut,
        [Description("How many guests are coming")] int guests,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var result = await catalog.QuoteAsync(listingId, checkIn, checkOut, guests, cancellationToken);
            if (result.Quote is not { } quote)
            {
                return new { message = result.Problem };
            }
            // In words too: from a bare "available": true, a small model told a guest a free place wasn't.
            var availability = quote.GetProperty("available").GetBoolean()
                ? "Available: nobody has booked these nights, so the guest can book them."
                : "Not available: some of these nights are already booked.";
            return new { availability, quote };
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException && !cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning(exception, "The quote failed");
            return new { message = Unavailable };
        }
    }
}
