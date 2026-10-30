using System.Security.Claims;
using Airbnb.Modules.Identity.Data;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

namespace Airbnb.Modules.Identity.External;

internal static partial class StartExternalLogin
{
    internal static readonly ExternalLoginError EmailRequired =
        new("email_required", "Enter your work email to continue with single sign-on.", StatusCodes.Status400BadRequest);

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
}
