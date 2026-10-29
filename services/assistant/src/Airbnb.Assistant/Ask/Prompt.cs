using System.Globalization;
using Airbnb.Assistant.Tools;

namespace Airbnb.Assistant.Ask;

// The system prompt: who the assistant is, its rules (the spec's anti-goals), what the catalog has, the listing the
// guest is on, and the guide to how the site works.
public sealed class Prompt(CatalogClient catalog, TimeProvider time, ILogger<Prompt> logger)
{
    private static readonly string Guide = ReadGuide();

    public async Task<string> ForAsync(string? listingId, CancellationToken cancellationToken)
    {
        var today = DateOnly.FromDateTime(time.GetUtcNow().UtcDateTime);
        var facets = await FacetsAsync(cancellationToken);
        var looking = listingId is null ? "" : $"\nThe guest is looking at the listing {listingId}; \"this place\" means it.\n";
        return $"""
            You are the assistant on a home-rental site, helping guests. Today is {today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)} ({today.DayOfWeek}).

            Rules:
            - To find or recommend places, call search_listings. Mention only places it returned, with title, city and price per night.
            - For a place's details call get_listing. For availability or the price of particular dates call quote_stay. Never guess availability or prices.
            - For how the site works, use the guide below.
            - You can't book, cancel, pay or change anything: tell the guest where on the site to do it.
            - You only see public listing information, never anyone's trips, messages or account.
            - If you don't know, say so. Never make up places, prices, availability or policies.
            - If you need something you weren't told, like the dates or how many guests, ask for it.
            - Answer in plain text without markdown, in under about 120 words.

            The site's cities: {facets.Cities}.
            Its categories: {facets.Categories}.
            {looking}
            {Guide}
            """;
    }

    private async Task<(string Cities, string Categories)> FacetsAsync(CancellationToken cancellationToken)
    {
        try
        {
            var facets = await catalog.FacetsAsync(cancellationToken);
            return (string.Join(", ", facets.Cities), string.Join(", ", facets.Categories));
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException && !cancellationToken.IsCancellationRequested)
        {
            // The prompt goes without them; the tools then tell the model the catalog is down.
            logger.LogWarning("Reading the catalog's cities failed: {Error}", exception.GetType().Name);
            return ("unknown right now", "unknown right now");
        }
    }

    private static string ReadGuide()
    {
        using var stream = typeof(Prompt).Assembly.GetManifestResourceStream("guide.md")
            ?? throw new InvalidOperationException("The embedded guide.md is missing");
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
