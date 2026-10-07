# Backend Identity (Real Authentication) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real accounts in the .NET backend, with hashed passwords and revocable server-side sessions behind an ASP.NET auth scheme. In `DATA_SOURCE=api` mode the frontend authenticates through the backend, while mock mode is unchanged.

**Architecture:**
- **Backend:** a new `Identity` module in its own `identity` Postgres schema, holding the `users` and `sessions` tables. Opaque bearer tokens are stored only as SHA-256 hashes, and a custom `"Session"` `AuthenticationHandler` lets any endpoint `RequireAuthorization()`.
- **Frontend:** an `AuthGateway`, mock or HTTP depending on `DATA_SOURCE`, sits behind the existing `/api/auth/*` route handlers. The httpOnly cookie holds the gateway's token.
- **Folded in:**
  - forwarded headers, so rate limiting is per browser;
  - a `withErrorEnvelope` wrapper on every route handler;
  - `server-only` guards.

**Tech Stack:**
- **Backend:** .NET 10, ASP.NET Core minimal APIs, EF Core 10 with Npgsql, `Microsoft.Extensions.Identity.Core` (`PasswordHasher<T>`), xUnit v3, Testcontainers.
- **Frontend:** Next.js 16 route handlers, Zod v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-07-backend-identity-design.md`

**Paths:**
- **Frontend:** paths are relative to `frontend/`, and npm/npx commands run from there.
- **Backend:** paths are relative to `backend/`, and `dotnet` commands run from there. Docker must be running for `Airbnb.Api.Tests`.

## Global Constraints

### Backend rules (CLAUDE.md)

- **Public surface:** a module's only public type is its module class (`IdentityModule`). Request records are `public` but nested inside `internal` slice classes. The module calls `services.AddValidation()` itself.
- **Envelope:** every `/api` body is the envelope `{ success, data?, error?, meta? }`, built with `ApiResponse.Ok`/`ApiResponse.Fail`.
- **Package versions:** they live only in `backend/Directory.Packages.props`. Warnings are errors, so xUnit tests pass `TestContext.Current.CancellationToken`.
- **Registration:** a new module is registered in `Airbnb.Api/Program.cs`, `Airbnb.MigrationService/Program.cs`, the tests' `InfrastructureFixture`, `ModuleRulesTests` and `backend/Airbnb.slnx`.
- **Migrations:** from `backend/`, run `dotnet tool restore`, then `dotnet ef migrations add <Name> --project src/Modules/Identity/Airbnb.Modules.Identity --startup-project src/Modules/Identity/Airbnb.Modules.Identity --output-dir Data/Migrations`.
- **Write tests:** they use fresh random emails (`$"u-{Guid.NewGuid():N}@example.com"`), never fixed ones, so test runs never collide.

### Identity values (spec §1)

- **Schema:** `identity`.
- **Tables:** `users` (`Id`, `Email`, `Name`, `PasswordHash`, `CreatedAt`) and `sessions` (`TokenHash`, `UserId`, `CreatedAt`, `ExpiresAt`).
- **User ids:** `"usr_" + Guid.CreateVersion7().ToString("N")`.
- **Tokens:** 32 random bytes, base64url, no padding. The stored hash is lower-case hex SHA-256.
- **Session lifetime:** 7 days, fixed.
- **Validation:**
  - name: 1–60 after trim;
  - email: valid, ≤ 254;
  - password: 8–128.
- **Messages:**
  - `An account with that email already exists` (409);
  - `Email or password is incorrect` (401);
  - `Log in to continue` (401).
- **Endpoints:**
  - `POST /api/auth/register` returns 201 `{ user, token, expiresAt }`;
  - `POST /api/auth/login` returns 200 with the same shape;
  - `POST /api/auth/logout` returns 204, always;
  - `GET /api/auth/me` returns 200 `user`.
- **User JSON:** `{ id, name, email }`.

### Frontend rules

- **Imports:** tests import from `@/lib/test-utils` where they render. Route handler tests start with `// @vitest-environment node`.
- **Mocks:** use `mockRejectedValueOnce`, never `mockRejectedValue`.
- **Data sources:** `DATA_SOURCE=mock|api`, default `mock`. `api` needs `API_HTTP`.
- **Generic error message:** `Something went wrong. Try again.` (status 500).

### Commits

