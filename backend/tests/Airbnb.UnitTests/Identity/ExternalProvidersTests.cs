using Airbnb.Modules.Identity.External;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace Airbnb.UnitTests.Identity;

public sealed class ExternalProvidersTests
{
    private static ExternalProviders Providers(ExternalLoginOptions options) =>
        new(Options.Create(options), new StubHttpClientFactory(_ => throw new InvalidOperationException("no HTTP expected")), TimeProvider.System, NullLoggerFactory.Instance);

    private static ExternalLoginOptions Everything() => new()
    {
        RedirectBaseUrl = "http://localhost:3000/api/auth/callback/",
        Google = new ClientCredentials { ClientId = "g", ClientSecret = "gs" },
        GitHub = new ClientCredentials { ClientId = "h", ClientSecret = "hs" },
        Sso =
        {
            ["acme"] = new SsoConnectionOptions
            {
                Name = "Acme Corp",
                Domains = ["acme.test", "Acme.Example"],
                Authority = "https://idp.acme.test/realms/acme",
                ClientId = "airbnb",
                ClientSecret = "secret",
            },
        },
    };

    [Fact]
    public void Configured_providers_are_on_with_social_ones_in_button_order()
    {
        var providers = Providers(Everything());

        Assert.Equal(["google", "github"], providers.Social.Select(p => p.Key));
        Assert.True(providers.HasSso);
        Assert.Equal("Acme Corp", providers.Find("sso-acme")?.Name);
        Assert.Null(providers.Find("facebook"));
    }

    [Fact]
    public void Nothing_is_on_without_a_redirect_base()
    {
        var options = Everything();
        options.RedirectBaseUrl = null;

        var providers = Providers(options);

        Assert.Empty(providers.Social);
        Assert.False(providers.HasSso);
        Assert.Null(providers.Find("google"));
    }

    [Fact]
    public void Unset_credentials_switch_a_provider_off()
    {
        var options = Everything();
        options.GitHub = new ClientCredentials();

        Assert.Equal(["google"], Providers(options).Social.Select(p => p.Key));
    }

    [Theory]
    [InlineData("alex@acme.test", "sso-acme")]
    [InlineData(" Alex@ACME.TEST ", "sso-acme")]
    [InlineData("sam@acme.example", "sso-acme")]
    [InlineData("alex@eu.acme.test", null)]
    [InlineData("alex@evil-acme.test", null)]
    [InlineData("alex@gmail.com", null)]
    public void Sso_is_found_by_the_exact_email_domain(string email, string? expected) =>
        Assert.Equal(expected, Providers(Everything()).FindSsoForEmail(email)?.Key);

    [Fact]
    public void The_redirect_uri_is_the_base_plus_the_provider_key()
    {
        var providers = Providers(Everything());

        Assert.Equal("http://localhost:3000/api/auth/callback/sso-acme", providers.RedirectUri(providers.Find("sso-acme")!));
    }

    [Theory]
    [InlineData("google", "Google")]
    [InlineData("github", "GitHub")]
    [InlineData("sso-gone", "Single sign-on")]
    [InlineData("other", "other")]
    public void Switched_off_providers_still_have_a_display_name(string key, string expected) =>
        Assert.Equal(expected, Providers(new ExternalLoginOptions()).DisplayName(key));
}
