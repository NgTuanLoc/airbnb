namespace Airbnb.Modules.Identity;

internal static partial class ChatToken
{
    internal sealed record ChatTokenDto(string Token, DateTimeOffset ExpiresAt);
}
