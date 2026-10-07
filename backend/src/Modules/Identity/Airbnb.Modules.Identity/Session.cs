namespace Airbnb.Modules.Identity;

internal sealed class Session
{
    public required string TokenHash { get; init; }
    public required string UserId { get; init; }
    public User User { get; init; } = null!;
    public required DateTimeOffset CreatedAt { get; init; }
    public required DateTimeOffset ExpiresAt { get; init; }
}
