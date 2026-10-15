using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Airbnb.Modules.Identity.External;

// The providers switched on by configuration (OAuth spec §1). A singleton, so each OIDC provider keeps its cached
// discovery document and signing keys.
internal sealed class ExternalProviders
{
    internal const string SsoKeyPrefix = "sso-";

    // What the "Continue with SSO" form sends: the connection comes from the email's domain.
    internal const string SsoByEmail = "sso";

    private readonly List<IExternalProvider> _providers = [];
    private readonly Dictionary<string, IExternalProvider> _ssoByDomain = new(StringComparer.OrdinalIgnoreCase);
    private readonly string? _redirectBaseUrl;

    public ExternalProviders(IOptions<ExternalLoginOptions> options, IHttpClientFactory clients, TimeProvider time, ILoggerFactory loggers)
    {
        var settings = options.Value;
        var configured = settings.Google.IsSet || settings.GitHub.IsSet || settings.Sso.Count > 0;
        if (string.IsNullOrWhiteSpace(settings.RedirectBaseUrl))
        {
            if (configured)
            {
                loggers.CreateLogger<ExternalProviders>().LogWarning(
                    "External sign-in is off: {Setting} is not set", $"{ExternalLoginOptions.SectionName}:RedirectBaseUrl");
            }
            return;
        }
        _redirectBaseUrl = settings.RedirectBaseUrl.TrimEnd('/');

        if (settings.Google.IsSet)
        {
            _providers.Add(new OidcProvider(
                new OidcSettings(
                    "google",
                    "Google",
                    ProviderKind.Social,
                    "https://accounts.google.com",
                    settings.Google.ClientId!,
                    settings.Google.ClientSecret!,
                    AdditionalIssuers: ["accounts.google.com"],
                    ExtraAuthorizationParameters: new Dictionary<string, string> { ["prompt"] = "select_account" }),
                clients,
                time,
                loggers.CreateLogger<OidcProvider>()));
        }
        if (settings.GitHub.IsSet)
        {
            _providers.Add(new GitHubProvider(settings.GitHub, clients, loggers.CreateLogger<GitHubProvider>()));
        }
        foreach (var (id, connection) in settings.Sso.OrderBy(entry => entry.Key, StringComparer.Ordinal))
        {
            var domains = connection.Domains.Select(domain => domain.Trim().ToLowerInvariant()).ToHashSet();
            var provider = new OidcProvider(
                new OidcSettings(
                    SsoKeyPrefix + id,
                    connection.Name!,
                    ProviderKind.Sso,
                    connection.Authority!,
                    connection.ClientId!,
                    connection.ClientSecret!,
                    connection.RequireHttpsMetadata,
                    EmailDomains: domains),
                clients,
                time,
                loggers.CreateLogger<OidcProvider>());
            _providers.Add(provider);
            foreach (var domain in domains)
            {
                _ssoByDomain[domain] = provider;
            }
        }
    }

    // Google before GitHub, the order of the buttons.
    public IEnumerable<IExternalProvider> Social => _providers.Where(provider => provider.Kind == ProviderKind.Social);

    public bool HasSso => _ssoByDomain.Count > 0;

    public IExternalProvider? Find(string key) => _providers.FirstOrDefault(provider => provider.Key == key);

    // The connection for an email's domain: exact domains only, so "evil-acme.test" never matches "acme.test".
    public IExternalProvider? FindSsoForEmail(string email) => _ssoByDomain.GetValueOrDefault(Emails.Domain(Emails.Normalize(email)));

    // Must match the URI registered with the provider; also sent again with the code, as OAuth requires.
    public string RedirectUri(IExternalProvider provider) => $"{_redirectBaseUrl}/{provider.Key}";

    // A name even for a provider switched off after someone connected it, so they can still disconnect it.
    public string DisplayName(string key) => Find(key)?.Name ?? key switch
    {
        "google" => "Google",
        "github" => "GitHub",
        _ when key.StartsWith(SsoKeyPrefix, StringComparison.Ordinal) => "Single sign-on",
        _ => key,
    };
}
