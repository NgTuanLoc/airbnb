using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Airbnb.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Airbnb.Api.Tests.Identity;

// The token the browser takes to the chat service (chat spec: "Authentication: token exchange").
public sealed class ChatTokenTests(InfrastructureFixture infrastructure)
{
    private const string SigningKey = "test-chat-signing-key-0123456789abcdef";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private WebApplicationFactory<Program> Factory(string? signingKey = SigningKey) =>
        new ApiFactory(infrastructure).WithWebHostBuilder(builder =>
        {
            if (signingKey is not null)
            {
                builder.UseSetting("Identity:ChatToken:SigningKey", signingKey);
            }
        });

    private static async Task<HttpResponseMessage> RequestTokenAsync(HttpClient client, string? sessionToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/chat-token");
        if (sessionToken is not null)
        {
            request.Authorized(sessionToken);
        }
        return await client.SendAsync(request, Ct);
    }

    [Fact]
    public async Task Needs_a_session()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();

        using var response = await RequestTokenAsync(client, sessionToken: null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Is_off_without_a_signing_key()
    {
        await using var factory = Factory(signingKey: null);
        using var client = factory.CreateClient();
        var (session, _, _) = await AuthHelpers.RegisterAsync(client);

        using var response = await RequestTokenAsync(client, session);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Signs_a_ten_minute_token_for_the_chat_audience()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var (session, userId, _) = await AuthHelpers.RegisterAsync(client, "Chloe");

        using var response = await RequestTokenAsync(client, session);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var data = (await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("data");
        var result = await new JsonWebTokenHandler().ValidateTokenAsync(data.GetProperty("token").GetString(), new TokenValidationParameters
        {
            ValidIssuer = "airbnb-identity",
            ValidAudience = "chat",
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(SigningKey)),
            ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
        });
        Assert.True(result.IsValid, result.Exception?.Message);
        var jwt = (JsonWebToken)result.SecurityToken;
        Assert.Equal(userId, jwt.Subject);
        Assert.Equal("Chloe", jwt.GetClaim("name").Value);
        Assert.Equal(TimeSpan.FromMinutes(10), jwt.ValidTo - jwt.IssuedAt);
        var expiresAt = data.GetProperty("expiresAt").GetDateTimeOffset();
        Assert.InRange((expiresAt.UtcDateTime - jwt.ValidTo).Duration(), TimeSpan.Zero, TimeSpan.FromSeconds(1));
    }

    [Fact]
    public async Task Chat_tokens_have_their_own_rate_limit_bucket()
    {
        // Every chat page and reconnect fetches a token: they mustn't spend the budget logins and bookings share.
        await using var factory = Factory().WithWebHostBuilder(builder => builder
            .UseSetting("RateLimiting:WritesPerMinute", "1")
            .UseSetting("RateLimiting:ChatTokensPerMinute", "3"));
        using var client = factory.CreateClient();
        var (session, _, _) = await AuthHelpers.RegisterAsync(client);

        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < 4; i++)
        {
            using var response = await RequestTokenAsync(client, session);
            statuses.Add(response.StatusCode);
        }

        Assert.Equal([HttpStatusCode.OK, HttpStatusCode.OK, HttpStatusCode.OK, HttpStatusCode.TooManyRequests], statuses);
    }

    [Fact]
    public async Task A_short_signing_key_fails_at_startup()
    {
        await using var factory = Factory(signingKey: "too-short");

        Assert.ThrowsAny<Exception>(() => factory.CreateClient());
    }
}
