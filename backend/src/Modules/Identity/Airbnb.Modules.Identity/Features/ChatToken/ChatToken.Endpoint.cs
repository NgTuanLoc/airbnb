using System.Security.Claims;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Airbnb.Modules.Identity;

// Token exchange for the chat service (chat spec): the browser mustn't hold the session token, so a session buys a
// short-lived JWT that the chat service checks on its own, without calling back here.
internal static partial class ChatToken
{
    internal static void Map(IEndpointRouteBuilder api, SymmetricSecurityKey key) =>
        api.MapPost("/auth/chat-token", (ClaimsPrincipal user, TimeProvider time) =>
        {
            var now = time.GetUtcNow();
            var expiresAt = now + Lifetime;
            var token = new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
            {
                Issuer = Issuer,
                Audience = Audience,
                IssuedAt = now.UtcDateTime,
                NotBefore = now.UtcDateTime,
                Expires = expiresAt.UtcDateTime,
                Claims = new Dictionary<string, object>
                {
                    [JwtRegisteredClaimNames.Sub] = user.FindFirstValue(ClaimTypes.NameIdentifier)!,
                    ["name"] = user.FindFirstValue(ClaimTypes.Name)!,
                },
                SigningCredentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256),
            });
            return TypedResults.Ok(ApiResponse.Ok(new ChatTokenDto(token, expiresAt)));
        }).RequireAuthorization().WithMetadata(RateLimitBucket.ChatTokens);
}
