using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;

namespace Airbnb.Assistant.Tools;

public sealed record CatalogLocation(string City, string? Country);

// A listing as the Next server's catalog API returns it (the fields the assistant uses).
public sealed record CatalogListing(
    string Id,
    string Title,
    CatalogLocation Location,
    decimal PricePerNight,
    double Rating,
    int ReviewCount,
    string Category,
    string? Description,
    string? PropertyType,
    int MaxGuests,
    int Bedrooms,
    int Beds,
    double Baths,
    List<string>? Amenities);

public sealed record ListingSearch(string? City, string? Category, int? Guests, int? MinPrice, int? MaxPrice, int? Bedrooms);

// The cities and categories the catalog has, for the prompt (so the model passes values the search understands).
public sealed record CatalogFacets(IReadOnlyList<string> Cities, IReadOnlyList<string> Categories);

// A quote, or why there isn't one (bad dates, too many guests, no such listing).
public sealed record QuoteResult(JsonElement? Quote, string? Problem);

// The Next server's public catalog API: the one place that has seed and host listings alike, with the app's search
// rules and price math (assistant spec: "Why Next's catalog API"). Read-only, no session.
public sealed class CatalogClient(HttpClient http, IMemoryCache cache)
{
    private static readonly TimeSpan FacetsLifetime = TimeSpan.FromMinutes(5);
    private const string FacetsKey = "catalog-facets";

    private sealed record Envelope<T>(bool Success, T? Data, string? Error);

    public async Task<IReadOnlyList<CatalogListing>> SearchAsync(ListingSearch search, CancellationToken cancellationToken)
    {
        var query = new List<string>();
        void Add(string name, object? value)
        {
            if (value is not null && !(value is string text && string.IsNullOrWhiteSpace(text)))
            {
                query.Add($"{name}={Uri.EscapeDataString(value.ToString()!)}");
            }
        }
        Add("location", search.City);
        Add("category", search.Category);
        Add("guests", search.Guests);
        Add("minPrice", search.MinPrice);
        Add("maxPrice", search.MaxPrice);
        Add("bedrooms", search.Bedrooms);
        var url = query.Count > 0 ? $"/api/listings?{string.Join("&", query)}" : "/api/listings";
        return (await GetEnvelopeAsync<List<CatalogListing>>(url, cancellationToken)).Data ?? [];
    }

    public async Task<CatalogListing?> GetAsync(string listingId, CancellationToken cancellationToken)
    {
        using var response = await http.GetAsync($"/api/listings/{Uri.EscapeDataString(listingId)}", cancellationToken);
        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<Envelope<CatalogListing>>(cancellationToken))?.Data;
    }

    public async Task<QuoteResult> QuoteAsync(string listingId, string checkIn, string checkOut, int guests, CancellationToken cancellationToken)
    {
        var url = $"/api/listings/{Uri.EscapeDataString(listingId)}/quote"
            + $"?checkIn={Uri.EscapeDataString(checkIn)}&checkOut={Uri.EscapeDataString(checkOut)}&guests={guests}";
        using var response = await http.GetAsync(url, cancellationToken);
        var envelope = await response.Content.ReadFromJsonAsync<Envelope<JsonElement>>(cancellationToken);
        if (response.StatusCode is HttpStatusCode.BadRequest or HttpStatusCode.NotFound)
        {
            return new QuoteResult(null, envelope?.Error ?? "Those dates can't be quoted");
        }
        response.EnsureSuccessStatusCode();
        return new QuoteResult(envelope?.Data, null);
    }

    public async Task<CatalogFacets> FacetsAsync(CancellationToken cancellationToken) =>
        (await cache.GetOrCreateAsync(FacetsKey, async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = FacetsLifetime;
            var all = await SearchAsync(new ListingSearch(null, null, null, null, null, null), cancellationToken);
            return new CatalogFacets(
                [.. all.Select(l => l.Location.City).Distinct(StringComparer.OrdinalIgnoreCase).Order()],
                [.. all.Select(l => l.Category).Distinct(StringComparer.OrdinalIgnoreCase).Order()]);
        }))!;

    private async Task<Envelope<T>> GetEnvelopeAsync<T>(string url, CancellationToken cancellationToken)
    {
        using var response = await http.GetAsync(url, cancellationToken);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<Envelope<T>>(cancellationToken))!;
    }
}
