using System.Net;
using System.Security.Cryptography;
using System.Text;
using Airbnb.Modules.Identity.External;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols.Configuration;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace Airbnb.UnitTests.Identity;

public sealed class OidcProviderTests
{
    private const string Issuer = "https://idp.test";
    private const string ClientId = "client-1";
    private const string Nonce = "flow-nonce";

    private static readonly DateTimeOffset Now = new(2026, 10, 15, 12, 0, 0, TimeSpan.Zero);
    private static readonly RsaSecurityKey Key = new(RSA.Create(2048)) { KeyId = "key-1" };

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private sealed class FixedTime(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }

    private static OpenIdConnectConfiguration Configuration(params string[] tokenAuthMethods)
    {
        var configuration = new OpenIdConnectConfiguration
        {
            Issuer = Issuer,
            AuthorizationEndpoint = $"{Issuer}/authorize",
            TokenEndpoint = $"{Issuer}/token",
        };
        configuration.SigningKeys.Add(Key);
        foreach (var method in tokenAuthMethods) configuration.TokenEndpointAuthMethodsSupported.Add(method);
        return configuration;
    }

    private static OidcSettings Google() =>
        new("google", "Google", ProviderKind.Social, Issuer, ClientId, "secret 1", AdditionalIssuers: ["idp.test"],
            ExtraAuthorizationParameters: new Dictionary<string, string> { ["prompt"] = "select_account" });

    private static OidcSettings Acme() =>
        new("sso-acme", "Acme Corp", ProviderKind.Sso, Issuer, ClientId, "secret 1", EmailDomains: new HashSet<string> { "acme.test" });

    private static OidcProvider Provider(
        OidcSettings settings,
        OpenIdConnectConfiguration? configuration = null,
        StubHttpClientFactory? http = null,
        DateTimeOffset? now = null) =>
        new(
            settings,
            new StaticConfigurationManager<OpenIdConnectConfiguration>(configuration ?? Configuration()),
            http ?? new StubHttpClientFactory(_ => throw new InvalidOperationException("no HTTP expected")),
            new FixedTime(now ?? Now),
            NullLogger.Instance);

