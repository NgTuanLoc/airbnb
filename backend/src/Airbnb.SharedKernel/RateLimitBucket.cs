namespace Airbnb.SharedKernel;

// Endpoint metadata (`.WithMetadata(RateLimitBucket.Views)`) that gives an endpoint's requests their own per-IP budget
// instead of the shared read or write one.
public sealed record RateLimitBucket(string Name)
{
    // Listing view pings: technically writes, but one per page view, so they mustn't spend the write budget.
    public static readonly RateLimitBucket Views = new("views");
}
