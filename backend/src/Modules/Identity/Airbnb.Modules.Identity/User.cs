namespace Airbnb.Modules.Identity;

internal sealed class User
{
    public required string Id { get; init; }
    public required string Email { get; init; }
    public required string Name { get; init; }
    public string PasswordHash { get; set; } = string.Empty;
    public required DateTimeOffset CreatedAt { get; init; }
}