Conventional commits, each ending with the line `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Rulings made while planning

- **Name clash:** the module's DbContext is `IdentityDbContext` in namespace `Airbnb.Modules.Identity.Data`. The project never references `Microsoft.AspNetCore.Identity.EntityFrameworkCore`, so the names don't clash.
- **Backend down:** if the backend can't be reached while reading a session, the frontend treats the visitor as logged out. `getSession()` and `sessionFromRequest()` log the error and return null. Pages keep rendering, and writes get the normal 401. Throwing instead would break every page that reads the session during an outage.
- **Shared data-source switch:** the `DATA_SOURCE` switch is extracted to `lib/data-source.ts`, so the repositories and the auth gateway share one parser instead of duplicating it.

## Review Focus

1. **Duplicate registrations.** Two registrations for the same email racing each other must give one 201 and one 409, never a 500. Task 2 adds a parallel-register test.
2. **Email normalisation.** `" Ana@Example.COM "` at login must match an account registered as `ana@example.com`. Task 2 adds the test.
3. **Spoofed client IP.** A forwarded-for header from a non-loopback caller must not create a new rate-limit bucket. Task 3 adds the test.
4. **Backend down while reading a session.** Pages render as logged out and don't crash. Task 5 adds the test.
5. **Backend down during logout.** The cookie is still cleared. Task 5 adds the test.

---

### Task 1: The Identity module skeleton, its data and its wiring

**Files:**
- Modify: `Directory.Packages.props`, `Airbnb.slnx`, `src/Airbnb.Api/Airbnb.Api.csproj`, `src/Airbnb.Api/Program.cs`, `src/Airbnb.MigrationService/Airbnb.MigrationService.csproj`, `src/Airbnb.MigrationService/Program.cs`, `tests/Airbnb.Api.Tests/Infrastructure/InfrastructureFixture.cs`, `tests/Airbnb.ArchitectureTests/Airbnb.ArchitectureTests.csproj`, `tests/Airbnb.ArchitectureTests/ModuleRulesTests.cs`, `tests/Airbnb.UnitTests/Airbnb.UnitTests.csproj`
- Create: `src/Modules/Identity/Airbnb.Modules.Identity/Airbnb.Modules.Identity.csproj`, `IdentityModule.cs`, `User.cs`, `Session.cs`, `SessionTokens.cs`, `Emails.cs`, `Data/IdentityDbContext.cs`, `Data/Migrations/*` (generated)
- Test: `tests/Airbnb.UnitTests/Identity/SessionTokensTests.cs`, `tests/Airbnb.UnitTests/Identity/EmailsTests.cs`

**Interfaces:**
- **Produces:**
  - `IdentityModule.AddIdentityModule(IHostApplicationBuilder)`, `AddIdentityModuleDatabase`, `MapIdentityEndpoints(IEndpointRouteBuilder)`; endpoints come in Task 2;
  - internal entities `User { Id, Email, Name, PasswordHash, CreatedAt }` and `Session { TokenHash, UserId, User, CreatedAt, ExpiresAt }`;
  - `IdentityDbContext { Users, Sessions }`;
  - `SessionTokens.NewToken(): string`, `SessionTokens.Hash(string token): string`, `SessionTokens.Lifetime` (7 days);
  - `Emails.Normalize(string): string`.

- [ ] **Step 1: Add the package and the project**

In `Directory.Packages.props`, beside the other ASP.NET packages, add `<PackageVersion Include="Microsoft.Extensions.Identity.Core" Version="10.0.12" />`. Match the repo's ASP.NET 10 patch version, and use the nearest published 10.0.x if `10.0.12` doesn't exist.

`src/Modules/Identity/Airbnb.Modules.Identity/Airbnb.Modules.Identity.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">

  <ItemGroup>
    <InternalsVisibleTo Include="Airbnb.UnitTests" />
  </ItemGroup>

  <ItemGroup>
    <FrameworkReference Include="Microsoft.AspNetCore.App" />
    <PackageReference Include="Microsoft.EntityFrameworkCore.Design" PrivateAssets="all" />
    <PackageReference Include="Microsoft.Extensions.Identity.Core" />
  </ItemGroup>

  <ItemGroup>
    <ProjectReference Include="..\..\..\Airbnb.SharedKernel\Airbnb.SharedKernel.csproj" />
  </ItemGroup>

</Project>
```

The EF provider comes through SharedKernel, as for the other modules. Check `src/Modules/Hosts/Airbnb.Modules.Hosts/Airbnb.Modules.Hosts.csproj` and copy whatever else it carries, apart from the seed `EmbeddedResource`.

Add the project to `Airbnb.slnx` in a new `<Folder Name="/src/Modules/Identity/">`, after the Hosts folder.

- [ ] **Step 2: Write the failing unit tests**

`tests/Airbnb.UnitTests/Airbnb.UnitTests.csproj`: add `<ProjectReference Include="..\..\src\Modules\Identity\Airbnb.Modules.Identity\Airbnb.Modules.Identity.csproj" />`.

`tests/Airbnb.UnitTests/Identity/SessionTokensTests.cs`:

```csharp
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
```

`tests/Airbnb.UnitTests/Identity/EmailsTests.cs`:

```csharp
using Airbnb.Modules.Identity;

namespace Airbnb.UnitTests.Identity;

public sealed class EmailsTests
{
    [Theory]
    [InlineData("ana@example.com", "ana@example.com")]
    [InlineData("  Ana@Example.COM ", "ana@example.com")]
    public void Emails_are_trimmed_and_lower_cased(string input, string expected) =>
        Assert.Equal(expected, Emails.Normalize(input));
}
```

- [ ] **Step 3: Run them to verify they fail**

Run: `dotnet test --project tests/Airbnb.UnitTests --filter-namespace "Airbnb.UnitTests.Identity"`
Expected: build FAIL (types missing).

- [ ] **Step 4: Implement the module types**

`SessionTokens.cs`:

```csharp
using System.Security.Cryptography;
using System.Text;

namespace Airbnb.Modules.Identity;

// Opaque bearer tokens: the caller holds the token, the database only its SHA-256 (spec §1).
internal static class SessionTokens
{
    private const int TokenBytes = 32;

    internal static readonly TimeSpan Lifetime = TimeSpan.FromDays(7);

    internal static string NewToken() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(TokenBytes)).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    internal static string Hash(string token) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}
```

`Emails.cs`:

```csharp
namespace Airbnb.Modules.Identity;

internal static class Emails
{
    // One canonical form for every lookup and insert, so "Ana@Example.com " and "ana@example.com" are one account.
    internal static string Normalize(string email) => email.Trim().ToLowerInvariant();
}
```

`User.cs`:

```csharp
namespace Airbnb.Modules.Identity;

internal sealed class User
{
    public required string Id { get; init; }
    public required string Email { get; init; }
    public required string Name { get; init; }
    public string PasswordHash { get; set; } = string.Empty;
    public required DateTimeOffset CreatedAt { get; init; }
}
```

`Session.cs`:

```csharp
namespace Airbnb.Modules.Identity;

internal sealed class Session
{
    public required string TokenHash { get; init; }
    public required string UserId { get; init; }
    public User User { get; init; } = null!;
    public required DateTimeOffset CreatedAt { get; init; }
    public required DateTimeOffset ExpiresAt { get; init; }
}
```

`Data/IdentityDbContext.cs`:

```csharp
using Airbnb.SharedKernel.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Airbnb.Modules.Identity.Data;

internal sealed class IdentityDbContext(DbContextOptions<IdentityDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Session> Sessions => Set<Session>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(IdentityModule.Schema);

        modelBuilder.Entity<User>(user =>
        {
            user.ToTable("users");
            user.Property(u => u.Id).HasMaxLength(40);
            user.Property(u => u.Email).HasMaxLength(254);
            user.Property(u => u.Name).HasMaxLength(60);
            // The one guard against duplicate accounts, even when two registrations race (spec §1).
            user.HasIndex(u => u.Email).IsUnique();
        });

        modelBuilder.Entity<Session>(session =>
        {
            session.ToTable("sessions");
            session.HasKey(s => s.TokenHash);
            session.Property(s => s.TokenHash).HasMaxLength(64);
            session.Property(s => s.UserId).HasMaxLength(40);
            session.HasOne(s => s.User).WithMany().HasForeignKey(s => s.UserId).OnDelete(DeleteBehavior.Cascade);
            session.HasIndex(s => s.UserId);
        });
    }

    // No seed data: accounts are created by people registering.
    internal static Task SeedAsync(IdentityDbContext db, CancellationToken cancellationToken) => Task.CompletedTask;
}

// Lets `dotnet ef migrations add` build the context without a running host.
internal sealed class IdentityDbContextFactory : IDesignTimeDbContextFactory<IdentityDbContext>
{
    public IdentityDbContext CreateDbContext(string[] args) =>
        new(ModuleDatabase.DesignTimeOptions<IdentityDbContext>(IdentityModule.Schema));
}
```

`IdentityModule.cs`:

```csharp
using Airbnb.Modules.Identity.Data;
using Airbnb.SharedKernel.Persistence;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Airbnb.Modules.Identity;

public static class IdentityModule
{
    internal const string Schema = "identity";

    public static IHostApplicationBuilder AddIdentityModule(this IHostApplicationBuilder builder)
    {
        builder.AddIdentityModuleDatabase();
        // The validation generator only registers request types for AddValidation() calls in this assembly.
        builder.Services.AddValidation();
        return builder;
    }

    public static IHostApplicationBuilder AddIdentityModuleDatabase(this IHostApplicationBuilder builder) =>
        builder.AddModuleDbContext<IdentityDbContext>(Schema, IdentityDbContext.SeedAsync);

    public static IEndpointRouteBuilder MapIdentityEndpoints(this IEndpointRouteBuilder api) => api;
}
```

- [ ] **Step 5: Generate the migration**

Run (from `backend/`): `dotnet tool restore`, then `dotnet ef migrations add InitialIdentity --project src/Modules/Identity/Airbnb.Modules.Identity --startup-project src/Modules/Identity/Airbnb.Modules.Identity --output-dir Data/Migrations`.
Expected: `Data/Migrations/*_InitialIdentity.cs` creates schema `identity`, tables `users` (unique index on `Email`) and `sessions` (FK and cascade to `users`, index on `UserId`).

- [ ] **Step 6: Wire the module everywhere**

- **API:** in `src/Airbnb.Api/Airbnb.Api.csproj`, add a ProjectReference to the Identity module. In `Program.cs`, add `using Airbnb.Modules.Identity;`, then `builder.AddIdentityModule();` after `builder.AddReviewsModule();`, and `api.MapIdentityEndpoints();` after `api.MapReviewsEndpoints();`.
- **Migration service:** in `src/Airbnb.MigrationService/Airbnb.MigrationService.csproj`, add the ProjectReference. In `Program.cs`, add `builder.AddIdentityModuleDatabase();` after the Reviews line.
- **Test fixture:** in `tests/Airbnb.Api.Tests/Infrastructure/InfrastructureFixture.cs`, add `using Airbnb.Modules.Identity;` and `builder.AddIdentityModuleDatabase();` after the Reviews line. The Api.Tests project gets the module transitively through Airbnb.Api; if it doesn't compile, add a direct ProjectReference.
- **Architecture tests:** in `tests/Airbnb.ArchitectureTests/Airbnb.ArchitectureTests.csproj`, add the ProjectReference. In `ModuleRulesTests.cs`, add `using Airbnb.Modules.Identity;` and `["Airbnb.Modules.Identity"] = typeof(IdentityModule),` to `Modules`, keeping the alphabetical order.

- [ ] **Step 7: Run the tests**

Run:
- `dotnet build Airbnb.slnx`
- `dotnet test --project tests/Airbnb.UnitTests`
- `dotnet test --project tests/Airbnb.ArchitectureTests`
- `dotnet test --project tests/Airbnb.Api.Tests` (this proves the migration applies, since the fixture migrates every module)

Expected: all pass, 0 warnings.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add the identity module with users and sessions tables"
```

---

### Task 2: Register, login, logout, me, and the session auth scheme

**Files:**
- Create: `src/Modules/Identity/Airbnb.Modules.Identity/{UserDto.cs, SessionStore.cs, Register.cs, Login.cs, Logout.cs, Me.cs, SessionAuthentication.cs}`
- Modify: `IdentityModule.cs`, `src/Airbnb.Api/Program.cs`
- Test: `tests/Airbnb.Api.Tests/Identity/AuthEndpointTests.cs`, `tests/Airbnb.Api.Tests/Infrastructure/MutableTimeProvider.cs`

**Interfaces:**
- **Consumes:** Task 1's types.
- **Produces:**
  - `SessionAuthentication.Scheme = "Session"`;
  - endpoints that set `ClaimTypes.NameIdentifier` (user id), `ClaimTypes.Name` and `ClaimTypes.Email` on authenticated requests;
  - the JSON `{ user: { id, name, email }, token, expiresAt }`.

- [ ] **Step 1: Write the failing integration tests**

`tests/Airbnb.Api.Tests/Infrastructure/MutableTimeProvider.cs`:

```csharp
namespace Airbnb.Api.Tests.Infrastructure;

// A clock a test can move forward, swapped in for TimeProvider.System.
public sealed class MutableTimeProvider(DateTimeOffset start) : TimeProvider
{
    public DateTimeOffset Now { get; set; } = start;

    public override DateTimeOffset GetUtcNow() => Now;
}
```

`tests/Airbnb.Api.Tests/Identity/AuthEndpointTests.cs`:

```csharp
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

        Assert.Equal([HttpStatusCode.Conflict, HttpStatusCode.Created], responses.Select(r => r.StatusCode).Order().ToArray());
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
```

The Api.Tests project may need `using Npgsql;` to resolve through the Aspire package chain. If it doesn't, add `<PackageReference Include="Npgsql" />` with a matching `PackageVersion`; check `dotnet list package --include-transitive` for the version already in use.

- [ ] **Step 2: Run them to verify they fail**

Run: `dotnet test --project tests/Airbnb.Api.Tests --filter-class "Airbnb.Api.Tests.Identity.AuthEndpointTests"`
Expected: FAIL with 404s.

- [ ] **Step 3: Implement**

`UserDto.cs`:

```csharp
namespace Airbnb.Modules.Identity;

internal sealed record UserDto(string Id, string Name, string Email)
{
    internal static UserDto From(User user) => new(user.Id, user.Name, user.Email);
}

internal sealed record AuthSessionDto(UserDto User, string Token, DateTimeOffset ExpiresAt);
```

`SessionStore.cs`:

```csharp
using Airbnb.Modules.Identity.Data;

namespace Airbnb.Modules.Identity;

internal static class SessionStore
{
    // Starts a session for a saved user and returns what the caller hands to the browser.
    internal static async Task<AuthSessionDto> StartAsync(IdentityDbContext db, User user, TimeProvider time, CancellationToken cancellationToken)
    {
        var token = SessionTokens.NewToken();
        var now = time.GetUtcNow();
        var session = new Session
        {
            TokenHash = SessionTokens.Hash(token),
            UserId = user.Id,
            CreatedAt = now,
            ExpiresAt = now + SessionTokens.Lifetime,
        };
        db.Sessions.Add(session);
        await db.SaveChangesAsync(cancellationToken);
        return new AuthSessionDto(UserDto.From(user), token, session.ExpiresAt);
    }

    // The raw token in an "Authorization: Bearer <token>" header, or null.
    internal static string? BearerToken(Microsoft.AspNetCore.Http.HttpRequest request)
    {
        var header = request.Headers.Authorization.ToString();
        const string prefix = "Bearer ";
        return header.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) && header.Length > prefix.Length
            ? header[prefix.Length..].Trim()
            : null;
    }
}
```

`Register.cs`:

```csharp
using System.ComponentModel.DataAnnotations;
using Airbnb.Modules.Identity.Data;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Airbnb.Modules.Identity;

internal static class Register
{
    internal const string DuplicateEmail = "An account with that email already exists";

    // public for the validation generator; still invisible outside the assembly because the class is internal.
    public sealed record Command(
        [property: Required, StringLength(60, MinimumLength = 1)] string? Name,
        [property: Required, EmailAddress, StringLength(254)] string? Email,
        [property: Required, StringLength(128, MinimumLength = 8)] string? Password);

    internal sealed class Handler(IdentityDbContext db, IPasswordHasher<User> hasher, TimeProvider time)
    {
        // Null when the email is taken.
        public async Task<AuthSessionDto?> HandleAsync(Command command, CancellationToken cancellationToken)
        {
            var email = Emails.Normalize(command.Email!);
            if (await db.Users.AnyAsync(u => u.Email == email, cancellationToken))
            {
                return null;
            }

            var user = new User
            {
                Id = "usr_" + Guid.CreateVersion7().ToString("N"),
                Email = email,
                Name = command.Name!.Trim(),
                CreatedAt = time.GetUtcNow(),
            };
            user.PasswordHash = hasher.HashPassword(user, command.Password!);
            db.Users.Add(user);
            try
            {
                await db.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException exception) when (exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
            {
                // A concurrent registration won the unique index between our check and insert.
                return null;
            }

            return await SessionStore.StartAsync(db, user, time, cancellationToken);
        }
    }

    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapPost("/auth/register", async Task<Results<Created<ApiResponse<AuthSessionDto>>, Conflict<ApiResponse<object>>>> (
            Command command, Handler handler, CancellationToken cancellationToken) =>
            await handler.HandleAsync(command, cancellationToken) is { } session
                ? TypedResults.Created((string?)null, ApiResponse.Ok(session))
                : TypedResults.Conflict(ApiResponse.Fail(DuplicateEmail)));
}
```

`Login.cs`:

```csharp
using System.ComponentModel.DataAnnotations;
using Airbnb.Modules.Identity.Data;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace Airbnb.Modules.Identity;

internal static class Login
{
    internal const string InvalidCredentials = "Email or password is incorrect";

    public sealed record Command(
        [property: Required, StringLength(254)] string? Email,
        [property: Required, StringLength(128)] string? Password);

    internal sealed class Handler(IdentityDbContext db, IPasswordHasher<User> hasher, TimeProvider time)
    {
        // A real hash to verify against when the email is unknown, so both failures take the same time (spec §1).
        private static readonly Lazy<string> DummyHash = new(() =>
            new PasswordHasher<User>().HashPassword(null!, Guid.NewGuid().ToString()));

        // Null when the email or password is wrong.
        public async Task<AuthSessionDto?> HandleAsync(Command command, CancellationToken cancellationToken)
        {
            var email = Emails.Normalize(command.Email!);
            var user = await db.Users.SingleOrDefaultAsync(u => u.Email == email, cancellationToken);
            if (user is null)
            {
                hasher.VerifyHashedPassword(null!, DummyHash.Value, command.Password!);
                return null;
            }

            var result = hasher.VerifyHashedPassword(user, user.PasswordHash, command.Password!);
            if (result == PasswordVerificationResult.Failed)
            {
                return null;
            }
            if (result == PasswordVerificationResult.SuccessRehashNeeded)
            {
                user.PasswordHash = hasher.HashPassword(user, command.Password!);
            }

            return await SessionStore.StartAsync(db, user, time, cancellationToken);
        }
    }

    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapPost("/auth/login", async Task<Results<Ok<ApiResponse<AuthSessionDto>>, UnauthorizedHttpResult, JsonHttpResult<ApiResponse<object>>>> (
            Command command, Handler handler, CancellationToken cancellationToken) =>
            await handler.HandleAsync(command, cancellationToken) is { } session
                ? TypedResults.Ok(ApiResponse.Ok(session))
                : TypedResults.Json(ApiResponse.Fail(InvalidCredentials), statusCode: StatusCodes.Status401Unauthorized));
}
```

Drop `UnauthorizedHttpResult` from the `Results<…>` union if it's unused; it's listed only in case the analyzer needs it.

`Logout.cs`:

```csharp
using Airbnb.Modules.Identity.Data;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace Airbnb.Modules.Identity;

internal static class Logout
{
    // Always 204: logging out of a missing or already-revoked session is still "logged out".
    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapPost("/auth/logout", async (HttpRequest request, IdentityDbContext db, CancellationToken cancellationToken) =>
        {
            if (SessionStore.BearerToken(request) is { } token)
            {
                var hash = SessionTokens.Hash(token);
                await db.Sessions.Where(s => s.TokenHash == hash).ExecuteDeleteAsync(cancellationToken);
            }
            return TypedResults.NoContent();
        });
}
```

`Me.cs`:

```csharp
using System.Security.Claims;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace Airbnb.Modules.Identity;

internal static class Me
{
    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/auth/me", (ClaimsPrincipal principal) => TypedResults.Ok(ApiResponse.Ok(new UserDto(
                principal.FindFirstValue(ClaimTypes.NameIdentifier)!,
                principal.FindFirstValue(ClaimTypes.Name)!,
                principal.FindFirstValue(ClaimTypes.Email)!))))
            .RequireAuthorization();
}
```

`SessionAuthentication.cs`:

```csharp
using System.Security.Claims;
using System.Text.Encodings.Web;
using Airbnb.Modules.Identity.Data;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Airbnb.Modules.Identity;

internal static class SessionAuthentication
{
    internal const string Scheme = "Session";
    internal const string LogInMessage = "Log in to continue";
}

// "Authorization: Bearer <token>" → the session's user, if the session exists and hasn't expired (spec §1).
internal sealed class SessionAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    IdentityDbContext db,
    TimeProvider time) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (SessionStore.BearerToken(Request) is not { } token)
        {
            return AuthenticateResult.NoResult();
        }

        var hash = SessionTokens.Hash(token);
        var session = await db.Sessions.Include(s => s.User).SingleOrDefaultAsync(s => s.TokenHash == hash, Context.RequestAborted);
        if (session is null)
        {
            return AuthenticateResult.NoResult();
        }
        if (session.ExpiresAt <= time.GetUtcNow())
        {
            // ponytail: expired rows are deleted only when presented; add a scheduled purge if the table grows.
            db.Sessions.Remove(session);
            await db.SaveChangesAsync(Context.RequestAborted);
            return AuthenticateResult.NoResult();
        }

        var identity = new ClaimsIdentity(
            [
                new Claim(ClaimTypes.NameIdentifier, session.User.Id),
                new Claim(ClaimTypes.Name, session.User.Name),
                new Claim(ClaimTypes.Email, session.User.Email),
            ],
            SessionAuthentication.Scheme);
        return AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), SessionAuthentication.Scheme));
    }

    // RequireAuthorization() failures get the API's envelope instead of an empty 401.
    protected override async Task HandleChallengeAsync(AuthenticationProperties properties)
    {
        Response.StatusCode = StatusCodes.Status401Unauthorized;
        await Response.WriteAsJsonAsync(ApiResponse.Fail(SessionAuthentication.LogInMessage), Context.RequestAborted);
    }
}
```

**`IdentityModule.cs`**:
- `AddIdentityModule` additionally registers:

  ```csharp
  builder.Services.AddSingleton<IPasswordHasher<User>, PasswordHasher<User>>();
  builder.Services.AddScoped<Register.Handler>();
  builder.Services.AddScoped<Login.Handler>();
  builder.Services
      .AddAuthentication(SessionAuthentication.Scheme)
      .AddScheme<AuthenticationSchemeOptions, SessionAuthenticationHandler>(SessionAuthentication.Scheme, configureOptions: null);
  builder.Services.AddAuthorization();
  ```

  It needs `using Microsoft.AspNetCore.Authentication;` and `using Microsoft.AspNetCore.Identity;`.
- `MapIdentityEndpoints` calls `Register.Map(api); Login.Map(api); Logout.Map(api); Me.Map(api); return api;`.

**`src/Airbnb.Api/Program.cs`**: after `app.UseStatusCodePages();` and before `app.UseRateLimiter();`, add `app.UseAuthentication();` and `app.UseAuthorization();`.

If `ModuleRulesTests.A_module_exports_only_its_module_class` fails because `Register.Command`/`Login.Command` leak, that's not expected: they're nested in internal classes, like `SubmitReview.Command`. Investigate rather than relax the test.

- [ ] **Step 4: Run the tests**

Run:
- `dotnet test --project tests/Airbnb.Api.Tests --filter-class "Airbnb.Api.Tests.Identity.AuthEndpointTests"`
- then the full `dotnet test` (all projects)

Expected: all pass, 0 warnings. The existing tests, including `ErrorEnvelopeTests` and `RateLimitingTests`, must not change behaviour.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add register, login, logout and me endpoints with a session auth scheme"
```

---

### Task 3: Rate limiting per real client through forwarded headers

**Files:**
- Modify: `src/Airbnb.Api/Program.cs`, `src/Airbnb.Api/RateLimiting/ApiRateLimiting.cs` (comment only)
- Test: `tests/Airbnb.Api.Tests/RateLimitingTests.cs` (append)

**Interfaces:**
- **Produces:** `HttpContext.Connection.RemoteIpAddress` is the browser's IP when the request comes from a loopback proxy (the Next server) with `X-Forwarded-For`.

- [ ] **Step 1: Write the failing tests** (append to `RateLimitingTests`)

```csharp
    [Fact]
    public async Task Browsers_behind_the_local_next_server_get_their_own_write_budgets()
    {
        await using var factory = CreateFactory(readsPerMinute: 10, writesPerMinute: 1);

        var first = await PostFromAsync(factory, IPAddress.Loopback, forwardedFor: "203.0.113.7");
        var otherBrowser = await PostFromAsync(factory, IPAddress.Loopback, forwardedFor: "203.0.113.8");
        var firstAgain = await PostFromAsync(factory, IPAddress.Loopback, forwardedFor: "203.0.113.7");

        Assert.Equal(HttpStatusCode.NotFound, first);
        Assert.Equal(HttpStatusCode.NotFound, otherBrowser);
        Assert.Equal(HttpStatusCode.TooManyRequests, firstAgain);
    }

    [Fact]
    public async Task A_forwarded_for_header_from_a_non_local_caller_is_ignored()
    {
        await using var factory = CreateFactory(readsPerMinute: 10, writesPerMinute: 1);
        var stranger = IPAddress.Parse("198.51.100.20");

        var first = await PostFromAsync(factory, stranger, forwardedFor: "203.0.113.7");
        var spoofed = await PostFromAsync(factory, stranger, forwardedFor: "203.0.113.99");

        Assert.Equal(HttpStatusCode.NotFound, first);
        Assert.Equal(HttpStatusCode.TooManyRequests, spoofed);
    }

    private static async Task<HttpStatusCode> PostFromAsync(WebApplicationFactory<Program> factory, IPAddress remote, string forwardedFor)
    {
        var context = await factory.Server.SendAsync(http =>
        {
            http.Connection.RemoteIpAddress = remote;
            http.Request.Method = HttpMethods.Post;
            http.Request.Path = "/api/anything";
            http.Request.Headers["X-Forwarded-For"] = forwardedFor;
        }, Ct);
        return (HttpStatusCode)context.Response.StatusCode;
    }
```

Add `using Microsoft.AspNetCore.Http;` and `using System.Net;` if they're missing.

- [ ] **Step 2: Run them to verify they fail**

Run: `dotnet test --project tests/Airbnb.Api.Tests --filter-class "Airbnb.Api.Tests.RateLimitingTests"`
Expected: the first new test FAILS: the second browser gets 429, because every request shares one bucket.

- [ ] **Step 3: Implement**

In `Program.cs`, before `var app = builder.Build();`:

```csharp
// The browser's IP arrives as X-Forwarded-For from the Next.js server; the defaults trust only loopback proxies,
// which is where Aspire runs Next. Behind other proxies, add them to KnownProxies/KnownNetworks.
builder.Services.Configure<ForwardedHeadersOptions>(options => options.ForwardedHeaders = ForwardedHeaders.XForwardedFor);
```

Make `app.UseForwardedHeaders();` the first middleware after `var app = builder.Build();`, before `UseExceptionHandler`. Add `using Microsoft.AspNetCore.HttpOverrides;`.

In `ApiRateLimiting.cs`, replace the two-line `ponytail:` comment above `var client = …` with:

```csharp
                // The browser's IP: UseForwardedHeaders resolves X-Forwarded-For from the local Next.js server.
```

- [ ] **Step 4: Run the tests**

Run: `dotnet test --project tests/Airbnb.Api.Tests --filter-class "Airbnb.Api.Tests.RateLimitingTests"`, then the full `dotnet test`.
Expected: all pass. If a default `KnownNetworks`/`KnownProxies` change in .NET 10 makes loopback untrusted, add `options.KnownProxies.Add(IPAddress.Loopback); options.KnownProxies.Add(IPAddress.IPv6Loopback);` explicitly and say so in the report.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: rate-limit by the browser's IP forwarded by the next server"
```

---

### Task 4: Frontend groundwork: the data-source switch, `server-only` and `withErrorEnvelope`

**Files:**
- Create: `lib/data-source.ts`, `lib/data-source.test.ts`, `lib/test/empty-module.ts`
- Modify: `package.json` (`server-only`), `vitest.config.ts`, `lib/repositories/index.ts`, `lib/api/request.ts`, every `app/api/**/route.ts`
- Test: `lib/api/request.test.ts` (create or append), `app/api/listings/route.test.ts` (append)

**Interfaces:**
- **Produces:**
  - `dataSource(): { kind: "mock" } | { kind: "api"; baseUrl: string }`;
  - `withErrorEnvelope<A extends unknown[]>(handler: (request: Request, ...rest: A) => Promise<Response>)`, returning the same signature.

- [ ] **Step 1: Write the failing tests**

`lib/data-source.test.ts`:

```ts
// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";
import { dataSource } from "./data-source";

