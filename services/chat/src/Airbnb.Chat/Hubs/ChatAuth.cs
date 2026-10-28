using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.SignalR;
using Microsoft.IdentityModel.Tokens;

namespace Airbnb.Chat.Hubs;

// Tokens come from the monolith's Identity module (chat spec: "Authentication: token exchange"): checked here on their
// own, with no call back to the monolith.
public static class ChatAuth
{
    public const string Issuer = "airbnb-identity";
    public const string Audience = "chat";
    private const int MinKeyLength = 32;

    // Bad settings fail at startup: without both keys nobody could chat.
    public static SymmetricSecurityKey TokenKey(IConfiguration configuration)
    {
        var key = configuration["Chat:TokenKey"];
        if (key is not { Length: >= MinKeyLength })
        {
            throw new InvalidOperationException($"Chat:TokenKey is required, at least {MinKeyLength} characters");
        }
        if (string.IsNullOrEmpty(configuration["Chat:ServiceKey"]))
        {
            throw new InvalidOperationException("Chat:ServiceKey is required");
        }
        return new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
    }

    public static void Configure(JwtBearerOptions options, SymmetricSecurityKey key)
    {
        // Claims keep their JWT names: "sub" is the user id, "name" the display name.
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidIssuer = Issuer,
            ValidAudience = Audience,
            IssuerSigningKey = key,
            ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
            NameClaimType = "name",
            ClockSkew = TimeSpan.FromSeconds(30),
        };
        options.Events = new JwtBearerEvents
        {
            // Browsers can't set headers on a WebSocket, so the JavaScript client sends the token in the query string.
            OnMessageReceived = context =>
            {
                if (context.Request.Path.StartsWithSegments("/hub") && context.Request.Query["access_token"] is [{ Length: > 0 } token])
                {
                    context.Token = token;
                }
                return Task.CompletedTask;
            },
        };
    }
}

// Clients.User(id) addresses every connection of the token's subject.
public sealed class SubjectUserIdProvider : IUserIdProvider
{
    public string? GetUserId(HubConnectionContext connection) => connection.User.FindFirst("sub")?.Value;
}
