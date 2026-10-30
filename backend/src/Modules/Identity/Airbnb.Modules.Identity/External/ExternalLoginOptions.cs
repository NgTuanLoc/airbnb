using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;

namespace Airbnb.Modules.Identity.External;

// "Identity:External" (OAuth spec §1, "Configuration"). A provider is on when its client id and secret are both set.
internal sealed class ExternalLoginOptions
{
    internal const string SectionName = "Identity:External";

    // The browser comes back to <RedirectBaseUrl>/<provider key>: the Next.js callback route. Nothing is on without it.
    public string? RedirectBaseUrl { get; set; }

    public ClientCredentials Google { get; set; } = new();

    public ClientCredentials GitHub { get; set; } = new();

    // Enterprise connections by id; connection "acme" is provider "sso-acme".
    public Dictionary<string, SsoConnectionOptions> Sso { get; set; } = new(StringComparer.OrdinalIgnoreCase);
}

internal class ClientCredentials
{
    public string? ClientId { get; set; }

    public string? ClientSecret { get; set; }

    internal bool IsSet => !string.IsNullOrWhiteSpace(ClientId) && !string.IsNullOrWhiteSpace(ClientSecret);

    internal bool IsHalfSet => string.IsNullOrWhiteSpace(ClientId) != string.IsNullOrWhiteSpace(ClientSecret);
}

internal sealed class SsoConnectionOptions : ClientCredentials
{
    public string? Name { get; set; }

    // The email domains this identity provider is authoritative for; its emails on other domains are refused.
    public List<string> Domains { get; set; } = [];

    public string? Authority { get; set; }

    // false only for a local identity provider served over http (the Aspire Keycloak demo).
    public bool RequireHttpsMetadata { get; set; } = true;
}

// Present-but-wrong settings fail at startup; unset credentials only switch a provider off.
internal sealed partial class ExternalLoginOptionsValidator : IValidateOptions<ExternalLoginOptions>
{
    private const string Section = ExternalLoginOptions.SectionName;

    public ValidateOptionsResult Validate(string? name, ExternalLoginOptions options)
    {
        var failures = new List<string>();
        if (!string.IsNullOrWhiteSpace(options.RedirectBaseUrl) && !IsHttpUrl(options.RedirectBaseUrl))
        {
            failures.Add($"{Section}:RedirectBaseUrl must be an absolute http(s) URL.");
        }
        if (options.Google.IsHalfSet)
        {
            failures.Add($"{Section}:Google needs both ClientId and ClientSecret.");
        }
        if (options.GitHub.IsHalfSet)
        {
            failures.Add($"{Section}:GitHub needs both ClientId and ClientSecret.");
        }

        // Email domain -> the connection that claimed it first.
        var owners = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var (id, connection) in options.Sso)
        {
            ValidateConnection(id, connection, owners, failures);
        }

        return failures.Count == 0 ? ValidateOptionsResult.Success : ValidateOptionsResult.Fail(failures);
    }

    private static void ValidateConnection(string id, SsoConnectionOptions connection, Dictionary<string, string> owners, List<string> failures)
    {
        var path = $"{Section}:Sso:{id}";
        if (!ConnectionId().IsMatch(id))
        {
            failures.Add($"{path}: a connection id is 1-40 lowercase letters, digits or dashes.");
        }
        if (string.IsNullOrWhiteSpace(connection.Name))
        {
            failures.Add($"{path}:Name is required.");
        }
        if (!connection.IsSet)
        {
            failures.Add($"{path} needs both ClientId and ClientSecret.");
        }
        if (connection.Authority is null || !IsHttpUrl(connection.Authority))
        {
            failures.Add($"{path}:Authority must be an absolute http(s) URL.");
        }
        else if (connection.RequireHttpsMetadata && !connection.Authority.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            failures.Add($"{path}:Authority must use https unless RequireHttpsMetadata is false.");
        }
        if (connection.Domains.Count == 0)
        {
            failures.Add($"{path}:Domains needs at least one email domain.");
        }
        foreach (var domain in connection.Domains)
        {
            if (!EmailDomain().IsMatch(domain))
            {
                failures.Add($"{path}:Domains has an invalid email domain \"{domain}\".");
            }
            else if (!owners.TryAdd(domain, id))
            {
                failures.Add($"{path}:Domains: \"{domain}\" already belongs to connection \"{owners[domain]}\".");
            }
        }
    }

    private static bool IsHttpUrl(string value) =>
        Uri.TryCreate(value, UriKind.Absolute, out var uri) && (uri.Scheme == Uri.UriSchemeHttps || uri.Scheme == Uri.UriSchemeHttp);

    [GeneratedRegex("^[a-z0-9][a-z0-9-]{0,39}$")]
    private static partial Regex ConnectionId();

    // Dot-separated DNS labels ending in a letters-only TLD: "acme.test", "mail.acme.co.uk".
    [GeneratedRegex(@"^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$", RegexOptions.IgnoreCase)]
    private static partial Regex EmailDomain();
}