describe("dataSource", () => {
  afterEach(() => vi.unstubAllEnvs());

  test("defaults to mock", () => {
    vi.stubEnv("DATA_SOURCE", "");
    expect(dataSource()).toEqual({ kind: "mock" });
  });

  test("api mode carries the backend base url", () => {
    vi.stubEnv("DATA_SOURCE", "api");
    vi.stubEnv("API_HTTP", "http://localhost:5000");
    expect(dataSource()).toEqual({ kind: "api", baseUrl: "http://localhost:5000" });
  });

  test("api mode without API_HTTP and unknown values throw", () => {
    vi.stubEnv("DATA_SOURCE", "api");
    vi.stubEnv("API_HTTP", "");
    expect(() => dataSource()).toThrow("DATA_SOURCE=api needs API_HTTP");
    vi.stubEnv("DATA_SOURCE", "csv");
    expect(() => dataSource()).toThrow('DATA_SOURCE must be "mock" or "api", got "csv"');
  });
});
```

Append to `lib/api/request.test.ts`, creating it with `// @vitest-environment node` at the top if it doesn't exist:

```ts
import { describe, expect, test, vi } from "vitest";
import { withErrorEnvelope } from "./request";

describe("withErrorEnvelope", () => {
  test("passes a handler's response through", async () => {
    const handler = withErrorEnvelope(async () => Response.json({ success: true }, { status: 201 }));
    const response = await handler(new Request("http://localhost/api/x"));
    expect(response.status).toBe(201);
  });

  test("turns a thrown error into a 500 envelope and logs it", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = withErrorEnvelope(async () => {
      throw new Error("GET /api/listings failed: connect ECONNREFUSED");
    });

    const response = await handler(new Request("http://localhost/api/listings", { method: "GET" }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ success: false, error: "Something went wrong. Try again." });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
```

