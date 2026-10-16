using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Airbnb.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using static Airbnb.Api.Tests.Identity.FakeIdentityProviders;

namespace Airbnb.Api.Tests.Identity;

// Google, GitHub and SSO sign-in against fake identity providers (OAuth spec §4).
public sealed class ExternalLoginTests(InfrastructureFixture infrastructure)
{
    private const string RedirectBase = "http://localhost:3000/api/auth/callback";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private readonly FakeIdentityProviders _idp = new();

    private WebApplicationFactory<Program> Factory(TimeProvider? clock = null) =>
        new ApiFactory(infrastructure).WithWebHostBuilder(builder =>
        {
            builder
                .UseSetting("RateLimiting:WritesPerMinute", "1000")
                .UseSetting("Identity:External:RedirectBaseUrl", RedirectBase)
                .UseSetting("Identity:External:Google:ClientId", GoogleClientId)
                .UseSetting("Identity:External:Google:ClientSecret", GoogleClientSecret)
                .UseSetting("Identity:External:GitHub:ClientId", GitHubClientId)
                .UseSetting("Identity:External:GitHub:ClientSecret", GitHubClientSecret)
                .UseSetting("Identity:External:Sso:acme:Name", "Acme Corp")
                .UseSetting("Identity:External:Sso:acme:Domains:0", "acme.test")
                .UseSetting("Identity:External:Sso:acme:Authority", AcmeAuthority)
                .UseSetting("Identity:External:Sso:acme:ClientId", AcmeClientId)
                .UseSetting("Identity:External:Sso:acme:ClientSecret", AcmeClientSecret)
                .ConfigureTestServices(services =>
                {
                    // The Identity module's named client for provider calls.
                    services.AddHttpClient("identity-external")
                        .ConfigurePrimaryHttpMessageHandler(() => _idp)
                        .SetHandlerLifetime(Timeout.InfiniteTimeSpan);
                    if (clock is not null)
                    {
                        services.AddSingleton(clock);
                    }
                });
        });

    private static string NewEmail(string domain = "example.com") => $"u-{Guid.NewGuid():N}@{domain}";

    private static string NewSubject() => Random.Shared.NextInt64(1, long.MaxValue).ToString(System.Globalization.CultureInfo.InvariantCulture);

    private static async Task<(HttpStatusCode Status, JsonElement Body)> SendAsync(HttpClient client, HttpMethod method, string path, object? body = null, string? token = null)
    {
        using var request = new HttpRequestMessage(method, path);
        if (body is not null) request.Content = JsonContent.Create(body);
        if (token is not null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var response = await client.SendAsync(request, Ct);
        var text = await response.Content.ReadAsStringAsync(Ct);
        return (response.StatusCode, text.Length == 0 ? default : JsonDocument.Parse(text).RootElement.Clone());
    }

    private sealed record Started(string AuthorizationUrl, string FlowId, string State, string Provider);

    private static async Task<Started> StartAsync(HttpClient client, object body, string? token = null)
    {
        var (status, envelope) = await SendAsync(client, HttpMethod.Post, "/api/auth/external/start", body, token);
        Assert.True(status == HttpStatusCode.OK, $"start answered {status}: {envelope}");
        var data = envelope.GetProperty("data");
        var url = data.GetProperty("authorizationUrl").GetString()!;
        return new Started(url, data.GetProperty("flowId").GetString()!, QueryHelpers.ParseQuery(new Uri(url).Query)["state"]!, data.GetProperty("provider").GetString()!);
    }

    private static Task<(HttpStatusCode Status, JsonElement Body)> CallbackAsync(HttpClient client, string provider, Started started, string code, string? state = null, string? iss = null) =>
        SendAsync(client, HttpMethod.Post, "/api/auth/external/callback", new { provider, flowId = started.FlowId, state = state ?? started.State, code, iss });

    // The whole round trip: start, the person signs in at the provider, the callback.
    private async Task<(HttpStatusCode Status, JsonElement Body)> SignInAsync(
        HttpClient client,
        object start,
        Person person,
        string? token = null,
        Action<Dictionary<string, object>>? tamperClaims = null,
        IReadOnlyList<GitHubEmail>? gitHubEmails = null)
    {
        var started = await StartAsync(client, start, token);
        var code = _idp.Authorize(started.AuthorizationUrl, person, tamperClaims, gitHubEmails);
        return await CallbackAsync(client, started.Provider, started, code);
    }

    private static string Code(JsonElement envelope) => envelope.GetProperty("code").GetString()!;

    private static string UserId(JsonElement envelope) => envelope.GetProperty("data").GetProperty("session").GetProperty("user").GetProperty("id").GetString()!;

    private async Task<T> QueryAsync<T>(string sql, params (string Name, object Value)[] parameters)
    {
        await using var connection = new NpgsqlConnection(infrastructure.PostgresConnectionString);
        await connection.OpenAsync(Ct);
        await using var command = new NpgsqlCommand(sql, connection);
        foreach (var (name, value) in parameters) command.Parameters.AddWithValue(name, value);
        return (T)(await command.ExecuteScalarAsync(Ct))!;
    }

    [Fact]
    public async Task Providers_lists_the_configured_social_providers_and_whether_sso_is_on()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();

        var (status, body) = await SendAsync(client, HttpMethod.Get, "/api/auth/providers");

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal("""{"social":[{"id":"google","name":"Google"},{"id":"github","name":"GitHub"}],"sso":true}""", body.GetProperty("data").GetRawText());
    }