    private static string IdToken(
        Action<Dictionary<string, object>>? tamper = null,
        string issuer = Issuer,
        string audience = ClientId,
        DateTimeOffset? expires = null,
        SigningCredentials? signing = null)
    {
        var claims = new Dictionary<string, object>
        {
            ["sub"] = "subject-1",
            ["email"] = "Ana@Acme.test",
            ["email_verified"] = true,
            ["name"] = "Ana Lima",
            ["nonce"] = Nonce,
        };
        tamper?.Invoke(claims);
        return new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = issuer,
            // A tampered "aud" claim (several audiences) replaces the single one.
            Audience = claims.ContainsKey("aud") ? null : audience,
            Claims = claims,
            IssuedAt = Now.UtcDateTime,
            NotBefore = Now.UtcDateTime,
            Expires = (expires ?? Now.AddMinutes(5)).UtcDateTime,
            SigningCredentials = signing ?? new SigningCredentials(Key, SecurityAlgorithms.RsaSha256),
        });
    }

    private static async Task<ExternalLoginError> FailureAsync(Func<Task> act) =>
        (await Assert.ThrowsAsync<ExternalLoginException>(act)).Error;

    [Fact]
    public async Task The_authorization_url_carries_pkce_state_nonce_and_the_login_hint()
    {
        var url = new Uri(await Provider(Google()).BuildAuthorizationUrlAsync(
            new AuthorizationRequest("http://localhost:3000/api/auth/callback/google", "the-state", "the-nonce", "the-challenge", "ana@example.com"), Ct));

        Assert.Equal($"{Issuer}/authorize", url.GetLeftPart(UriPartial.Path));
        var query = QueryHelpers.ParseQuery(url.Query);
        Assert.Equal("code", query["response_type"]);
        Assert.Equal(ClientId, query["client_id"]);
        Assert.Equal("http://localhost:3000/api/auth/callback/google", query["redirect_uri"]);
        Assert.Equal("openid email profile", query["scope"]);
        Assert.Equal("the-state", query["state"]);
        Assert.Equal("the-nonce", query["nonce"]);
        Assert.Equal("the-challenge", query["code_challenge"]);
        Assert.Equal("S256", query["code_challenge_method"]);
        Assert.Equal("ana@example.com", query["login_hint"]);
        Assert.Equal("select_account", query["prompt"]);
    }

    [Fact]
    public async Task No_login_hint_is_sent_without_an_email()
    {
        var url = await Provider(Acme()).BuildAuthorizationUrlAsync(new AuthorizationRequest("http://x/cb", "s", "n", "c", null), Ct);

        Assert.DoesNotContain("login_hint", url);
        Assert.DoesNotContain("prompt", url);
    }

    [Fact]
    public async Task A_valid_id_token_gives_the_subject_normalized_email_and_name()
    {
        var identity = await Provider(Google()).IdentityAsync(IdToken(), Nonce, Configuration(), Ct);

        Assert.Equal(new ExternalIdentity("subject-1", "ana@acme.test", "Ana Lima"), identity);
    }

    [Fact]
    public async Task Googles_bare_issuer_is_accepted_too() =>
        Assert.Equal("subject-1", (await Provider(Google()).IdentityAsync(IdToken(issuer: "idp.test"), Nonce, Configuration(), Ct)).Subject);

    [Fact]
    public async Task The_name_falls_back_to_given_and_family_names()
    {
        var token = IdToken(claims =>
        {
            claims.Remove("name");
            claims["given_name"] = "Ana";
            claims["family_name"] = "Lima";
        });

        Assert.Equal("Ana Lima", (await Provider(Google()).IdentityAsync(token, Nonce, Configuration(), Ct)).Name);
    }

    [Fact]
    public async Task Another_flows_nonce_is_refused() =>
        Assert.Equal(ExternalLoginError.ProviderError, await FailureAsync(() => Provider(Google()).IdentityAsync(IdToken(), "other-nonce", Configuration(), Ct)));

    [Fact]
    public async Task A_token_without_a_nonce_is_refused() =>
        Assert.Equal(ExternalLoginError.ProviderError, await FailureAsync(() => Provider(Google()).IdentityAsync(IdToken(c => c.Remove("nonce")), Nonce, Configuration(), Ct)));

    [Fact]
    public async Task A_token_for_another_client_is_refused() =>
        Assert.Equal(ExternalLoginError.ProviderError, await FailureAsync(() => Provider(Google()).IdentityAsync(IdToken(audience: "client-2"), Nonce, Configuration(), Ct)));

    [Fact]
    public async Task A_token_from_another_issuer_is_refused() =>
        Assert.Equal(ExternalLoginError.ProviderError, await FailureAsync(() => Provider(Google()).IdentityAsync(IdToken(issuer: "https://evil.test"), Nonce, Configuration(), Ct)));

    [Fact]
    public async Task An_expired_token_is_refused_by_the_injected_clock()
    {
        var token = IdToken(expires: Now.AddMinutes(5));

        Assert.Equal("subject-1", (await Provider(Google(), now: Now.AddMinutes(6)).IdentityAsync(token, Nonce, Configuration(), Ct)).Subject);
        Assert.Equal(ExternalLoginError.ProviderError, await FailureAsync(() => Provider(Google(), now: Now.AddMinutes(8)).IdentityAsync(token, Nonce, Configuration(), Ct)));
    }

    [Fact]
    public async Task A_token_signed_by_an_unknown_key_is_refused()
    {
        var stranger = new RsaSecurityKey(RSA.Create(2048)) { KeyId = "key-2" };

        var error = await FailureAsync(() => Provider(Google()).IdentityAsync(
            IdToken(signing: new SigningCredentials(stranger, SecurityAlgorithms.RsaSha256)), Nonce, Configuration(), Ct));

        Assert.Equal(ExternalLoginError.ProviderError, error);
    }

    [Fact]
    public async Task An_hmac_signed_token_is_refused_even_with_a_matching_key()
    {
        var shared = new SymmetricSecurityKey(Encoding.UTF8.GetBytes("a-32-byte-secret-a-32-byte-secret")) { KeyId = "hmac" };
        var configuration = Configuration();
        configuration.SigningKeys.Add(shared);

        var error = await FailureAsync(() => Provider(Google()).IdentityAsync(
            IdToken(signing: new SigningCredentials(shared, SecurityAlgorithms.HmacSha256)), Nonce, configuration, Ct));

        Assert.Equal(ExternalLoginError.ProviderError, error);
    }

    [Fact]
    public async Task Several_audiences_need_this_client_as_the_authorized_party()
    {
        var token = IdToken(claims => claims["aud"] = new[] { ClientId, "client-2" });

        Assert.Equal(ExternalLoginError.ProviderError, await FailureAsync(() => Provider(Google()).IdentityAsync(token, Nonce, Configuration(), Ct)));
        var withAzp = IdToken(claims =>
        {
            claims["aud"] = new[] { ClientId, "client-2" };
            claims["azp"] = ClientId;
        });
        Assert.Equal("subject-1", (await Provider(Google()).IdentityAsync(withAzp, Nonce, Configuration(), Ct)).Subject);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(null)]
    public async Task Google_needs_email_verified_true(bool? verified)
    {
        var token = IdToken(claims =>
        {
            if (verified is null) claims.Remove("email_verified");
            else claims["email_verified"] = verified.Value;
        });

        Assert.Equal(ExternalLoginError.NoVerifiedEmail, await FailureAsync(() => Provider(Google()).IdentityAsync(token, Nonce, Configuration(), Ct)));
    }

    [Fact]
    public async Task A_string_email_verified_is_understood() =>
        Assert.Equal("ana@acme.test", (await Provider(Google()).IdentityAsync(IdToken(c => c["email_verified"] = "true"), Nonce, Configuration(), Ct)).Email);

    [Fact]
    public async Task Sso_trusts_its_domains_without_an_email_verified_claim() =>
        Assert.Equal("ana@acme.test", (await Provider(Acme()).IdentityAsync(IdToken(c => c.Remove("email_verified")), Nonce, Configuration(), Ct)).Email);

    [Fact]
    public async Task Sso_refuses_an_email_its_provider_marks_unverified() =>
        Assert.Equal(ExternalLoginError.NoVerifiedEmail, await FailureAsync(() => Provider(Acme()).IdentityAsync(IdToken(c => c["email_verified"] = false), Nonce, Configuration(), Ct)));

    [Theory]
    [InlineData("ana@gmail.com")]
    [InlineData("ana@eu.acme.test")]
    public async Task Sso_refuses_emails_outside_its_domains(string email) =>
        Assert.Equal(ExternalLoginError.EmailDomainNotAllowed, await FailureAsync(() => Provider(Acme()).IdentityAsync(IdToken(c => c["email"] = email), Nonce, Configuration(), Ct)));

    [Fact]
    public async Task The_code_is_redeemed_with_basic_client_auth_and_the_pkce_verifier()
    {
        var http = new StubHttpClientFactory(_ => StubHttpClientFactory.Json(HttpStatusCode.OK, $$"""{"id_token":"{{IdToken()}}","access_token":"at"}"""));

        var identity = await Provider(Google(), Configuration("client_secret_post", "client_secret_basic"), http)
            .ExchangeAsync(new CodeExchange("the-code", "http://localhost:3000/api/auth/callback/google", "the-verifier", Nonce, Issuer), Ct);

        Assert.Equal("subject-1", identity.Subject);
        var request = Assert.Single(http.Requests);
        Assert.Equal(HttpMethod.Post, request.Method);
        Assert.Equal($"{Issuer}/token", request.Uri.ToString());
        Assert.Equal("Basic", request.Authorization?.Scheme);
        Assert.Equal("client-1:secret+1", Encoding.UTF8.GetString(Convert.FromBase64String(request.Authorization!.Parameter!)));
        var form = QueryHelpers.ParseQuery(request.Body);
        Assert.Equal("authorization_code", form["grant_type"]);
        Assert.Equal("the-code", form["code"]);
        Assert.Equal("the-verifier", form["code_verifier"]);
        Assert.Equal("http://localhost:3000/api/auth/callback/google", form["redirect_uri"]);
        Assert.False(form.ContainsKey("client_secret"));
    }

    [Fact]
    public async Task A_provider_without_basic_auth_gets_the_secret_in_the_form()
    {
        var http = new StubHttpClientFactory(_ => StubHttpClientFactory.Json(HttpStatusCode.OK, $$"""{"id_token":"{{IdToken()}}"}"""));

        await Provider(Google(), Configuration("client_secret_post"), http).ExchangeAsync(new CodeExchange("c", "http://x/cb", "v", Nonce, null), Ct);

        var request = Assert.Single(http.Requests);
        Assert.Null(request.Authorization);
        var form = QueryHelpers.ParseQuery(request.Body);
        Assert.Equal(ClientId, form["client_id"]);
        Assert.Equal("secret 1", form["client_secret"]);
    }

    [Fact]
    public async Task A_refused_code_is_a_provider_error_and_an_outage_is_unreachable()
    {
        var refused = new StubHttpClientFactory(_ => StubHttpClientFactory.Json(HttpStatusCode.BadRequest, """{"error":"invalid_grant"}"""));
        var down = new StubHttpClientFactory(_ => new HttpResponseMessage(HttpStatusCode.ServiceUnavailable));
        var exchange = new CodeExchange("c", "http://x/cb", "v", Nonce, null);

        Assert.Equal(ExternalLoginError.ProviderError, await FailureAsync(() => Provider(Google(), http: refused).ExchangeAsync(exchange, Ct)));
        Assert.Equal(ExternalLoginError.ProviderUnreachable, await FailureAsync(() => Provider(Google(), http: down).ExchangeAsync(exchange, Ct)));
    }

    [Fact]
    public async Task A_callback_naming_another_issuer_is_a_mismatch_before_any_request()
    {
        var http = new StubHttpClientFactory(_ => throw new InvalidOperationException("must not redeem"));

        var error = await FailureAsync(() => Provider(Google(), http: http).ExchangeAsync(new CodeExchange("c", "http://x/cb", "v", Nonce, "https://evil.test"), Ct));

        Assert.Equal(ExternalLoginError.FlowMismatch, error);
        Assert.Empty(http.Requests);
    }

    [Fact]
    public async Task A_discovery_document_for_another_issuer_makes_the_provider_unusable()
    {
        var configuration = Configuration();
        configuration.Issuer = "https://evil.test";

        var error = await FailureAsync(() => Provider(Google(), configuration).BuildAuthorizationUrlAsync(new AuthorizationRequest("http://x/cb", "s", "n", "c", null), Ct));

        Assert.Equal(ExternalLoginError.ProviderUnreachable, error);
    }
}