Append to `app/api/listings/route.test.ts`, following its existing mocking style. If the file doesn't mock `@/lib/repositories`, add a separate `describe` with `vi.doMock` plus a dynamic import, or a new file `app/api/listings/route-errors.test.ts`:

```ts
test("a backend failure returns the 500 envelope instead of a bare 500", async () => {
  // Arrange: getRepositories().listings.findAll rejects once.
  // Act:
  const response = await GET(new Request("http://localhost/api/listings"));
  // Assert:
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ success: false, error: "Something went wrong. Try again." });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run lib/data-source.test.ts lib/api/request.test.ts app/api/listings`
Expected: FAIL (missing modules or exports; an unhandled throw).

- [ ] **Step 3: Implement**

`lib/data-source.ts`:

```ts
export type DataSource = { kind: "mock" } | { kind: "api"; baseUrl: string };

/** The server-only DATA_SOURCE switch (mock by default), shared by the repositories and the auth gateway. Reads the env on every call. */
export function dataSource(): DataSource {
  const source = process.env.DATA_SOURCE || "mock";
  if (source === "mock") return { kind: "mock" };
  if (source !== "api") throw new Error(`DATA_SOURCE must be "mock" or "api", got "${source}"`);
  const baseUrl = process.env.API_HTTP;
  if (!baseUrl) throw new Error("DATA_SOURCE=api needs API_HTTP, the backend base URL (Aspire sets it)");
  return { kind: "api", baseUrl };
}
```

