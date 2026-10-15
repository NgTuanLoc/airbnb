namespace Airbnb.Modules.Identity.External;

// A provider account connected to a user: the provider's stable id for that person, never their email.
internal sealed class ExternalLogin
{
    public required string Provider { get; init; }
    public required string Subject { get; init; }
    public required string UserId { get; init; }
    public User User { get; init; } = null!;

    // What the provider last reported, shown on Login & security.
    public required string Email { get; set; }
    public required DateTimeOffset CreatedAt { get; init; }
}
