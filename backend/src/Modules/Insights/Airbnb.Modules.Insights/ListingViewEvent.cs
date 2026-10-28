using System.Diagnostics.CodeAnalysis;
using System.Text.Json;

namespace Airbnb.Modules.Insights;

// One guest view, as it travels through the listing-views topic (keyed by the listing id). Deliberately nothing about
// the viewer: a Kafka log keeps events forever and can't easily be edited.
internal sealed record ListingViewEvent(string ListingId, DateTimeOffset ViewedAt)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public string Serialize() => JsonSerializer.Serialize(this, Json);

    public static bool TryParse(string? value, [NotNullWhen(true)] out ListingViewEvent? view)
    {
        view = null;
        if (string.IsNullOrEmpty(value))
        {
            return false;
        }
        try
        {
            var parsed = JsonSerializer.Deserialize<ListingViewEvent>(value, Json);
            if (parsed is { ListingId: { } id, ViewedAt: var at } && at != default && ListingIds.IsValid(id))
            {
                view = parsed;
            }
        }
        catch (JsonException)
        {
            // Not ours, or corrupted: skipped like any other malformed view.
        }
        return view is not null;
    }
}