`lib/repositories/index.ts`:
- Add `import "server-only";` as the first line.
- `getRepositories()` becomes:

  ```ts
  export function getRepositories(): AppRepositories {
    const source = dataSource();
    return source.kind === "mock" ? mockRepositories : withHostData(createHttpRepositories(source.baseUrl));
  }
  ```

- Keep its doc comment, pointing at `dataSource()`.
- Keep the existing `lib/repositories/index.test.ts` passing. Its error-message assertions still hold, because the messages are unchanged.

`lib/api/request.ts`, appended:

```ts
/** Route handlers never answer with a bare 500: anything thrown becomes the error envelope (and is logged here). */
export function withErrorEnvelope<A extends unknown[]>(
  handler: (request: Request, ...rest: A) => Promise<Response>,
): (request: Request, ...rest: A) => Promise<Response> {
  return async (request, ...rest) => {
    try {
      return await handler(request, ...rest);
    } catch (error) {
      console.error(`${request.method} ${new URL(request.url).pathname} failed`, error);
      return jsonError("Something went wrong. Try again.", 500);
    }
  };
}
```

**`server-only`:**
- Install it with `npm install server-only`.
- Create `lib/test/empty-module.ts` with `export {};`.
- In `vitest.config.ts`, add `resolve: { alias: { "server-only": fileURLToPath(new URL("./lib/test/empty-module.ts", import.meta.url)) } }`, plus `import { fileURLToPath } from "node:url";`.

