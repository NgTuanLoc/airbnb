using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace Airbnb.Modules.Identity.External;

// What differs between Google and an enterprise connection.
internal sealed record OidcSettings(
    string Key,
    string Name,
    ProviderKind Kind,
    string Authority,
    string ClientId,
    string ClientSecret,
    bool RequireHttpsMetadata = true,
    // Issuers besides the discovery document's: Google also signs as "accounts.google.com".
    IReadOnlyList<string>? AdditionalIssuers = null,
    IReadOnlyDictionary<string, string>? ExtraAuthorizationParameters = null,
    // Null: trust an email only when email_verified is true (Google). Set: trust one on these domains unless the
    // provider says it isn't verified, and refuse any other domain (an SSO connection vouched for by the operator).
    IReadOnlySet<string>? EmailDomains = null);

// OpenID Connect authorization-code flow with PKCE (OAuth spec §1, "Providers"): Google and SSO connections.
internal sealed class OidcProvider : IExternalProvider
{
    private static readonly JsonWebTokenHandler Tokens = new();

    // Asymmetric signatures only: an HMAC-signed token would be signed with our own client secret.
    private static readonly string[] AllowedAlgorithms =
    [
        SecurityAlgorithms.RsaSha256, SecurityAlgorithms.RsaSha384, SecurityAlgorithms.RsaSha512,
        SecurityAlgorithms.RsaSsaPssSha256, SecurityAlgorithms.RsaSsaPssSha384, SecurityAlgorithms.RsaSsaPssSha512,
        SecurityAlgorithms.EcdsaSha256, SecurityAlgorithms.EcdsaSha384, SecurityAlgorithms.EcdsaSha512,
    ];

    private readonly OidcSettings _settings;
    private readonly IConfigurationManager<OpenIdConnectConfiguration> _configuration;
    private readonly IHttpClientFactory _clients;
    private readonly TimeProvider _time;
    private readonly ILogger _logger;

    public OidcProvider(OidcSettings settings, IHttpClientFactory clients, TimeProvider time, ILogger logger)
        : this(
            settings,
            new ConfigurationManager<OpenIdConnectConfiguration>(
                settings.Authority.TrimEnd('/') + "/.well-known/openid-configuration",
                new OpenIdConnectConfigurationRetriever(),
                new FactoryDocumentRetriever(clients, settings.RequireHttpsMetadata)),
            clients,
            time,
            logger)
    {
    }

    // Unit tests pass a fixed configuration instead of discovery.
    internal OidcProvider(
        OidcSettings settings,
        IConfigurationManager<OpenIdConnectConfiguration> configuration,
        IHttpClientFactory clients,
        TimeProvider time,
        ILogger logger)
    {
        _settings = settings;
        _configuration = configuration;
        _clients = clients;
        _time = time;
        _logger = logger;
    }

    public string Key => _settings.Key;

    public string Name => _settings.Name;

    public ProviderKind Kind => _settings.Kind;

    public async Task<string> BuildAuthorizationUrlAsync(AuthorizationRequest request, CancellationToken cancellationToken)
    {
        var configuration = await GetConfigurationAsync(cancellationToken);
        var parameters = new Dictionary<string, string?>
        {
            ["response_type"] = "code",
            ["client_id"] = _settings.ClientId,
            ["redirect_uri"] = request.RedirectUri,
            ["scope"] = "openid email profile",
            ["state"] = request.State,
            ["nonce"] = request.Nonce,
            ["code_challenge"] = request.CodeChallenge,
            ["code_challenge_method"] = "S256",
        };
        if (request.LoginHint is not null)
        {
            parameters["login_hint"] = request.LoginHint;
        }
        foreach (var (name, value) in _settings.ExtraAuthorizationParameters ?? new Dictionary<string, string>())
        {
            parameters[name] = value;
        }
        return QueryHelpers.AddQueryString(configuration.AuthorizationEndpoint, parameters);
    }

    public async Task<ExternalIdentity> ExchangeAsync(CodeExchange exchange, CancellationToken cancellationToken)
    {
        var configuration = await GetConfigurationAsync(cancellationToken);
        // RFC 9207: an authorization server that names itself on the callback must be the one this flow went to.
        if (exchange.Issuer is not null && !IsIssuer(exchange.Issuer, configuration))
        {
            throw new ExternalLoginException(ExternalLoginError.FlowMismatch, $"{Key}: the callback's iss is not the issuer");
        }
        var idToken = await RedeemCodeAsync(configuration, exchange, cancellationToken);
        return await IdentityAsync(idToken, exchange.Nonce, configuration, cancellationToken);
    }

