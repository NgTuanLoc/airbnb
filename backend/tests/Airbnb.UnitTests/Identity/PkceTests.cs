using Airbnb.Modules.Identity.External;

namespace Airbnb.UnitTests.Identity;

public sealed class PkceTests
{
    // RFC 7636 Appendix B.
    [Fact]
    public void The_challenge_is_the_base64url_sha256_of_the_verifier() =>
        Assert.Equal("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", Pkce.Challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"));

    [Fact]
    public void Verifiers_are_43_unreserved_characters_and_unique()
    {
        var a = Pkce.NewVerifier();

        Assert.Equal(43, a.Length);
        Assert.Matches("^[A-Za-z0-9_-]+$", a);
        Assert.NotEqual(a, Pkce.NewVerifier());
    }

    [Fact]
    public void Secrets_compare_exactly()
    {
        Assert.True(Secrets.Equal("abc", "abc"));
        Assert.False(Secrets.Equal("abd", "abc"));
        Assert.False(Secrets.Equal("ab", "abc"));
        Assert.False(Secrets.Equal(null, "abc"));
    }
}
