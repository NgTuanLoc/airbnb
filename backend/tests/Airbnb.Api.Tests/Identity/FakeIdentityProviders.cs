using System.Buffers.Text;
using System.Collections.Concurrent;
using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Airbnb.Api.Tests.Identity;

// Google, GitHub and an "Acme" SSO identity provider in one HttpMessageHandler: discovery, JWKS, token endpoints and
// GitHub's REST API, behaving like the real ones where the API relies on it (PKCE, client authentication, single-use
// codes, signed ID tokens). A test plays the person at the provider's sign-in page with Authorize().
public sealed class FakeIdentityProviders : HttpMessageHandler
{
    public const string GoogleClientId = "google-client";
    public const string GoogleClientSecret = "google-secret";
    public const string GitHubClientId = "github-client";
    public const string GitHubClientSecret = "github-secret";
    public const string AcmeAuthority = "https://idp.acme.test/realms/acme";
    public const string AcmeClientId = "airbnb";
    public const string AcmeClientSecret = "acme-secret";

    private const string GoogleIssuer = "https://accounts.google.com";

    private readonly RsaSecurityKey _key = new(RSA.Create(2048)) { KeyId = "fake-key" };
    private readonly ConcurrentDictionary<string, Grant> _codes = new();
    private readonly ConcurrentDictionary<string, Grant> _gitHubTokens = new();

    // A provider outage: token endpoints answer 503.
    public bool TokenEndpointDown { get; set; }

    public sealed record Person(string Subject, string Email, bool EmailVerified = true, string? Name = "Test Person");

    public sealed record GitHubEmail(string Email, bool Primary, bool Verified);

    private sealed record Grant(
        string Provider,
        string RedirectUri,
        string CodeChallenge,
        string? Nonce,
        Person Person,
        Action<Dictionary<string, object>>? TamperClaims,
        IReadOnlyList<GitHubEmail>? GitHubEmails);

