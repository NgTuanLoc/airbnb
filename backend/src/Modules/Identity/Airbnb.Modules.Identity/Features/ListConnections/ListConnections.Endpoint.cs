using System.Security.Claims;
using Airbnb.Modules.Identity.Data;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace Airbnb.Modules.Identity.External;

// Login & security: the sign-in methods a user has connected, and disconnecting them (OAuth spec §1, endpoint table).
internal static partial class ListConnections
{
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
