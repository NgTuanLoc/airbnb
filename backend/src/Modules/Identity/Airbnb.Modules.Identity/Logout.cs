using Airbnb.Modules.Identity.Data;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace Airbnb.Modules.Identity;

internal static class Logout
{
    // Always 204: logging out of a missing or already-revoked session is still "logged out".
    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapPost("/auth/logout", async (HttpRequest request, IdentityDbContext db, CancellationToken cancellationToken) =>
        {
            if (SessionStore.BearerToken(request) is { } token)
            {
                var hash = SessionTokens.Hash(token);
                await db.Sessions.Where(s => s.TokenHash == hash).ExecuteDeleteAsync(cancellationToken);
            }
            return TypedResults.NoContent();
        });
}