**Every route handler.** For each `app/api/**/route.ts` export (`grep -rln "export async function \(GET\|POST\|PUT\|PATCH\|DELETE\)" app/api`), change `export async function GET(request: Request) { … }` to `export const GET = withErrorEnvelope(async (request: Request) => { … });`.
- Keep the second `context` parameter (for example `{ params }`) where a handler has one.
- A handler with no parameters, such as `logout`'s `POST()`, becomes `withErrorEnvelope(async () => …)`. The wrapper's request parameter is then ignored by the inner function. That's fine for TypeScript because the inner function takes fewer parameters.
- Existing route tests call `GET(new Request(…))` and keep working.

- [ ] **Step 4: Run the checks**

Run: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
Expected: all green. The build proves no client bundle imports `getRepositories`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: guard server-only modules and return the error envelope from every route handler"
```

---

### Task 5: The auth gateway: mock and HTTP behind the `/api/auth` routes

**Files:**
- Create: `lib/auth/gateway.ts`, `lib/auth/mock-gateway.ts`, `lib/auth/http-gateway.ts`, `lib/auth/client-ip.ts`
- Modify: `lib/auth/session.ts`, `lib/auth/get-session.ts`, `app/api/auth/{login,register,logout,session}/route.ts`, and every route handler calling `sessionFromRequest` (add `await`): `app/api/bookings/route.ts`, `app/api/host/listings/route.ts`, `app/api/host/listings/[id]/route.ts`, `app/api/host/listings/[id]/status/route.ts`, `app/api/wishlists/route.ts`, `app/api/wishlists/[id]/listings/route.ts`, `app/api/wishlists/saved/[listingId]/route.ts`
- Test: `lib/auth/http-gateway.test.ts`, `lib/auth/mock-gateway.test.ts`, `lib/auth/client-ip.test.ts`, `app/api/auth/auth-routes.test.ts` (append), `lib/auth/get-session.test.ts` and `lib/auth/session.test.ts` (mechanical updates plus new cases)

**Interfaces:**
- **Consumes:** `dataSource()`, `withErrorEnvelope`, `jsonError` (Task 4); `envelopeSchema` (`lib/api-client/schemas.ts`); `User` (`lib/types.ts`).
- **Produces:**

  ```ts
  // lib/auth/gateway.ts
  export interface AuthSession { user: User; token: string; expiresAt: string }
  export type AuthResult = { ok: true; session: AuthSession } | { ok: false; status: number; error: string };
  export interface RequestContext { clientIp?: string }
  export interface AuthGateway {
    register(input: { name: string; email: string; password: string }, context?: RequestContext): Promise<AuthResult>;
    login(input: { email: string; password: string }, context?: RequestContext): Promise<AuthResult>;
    logout(token: string): Promise<void>;
    me(token: string): Promise<User | null>;
  }
  export function getAuthGateway(): AuthGateway;
  ```

  - `sessionCookie(token: string): string`;
  - `sessionFromRequest(request: Request): Promise<User | null>`;
  - `getSession(): Promise<User | null>`, memoised per request with React `cache`;
  - `clientIp(request: Request): string | undefined`.

- [ ] **Step 1: Write the failing tests**

`lib/auth/client-ip.test.ts`:

```ts
// @vitest-environment node
import { expect, test } from "vitest";
import { clientIp } from "./client-ip";

test("the first x-forwarded-for entry is the browser", () => {
  const request = new Request("http://localhost/", { headers: { "x-forwarded-for": " 203.0.113.7 , 10.0.0.1" } });
  expect(clientIp(request)).toBe("203.0.113.7");
});

test("no header means no client ip", () => {
  expect(clientIp(new Request("http://localhost/"))).toBeUndefined();
});
```

`lib/auth/mock-gateway.test.ts`:

```ts
// @vitest-environment node
import { expect, test } from "vitest";
import { mockAuthGateway } from "./mock-gateway";

test("any valid login succeeds and me() reads the token back", async () => {
  const result = await mockAuthGateway.login({ email: " Ana@Example.com ", password: "whatever1" });
  if (!result.ok) throw new Error("expected ok");
  expect(result.session.user).toEqual({ id: "u-ana@example.com", name: "ana", email: "ana@example.com" });
  expect(await mockAuthGateway.me(result.session.token)).toEqual(result.session.user);
});

test("register keeps the given name", async () => {
  const result = await mockAuthGateway.register({ name: "Ana Lima", email: "ana@example.com", password: "whatever1" });
  if (!result.ok) throw new Error("expected ok");
  expect(result.session.user.name).toBe("Ana Lima");
});

test("an unreadable token is logged out", async () => {
  expect(await mockAuthGateway.me("not-base64-json")).toBeNull();
});
```

`lib/auth/http-gateway.test.ts`:

```ts
// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";
import { createHttpAuthGateway } from "./http-gateway";

