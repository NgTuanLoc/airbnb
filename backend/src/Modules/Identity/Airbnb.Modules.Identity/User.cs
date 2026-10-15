namespace Airbnb.Modules.Identity;

internal sealed class User
{
    public required string Id { get; init; }
    public required string Email { get; init; }
    public required string Name { get; init; }

    // Null for accounts created by an external sign-in: there is no password to check.
    public string? PasswordHash { get; set; }

    // When a provider we trust confirmed this email. Null for password registrations, which never verify it, so an
    // external sign-in with the same email must not take such an account over (OAuth spec, "Email collisions").
    public DateTimeOffset? EmailVerifiedAt { get; set; }

    public required DateTimeOffset CreatedAt { get; init; }
}
