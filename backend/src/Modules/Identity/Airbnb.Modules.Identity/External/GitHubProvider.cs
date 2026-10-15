using System.Globalization;
using System.Net.Http.Headers;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Logging;

namespace Airbnb.Modules.Identity.External;

// GitHub is OAuth 2.0 without OpenID Connect: the identity comes from its REST API (OAuth spec §1, "Providers").
// PKCE (S256) has been supported since July 2025; the client secret is still required.
internal sealed class GitHubProvider(ClientCredentials credentials, IHttpClientFactory clients, ILogger logger) : IExternalProvider
{
    internal const string AuthorizationEndpoint = "https://github.com/login/oauth/authorize";
    internal const string TokenEndpoint = "https://github.com/login/oauth/access_token";
    internal const string ApiBaseUrl = "https://api.github.com";

    public string Key => "github";

    public string Name => "GitHub";

    public ProviderKind Kind => ProviderKind.Social;

    public Task<string> BuildAuthorizationUrlAsync(AuthorizationRequest request, CancellationToken cancellationToken) =>
        Task.FromResult(QueryHelpers.AddQueryString(AuthorizationEndpoint, new Dictionary<string, string?>
        {
            ["client_id"] = credentials.ClientId,
            ["redirect_uri"] = request.RedirectUri,
            ["scope"] = "read:user user:email",
            ["state"] = request.State,
            ["code_challenge"] = request.CodeChallenge,
            ["code_challenge_method"] = "S256",
        }));

    // GitHub sends no iss on its callback, and this flow's endpoints are fixed, so there is no issuer to compare.
    public async Task<ExternalIdentity> ExchangeAsync(CodeExchange exchange, CancellationToken cancellationToken)
    {
        using var client = clients.CreateClient(ExternalHttp.ClientName);
        var accessToken = await RedeemCodeAsync(client, exchange, cancellationToken);
        var user = await GetAsync<GitHubUser>(client, "/user", accessToken, cancellationToken);
        var emails = await GetAsync<GitHubEmail[]>(client, "/user/emails", accessToken, cancellationToken);
        var email = PrimaryVerifiedEmail(emails)
            ?? throw new ExternalLoginException(ExternalLoginError.NoVerifiedEmail, "github: no verified primary email");
        var name = string.IsNullOrWhiteSpace(user.Name) ? user.Login : user.Name;
        return new ExternalIdentity(user.Id.ToString(CultureInfo.InvariantCulture), Emails.Normalize(email), name);
    }

    // Only the primary address, and only once GitHub has verified it: secondary addresses are less looked after.
    internal static string? PrimaryVerifiedEmail(IEnumerable<GitHubEmail> emails) =>
        emails.FirstOrDefault(email => email is { Primary: true, Verified: true })?.Email;

    private async Task<string> RedeemCodeAsync(HttpClient client, CodeExchange exchange, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, TokenEndpoint)
        {
            Content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["client_id"] = credentials.ClientId!,
                ["client_secret"] = credentials.ClientSecret!,
                ["code"] = exchange.Code,
                ["redirect_uri"] = exchange.RedirectUri,
                ["code_verifier"] = exchange.CodeVerifier,
            }),
        };
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        using var response = await ExternalHttp.SendAsync(client, request, cancellationToken);
        // GitHub answers 200 with an "error" member when it refuses a code.
        var payload = await ExternalHttp.ReadJsonAsync<TokenResponse>(response, cancellationToken);
        if (!response.IsSuccessStatusCode || string.IsNullOrEmpty(payload?.AccessToken))
        {
            logger.LogWarning("GitHub refused the code exchange: {Status} {Error}", (int)response.StatusCode, payload?.Error);
            throw new ExternalLoginException(ExternalLoginError.ProviderError, "github: the code exchange failed");
        }
        return payload.AccessToken;
    }

    private async Task<T> GetAsync<T>(HttpClient client, string path, string accessToken, CancellationToken cancellationToken) where T : class
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, ApiBaseUrl + path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github+json"));
        request.Headers.Add("X-GitHub-Api-Version", "2022-11-28");
        using var response = await ExternalHttp.SendAsync(client, request, cancellationToken);
        var payload = response.IsSuccessStatusCode ? await ExternalHttp.ReadJsonAsync<T>(response, cancellationToken) : null;
        if (payload is null)
        {
            logger.LogWarning("GitHub {Path} answered {Status}", path, (int)response.StatusCode);
            throw new ExternalLoginException(ExternalLoginError.ProviderError, $"github: {path} failed");
        }
        return payload;
    }

    private sealed record TokenResponse(
        [property: JsonPropertyName("access_token")] string? AccessToken,
        [property: JsonPropertyName("error")] string? Error);

    internal sealed record GitHubUser(long Id, string? Login, string? Name);

    internal sealed record GitHubEmail(string Email, bool Primary, bool Verified);
}