    // The person signs in at the provider: checks what the API sent the browser to, then returns the code the
    // provider would redirect back with. tamperClaims edits the ID token's claims before it is signed.
    public string Authorize(
        string authorizationUrl,
        Person person,
        Action<Dictionary<string, object>>? tamperClaims = null,
        IReadOnlyList<GitHubEmail>? gitHubEmails = null)
    {
        var url = new Uri(authorizationUrl);
        var query = QueryHelpers.ParseQuery(url.Query);
        var (provider, clientId) = url.Host switch
        {
            "accounts.google.com" => ("google", GoogleClientId),
            "github.com" => ("github", GitHubClientId),
            "idp.acme.test" => ("acme", AcmeClientId),
            _ => throw new InvalidOperationException($"No fake provider at {url.Host}"),
        };
        Assert.Equal(clientId, query["client_id"]);
        Assert.Equal("S256", query["code_challenge_method"]);
        var code = $"code-{Guid.NewGuid():N}";
        _codes[code] = new Grant(
            provider,
            query["redirect_uri"]!,
            query["code_challenge"]!,
            query.TryGetValue("nonce", out var nonce) ? nonce.ToString() : null,
            person,
            tamperClaims,
            gitHubEmails);
        return code;
    }

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var url = request.RequestUri!;
        return (url.Host, url.AbsolutePath) switch
        {
            ("accounts.google.com", "/.well-known/openid-configuration") => Json(Discovery(
                GoogleIssuer,
                "https://accounts.google.com/o/oauth2/v2/auth",
                "https://oauth2.googleapis.com/token",
                "https://www.googleapis.com/oauth2/v3/certs")),
            ("www.googleapis.com", "/oauth2/v3/certs") => Json(Jwks()),
            ("oauth2.googleapis.com", "/token") => await IdTokenAsync(request, "google", GoogleIssuer, GoogleClientId, GoogleClientSecret, cancellationToken),
            ("idp.acme.test", "/realms/acme/.well-known/openid-configuration") => Json(Discovery(
                AcmeAuthority,
                $"{AcmeAuthority}/protocol/openid-connect/auth",
                $"{AcmeAuthority}/protocol/openid-connect/token",
                $"{AcmeAuthority}/protocol/openid-connect/certs")),
            ("idp.acme.test", "/realms/acme/protocol/openid-connect/certs") => Json(Jwks()),
            ("idp.acme.test", "/realms/acme/protocol/openid-connect/token") => await IdTokenAsync(request, "acme", AcmeAuthority, AcmeClientId, AcmeClientSecret, cancellationToken),
            ("github.com", "/login/oauth/access_token") => await GitHubTokenAsync(request, cancellationToken),
            ("api.github.com", "/user") => GitHubApi(request, grant => new
            {
                id = long.Parse(grant.Person.Subject, CultureInfo.InvariantCulture),
                login = "octo",
                name = grant.Person.Name,
            }),
            ("api.github.com", "/user/emails") => GitHubApi(request, grant =>
                grant.GitHubEmails ?? [new GitHubEmail(grant.Person.Email, Primary: true, Verified: grant.Person.EmailVerified)]),
            _ => throw new InvalidOperationException($"The fake providers don't serve {request.Method} {url}"),
        };
    }

    private static object Discovery(string issuer, string authorize, string token, string jwks) => new Dictionary<string, object>
    {
        ["issuer"] = issuer,
        ["authorization_endpoint"] = authorize,
        ["token_endpoint"] = token,
        ["jwks_uri"] = jwks,
        ["response_types_supported"] = new[] { "code" },
        ["subject_types_supported"] = new[] { "public" },
        ["id_token_signing_alg_values_supported"] = new[] { "RS256" },
        ["token_endpoint_auth_methods_supported"] = new[] { "client_secret_post", "client_secret_basic" },
    };

    private object Jwks()
    {
        var jwk = JsonWebKeyConverter.ConvertFromRSASecurityKey(_key);
        return new { keys = new[] { new { kty = jwk.Kty, kid = jwk.Kid, use = "sig", alg = "RS256", n = jwk.N, e = jwk.E } } };
    }

    // An OIDC token endpoint: client_secret_basic, a single-use code, the same redirect_uri, and the PKCE verifier.
    private async Task<HttpResponseMessage> IdTokenAsync(
        HttpRequestMessage request,
        string provider,
        string issuer,
        string clientId,
        string clientSecret,
        CancellationToken cancellationToken)
    {
        if (TokenEndpointDown)
        {
            return new HttpResponseMessage(HttpStatusCode.ServiceUnavailable);
        }
        var form = QueryHelpers.ParseQuery(await request.Content!.ReadAsStringAsync(cancellationToken));
        if (request.Headers.Authorization is not { Scheme: "Basic" } basic
            || Encoding.UTF8.GetString(Convert.FromBase64String(basic.Parameter!)) != $"{clientId}:{clientSecret}")
        {
            return Json(new { error = "invalid_client" }, HttpStatusCode.Unauthorized);
        }
        if (Redeem(form, provider) is not { } grant)
        {
            return Json(new { error = "invalid_grant" }, HttpStatusCode.BadRequest);
        }

        var claims = new Dictionary<string, object>
        {
            ["sub"] = grant.Person.Subject,
            ["email"] = grant.Person.Email,
            ["email_verified"] = grant.Person.EmailVerified,
            ["nonce"] = grant.Nonce!,
        };
        if (grant.Person.Name is { } name)
        {
            claims["name"] = name;
        }
        grant.TamperClaims?.Invoke(claims);
        var now = DateTime.UtcNow;
        var idToken = new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = issuer,
            Audience = claims.ContainsKey("aud") ? null : clientId,
            Claims = claims,
            IssuedAt = now,
            NotBefore = now,
            Expires = now.AddMinutes(5),
            SigningCredentials = new SigningCredentials(_key, SecurityAlgorithms.RsaSha256),
        });
        return Json(new { access_token = $"at-{Guid.NewGuid():N}", token_type = "Bearer", expires_in = 300, id_token = idToken });
    }

    // GitHub's token endpoint: client credentials in the form, and errors as a 200 with an "error" member.
    private async Task<HttpResponseMessage> GitHubTokenAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        if (TokenEndpointDown)
        {
            return new HttpResponseMessage(HttpStatusCode.ServiceUnavailable);
        }
        var form = QueryHelpers.ParseQuery(await request.Content!.ReadAsStringAsync(cancellationToken));
        if (form["client_id"] != GitHubClientId || form["client_secret"] != GitHubClientSecret)
        {
            return Json(new { error = "incorrect_client_credentials" });
        }
        if (Redeem(form, "github") is not { } grant)
        {
            return Json(new { error = "bad_verification_code" });
        }
        var accessToken = $"gho_{Guid.NewGuid():N}";
        _gitHubTokens[accessToken] = grant;
        return Json(new { access_token = accessToken, token_type = "bearer", scope = "read:user,user:email" });
    }

    private HttpResponseMessage GitHubApi(HttpRequestMessage request, Func<Grant, object> body)
    {
        Assert.Contains(request.Headers.UserAgent, agent => agent.Product?.Name == "airbnb-clone");
        return request.Headers.Authorization is { Scheme: "Bearer" } bearer && _gitHubTokens.TryGetValue(bearer.Parameter!, out var grant)
            ? Json(body(grant))
            : Json(new { message = "Bad credentials" }, HttpStatusCode.Unauthorized);
    }

    // A code works once, for the provider that issued it, with its redirect_uri and the verifier behind its challenge.
    private Grant? Redeem(IDictionary<string, Microsoft.Extensions.Primitives.StringValues> form, string provider)
    {
        if (!_codes.TryRemove(form["code"].ToString(), out var grant) || grant.Provider != provider || form["redirect_uri"] != grant.RedirectUri)
        {
            return null;
        }
        var challenge = Base64Url.EncodeToString(SHA256.HashData(Encoding.ASCII.GetBytes(form["code_verifier"].ToString())));
        return challenge == grant.CodeChallenge ? grant : null;
    }

    private static HttpResponseMessage Json(object body, HttpStatusCode status = HttpStatusCode.OK) =>
        new(status) { Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, new MediaTypeHeaderValue("application/json")) };
}
