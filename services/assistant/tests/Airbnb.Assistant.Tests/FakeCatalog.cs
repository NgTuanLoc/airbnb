using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;

namespace Airbnb.Assistant.Tests;

// The Next server's public catalog API in memory: /api/listings (location filter only), /api/listings/{id} and
// /api/listings/{id}/quote. Records every request; Down makes every call fail.
public sealed class FakeCatalog : HttpMessageHandler
{
    public static object Listing(string id, string title, string city, decimal price, double rating = 4.8, string category = "Cabins") => new
    {
        id,
        title,
        location = new { city, country = "USA", lat = 0, lng = 0 },
        photos = Array.Empty<string>(),
        pricePerNight = price,
        rating,
        reviewCount = 12,
        isGuestFavorite = false,
        hostId = "h1",
        category,
        description = $"{title}, a lovely place.",
        propertyType = "Entire cabin",
        maxGuests = 4,
        bedrooms = 2,
        beds = 2,
        baths = 1,
        amenities = new[] { "Wifi", "Hot tub" },
    };

    public List<object> Listings { get; } =
    [
        Listing("l13", "Pine cabin", "Aspen", 180),
        Listing("l14", "Lakeside loft", "Aspen", 150, rating: 4.9),
        Listing("l2", "Beach villa", "Malibu", 540, category: "Beachfront"),
    ];

    public object Quote { get; set; } = new
    {
        listingId = "l13",
        checkIn = "2030-05-03",
        checkOut = "2030-05-06",
        nights = 3,
        available = true,
        priceBreakdown = new { lineItems = new[] { new { label = "$180 x 3 nights", amount = 540 } }, total = 690 },
    };

    public bool Down { get; set; }

    public ConcurrentQueue<string> Requests { get; } = new();

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var uri = request.RequestUri!;
        Requests.Enqueue(uri.PathAndQuery);
        if (Down)
        {
            throw new HttpRequestException("The catalog is down");
        }
        var query = System.Web.HttpUtility.ParseQueryString(uri.Query);
        var segments = uri.AbsolutePath.Trim('/').Split('/');
        return Task.FromResult(segments switch
        {
            // As the real search: the city ignoring case, the category exactly.
            ["api", "listings"] => Ok(Listings
                .Where(l => query["location"] is not { } city || string.Equals(City(l), city, StringComparison.OrdinalIgnoreCase))
                .Where(l => query["category"] is not { } category || Category(l) == category)
                .ToList()),
            ["api", "listings", var id] => Listings.FirstOrDefault(l => Id(l) == id) is { } listing
                ? Ok(listing)
                : Json(HttpStatusCode.NotFound, new { success = false, error = $"Listing '{id}' was not found" }),
            ["api", "listings", _, "quote"] => Ok(Quote),
            _ => new HttpResponseMessage(HttpStatusCode.NotFound),
        });
    }

    private static string Id(object listing) => (string)listing.GetType().GetProperty("id")!.GetValue(listing)!;

    private static string Category(object listing) => (string)listing.GetType().GetProperty("category")!.GetValue(listing)!;

    private static string City(object listing)
    {
        var location = listing.GetType().GetProperty("location")!.GetValue(listing)!;
        return (string)location.GetType().GetProperty("city")!.GetValue(location)!;
    }

    private static HttpResponseMessage Ok(object data) => Json(HttpStatusCode.OK, new { success = true, data });

    private static HttpResponseMessage Json(HttpStatusCode status, object body) => new(status) { Content = JsonContent.Create(body) };
}
