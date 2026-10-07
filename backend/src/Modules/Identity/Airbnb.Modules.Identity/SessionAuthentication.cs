using System.Security.Claims;
using System.Text.Encodings.Web;
using Airbnb.Modules.Identity.Data;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Airbnb.Modules.Identity;

internal static class SessionAuthentication
{
    internal const string Scheme = "Session";
    internal const string LogInMessage = "Log in to continue";
}

// "Authorization: Bearer <token>" → the session's user, if the session exists and hasn't expired (spec §1).
internal sealed class SessionAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    IdentityDbContext db,
    TimeProvider time) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (SessionStore.BearerToken(Request) is not { } token)
        {
            return AuthenticateResult.NoResult();
        }

        var hash = SessionTokens.Hash(token);
        var session = await db.Sessions.Include(s => s.User).SingleOrDefaultAsync(s => s.TokenHash == hash, Context.RequestAborted);
        if (session is null)
        {
            return AuthenticateResult.NoResult();
        }
        if (session.ExpiresAt <= time.GetUtcNow())
        {
            // ponytail: expired rows are deleted only when presented; add a scheduled purge if the table grows.
            db.Sessions.Remove(session);
            await db.SaveChangesAsync(Context.RequestAborted);
            return AuthenticateResult.NoResult();
        }

        var identity = new ClaimsIdentity(
            [
                new Claim(ClaimTypes.NameIdentifier, session.User.Id),
                new Claim(ClaimTypes.Name, session.User.Name),
                new Claim(ClaimTypes.Email, session.User.Email),
            ],
            SessionAuthentication.Scheme);
        return AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), SessionAuthentication.Scheme));
    }

    // RequireAuthorization() failures get the API's envelope instead of an empty 401.
    protected override async Task HandleChallengeAsync(AuthenticationProperties properties)
    {
        Response.StatusCode = StatusCodes.Status401Unauthorized;
        await Response.WriteAsJsonAsync(ApiResponse.Fail(SessionAuthentication.LogInMessage), Context.RequestAborted);
    }
}