    [Fact]
    public async Task Without_configuration_nothing_is_offered()
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();

        var (_, body) = await SendAsync(client, HttpMethod.Get, "/api/auth/providers");

        Assert.Equal("""{"social":[],"sso":false}""", body.GetProperty("data").GetRawText());
    }

    [Fact]
    public async Task Start_sends_the_browser_to_the_provider_with_pkce_and_stores_only_a_hash_of_the_flow_id()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();

        var started = await StartAsync(client, new { provider = "google" });

        var url = new Uri(started.AuthorizationUrl);
        Assert.Equal("https://accounts.google.com/o/oauth2/v2/auth", url.GetLeftPart(UriPartial.Path));
        var query = QueryHelpers.ParseQuery(url.Query);
        Assert.Equal(GoogleClientId, query["client_id"]);
        Assert.Equal($"{RedirectBase}/google", query["redirect_uri"]);
        Assert.Equal("code", query["response_type"]);
        Assert.Equal("openid email profile", query["scope"]);
        Assert.Equal("S256", query["code_challenge_method"]);
        Assert.Equal(43, query["code_challenge"].ToString().Length);
        Assert.Equal(43, query["nonce"].ToString().Length);
        Assert.NotEqual(started.FlowId, started.State);
        Assert.Equal("google", started.Provider);

        var stored = await QueryAsync<long>(
            """SELECT count(*) FROM identity.external_login_flows WHERE "IdHash" = encode(sha256(convert_to(@id, 'UTF8')), 'hex') AND "State" = @state""",
            ("id", started.FlowId), ("state", started.State));
        Assert.Equal(1, stored);
        Assert.Equal(0, await QueryAsync<long>("""SELECT count(*) FROM identity.external_login_flows WHERE "IdHash" = @id""", ("id", started.FlowId)));
    }

    [Theory]
    [InlineData("facebook")]
    [InlineData("sso-other")]
    public async Task Start_with_a_provider_that_isnt_on_is_404(string provider)
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();

        var (status, body) = await SendAsync(client, HttpMethod.Post, "/api/auth/external/start", new { provider });

        Assert.Equal(HttpStatusCode.NotFound, status);
        Assert.Equal("provider_unavailable", Code(body));
    }

    [Fact]
    public async Task Sso_start_picks_the_connection_by_email_domain()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();

        var started = await StartAsync(client, new { provider = "sso", email = " Alex@ACME.test " });

        Assert.Equal("sso-acme", started.Provider);
        Assert.StartsWith($"{AcmeAuthority}/protocol/openid-connect/auth?", started.AuthorizationUrl);
        var query = QueryHelpers.ParseQuery(new Uri(started.AuthorizationUrl).Query);
        Assert.Equal("alex@acme.test", query["login_hint"]);
        Assert.Equal($"{RedirectBase}/sso-acme", query["redirect_uri"]);

        var (unknown, unknownBody) = await SendAsync(client, HttpMethod.Post, "/api/auth/external/start", new { provider = "sso", email = "alex@acme.example" });
        Assert.Equal(HttpStatusCode.NotFound, unknown);
        Assert.Equal("sso_not_configured", Code(unknownBody));

        var (missing, missingBody) = await SendAsync(client, HttpMethod.Post, "/api/auth/external/start", new { provider = "sso" });
        Assert.Equal(HttpStatusCode.BadRequest, missing);
        Assert.Equal("email_required", Code(missingBody));
    }

    [Fact]
    public async Task A_connect_flow_needs_a_session()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();

        var (status, body) = await SendAsync(client, HttpMethod.Post, "/api/auth/external/start", new { provider = "google", link = true });

        Assert.Equal(HttpStatusCode.Unauthorized, status);
        Assert.Equal("Log in to continue", body.GetProperty("error").GetString());
    }

    [Fact]
    public async Task A_first_google_sign_in_creates_a_verified_password_less_account_and_the_next_finds_it()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var person = new Person(NewSubject(), NewEmail().ToUpperInvariant(), Name: "Ana Lima");

        var (status, body) = await SignInAsync(client, new { provider = "google" }, person);

        Assert.Equal(HttpStatusCode.OK, status);
        var session = body.GetProperty("data").GetProperty("session");
        Assert.Equal(person.Email.ToLowerInvariant(), session.GetProperty("user").GetProperty("email").GetString());
        Assert.Equal("Ana Lima", session.GetProperty("user").GetProperty("name").GetString());
        var (me, meBody) = await SendAsync(client, HttpMethod.Get, "/api/auth/me", token: session.GetProperty("token").GetString());
        Assert.Equal(HttpStatusCode.OK, me);
        Assert.Equal(UserId(body), meBody.GetProperty("data").GetProperty("id").GetString());
        Assert.True(await QueryAsync<bool>(
            """SELECT "PasswordHash" IS NULL AND "EmailVerifiedAt" IS NOT NULL FROM identity.users WHERE "Id" = @id""", ("id", UserId(body))));

        var (_, again) = await SignInAsync(client, new { provider = "google" }, person with { Email = NewEmail() });

        Assert.Equal(UserId(body), UserId(again));
    }

    [Fact]
    public async Task A_replayed_callback_is_refused()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var started = await StartAsync(client, new { provider = "google" });
        var code = _idp.Authorize(started.AuthorizationUrl, new Person(NewSubject(), NewEmail()));
        var (first, _) = await CallbackAsync(client, "google", started, code);

        var (second, body) = await CallbackAsync(client, "google", started, code);

        Assert.Equal(HttpStatusCode.OK, first);
        Assert.Equal(HttpStatusCode.BadRequest, second);
        Assert.Equal("flow_expired", Code(body));
    }

    [Fact]
    public async Task A_callback_with_another_state_is_refused_and_spends_the_flow()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var started = await StartAsync(client, new { provider = "google" });
        var code = _idp.Authorize(started.AuthorizationUrl, new Person(NewSubject(), NewEmail()));

        var (status, body) = await CallbackAsync(client, "google", started, code, state: "forged-state");
        var (retry, retryBody) = await CallbackAsync(client, "google", started, code);

        Assert.Equal(HttpStatusCode.BadRequest, status);
        Assert.Equal("flow_mismatch", Code(body));
        Assert.Equal(HttpStatusCode.BadRequest, retry);
        Assert.Equal("flow_expired", Code(retryBody));
    }

    [Fact]
    public async Task A_callback_on_another_providers_url_is_refused()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var started = await StartAsync(client, new { provider = "google" });
        var code = _idp.Authorize(started.AuthorizationUrl, new Person(NewSubject(), NewEmail()));

        var (status, body) = await CallbackAsync(client, "github", started, code);

        Assert.Equal(HttpStatusCode.BadRequest, status);
        Assert.Equal("flow_mismatch", Code(body));
    }

    [Fact]
    public async Task A_callback_naming_another_issuer_is_refused()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var started = await StartAsync(client, new { provider = "google" });
        var code = _idp.Authorize(started.AuthorizationUrl, new Person(NewSubject(), NewEmail()));

        var (status, body) = await CallbackAsync(client, "google", started, code, iss: "https://evil.test");

        Assert.Equal(HttpStatusCode.BadRequest, status);
        Assert.Equal("flow_mismatch", Code(body));
    }

    [Fact]
    public async Task A_flow_older_than_ten_minutes_is_refused()
    {
        var clock = new MutableTimeProvider(DateTimeOffset.UtcNow);
        await using var factory = Factory(clock);
        using var client = factory.CreateClient();
        var started = await StartAsync(client, new { provider = "google" });
        var code = _idp.Authorize(started.AuthorizationUrl, new Person(NewSubject(), NewEmail()));

        clock.Now = clock.Now.AddMinutes(10).AddSeconds(1);
        var (status, body) = await CallbackAsync(client, "google", started, code);

        Assert.Equal(HttpStatusCode.BadRequest, status);
        Assert.Equal("flow_expired", Code(body));
    }

    [Theory]
    [InlineData("nonce")]
    [InlineData("aud")]
    public async Task An_id_token_for_another_flow_or_client_is_refused(string claim)
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();

        var (status, body) = await SignInAsync(client, new { provider = "google" }, new Person(NewSubject(), NewEmail()),
            tamperClaims: claims => claims[claim] = "someone-else");

        Assert.Equal(HttpStatusCode.BadRequest, status);
        Assert.Equal("provider_error", Code(body));
    }

    [Fact]
    public async Task An_unverified_google_email_is_refused_and_creates_nothing()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var email = NewEmail();

        var (status, body) = await SignInAsync(client, new { provider = "google" }, new Person(NewSubject(), email, EmailVerified: false));

        Assert.Equal(HttpStatusCode.BadRequest, status);
        Assert.Equal("no_verified_email", Code(body));
        Assert.Equal(0, await QueryAsync<long>("""SELECT count(*) FROM identity.users WHERE "Email" = @email""", ("email", email)));
    }

    [Fact]
    public async Task A_password_account_with_the_same_email_is_not_taken_over()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var (_, userId, email) = await AuthHelpers.RegisterAsync(client);

        var (status, body) = await SignInAsync(client, new { provider = "google" }, new Person(NewSubject(), email));

        Assert.Equal(HttpStatusCode.Conflict, status);
        Assert.Equal("account_exists", Code(body));
        Assert.Equal(1, await QueryAsync<long>("""SELECT count(*) FROM identity.sessions WHERE "UserId" = @id""", ("id", userId)));
        Assert.Equal(0, await QueryAsync<long>("""SELECT count(*) FROM identity.external_logins WHERE "UserId" = @id""", ("id", userId)));
    }

    [Fact]
    public async Task A_verified_account_signs_in_with_another_provider_carrying_the_same_verified_email()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var email = NewEmail();
        var (_, google) = await SignInAsync(client, new { provider = "google" }, new Person(NewSubject(), email));

        var (status, github) = await SignInAsync(client, new { provider = "github" }, new Person(NewSubject(), email));

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal(UserId(google), UserId(github));
    }

    [Fact]
    public async Task GitHub_signs_in_with_the_verified_primary_email()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var primary = NewEmail();

        var (status, body) = await SignInAsync(client, new { provider = "github" }, new Person(NewSubject(), "unused@example.com"),
            gitHubEmails: [new GitHubEmail(NewEmail(), Primary: false, Verified: true), new GitHubEmail(primary, Primary: true, Verified: true)]);

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal(primary, body.GetProperty("data").GetProperty("session").GetProperty("user").GetProperty("email").GetString());
    }

    [Fact]
    public async Task GitHub_without_a_verified_primary_email_is_refused()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();

        var (status, body) = await SignInAsync(client, new { provider = "github" }, new Person(NewSubject(), "unused@example.com"),
            gitHubEmails: [new GitHubEmail(NewEmail(), Primary: true, Verified: false), new GitHubEmail(NewEmail(), Primary: false, Verified: true)]);

        Assert.Equal(HttpStatusCode.BadRequest, status);
        Assert.Equal("no_verified_email", Code(body));
    }

    [Fact]
    public async Task Sso_signs_in_emails_on_its_domain_and_refuses_others()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var email = NewEmail("acme.test");

        var (status, body) = await SignInAsync(client, new { provider = "sso", email }, new Person($"kc-{Guid.NewGuid():N}", email));
        var (outside, outsideBody) = await SignInAsync(client, new { provider = "sso", email }, new Person($"kc-{Guid.NewGuid():N}", NewEmail("gmail.com")));

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal(email, body.GetProperty("data").GetProperty("session").GetProperty("user").GetProperty("email").GetString());
        Assert.Equal(HttpStatusCode.BadRequest, outside);
        Assert.Equal("email_domain_not_allowed", Code(outsideBody));
    }

    [Fact]
    public async Task A_password_user_connects_google_verifies_their_email_and_can_then_sign_in_with_it()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var (token, userId, email) = await AuthHelpers.RegisterAsync(client);
        var person = new Person(NewSubject(), email);

        var (status, body) = await SignInAsync(client, new { provider = "google", link = true }, person, token);

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal($$"""{"provider":"google","email":"{{email}}"}""", body.GetProperty("data").GetProperty("linked").GetRawText());
        Assert.False(body.GetProperty("data").TryGetProperty("session", out _));
        Assert.True(await QueryAsync<bool>("""SELECT "EmailVerifiedAt" IS NOT NULL FROM identity.users WHERE "Id" = @id""", ("id", userId)));

        var (_, signIn) = await SignInAsync(client, new { provider = "google" }, person);
        Assert.Equal(userId, UserId(signIn));
    }

    [Fact]
    public async Task Connecting_someone_elses_provider_account_is_refused()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var person = new Person(NewSubject(), NewEmail());
        await SignInAsync(client, new { provider = "google" }, person);
        var (token, _, _) = await AuthHelpers.RegisterAsync(client);

        var (status, body) = await SignInAsync(client, new { provider = "google", link = true }, person, token);

        Assert.Equal(HttpStatusCode.Conflict, status);
        Assert.Equal("identity_in_use", Code(body));
    }

    [Fact]
    public async Task A_second_account_of_one_provider_is_refused_and_the_same_one_again_is_fine()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var (token, _, _) = await AuthHelpers.RegisterAsync(client);
        var first = new Person(NewSubject(), NewEmail());
        await SignInAsync(client, new { provider = "github", link = true }, first, token);

        var (again, _) = await SignInAsync(client, new { provider = "github", link = true }, first, token);
        var (second, body) = await SignInAsync(client, new { provider = "github", link = true }, new Person(NewSubject(), NewEmail()), token);

        Assert.Equal(HttpStatusCode.OK, again);
        Assert.Equal(HttpStatusCode.Conflict, second);
        Assert.Equal("provider_already_connected", Code(body));
    }

    [Fact]
    public async Task Connections_list_every_option_with_what_is_connected()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var email = NewEmail("acme.test");
        var (token, _, _) = await RegisterWithEmailAsync(client, email);
        await SignInAsync(client, new { provider = "github", link = true }, new Person(NewSubject(), "gh@example.com"), token);

        var (status, body) = await SendAsync(client, HttpMethod.Get, "/api/auth/connections", token: token);

        Assert.Equal(HttpStatusCode.OK, status);
        var data = body.GetProperty("data");
        Assert.True(data.GetProperty("hasPassword").GetBoolean());
        var rows = data.GetProperty("connections").EnumerateArray().ToArray();
        Assert.Equal(["google", "github", "sso-acme"], rows.Select(r => r.GetProperty("provider").GetString()));
        Assert.Equal(["Google", "GitHub", "Acme Corp"], rows.Select(r => r.GetProperty("name").GetString()));
        Assert.Equal(["social", "social", "sso"], rows.Select(r => r.GetProperty("kind").GetString()));
        Assert.False(rows[0].TryGetProperty("email", out _));
        Assert.Equal("gh@example.com", rows[1].GetProperty("email").GetString());
        Assert.True(rows[1].TryGetProperty("connectedAt", out _));
    }

    [Fact]
    public async Task Disconnecting_never_removes_the_last_way_in()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var (_, signIn) = await SignInAsync(client, new { provider = "google" }, new Person(NewSubject(), NewEmail()));
        var token = signIn.GetProperty("data").GetProperty("session").GetProperty("token").GetString()!;

        var (onlyOne, onlyOneBody) = await SendAsync(client, HttpMethod.Delete, "/api/auth/connections/google", token: token);
        await SignInAsync(client, new { provider = "github", link = true }, new Person(NewSubject(), NewEmail()), token);
        var (removed, _) = await SendAsync(client, HttpMethod.Delete, "/api/auth/connections/google", token: token);
        var (gone, goneBody) = await SendAsync(client, HttpMethod.Delete, "/api/auth/connections/google", token: token);

        Assert.Equal(HttpStatusCode.Conflict, onlyOne);
        Assert.Equal("last_login_method", Code(onlyOneBody));
        Assert.Equal(HttpStatusCode.NoContent, removed);
        Assert.Equal(HttpStatusCode.NotFound, gone);
        Assert.Equal("not_connected", Code(goneBody));
    }

    [Fact]
    public async Task A_password_user_can_disconnect_their_only_provider()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var (token, _, _) = await AuthHelpers.RegisterAsync(client);
        await SignInAsync(client, new { provider = "google", link = true }, new Person(NewSubject(), NewEmail()), token);

        var (status, _) = await SendAsync(client, HttpMethod.Delete, "/api/auth/connections/google", token: token);

        Assert.Equal(HttpStatusCode.NoContent, status);
    }

    [Theory]
    [InlineData("GET", "/api/auth/connections")]
    [InlineData("DELETE", "/api/auth/connections/google")]
    public async Task Connections_need_a_session(string method, string path)
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();

        var (status, _) = await SendAsync(client, new HttpMethod(method), path);

        Assert.Equal(HttpStatusCode.Unauthorized, status);
    }

    [Fact]
    public async Task A_provider_outage_is_a_502()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        _idp.TokenEndpointDown = true;

        var (status, body) = await SignInAsync(client, new { provider = "google" }, new Person(NewSubject(), NewEmail()));

        Assert.Equal(HttpStatusCode.BadGateway, status);
        Assert.Equal("provider_unreachable", Code(body));
    }

    private static async Task<(string Token, string UserId, string Email)> RegisterWithEmailAsync(HttpClient client, string email)
    {
        var (status, body) = await SendAsync(client, HttpMethod.Post, "/api/auth/register", new { name = "Alex", email, password = "correct-horse" });
        Assert.Equal(HttpStatusCode.Created, status);
        var data = body.GetProperty("data");
        return (data.GetProperty("token").GetString()!, data.GetProperty("user").GetProperty("id").GetString()!, email);
    }
}
