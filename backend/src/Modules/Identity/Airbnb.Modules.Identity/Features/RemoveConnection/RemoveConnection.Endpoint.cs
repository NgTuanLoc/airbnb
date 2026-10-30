using System.Security.Claims;
using Airbnb.Modules.Identity.Data;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace Airbnb.Modules.Identity.External;

internal static partial class RemoveConnection
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
