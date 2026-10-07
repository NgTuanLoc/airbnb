namespace Airbnb.Modules.Identity;

internal sealed record UserDto(string Id, string Name, string Email)
{
    internal static UserDto From(User user) => new(user.Id, user.Name, user.Email);
}

internal sealed record AuthSessionDto(UserDto User, string Token, DateTimeOffset ExpiresAt);