    // The person in an ID token, once it is proven to be from this provider, for this client and this flow.
    internal async Task<ExternalIdentity> IdentityAsync(
        string idToken,
        string expectedNonce,
        OpenIdConnectConfiguration configuration,
        CancellationToken cancellationToken) =>
        Identity(await ValidateIdTokenAsync(idToken, expectedNonce, configuration, cancellationToken));

    private async Task<OpenIdConnectConfiguration> GetConfigurationAsync(CancellationToken cancellationToken)
    {
        OpenIdConnectConfiguration configuration;
        try
        {
            configuration = await _configuration.GetConfigurationAsync(cancellationToken);
        }
        catch (Exception exception) when (!cancellationToken.IsCancellationRequested)
        {
            throw new ExternalLoginException(ExternalLoginError.ProviderUnreachable, $"{Key}: discovery failed", exception);
        }
        // OpenID Connect Discovery §4.3: the document's issuer must be the authority it was fetched from.
        if (!SameUrl(configuration.Issuer, _settings.Authority))
        {
            throw new ExternalLoginException(
                ExternalLoginError.ProviderUnreachable,
                $"{Key}: the discovery issuer {configuration.Issuer} is not the authority {_settings.Authority}");
        }
        return configuration;
    }

    private async Task<string> RedeemCodeAsync(OpenIdConnectConfiguration configuration, CodeExchange exchange, CancellationToken cancellationToken)
    {
        var form = new Dictionary<string, string>
        {
            ["grant_type"] = "authorization_code",
            ["code"] = exchange.Code,
            ["redirect_uri"] = exchange.RedirectUri,
            ["code_verifier"] = exchange.CodeVerifier,
        };
        using var request = new HttpRequestMessage(HttpMethod.Post, configuration.TokenEndpoint);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        // client_secret_basic is OAuth's default (RFC 6749 §2.3.1); the form only when the provider doesn't offer basic.
        var methods = configuration.TokenEndpointAuthMethodsSupported;
        if (methods.Count == 0 || methods.Contains("client_secret_basic"))
        {
            var credentials = $"{WebUtility.UrlEncode(_settings.ClientId)}:{WebUtility.UrlEncode(_settings.ClientSecret)}";
            request.Headers.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes(credentials)));
        }
        else
        {
            form["client_id"] = _settings.ClientId;
            form["client_secret"] = _settings.ClientSecret;
        }
        request.Content = new FormUrlEncodedContent(form);

        using var client = _clients.CreateClient(ExternalHttp.ClientName);
        using var response = await ExternalHttp.SendAsync(client, request, cancellationToken);
        var payload = await ExternalHttp.ReadJsonAsync<TokenResponse>(response, cancellationToken);
        if (!response.IsSuccessStatusCode || string.IsNullOrEmpty(payload?.IdToken))
        {
            _logger.LogWarning("{Provider} refused the code exchange: {Status} {Error}", Key, (int)response.StatusCode, payload?.Error);
            throw new ExternalLoginException(ExternalLoginError.ProviderError, $"{Key}: the code exchange failed");
        }
        return payload.IdToken;
    }

    // OpenID Connect Core §3.1.3.7: signature, issuer, audience, lifetime, then the nonce this flow sent.
    private async Task<JsonWebToken> ValidateIdTokenAsync(
        string idToken,
        string expectedNonce,
        OpenIdConnectConfiguration configuration,
        CancellationToken cancellationToken)
    {
        var result = await Tokens.ValidateTokenAsync(idToken, ValidationParameters(configuration));
        if (result is { IsValid: false, Exception: SecurityTokenSignatureKeyNotFoundException })
        {
            // The provider may have rotated its keys since they were cached: refresh once and retry.
            _configuration.RequestRefresh();
            result = await Tokens.ValidateTokenAsync(idToken, ValidationParameters(await GetConfigurationAsync(cancellationToken)));
        }
        if (!result.IsValid)
        {
            _logger.LogWarning(result.Exception, "{Provider} sent an ID token that failed validation", Key);
            throw new ExternalLoginException(ExternalLoginError.ProviderError, $"{Key}: invalid ID token");
        }

        var token = (JsonWebToken)result.SecurityToken;
        if (!token.TryGetPayloadValue<string>("nonce", out var nonce) || !Secrets.Equal(nonce, expectedNonce))
        {
            throw new ExternalLoginException(ExternalLoginError.ProviderError, $"{Key}: the ID token's nonce is not this flow's");
        }
        if (token.Audiences.Count() > 1 && (!token.TryGetPayloadValue<string>("azp", out var azp) || azp != _settings.ClientId))
        {
            throw new ExternalLoginException(ExternalLoginError.ProviderError, $"{Key}: the ID token's azp is not this client");
        }
        if (string.IsNullOrEmpty(token.Subject))
        {
            throw new ExternalLoginException(ExternalLoginError.ProviderError, $"{Key}: the ID token has no subject");
        }
        return token;
    }

    private TokenValidationParameters ValidationParameters(OpenIdConnectConfiguration configuration) => new()
    {
        ValidIssuers = [configuration.Issuer, .. _settings.AdditionalIssuers ?? []],
        ValidAudience = _settings.ClientId,
        IssuerSigningKeys = configuration.SigningKeys,
        ValidAlgorithms = AllowedAlgorithms,
        ValidateIssuerSigningKey = true,
        RequireSignedTokens = true,
        ClockSkew = ClockSkew,
        // The library's own clock isn't injectable (TokenValidationParameters.TimeProvider is internal), so "now" comes
        // from TimeProvider here as everywhere else. An ID token must expire.
        LifetimeValidator = (notBefore, expires, _, _) =>
        {
            var now = _time.GetUtcNow().UtcDateTime;
            return expires is not null && expires.Value >= now - ClockSkew && (notBefore is null || notBefore.Value <= now + ClockSkew);
        },
    };

    private static readonly TimeSpan ClockSkew = TimeSpan.FromMinutes(2);

    private ExternalIdentity Identity(JsonWebToken token)
    {
        var email = token.TryGetPayloadValue<string>("email", out var claimed) && !string.IsNullOrWhiteSpace(claimed)
            ? Emails.Normalize(claimed)
            : null;
        var verified = EmailVerified(token);
        if (_settings.EmailDomains is { } domains)
        {
            if (email is null || verified == false)
            {
                throw new ExternalLoginException(ExternalLoginError.NoVerifiedEmail, $"{Key}: no usable email");
            }
            if (!domains.Contains(Emails.Domain(email)))
            {
                throw new ExternalLoginException(ExternalLoginError.EmailDomainNotAllowed, $"{Key}: {Emails.Domain(email)} is not a connection domain");
            }
        }
        else if (email is null || verified != true)
        {
            throw new ExternalLoginException(ExternalLoginError.NoVerifiedEmail, $"{Key}: no verified email");
        }
        return new ExternalIdentity(token.Subject, email, DisplayName(token));
    }

    // email_verified is a JSON boolean, but some providers send the string "true".
    private static bool? EmailVerified(JsonWebToken token)
    {
        if (!token.TryGetPayloadValue<object>("email_verified", out var value))
        {
            return null;
        }
        return value switch
        {
            bool flag => flag,
            string text when bool.TryParse(text, out var parsed) => parsed,
            JsonElement { ValueKind: JsonValueKind.True } => true,
            JsonElement { ValueKind: JsonValueKind.False } => false,
            _ => null,
        };
    }

    private static string? DisplayName(JsonWebToken token)
    {
        if (token.TryGetPayloadValue<string>("name", out var name) && !string.IsNullOrWhiteSpace(name))
        {
            return name;
        }
        token.TryGetPayloadValue<string>("given_name", out var given);
        token.TryGetPayloadValue<string>("family_name", out var family);
        var joined = $"{given} {family}".Trim();
        return joined.Length > 0 ? joined : null;
    }

    private bool IsIssuer(string issuer, OpenIdConnectConfiguration configuration) =>
        issuer == configuration.Issuer || (_settings.AdditionalIssuers ?? []).Contains(issuer);

    private static bool SameUrl(string? a, string b) =>
        a is not null && string.Equals(a.TrimEnd('/'), b.TrimEnd('/'), StringComparison.Ordinal);

    private sealed record TokenResponse(
        [property: JsonPropertyName("id_token")] string? IdToken,
        [property: JsonPropertyName("error")] string? Error);
}