const base = "http://api.test";
const user = { id: "usr_1", name: "Ana", email: "ana@example.com" };
const session = { user, token: "tok_abc", expiresAt: "2031-01-08T00:00:00Z" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("createHttpAuthGateway", () => {
  afterEach(() => vi.restoreAllMocks());

  test("login posts the credentials and the client ip, and returns the session", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json(200, { success: true, data: session }));

    const result = await createHttpAuthGateway(base).login({ email: "ana@example.com", password: "pw-12345" }, { clientIp: "203.0.113.7" });

    expect(result).toEqual({ ok: true, session });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://api.test/api/auth/login");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ email: "ana@example.com", password: "pw-12345" });
    expect(new Headers(init?.headers).get("x-forwarded-for")).toBe("203.0.113.7");
  });

  test.each([
    [401, "Email or password is incorrect"],
    [409, "An account with that email already exists"],
    [400, "The Password field must be a string or array type with a minimum length of '8'."],
    [429, "Too Many Requests"],
  ])("a %i keeps the backend's status and message", async (status, error) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json(status, { success: false, error }));
    const result = await createHttpAuthGateway(base).register({ name: "Ana", email: "ana@example.com", password: "pw-12345" });
    expect(result).toEqual({ ok: false, status, error });
  });

  test("a 500 or an invalid payload throws", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(500, { success: false, error: "An unexpected error occurred" }))
      .mockResolvedValueOnce(json(200, { success: true, data: { token: 1 } }));
    const gateway = createHttpAuthGateway(base);
    await expect(gateway.login({ email: "a@b.co", password: "pw-12345" })).rejects.toThrow("POST /api/auth/login failed with 500");
    await expect(gateway.login({ email: "a@b.co", password: "pw-12345" })).rejects.toThrow("invalid payload");
  });

  test("me sends the bearer token, returns the user, and null on 401", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(200, { success: true, data: user }))
      .mockResolvedValueOnce(json(401, { success: false, error: "Log in to continue" }));
    const gateway = createHttpAuthGateway(base);

    expect(await gateway.me("tok_abc")).toEqual(user);
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("authorization")).toBe("Bearer tok_abc");
    expect(await gateway.me("tok_gone")).toBeNull();
  });

  test("logout posts the bearer token", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 204 }));
    await createHttpAuthGateway(base).logout("tok_abc");
    expect(String(fetchMock.mock.calls[0][0])).toBe("http://api.test/api/auth/logout");
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("authorization")).toBe("Bearer tok_abc");
  });

  test("a network failure throws with the path", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(createHttpAuthGateway(base).me("tok")).rejects.toThrow("GET /api/auth/me failed: fetch failed");
  });
});
```

Append to `app/api/auth/auth-routes.test.ts`. Read it first and keep its existing mock-mode tests, which must pass unchanged apart from mechanical updates. Then add a `describe("with a stubbed gateway")` that uses `vi.mock("@/lib/auth/gateway", …)` in a separate file, `app/api/auth/auth-routes-gateway.test.ts`, so the existing file keeps the real mock gateway:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";
import { POST as login } from "./login/route";
import { POST as register } from "./register/route";
import { POST as logout } from "./logout/route";
import { GET as session } from "./session/route";
import { jsonRequest } from "@/lib/auth/test-helpers";

const gateway = vi.hoisted(() => ({ register: vi.fn(), login: vi.fn(), logout: vi.fn(), me: vi.fn() }));
vi.mock("@/lib/auth/gateway", () => ({ getAuthGateway: () => gateway }));

const user = { id: "usr_1", name: "Ana", email: "ana@example.com" };
const okSession = { ok: true, session: { user, token: "tok_abc", expiresAt: "2031-01-08T00:00:00Z" } };

describe("auth routes over the gateway", () => {
  beforeEach(() => Object.values(gateway).forEach((fn) => fn.mockReset()));

  test("login sets the cookie to the gateway token and returns the user", async () => {
    gateway.login.mockResolvedValueOnce(okSession);
    const response = await login(jsonRequest("http://localhost/api/auth/login", "POST", { email: "ana@example.com", password: "pw-12345" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: user });
    expect(response.headers.get("set-cookie")).toMatch(/^session=tok_abc; Path=\/; HttpOnly; SameSite=Lax; Max-Age=604800$/);
  });

  test("a refused login keeps the gateway's status and message and sets no cookie", async () => {
    gateway.login.mockResolvedValueOnce({ ok: false, status: 401, error: "Email or password is incorrect" });
    const response = await login(jsonRequest("http://localhost/api/auth/login", "POST", { email: "ana@example.com", password: "pw-12345" }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ success: false, error: "Email or password is incorrect" });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  test("register sends name, email and password only, and answers 201", async () => {
    gateway.register.mockResolvedValueOnce(okSession);
    const response = await register(jsonRequest("http://localhost/api/auth/register", "POST",
      { name: "Ana", email: "ana@example.com", password: "pw-12345", confirmPassword: "pw-12345" }));
    expect(response.status).toBe(201);
    expect(gateway.register.mock.calls[0][0]).toEqual({ name: "Ana", email: "ana@example.com", password: "pw-12345" });
  });

  test("logout revokes the cookie's token and clears the cookie", async () => {
    gateway.logout.mockResolvedValueOnce(undefined);
    const response = await logout(jsonRequest("http://localhost/api/auth/logout", "POST", undefined, "session=tok_abc"));
    expect(gateway.logout).toHaveBeenCalledWith("tok_abc");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  test("logout still clears the cookie when the backend is down", async () => {
    gateway.logout.mockRejectedValueOnce(new Error("GET /api/auth/logout failed: fetch failed"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await logout(jsonRequest("http://localhost/api/auth/logout", "POST", undefined, "session=tok_abc"));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  test("session reads the user through the gateway, and a backend outage reads as logged out", async () => {
    gateway.me.mockResolvedValueOnce(user).mockRejectedValueOnce(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const request = () => new Request("http://localhost/api/auth/session", { headers: { cookie: "session=tok_abc" } });
    expect(await (await session(request())).json()).toEqual({ success: true, data: user });
    expect(await (await session(request())).json()).toEqual({ success: true, data: null });
  });
});
```

`lib/auth/get-session.test.ts` and `lib/auth/session.test.ts`:
- Update the mechanical calls: `sessionCookie(user)` becomes `sessionCookie(encodeSession(user))`, and `sessionFromRequest` is now awaited.
- Add a test to `get-session.test.ts`: when the gateway's `me` rejects, `getSession()` resolves to `null` and logs the error. Use `vi.mock("@/lib/auth/gateway")` there.
- Read the files first and keep every existing assertion.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run lib/auth app/api/auth`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement**

`lib/auth/client-ip.ts`:

```ts
/** The browser's IP from the incoming request (the first x-forwarded-for entry), to forward to the backend's rate limiter. */
export function clientIp(request: Request): string | undefined {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
}
```

`lib/auth/gateway.ts`:

```ts
import "server-only";
import { dataSource } from "@/lib/data-source";
import type { User } from "@/lib/types";
import { createHttpAuthGateway } from "./http-gateway";
import { mockAuthGateway } from "./mock-gateway";

export interface AuthSession { user: User; token: string; expiresAt: string }
export type AuthResult = { ok: true; session: AuthSession } | { ok: false; status: number; error: string };
export interface RequestContext { clientIp?: string }

export interface AuthGateway {
  register(input: { name: string; email: string; password: string }, context?: RequestContext): Promise<AuthResult>;
  login(input: { email: string; password: string }, context?: RequestContext): Promise<AuthResult>;
  /** Revokes the session; never fails for an unknown token. */
  logout(token: string): Promise<void>;
  /** The token's user, or null when the session is unknown or expired. */
  me(token: string): Promise<User | null>;
}

/** Mock accounts in DATA_SOURCE=mock, the backend's Identity module in api mode (spec §2). */
export function getAuthGateway(): AuthGateway {
  const source = dataSource();
  return source.kind === "mock" ? mockAuthGateway : createHttpAuthGateway(source.baseUrl);
}
```

`lib/auth/mock-gateway.ts`:

```ts
import type { AuthGateway } from "./gateway";
import { decodeSession, encodeSession, userFromCredentials } from "./session";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const session = (user: ReturnType<typeof userFromCredentials>) => ({
  ok: true as const,
  session: { user, token: encodeSession(user), expiresAt: new Date(Date.now() + SEVEN_DAYS_MS).toISOString() },
});

// Dev/test only: any valid input logs in and the token is the readable user (spec §2, "Mock mode security").
export const mockAuthGateway: AuthGateway = {
  async register({ name, email }) {
    return session(userFromCredentials(email, name));
  },
  async login({ email }) {
    return session(userFromCredentials(email));
  },
  async logout() {},
  async me(token) {
    return decodeSession(token);
  },
};
```

`gateway.ts` and `mock-gateway.ts` import each other (one for the type, one for the value). That's fine because the `AuthGateway` import in `mock-gateway.ts` is type-only: use `import type`.

`lib/auth/http-gateway.ts`:

```ts
import { z } from "zod";
import { envelopeSchema } from "@/lib/api-client/schemas";
import type { User } from "@/lib/types";
import type { AuthGateway, AuthResult, RequestContext } from "./gateway";

const REQUEST_TIMEOUT_MS = 5_000;
// Statuses the backend answers with a message meant for the person signing in.
const USER_FACING_STATUSES = new Set([400, 401, 409, 429]);

const userSchema = z.object({ id: z.string().min(1), name: z.string().min(1), email: z.email() });
const sessionSchema = z.object({ user: userSchema, token: z.string().min(1), expiresAt: z.string().min(1) });

function headers(context?: RequestContext, token?: string): HeadersInit {
  const result: Record<string, string> = { "content-type": "application/json" };
  if (context?.clientIp) result["x-forwarded-for"] = context.clientIp;
  if (token) result.authorization = `Bearer ${token}`;
  return result;
}

