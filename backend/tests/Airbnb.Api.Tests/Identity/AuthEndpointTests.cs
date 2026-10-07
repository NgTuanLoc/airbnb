using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Airbnb.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

namespace Airbnb.Api.Tests.Identity;

public sealed class AuthEndpointTests(InfrastructureFixture infrastructure)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static string NewEmail() => $"u-{Guid.NewGuid():N}@example.com";

    private static StringContent Json(string json) => new(json, Encoding.UTF8, "application/json");

    private static Task<HttpResponseMessage> RegisterAsync(HttpClient client, string email, string password = "correct-horse", string name = "Ana") =>
        client.PostAsync("/api/auth/register", Json(JsonSerializer.Serialize(new { name, email, password })), Ct);

    private static Task<HttpResponseMessage> LoginAsync(HttpClient client, string email, string password) =>
        client.PostAsync("/api/auth/login", Json(JsonSerializer.Serialize(new { email, password })), Ct);

    private static async Task<JsonElement> DataAsync(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("data");

    private static async Task<HttpResponseMessage> MeAsync(HttpClient client, string? token)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/auth/me");
        if (token is not null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return await client.SendAsync(request, Ct);
    }

    [Fact]
    public async Task Register_creates_an_account_and_a_session_that_me_accepts()
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();
        var email = NewEmail();

        using var registered = await RegisterAsync(client, $"  {email.ToUpperInvariant()} ", name: "  Ana  ");

        Assert.Equal(HttpStatusCode.Created, registered.StatusCode);
        var data = await DataAsync(registered);
        var user = data.GetProperty("user");
        Assert.StartsWith("usr_", user.GetProperty("id").GetString());
        Assert.Equal(email, user.GetProperty("email").GetString());
        Assert.Equal("Ana", user.GetProperty("name").GetString());
        var token = data.GetProperty("token").GetString()!;
        Assert.InRange(data.GetProperty("expiresAt").GetDateTimeOffset(), DateTimeOffset.UtcNow.AddDays(7).AddMinutes(-1), DateTimeOffset.UtcNow.AddDays(7).AddMinutes(1));

        using var me = await MeAsync(client, token);
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        Assert.Equal(user.GetProperty("id").GetString(), (await DataAsync(me)).GetProperty("id").GetString());
    }

    [Fact]
    public async Task The_database_stores_a_password_hash_and_a_token_hash_never_the_secrets()
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();
        var email = NewEmail();
        using var registered = await RegisterAsync(client, email, password: "correct-horse");
        var token = (await DataAsync(registered)).GetProperty("token").GetString()!;

        await using var connection = new NpgsqlConnection(infrastructure.PostgresConnectionString);
        await connection.OpenAsync(Ct);
        await using var command = new NpgsqlCommand(
            """SELECT u."PasswordHash", s."TokenHash" FROM identity.users u JOIN identity.sessions s ON s."UserId" = u."Id" WHERE u."Email" = @email""",
            connection);
        command.Parameters.AddWithValue("email", email);
        await using var reader = await command.ExecuteReaderAsync(Ct);
        Assert.True(await reader.ReadAsync(Ct));
        Assert.NotEqual("correct-horse", reader.GetString(0));
        Assert.NotEqual(token, reader.GetString(1));
        Assert.Matches("^[0-9a-f]{64}$", reader.GetString(1));
    }

    [Fact]
    public async Task A_second_account_with_the_same_email_in_any_case_gets_409()
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();
        var email = NewEmail();
        using var first = await RegisterAsync(client, email);

        using var second = await RegisterAsync(client, email.ToUpperInvariant());

        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
        Assert.Equal("""{"success":false,"error":"An account with that email already exists"}""", await second.Content.ReadAsStringAsync(Ct));
    }

    [Fact]
    public async Task Racing_registrations_for_one_email_give_one_201_and_one_409()
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();
        var email = NewEmail();

        var responses = await Task.WhenAll(RegisterAsync(client, email), RegisterAsync(client, email));

        Assert.Equal([HttpStatusCode.Created, HttpStatusCode.Conflict], responses.Select(r => r.StatusCode).Order().ToArray());
        foreach (var response in responses) response.Dispose();
    }

    [Theory]
    [InlineData("""{"name":"Ana","email":"not-an-email","password":"correct-horse"}""")]
    [InlineData("""{"name":"Ana","email":"a@example.com","password":"short"}""")]
    [InlineData("""{"name":"   ","email":"a@example.com","password":"correct-horse"}""")]
    [InlineData("""{"email":"a@example.com","password":"correct-horse"}""")]
    public async Task Invalid_registrations_get_400(string body)
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();

        using var response = await client.PostAsync("/api/auth/register", Json(body), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.False((await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("success").GetBoolean());
    }

    [Fact]
    public async Task Login_accepts_the_right_password_with_any_email_case_and_spacing()
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();
        var email = NewEmail();
        using var _ = await RegisterAsync(client, email, password: "correct-horse");

        using var login = await LoginAsync(client, $" {email.ToUpperInvariant()} ", "correct-horse");

        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var data = await DataAsync(login);
        Assert.Equal(email, data.GetProperty("user").GetProperty("email").GetString());
        using var me = await MeAsync(client, data.GetProperty("token").GetString());
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
    }

    [Fact]
    public async Task A_wrong_password_and_an_unknown_email_get_the_same_401()
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();
        var email = NewEmail();
        using var _ = await RegisterAsync(client, email, password: "correct-horse");

        using var wrongPassword = await LoginAsync(client, email, "wrong-horse!");
        using var unknownEmail = await LoginAsync(client, NewEmail(), "correct-horse");

        const string expected = """{"success":false,"error":"Email or password is incorrect"}""";
        Assert.Equal(HttpStatusCode.Unauthorized, wrongPassword.StatusCode);
        Assert.Equal(expected, await wrongPassword.Content.ReadAsStringAsync(Ct));
        Assert.Equal(HttpStatusCode.Unauthorized, unknownEmail.StatusCode);
        Assert.Equal(expected, await unknownEmail.Content.ReadAsStringAsync(Ct));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("not-a-real-token")]
    public async Task Me_without_a_valid_session_gets_the_401_envelope(string? token)
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();

        using var me = await MeAsync(client, token);

        Assert.Equal(HttpStatusCode.Unauthorized, me.StatusCode);
        Assert.Equal("""{"success":false,"error":"Log in to continue"}""", await me.Content.ReadAsStringAsync(Ct));
    }

    [Fact]
    public async Task Logout_revokes_the_session_and_is_idempotent()
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();
        using var registered = await RegisterAsync(client, NewEmail());
        var token = (await DataAsync(registered)).GetProperty("token").GetString()!;

        async Task<HttpStatusCode> LogoutAsync(string? bearer)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/logout");
            if (bearer is not null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearer);
            using var response = await client.SendAsync(request, Ct);
            return response.StatusCode;
        }

        Assert.Equal(HttpStatusCode.NoContent, await LogoutAsync(token));
        Assert.Equal(HttpStatusCode.NoContent, await LogoutAsync(token));
        Assert.Equal(HttpStatusCode.NoContent, await LogoutAsync(null));
        using var me = await MeAsync(client, token);
        Assert.Equal(HttpStatusCode.Unauthorized, me.StatusCode);
    }

    [Fact]
    public async Task A_session_older_than_seven_days_is_rejected()
    {
        var clock = new MutableTimeProvider(DateTimeOffset.UtcNow);
        await using var factory = new ApiFactory(infrastructure).WithWebHostBuilder(builder =>
            builder.ConfigureTestServices(services => services.AddSingleton<TimeProvider>(clock)));
        using var client = factory.CreateClient();
        using var registered = await RegisterAsync(client, NewEmail());
        var token = (await DataAsync(registered)).GetProperty("token").GetString()!;

        clock.Now = clock.Now.AddDays(7).AddSeconds(1);
        using var me = await MeAsync(client, token);

        Assert.Equal(HttpStatusCode.Unauthorized, me.StatusCode);
    }
}
