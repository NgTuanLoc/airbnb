using Airbnb.Modules.Identity.Data;

namespace Airbnb.Modules.Identity;

internal static class SessionStore
{
    // Starts a session for a saved user and returns what the caller hands to the browser.
    internal static async Task<AuthSessionDto> StartAsync(IdentityDbContext db, User user, TimeProvider time, CancellationToken cancellationToken)
    {
        var token = SessionTokens.NewToken();
        var now = time.GetUtcNow();
        var session = new Session
        {
            TokenHash = SessionTokens.Hash(token),
            UserId = user.Id,
            CreatedAt = now,
            ExpiresAt = now + SessionTokens.Lifetime,
        };
        db.Sessions.Add(session);
        await db.SaveChangesAsync(cancellationToken);
        return new AuthSessionDto(UserDto.From(user), token, session.ExpiresAt);
    }

    // The raw token in an "Authorization: Bearer <token>" header, or null.
    internal static string? BearerToken(Microsoft.AspNetCore.Http.HttpRequest request)
    {
        var header = request.Headers.Authorization.ToString();
        const string prefix = "Bearer ";
        return header.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) && header.Length > prefix.Length
            ? header[prefix.Length..].Trim()
            : null;
    }
}
