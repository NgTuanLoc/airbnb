using System.Security.Claims;
using System.Text.Json.Serialization;
using Airbnb.Modules.Identity.Data;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace Airbnb.Modules.Identity.External;

// Login & security: the sign-in methods a user has connected, and disconnecting them (OAuth spec §1, endpoint table).
internal static class ListConnections
{
    // Email and ConnectedAt only when connected. Kind is "social" or "sso".
    internal sealed record ConnectionDto(
        string Provider,
        string Name,
        string Kind,
        [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Email,
        [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] DateTimeOffset? ConnectedAt);

    internal sealed record ConnectionsDto(bool HasPassword, IReadOnlyList<ConnectionDto> Connections);

    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/auth/connections", async (ClaimsPrincipal principal, IdentityDbContext db, ExternalProviders providers, CancellationToken cancellationToken) =>
        {
            var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)!;
            var user = await db.Users.AsNoTracking().SingleAsync(u => u.Id == userId, cancellationToken);
            var logins = await db.ExternalLogins.AsNoTracking().Where(l => l.UserId == userId).ToDictionaryAsync(l => l.Provider, cancellationToken);

            // Everything this person could connect (the SSO connection only for their own email domain), then
            // anything connected that is no longer offered, so it can still be disconnected.
            var offered = providers.Social.Select(provider => provider.Key).ToList();
            if (providers.FindSsoForEmail(user.Email) is { } sso)
            {
                offered.Add(sso.Key);
            }
            var keys = offered.Concat(logins.Keys.Except(offered).Order(StringComparer.Ordinal));

            var connections = keys.Select(key =>
            {
                logins.TryGetValue(key, out var login);
                var kind = key.StartsWith(ExternalProviders.SsoKeyPrefix, StringComparison.Ordinal) ? "sso" : "social";
                return new ConnectionDto(key, providers.DisplayName(key), kind, login?.Email, login?.CreatedAt);
            }).ToList();
            return TypedResults.Ok(ApiResponse.Ok(new ConnectionsDto(user.PasswordHash is not null, connections)));
        }).RequireAuthorization();
}

internal static class RemoveConnection
{
    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapDelete("/auth/connections/{provider}", async Task<Results<NoContent, JsonHttpResult<ApiResponse<object>>>> (
            string provider, ClaimsPrincipal principal, IdentityDbContext db, CancellationToken cancellationToken) =>
        {
            var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)!;
            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
            // Locking the user means two disconnects in parallel can't each remove "the other" way to sign in.
            var user = await db.Users
                .FromSql($"""SELECT * FROM identity.users WHERE "Id" = {userId} FOR UPDATE""")
                .SingleAsync(cancellationToken);
            var logins = await db.ExternalLogins.Where(l => l.UserId == userId).ToListAsync(cancellationToken);
            if (logins.SingleOrDefault(l => l.Provider == provider) is not { } login)
            {
                return ExternalLoginError.NotConnected.ToResult();
            }
            if (user.PasswordHash is null && logins.Count == 1)
            {
                return ExternalLoginError.LastLoginMethod.ToResult();
            }

            db.ExternalLogins.Remove(login);
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return TypedResults.NoContent();
        }).RequireAuthorization();
}
