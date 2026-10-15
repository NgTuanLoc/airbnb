using Airbnb.Modules.Identity.External;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Logging.Abstractions;

namespace Airbnb.UnitTests.Identity;

public sealed class GitHubProviderTests
{
    [Fact]
    public void Only_a_verified_primary_email_is_used()
    {
        Assert.Equal("ana@example.com", GitHubProvider.PrimaryVerifiedEmail(
        [
            new("old@example.com", Primary: false, Verified: true),
            new("ana@example.com", Primary: true, Verified: true),
        ]));
        Assert.Null(GitHubProvider.PrimaryVerifiedEmail([new("ana@example.com", Primary: true, Verified: false)]));
        Assert.Null(GitHubProvider.PrimaryVerifiedEmail([new("ana@example.com", Primary: false, Verified: true)]));
        Assert.Null(GitHubProvider.PrimaryVerifiedEmail([]));
    }

    [Fact]
    public async Task The_authorization_url_asks_for_the_profile_and_emails_with_pkce()
    {
        var provider = new GitHubProvider(new ClientCredentials { ClientId = "gh-client", ClientSecret = "s" }, new StubHttpClientFactory(_ => throw new InvalidOperationException()), NullLogger.Instance);

        var url = new Uri(await provider.BuildAuthorizationUrlAsync(
            new AuthorizationRequest("http://localhost:3000/api/auth/callback/github", "the-state", "unused-nonce", "the-challenge", "ana@example.com"),
            TestContext.Current.CancellationToken));

        Assert.Equal("https://github.com/login/oauth/authorize", url.GetLeftPart(UriPartial.Path));
        var query = QueryHelpers.ParseQuery(url.Query);
        Assert.Equal("gh-client", query["client_id"]);
        Assert.Equal("http://localhost:3000/api/auth/callback/github", query["redirect_uri"]);
        Assert.Equal("read:user user:email", query["scope"]);
        Assert.Equal("the-state", query["state"]);
        Assert.Equal("the-challenge", query["code_challenge"]);
        Assert.Equal("S256", query["code_challenge_method"]);
        Assert.False(query.ContainsKey("client_secret"));
    }
}
