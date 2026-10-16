using Airbnb.Modules.Identity.External;

namespace Airbnb.UnitTests.Identity;

public sealed class ExternalLoginOptionsValidatorTests
{
    private static SsoConnectionOptions Acme(params string[] domains) => new()
    {
        Name = "Acme Corp",
        Domains = domains.Length > 0 ? [.. domains] : ["acme.test"],
        Authority = "https://idp.acme.test/realms/acme",
        ClientId = "airbnb",
        ClientSecret = "secret",
    };

    private static IEnumerable<string> Failures(ExternalLoginOptions options) =>
        new ExternalLoginOptionsValidator().Validate(null, options).Failures ?? [];

    [Fact]
    public void Nothing_configured_is_valid() => Assert.Empty(Failures(new ExternalLoginOptions()));

    [Fact]
    public void A_complete_configuration_is_valid()
    {
        var options = new ExternalLoginOptions
        {
            RedirectBaseUrl = "http://localhost:3000/api/auth/callback",
            Google = new ClientCredentials { ClientId = "g", ClientSecret = "gs" },
            GitHub = new ClientCredentials { ClientId = "h", ClientSecret = "hs" },
            Sso = { ["acme"] = Acme() },
        };

        Assert.Empty(Failures(options));
    }

    [Fact]
    public void Half_set_credentials_fail()
    {
        var options = new ExternalLoginOptions { Google = new ClientCredentials { ClientId = "g" }, GitHub = new ClientCredentials { ClientSecret = "hs" } };

        Assert.Equal(2, Failures(options).Count());
    }

    [Fact]
    public void A_relative_redirect_base_fails() =>
        Assert.Single(Failures(new ExternalLoginOptions { RedirectBaseUrl = "/api/auth/callback" }));

    [Fact]
    public void An_http_authority_needs_RequireHttpsMetadata_off()
    {
        var connection = Acme();
        connection.Authority = "http://localhost:8080/realms/acme";
        Assert.Contains(Failures(new ExternalLoginOptions { Sso = { ["acme"] = connection } }), f => f.Contains("https"));

        connection.RequireHttpsMetadata = false;
        Assert.Empty(Failures(new ExternalLoginOptions { Sso = { ["acme"] = connection } }));
    }

    [Theory]
    [InlineData("Acme")]
    [InlineData("acme corp")]
    [InlineData("-acme")]
    public void Connection_ids_are_lowercase_slugs(string id) =>
        Assert.Single(Failures(new ExternalLoginOptions { Sso = { [id] = Acme() } }));

    [Fact]
    public void A_connection_needs_a_name_credentials_an_authority_and_a_domain()
    {
        var failures = Failures(new ExternalLoginOptions { Sso = { ["acme"] = new SsoConnectionOptions() } }).ToArray();

        Assert.Equal(4, failures.Length);
    }

    [Theory]
    [InlineData("acme")]
    [InlineData("@acme.test")]
    [InlineData("acme.test/")]
    [InlineData("acme .test")]
    public void Invalid_domains_fail(string domain) =>
        Assert.Single(Failures(new ExternalLoginOptions { Sso = { ["acme"] = Acme(domain) } }));

    [Fact]
    public void Two_connections_cannot_claim_one_domain()
    {
        var options = new ExternalLoginOptions { Sso = { ["acme"] = Acme("acme.test"), ["other"] = Acme("ACME.test") } };

        Assert.Contains(Failures(options), f => f.Contains("already belongs to connection \"acme\""));
    }
}
