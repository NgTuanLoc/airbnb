using Airbnb.Modules.Identity;

namespace Airbnb.UnitTests.Identity;

public sealed class SessionTokensTests
{
    [Fact]
    public void New_tokens_are_43_char_base64url_and_unique()
    {
        var a = SessionTokens.NewToken();
        var b = SessionTokens.NewToken();

        Assert.Equal(43, a.Length);
        Assert.Matches("^[A-Za-z0-9_-]+$", a);
        Assert.NotEqual(a, b);
    }

    [Fact]
    public void The_hash_is_stable_lowercase_hex_sha256_and_not_the_token()
    {
        var token = SessionTokens.NewToken();

        var hash = SessionTokens.Hash(token);

        Assert.Equal(hash, SessionTokens.Hash(token));
        Assert.Matches("^[0-9a-f]{64}$", hash);
        Assert.NotEqual(token, hash);
    }

    [Fact]
    public void Sessions_last_seven_days() => Assert.Equal(TimeSpan.FromDays(7), SessionTokens.Lifetime);
}