async function send(baseUrl: string, method: string, path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(new URL(path, baseUrl), { ...init, method, cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`${method} ${path} failed: ${reason}`, { cause });
  }
}

async function authenticate(baseUrl: string, path: string, body: object, context?: RequestContext): Promise<AuthResult> {
  const response = await send(baseUrl, "POST", path, { headers: headers(context), body: JSON.stringify(body) });
  const payload: unknown = await response.json().catch(() => undefined);
  if (response.ok) {
    const parsed = envelopeSchema(sessionSchema).safeParse(payload);
    if (!parsed.success || !parsed.data.data) throw new Error(`POST ${path} returned an invalid payload`);
    return { ok: true, session: parsed.data.data };
  }
  if (USER_FACING_STATUSES.has(response.status)) {
    const parsed = envelopeSchema(z.unknown()).safeParse(payload);
    const error = parsed.success && parsed.data.error ? parsed.data.error : "Something went wrong. Try again.";
    return { ok: false, status: response.status, error };
  }
  throw new Error(`POST ${path} failed with ${response.status}`);
}

/** The backend's Identity module (spec §2): sessions are opaque tokens the backend can revoke. */
export function createHttpAuthGateway(baseUrl: string): AuthGateway {
  return {
    register: (input, context) => authenticate(baseUrl, "/api/auth/register", input, context),
    login: (input, context) => authenticate(baseUrl, "/api/auth/login", input, context),
    async logout(token) {
      const response = await send(baseUrl, "POST", "/api/auth/logout", { headers: headers(undefined, token) });
      await response.body?.cancel();
    },
    async me(token): Promise<User | null> {
      const response = await send(baseUrl, "GET", "/api/auth/me", { headers: headers(undefined, token) });
      if (response.status === 401) {
        await response.body?.cancel();
        return null;
      }
      const parsed = envelopeSchema(userSchema).safeParse(await response.json().catch(() => undefined));
      if (!response.ok || !parsed.success || !parsed.data.data) throw new Error(`GET /api/auth/me failed with ${response.status}`);
      return parsed.data.data;
    },
  };
}
```

`lib/auth/session.ts`:
- Keep `SESSION_COOKIE`, the max age, `userFromCredentials`, `encodeSession`, `decodeSession` and `clearedSessionCookie`. Change the comment above `encodeSession` to say it's the mock gateway's token format.
- Add `cookieValue`.
- Replace `sessionCookie` and `sessionFromRequest` with:

  ```ts
  export function sessionCookie(token: string): string {
    return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
  }

  /** The session token in a request's cookie header, if any. */
  export function cookieValue(request: Request): string | undefined {
    const entry = (request.headers.get("cookie") ?? "")
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
    return entry?.slice(SESSION_COOKIE.length + 1) || undefined;
  }

  /** The session of a route handler's request; a backend outage reads as logged out (plan ruling). */
  export async function sessionFromRequest(request: Request): Promise<User | null> {
    const token = cookieValue(request);
    return token ? userForToken(token) : null;
  }

  /** The user for a session token through the auth gateway; null when unknown, expired or unreachable. */
  export async function userForToken(token: string): Promise<User | null> {
    try {
      return await getAuthGateway().me(token);
    } catch (error) {
      console.error("Reading the session failed", error);
      return null;
    }
  }
  ```

  It needs `import { getAuthGateway } from "./gateway";`.
- `session.ts` and `mock-gateway.ts` import each other's values (the encode/decode helpers and `getAuthGateway`). ES modules allow that cycle because neither runs at module load. If the bundler or tests complain, move `userFromCredentials`/`encodeSession`/`decodeSession` into `lib/auth/mock-session.ts` and re-export them from `session.ts`.

`lib/auth/get-session.ts`:

```ts
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@/lib/types";
import { SESSION_COOKIE, userForToken } from "./session";
import { loginPath } from "./next-path";

/** The logged-in user for a server component, or null; one gateway call per request. */
export const getSession = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? userForToken(token) : null;
});
```

`requireSession` is unchanged.

**Routes:**
- `login/route.ts`:

  ```ts
  export const POST = withErrorEnvelope(async (request: Request) => {
    const body = await parseBody(request, loginSchema);
    if ("error" in body) return body.error;
    const result = await getAuthGateway().login(body.data, { clientIp: clientIp(request) });
    if (!result.ok) return jsonError(result.error, result.status);
    return Response.json(ok(result.session.user), { headers: { "Set-Cookie": sessionCookie(result.session.token) } });
  });
  ```

- `register/route.ts`: the same, with `getAuthGateway().register({ name: body.data.name, email: body.data.email, password: body.data.password }, …)` and `status: 201`.
- `logout/route.ts`:

  ```ts
  export const POST = withErrorEnvelope(async (request: Request) => {
    const token = cookieValue(request);
    if (token) {
      try {
        await getAuthGateway().logout(token);
      } catch (error) {
        // The cookie is cleared regardless: a backend outage must not keep someone logged in here.
        console.error("Revoking the session failed", error);
      }
    }
    return Response.json(ok(null), { headers: { "Set-Cookie": clearedSessionCookie() } });
  });
  ```

- `session/route.ts`: `Response.json(ok(await sessionFromRequest(request)))`, still wrapped.
- Every other route handler: `const user = sessionFromRequest(request)` becomes `const user = await sessionFromRequest(request)`.
- `lib/auth/test-helpers.ts` is unchanged: the mock gateway's token is the encoded user, so `sessionCookieHeader()` still produces a valid mock session.

- [ ] **Step 4: Run the checks**

Run: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run e2e` (mock mode; the auth flows must still pass).
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: authenticate through the backend identity module in api mode"
```

---

### Task 6: Docs and full verification

**Files:**
- Modify (repo root): `CLAUDE.md`, `docs/superpowers/specs/2026-09-26-backend-modular-monolith-design.md`

- [ ] **Step 1: Update `CLAUDE.md`**

- **Repository Layout:** list `Identity` among the modules.
- **Backend Conventions**, new bullets:
  - "Identity: `users` + `sessions` in the `identity` schema; passwords hashed by `PasswordHasher<T>`; opaque bearer tokens stored as SHA-256; the `Session` auth scheme sets `ClaimTypes.NameIdentifier` = user id — protect an endpoint with `.RequireAuthorization()`."
  - "`UseForwardedHeaders` trusts loopback proxies only (the Next server in Aspire); the rate limiter partitions by the forwarded browser IP. Behind another proxy, configure `KnownProxies`/`KnownNetworks`."
- **Data Layer**, frontend notes:
  - "`lib/data-source.ts` (`dataSource()`) is the one `DATA_SOURCE` parser."
  - "Auth goes through `getAuthGateway()` (`lib/auth/gateway.ts`): mock accounts in mock mode, the backend Identity module in api mode; the `session` cookie holds the gateway's token."
  - "Every `app/api/**/route.ts` export is wrapped in `withErrorEnvelope` (`lib/api/request.ts`)."
  - "`lib/repositories/index.ts` and `lib/auth/gateway.ts` import `server-only` (aliased to an empty module in Vitest)."
- **Existing Auth bullet:** say that mock auth applies in mock mode only.

- [ ] **Step 2: Link the spec**

In the backend design spec, add a final line under its phases or status section:

"Phase 5 (identity): see `2026-10-07-backend-identity-design.md`."

- [ ] **Step 3: Full verification**

Backend, from `backend/`: `dotnet build Airbnb.slnx` (0 warnings), then `dotnet test` (all projects). The `Airbnb.AppHost.Tests` smoke test needs Docker and port 3000 free. If that environment can't run it, report that rather than skipping it silently.

Frontend, from `frontend/`: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run e2e`.

Report every result. If something flakes, rerun it once and report both runs.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: document the identity module, auth gateway and route error envelope"
```
