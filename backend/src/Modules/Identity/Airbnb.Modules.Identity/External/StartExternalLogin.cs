using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Airbnb.Modules.Identity.Data;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Airbnb.Modules.Identity.External;

internal static class StartExternalLogin
{
    internal static readonly ExternalLoginError EmailRequired =
        new("email_required", "Enter your work email to continue with single sign-on.", StatusCodes.Status400BadRequest);

    // public for the validation generator; still invisible outside the assembly because the class is internal.
    // Provider "sso" finds the connection by Email's domain; Link starts a "connect" flow for the signed-in user.
    public sealed record Command(
        [property: Required, StringLength(64, MinimumLength = 1)] string? Provider,
        [property: EmailAddress, StringLength(254)] string? Email,
        bool Link);

    // FlowId goes into the browser's httpOnly flow cookie and comes back with the callback; only its hash is stored.
    internal sealed record StartDto(string AuthorizationUrl, string FlowId, string Provider, DateTimeOffset ExpiresAt);

    internal sealed class Handler(IdentityDbContext db, ExternalProviders providers, TimeProvider time)
    {
        // linkUser: the signed-in user for a connect flow, null for a sign-in.
        public async Task<StartDto> HandleAsync(Command command, ClaimsPrincipal? linkUser, CancellationToken cancellationToken)
        {
            var provider = Resolve(command);
            var now = time.GetUtcNow();
            // Abandoned flows are swept here rather than by a scheduled job: one indexed delete per start.
            await db.ExternalLoginFlows.Where(f => f.ExpiresAt <= now).ExecuteDeleteAsync(cancellationToken);

            var flowId = SessionTokens.NewToken();
            var flow = new ExternalLoginFlow
            {
                IdHash = SessionTokens.Hash(flowId),
                Provider = provider.Key,
                // Separate random values: the state travels in URLs, the flow id never does.
                State = SessionTokens.NewToken(),
                Nonce = SessionTokens.NewToken(),
                CodeVerifier = Pkce.NewVerifier(),
                LinkUserId = linkUser?.FindFirstValue(ClaimTypes.NameIdentifier),
                CreatedAt = now,
                ExpiresAt = now + ExternalLoginFlow.Lifetime,
            };
            var loginHint = command.Email is { } email ? Emails.Normalize(email) : linkUser?.FindFirstValue(ClaimTypes.Email);
            var authorizationUrl = await provider.BuildAuthorizationUrlAsync(
                new AuthorizationRequest(providers.RedirectUri(provider), flow.State, flow.Nonce, Pkce.Challenge(flow.CodeVerifier), loginHint),
                cancellationToken);

            db.ExternalLoginFlows.Add(flow);
            await db.SaveChangesAsync(cancellationToken);
            return new StartDto(authorizationUrl, flowId, provider.Key, flow.ExpiresAt);
        }

        private IExternalProvider Resolve(Command command)
        {
            if (command.Provider != ExternalProviders.SsoByEmail)
            {
                return providers.Find(command.Provider!) ?? throw new ExternalLoginException(ExternalLoginError.ProviderUnavailable);
            }
            if (command.Email is null)
            {
                throw new ExternalLoginException(EmailRequired);
            }
            return providers.FindSsoForEmail(command.Email) ?? throw new ExternalLoginException(ExternalLoginError.SsoNotConfigured);
        }
    }

    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapPost("/auth/external/start", async Task<Results<Ok<ApiResponse<StartDto>>, JsonHttpResult<ApiResponse<object>>>> (
            Command command, ClaimsPrincipal principal, Handler handler, ILogger<Handler> logger, CancellationToken cancellationToken) =>
        {
            if (command.Link && principal.Identity?.IsAuthenticated != true)
            {
                return TypedResults.Json(ApiResponse.Fail(SessionAuthentication.LogInMessage), statusCode: StatusCodes.Status401Unauthorized);
            }
            try
            {
                return TypedResults.Ok(ApiResponse.Ok(await handler.HandleAsync(command, command.Link ? principal : null, cancellationToken)));
            }
            catch (ExternalLoginException exception)
            {
                logger.LogInformation(exception, "Starting an external sign-in failed: {Code}", exception.Error.Code);
                return exception.Error.ToResult();
            }
        });
}
