using System.Security.Claims;
using System.Text;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Airbnb.Modules.Identity;

// Token exchange for the chat service (chat spec): the browser mustn't hold the session token, so a session buys a
// short-lived JWT that the chat service checks on its own, without calling back here.
internal static class ChatToken
{
    internal const string SigningKeySetting = "Identity:ChatToken:SigningKey";
    internal const string Issuer = "airbnb-identity";
    internal const string Audience = "chat";
    internal static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(10);
    private const int MinKeyLength = 32;

    internal sealed record ChatTokenDto(string Token, DateTimeOffset ExpiresAt);

    // Null when chat is off (no key). A key too short to sign with safely fails the host at startup.
    internal static SymmetricSecurityKey? SigningKey(IConfiguration configuration)
    {
        var key = configuration[SigningKeySetting];
        if (string.IsNullOrEmpty(key))
        {
            return null;
        }
        if (key.Length < MinKeyLength)
        {
            throw new InvalidOperationException($"{SigningKeySetting} must be at least {MinKeyLength} characters");
        }
        return new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
    }

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
