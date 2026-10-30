namespace Airbnb.Modules.Identity.External;

// One sign-in or connect attempt between "start" and the provider's callback (OAuth spec §1).
// Found by the hash of an id only the browser's flow cookie holds; deleted by the callback, so it is single-use.
internal sealed class ExternalLoginFlow
{
    internal static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(10);

    public required string IdHash { get; init; }
    public required string Provider { get; init; }
    public required string State { get; init; }
    public required string Nonce { get; init; }
    public required string CodeVerifier { get; init; }

    // Set for a "connect" flow started by a signed-in user; null for a sign-in.
    public string? LinkUserId { get; init; }

    public required DateTimeOffset CreatedAt { get; init; }
    public required DateTimeOffset ExpiresAt { get; init; }
}
