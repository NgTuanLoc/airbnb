# Backend Phase 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend's foundation so that `aspire start` brings up Postgres, Redis, RabbitMQ, a migration worker and a healthy API (with no modules yet). The foundation is shared build settings, Aspire service defaults, the API host's cross-cutting behavior (error envelope, rate limits, OpenAPI), the migration worker, the AppHost, and the unit, architecture and integration test projects.

**Architecture:** One ASP.NET Core host, `Airbnb.Api`, which later phases fill with modules. A single `IProblemDetailsWriter` reshapes every error the host produces into the frontend's `{ success, error }` envelope. An Aspire 13.5 AppHost orchestrates Postgres (database `airbnb`), Redis, RabbitMQ, the migration worker (it runs every `IModuleMigrator`, then exits) and the API, which starts only after the worker completes. Tests use xUnit v3 on Microsoft Testing Platform: unit tests, architecture tests (NetArchTest), and integration tests (`WebApplicationFactory` against one Testcontainers Postgres per test run).

**Tech Stack:** .NET 10 (SDK 10.0.4xx), Aspire 13.5.4, Aspire.Npgsql 13.5.4, Microsoft.AspNetCore.OpenApi 10.0.12, Scalar.AspNetCore 2.17.10, xunit.v3 4.0.1, Testcontainers.PostgreSql 4.15.0, NetArchTest.eNhancedEdition 1.4.5.

**Spec:** `docs/superpowers/specs/2026-09-26-backend-modular-monolith-design.md`. This plan covers phase 1 of its section 9.

Before this plan was written, a throwaway spike against the real SDK, packages and Docker checked the code paths below:

- **Unit tests:** ran verbatim (namespaces renamed) and matched the expected counts.
- **Envelope bodies:** confirmed for 400, 404, 500 and 429, including for `Accept: text/html`.
- **Health checks:** confirmed with Postgres up and down.
- **OpenAPI and Scalar:** both served.
- **xUnit 4 on Microsoft Testing Platform:** runs, including the `xUnit1051` build error Task 1 expects.
- **Testcontainers:** works.
- **Aspire orchestration:** `aspire start` / `wait` / `describe` / `stop` all work.
- **Coverage:** the report command in Task 8 works.

## Global Constraints

- Run every backend command from `backend/`. Run Aspire CLI commands from PowerShell: the CLI is `aspire.cmd`, which Git Bash cannot resolve.
- Docker Desktop must be running for integration tests and for Aspire.
- `backend/Directory.Build.props` sets `net10.0`, nullable, implicit usings and **warnings as errors** once. Project files must not repeat these.
- Every package version lives in `backend/Directory.Packages.props`. `<PackageReference>` elements never carry `Version`.
- Tests run on Microsoft Testing Platform, enabled by `"test": { "runner": "Microsoft.Testing.Platform" }` in `backend/global.json`. xUnit analyzer warnings are errors, so every test passes `TestContext.Current.CancellationToken` to calls that accept a token.
- Every response body is the envelope `{ success, data?, error?, meta? }`, camelCase, with null members omitted. Errors are `{ "success": false, "error": "<message>" }`, and the message for any 5xx is exactly `An unexpected error occurred.`
- Rate limits apply only to `/api` paths, per client IP, over a fixed 1-minute window: GET/HEAD 600 per minute, all other methods 10 per minute.
- `/health` and `/alive` (from ServiceDefaults), `/openapi/v1.json` and `/scalar` exist only in the Development environment.
- Aspire resource names are `postgres` (database `airbnb`), `redis`, `rabbitmq`, `migrations` and `api`. Containers are persistent. `AspireUseCliBundle` stays off.
- Commit messages use conventional commits and end with the line `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

- **Postgres unreachable** (Docker stopped, wrong connection string): `/health` must answer 503 `Unhealthy` within seconds, not hang or crash. Tested in Task 2.
- **Unknown `/api` path from a browser (`Accept: text/html`) or curl (`*/*`):** the response must still be the JSON envelope, never an HTML or plain-text error page. Tested in Task 3.
- **Several invalid fields in one request:** one 400 whose message names every field, in order. Tested in Task 3.
- **Separate budgets:** a burst of reads must not use up the write budget or the reverse, and health probes are never throttled. Tested in Task 4.
- **A migrator that throws:** the worker exits non-zero without running later migrators and still stops the host, so Aspire never starts the API on a half-migrated database. Tested in Task 6.

---

## File Structure

```text
backend/
├── global.json                    MODIFY  Microsoft Testing Platform runner (Task 1)
├── Directory.Build.props          CREATE  shared TFM, nullable, warnings as errors (Task 1)
├── Directory.Packages.props       CREATE  every package version (Task 1)
├── aspire.config.json             CREATE  tells the Aspire CLI where the AppHost is (Task 8)
├── Airbnb.slnx                    MODIFY  new projects (Tasks 2, 3, 6, 7, 8)
├── src/
│   ├── Airbnb.AppHost/            CREATE  Aspire orchestration (Task 8)
│   │   ├── Airbnb.AppHost.csproj
│   │   ├── AppHost.cs
│   │   ├── appsettings.json
│   │   └── Properties/launchSettings.json
│   ├── Airbnb.ServiceDefaults/    CREATE  Aspire template, verbatim (Task 2)
│   │   ├── Airbnb.ServiceDefaults.csproj
│   │   └── Extensions.cs
│   ├── Airbnb.SharedKernel/       CREATE
│   │   ├── Airbnb.SharedKernel.csproj
│   │   ├── ApiResponse.cs         envelope record, PageMeta, Ok/Fail (Task 3)
│   │   └── IModuleMigrator.cs     implemented by each module's persistence (Task 6)
│   ├── Airbnb.MigrationService/   CREATE  worker (Task 6)
│   │   ├── Airbnb.MigrationService.csproj
│   │   ├── Program.cs
│   │   └── MigrationWorker.cs
│   └── Airbnb.Api/
│       ├── Airbnb.Api.csproj                        MODIFY (Tasks 1, 2, 3, 5)
│       ├── Program.cs                               MODIFY (Tasks 2–5)
│       ├── Errors/EnvelopeProblemDetailsWriter.cs   CREATE (Task 3)
│       └── RateLimiting/ApiRateLimiting.cs          CREATE (Task 4)
└── tests/
    ├── Airbnb.Api.Tests/          MODIFY  integration suite
    │   ├── Airbnb.Api.Tests.csproj                  (Tasks 1, 2)
    │   ├── Infrastructure/PostgresFixture.cs        CREATE (Task 2)
    │   ├── Infrastructure/ApiFactory.cs             CREATE (Task 2)
    │   ├── HealthEndpointTests.cs                   MODIFY (Tasks 1, 2)
    │   ├── ErrorEnvelopeTests.cs                    CREATE (Task 3)
    │   ├── RateLimitingTests.cs                     CREATE (Task 4)
    │   └── ApiDocsTests.cs                          CREATE (Task 5)
    ├── Airbnb.UnitTests/          CREATE  (Tasks 3, 6)
    │   ├── Airbnb.UnitTests.csproj
    │   ├── SharedKernel/ApiResponseTests.cs
    │   ├── Api/EnvelopeProblemDetailsWriterTests.cs
    │   └── MigrationService/MigrationWorkerTests.cs
    └── Airbnb.ArchitectureTests/  CREATE  (Task 7)
        ├── Airbnb.ArchitectureTests.csproj
        └── SharedKernelRulesTests.cs
.github/workflows/ci.yml           MODIFY  latest .NET 10 SDK (Task 1)
README.md, CLAUDE.md               MODIFY  (Task 8)
```

---

### Task 1: Shared build settings, central package versions, xUnit v3 on Microsoft Testing Platform

**Files:**
- Modify: `backend/global.json`
- Create: `backend/Directory.Build.props`
- Create: `backend/Directory.Packages.props`
- Modify: `backend/src/Airbnb.Api/Airbnb.Api.csproj`
- Modify: `backend/tests/Airbnb.Api.Tests/Airbnb.Api.Tests.csproj`
- Modify: `backend/tests/Airbnb.Api.Tests/HealthEndpointTests.cs`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: the existing skeleton (`GET /health` returning `{"status":"ok"}`).
- Produces: every phase 1 package version in `Directory.Packages.props`. Later tasks add `<PackageReference Include="…" />` with no version. It also switches tests to the Microsoft Testing Platform runner and makes warnings errors in every project.

- [ ] **Step 1: Enable the Microsoft Testing Platform runner**

Replace `backend/global.json` with:

```json
{
  "sdk": {
    "version": "10.0.100",
    "rollForward": "latestFeature"
  },
  "test": {
    "runner": "Microsoft.Testing.Platform"
  }
}
```

- [ ] **Step 2: Create `backend/Directory.Build.props`**

```xml
<Project>
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
  </PropertyGroup>
</Project>
```

- [ ] **Step 3: Create `backend/Directory.Packages.props`**

```xml
<Project>
  <PropertyGroup>
    <ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>
  </PropertyGroup>

  <ItemGroup Label="Aspire hosting">
    <PackageVersion Include="Aspire.Hosting.PostgreSQL" Version="13.5.4" />
    <PackageVersion Include="Aspire.Hosting.RabbitMQ" Version="13.5.4" />
    <PackageVersion Include="Aspire.Hosting.Redis" Version="13.5.4" />
  </ItemGroup>

  <ItemGroup Label="Service defaults">
    <PackageVersion Include="Microsoft.Extensions.Http.Resilience" Version="10.8.0" />
    <PackageVersion Include="Microsoft.Extensions.ServiceDiscovery" Version="10.8.0" />
    <PackageVersion Include="OpenTelemetry.Exporter.OpenTelemetryProtocol" Version="1.15.3" />
    <PackageVersion Include="OpenTelemetry.Extensions.Hosting" Version="1.15.3" />
    <PackageVersion Include="OpenTelemetry.Instrumentation.AspNetCore" Version="1.15.2" />
    <PackageVersion Include="OpenTelemetry.Instrumentation.Http" Version="1.15.1" />
    <PackageVersion Include="OpenTelemetry.Instrumentation.Runtime" Version="1.15.1" />
  </ItemGroup>

  <ItemGroup Label="API">
    <PackageVersion Include="Aspire.Npgsql" Version="13.5.4" />
    <PackageVersion Include="Microsoft.AspNetCore.OpenApi" Version="10.0.12" />
    <PackageVersion Include="Scalar.AspNetCore" Version="2.17.10" />
  </ItemGroup>

  <ItemGroup Label="Tests">
    <PackageVersion Include="Microsoft.AspNetCore.Mvc.Testing" Version="10.0.12" />
    <PackageVersion Include="Microsoft.Testing.Extensions.CodeCoverage" Version="18.11.2" />
    <PackageVersion Include="NetArchTest.eNhancedEdition" Version="1.4.5" />
    <PackageVersion Include="Testcontainers.PostgreSql" Version="4.15.0" />
    <PackageVersion Include="xunit.v3" Version="4.0.1" />
  </ItemGroup>
</Project>
```

- [ ] **Step 4: Strip the API project file down to what `Directory.Build.props` doesn't cover**

Replace `backend/src/Airbnb.Api/Airbnb.Api.csproj` with:

```xml
<Project Sdk="Microsoft.NET.Sdk.Web">

</Project>
```

- [ ] **Step 5: Move the integration test project to xUnit v3**

Replace `backend/tests/Airbnb.Api.Tests/Airbnb.Api.Tests.csproj` with the following. The VSTest packages (`Microsoft.NET.Test.Sdk`, `xunit.runner.visualstudio`, `coverlet.collector`) go away; Microsoft Testing Platform replaces them.

```xml
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <IsPackable>false</IsPackable>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.AspNetCore.Mvc.Testing" />
    <PackageReference Include="Microsoft.Testing.Extensions.CodeCoverage" />
    <PackageReference Include="xunit.v3" />
  </ItemGroup>

  <ItemGroup>
    <Using Include="Xunit" />
  </ItemGroup>

  <ItemGroup>
    <ProjectReference Include="..\..\src\Airbnb.Api\Airbnb.Api.csproj" />
  </ItemGroup>

</Project>
```

- [ ] **Step 6: Build and watch the xUnit analyzer fail the build**

Run: `dotnet build`
Expected: FAIL with `error xUnit1051` in `HealthEndpointTests.cs`. With warnings as errors, xUnit v3's analyzer requires `TestContext.Current.CancellationToken` on calls that accept a token.

- [ ] **Step 7: Pass the test cancellation token**

Replace `backend/tests/Airbnb.Api.Tests/HealthEndpointTests.cs` with:

```csharp
using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Airbnb.Api.Tests;

public class HealthEndpointTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    private sealed record HealthResponse(string Status);

    [Fact]
    public async Task Get_health_returns_ok_status()
    {
        var client = factory.CreateClient();

        var response = await client.GetAsync("/health", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<HealthResponse>(TestContext.Current.CancellationToken);
        Assert.Equal("ok", body?.Status);
    }
}
```

- [ ] **Step 8: Build and test**

Run: `dotnet build`
Expected: `Build succeeded.` with `0 Warning(s)` and `0 Error(s)`.

Run: `dotnet test`
Expected: the summary reports `total: 1`, `failed: 0`, `succeeded: 1`.

- [ ] **Step 9: Install the latest .NET 10 SDK in CI**

In `.github/workflows/ci.yml`, replace the backend job's setup step:

```yaml
      - uses: actions/setup-dotnet@v4
        with:
          global-json-file: backend/global.json
```

with:

```yaml
      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: 10.0.x
```

`global.json` still pins the major version and the test runner. `latestFeature` then resolves to the newest 10.0 SDK, matching local development.

- [ ] **Step 10: Commit**

```bash
git add backend/global.json backend/Directory.Build.props backend/Directory.Packages.props backend/src/Airbnb.Api/Airbnb.Api.csproj backend/tests/Airbnb.Api.Tests .github/workflows/ci.yml
git commit -m "build: central package versions and xUnit v3 on Microsoft Testing Platform" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: ServiceDefaults, Postgres-backed health checks, integration test fixture

**Files:**
- Create: `backend/src/Airbnb.ServiceDefaults/Airbnb.ServiceDefaults.csproj`
- Create: `backend/src/Airbnb.ServiceDefaults/Extensions.cs`
- Modify: `backend/src/Airbnb.Api/Airbnb.Api.csproj`
- Modify: `backend/src/Airbnb.Api/Program.cs`
- Modify: `backend/tests/Airbnb.Api.Tests/Airbnb.Api.Tests.csproj`
- Create: `backend/tests/Airbnb.Api.Tests/Infrastructure/PostgresFixture.cs`
- Create: `backend/tests/Airbnb.Api.Tests/Infrastructure/ApiFactory.cs`
- Modify: `backend/tests/Airbnb.Api.Tests/HealthEndpointTests.cs`
- Modify: `backend/Airbnb.slnx`

**Interfaces:**
- Consumes: Task 1's package versions.
- Produces:
  - `builder.AddServiceDefaults()` and `app.MapDefaultEndpoints()`, both in namespace `Microsoft.Extensions.Hosting`.
  - The API now requires configuration `ConnectionStrings:airbnb`.
  - `Airbnb.Api.Tests.Infrastructure.PostgresFixture`: an xUnit assembly fixture exposing `string ConnectionString`.
  - `Airbnb.Api.Tests.Infrastructure.ApiFactory(string connectionString) : WebApplicationFactory<Program>`.

- [ ] **Step 1: Add Testcontainers to the integration project**

In `backend/tests/Airbnb.Api.Tests/Airbnb.Api.Tests.csproj`, replace the package `ItemGroup` with:

```xml
  <ItemGroup>
    <PackageReference Include="Microsoft.AspNetCore.Mvc.Testing" />
    <PackageReference Include="Microsoft.Testing.Extensions.CodeCoverage" />
    <PackageReference Include="Testcontainers.PostgreSql" />
    <PackageReference Include="xunit.v3" />
  </ItemGroup>
```

- [ ] **Step 2: Create the Postgres assembly fixture**

Create `backend/tests/Airbnb.Api.Tests/Infrastructure/PostgresFixture.cs`:

```csharp
using Airbnb.Api.Tests.Infrastructure;
using Testcontainers.PostgreSql;

[assembly: AssemblyFixture(typeof(PostgresFixture))]

namespace Airbnb.Api.Tests.Infrastructure;

// One Postgres container for the whole test run. xUnit injects it into any test class constructor that asks for it.
public sealed class PostgresFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder("postgres:18.3").Build();

    public string ConnectionString => _container.GetConnectionString();

    public ValueTask InitializeAsync() => new(_container.StartAsync());

    public ValueTask DisposeAsync() => _container.DisposeAsync();
}
```

- [ ] **Step 3: Create the API factory**

Create `backend/tests/Airbnb.Api.Tests/Infrastructure/ApiFactory.cs`:

```csharp
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Airbnb.Api.Tests.Infrastructure;

public sealed class ApiFactory(string connectionString) : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder) =>
        builder.UseSetting("ConnectionStrings:airbnb", connectionString);
}
```

- [ ] **Step 4: Write the failing health tests**

Replace `backend/tests/Airbnb.Api.Tests/HealthEndpointTests.cs` with:

```csharp
using System.Net;
using Airbnb.Api.Tests.Infrastructure;

namespace Airbnb.Api.Tests;

public sealed class HealthEndpointTests(PostgresFixture postgres)
{
    // Port 1 refuses connections immediately; Timeout=2 bounds the check if anything hangs.
    private const string UnreachableDatabase = "Host=127.0.0.1;Port=1;Username=u;Password=p;Database=airbnb;Timeout=2";

    [Fact]
    public async Task Health_is_healthy_when_postgres_is_reachable()
    {
        var (status, body) = await GetAsync(postgres.ConnectionString, "/health");

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal("Healthy", body);
    }

    [Fact]
    public async Task Health_is_unhealthy_when_postgres_is_unreachable()
    {
        var (status, body) = await GetAsync(UnreachableDatabase, "/health");

        Assert.Equal(HttpStatusCode.ServiceUnavailable, status);
        Assert.Equal("Unhealthy", body);
    }

    [Fact]
    public async Task Alive_ignores_dependencies()
    {
        var (status, body) = await GetAsync(UnreachableDatabase, "/alive");

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal("Healthy", body);
    }

    private static async Task<(HttpStatusCode Status, string Body)> GetAsync(string connectionString, string path)
    {
        await using var factory = new ApiFactory(connectionString);
        using var client = factory.CreateClient();

        using var response = await client.GetAsync(path, TestContext.Current.CancellationToken);

        return (response.StatusCode, await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
    }
}
```

- [ ] **Step 5: Run the tests to verify they fail**

Run (Docker must be running): `dotnet test --project tests/Airbnb.Api.Tests`
Expected: FAIL, `failed: 3`. The old endpoint returns `{"status":"ok"}` instead of `Healthy`, ignores the database (so the unreachable case gets 200), and `/alive` returns 404.

- [ ] **Step 6: Create the ServiceDefaults project**

Create `backend/src/Airbnb.ServiceDefaults/Airbnb.ServiceDefaults.csproj`. This is the Aspire 13.5.4 template, with versions moved to `Directory.Packages.props`:

```xml
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <IsAspireSharedProject>true</IsAspireSharedProject>
  </PropertyGroup>

  <ItemGroup>
    <FrameworkReference Include="Microsoft.AspNetCore.App" />

    <PackageReference Include="Microsoft.Extensions.Http.Resilience" />
    <PackageReference Include="Microsoft.Extensions.ServiceDiscovery" />
    <PackageReference Include="OpenTelemetry.Exporter.OpenTelemetryProtocol" />
    <PackageReference Include="OpenTelemetry.Extensions.Hosting" />
    <PackageReference Include="OpenTelemetry.Instrumentation.AspNetCore" />
    <PackageReference Include="OpenTelemetry.Instrumentation.Http" />
    <PackageReference Include="OpenTelemetry.Instrumentation.Runtime" />
  </ItemGroup>

</Project>
```

Create `backend/src/Airbnb.ServiceDefaults/Extensions.cs`. This is the Aspire 13.5.4 template verbatim:

```csharp
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.ServiceDiscovery;
using OpenTelemetry;
using OpenTelemetry.Metrics;
using OpenTelemetry.Trace;

namespace Microsoft.Extensions.Hosting;

// Adds common Aspire services: service discovery, resilience, health checks, and OpenTelemetry.
// This project should be referenced by each service project in your solution.
// To learn more about using this project, see https://aka.ms/aspire/service-defaults
public static class Extensions
{
    private const string HealthEndpointPath = "/health";
    private const string AlivenessEndpointPath = "/alive";

    public static TBuilder AddServiceDefaults<TBuilder>(this TBuilder builder) where TBuilder : IHostApplicationBuilder
    {
        builder.ConfigureOpenTelemetry();

        builder.AddDefaultHealthChecks();

        builder.Services.AddServiceDiscovery();

        builder.Services.ConfigureHttpClientDefaults(http =>
        {
            // Turn on resilience by default
            http.AddStandardResilienceHandler();

            // Turn on service discovery by default
            http.AddServiceDiscovery();
        });

        // Uncomment the following to restrict the allowed schemes for service discovery.
        // builder.Services.Configure<ServiceDiscoveryOptions>(options =>
        // {
        //     options.AllowedSchemes = ["https"];
        // });

        return builder;
    }

    public static TBuilder ConfigureOpenTelemetry<TBuilder>(this TBuilder builder) where TBuilder : IHostApplicationBuilder
    {
        builder.Logging.AddOpenTelemetry(logging =>
        {
            logging.IncludeFormattedMessage = true;
            logging.IncludeScopes = true;
        });

        builder.Services.AddOpenTelemetry()
            .WithMetrics(metrics =>
            {
                metrics.AddAspNetCoreInstrumentation()
                    .AddHttpClientInstrumentation()
                    .AddRuntimeInstrumentation();
            })
            .WithTracing(tracing =>
            {
                tracing.AddSource(builder.Environment.ApplicationName)
                    .AddAspNetCoreInstrumentation(tracing =>
                        // Exclude health check requests from tracing
                        tracing.Filter = context =>
                            !context.Request.Path.StartsWithSegments(HealthEndpointPath)
                            && !context.Request.Path.StartsWithSegments(AlivenessEndpointPath)
                    )
                    // Uncomment the following line to enable gRPC instrumentation (requires the OpenTelemetry.Instrumentation.GrpcNetClient package)
                    //.AddGrpcClientInstrumentation()
                    .AddHttpClientInstrumentation();
            });

        builder.AddOpenTelemetryExporters();

        return builder;
    }

    private static TBuilder AddOpenTelemetryExporters<TBuilder>(this TBuilder builder) where TBuilder : IHostApplicationBuilder
    {
        var useOtlpExporter = !string.IsNullOrWhiteSpace(builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"]);

        if (useOtlpExporter)
        {
            builder.Services.AddOpenTelemetry().UseOtlpExporter();
        }

        // Uncomment the following lines to enable the Azure Monitor exporter (requires the Azure.Monitor.OpenTelemetry.AspNetCore package)
        //if (!string.IsNullOrEmpty(builder.Configuration["APPLICATIONINSIGHTS_CONNECTION_STRING"]))
        //{
        //    builder.Services.AddOpenTelemetry()
        //       .UseAzureMonitor();
        //}

        return builder;
    }

    public static TBuilder AddDefaultHealthChecks<TBuilder>(this TBuilder builder) where TBuilder : IHostApplicationBuilder
    {
        builder.Services.AddHealthChecks()
            // Add a default liveness check to ensure app is responsive
            .AddCheck("self", () => HealthCheckResult.Healthy(), ["live"]);

        return builder;
    }

    public static WebApplication MapDefaultEndpoints(this WebApplication app)
    {
        // Adding health checks endpoints to applications in non-development environments has security implications.
        // See https://aka.ms/aspire/healthchecks for details before enabling these endpoints in non-development environments.
        if (app.Environment.IsDevelopment())
        {
            // All health checks must pass for app to be considered ready to accept traffic after starting
            app.MapHealthChecks(HealthEndpointPath);

            // Only health checks tagged with the "live" tag must pass for app to be considered alive
            app.MapHealthChecks(AlivenessEndpointPath, new HealthCheckOptions
            {
                Predicate = r => r.Tags.Contains("live")
            });
        }

        return app;
    }
}
```

Add it to the solution:

Run: `dotnet sln Airbnb.slnx add src/Airbnb.ServiceDefaults/Airbnb.ServiceDefaults.csproj`

- [ ] **Step 7: Wire ServiceDefaults and the Postgres data source into the API**

Replace `backend/src/Airbnb.Api/Airbnb.Api.csproj` with:

```xml
<Project Sdk="Microsoft.NET.Sdk.Web">

  <ItemGroup>
    <PackageReference Include="Aspire.Npgsql" />
  </ItemGroup>

  <ItemGroup>
    <ProjectReference Include="..\Airbnb.ServiceDefaults\Airbnb.ServiceDefaults.csproj" />
  </ItemGroup>

</Project>
```

Replace `backend/src/Airbnb.Api/Program.cs` with the following. The hand-written `/health` endpoint is removed; `MapDefaultEndpoints` serves `/health` and `/alive`, and the Npgsql data source adds the Postgres health check.

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.AddNpgsqlDataSource("airbnb");

var app = builder.Build();

app.MapDefaultEndpoints();

app.Run();
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `dotnet test --project tests/Airbnb.Api.Tests`
Expected: PASS, `succeeded: 3`, `failed: 0`. The first run pulls `postgres:18.3` if it isn't already cached.

- [ ] **Step 9: Commit**

```bash
git add backend/Airbnb.slnx backend/src/Airbnb.ServiceDefaults backend/src/Airbnb.Api backend/tests/Airbnb.Api.Tests
git commit -m "feat: add Aspire service defaults with Postgres-backed health checks" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Every error leaves the API as the frontend envelope

**Files:**
- Create: `backend/src/Airbnb.SharedKernel/Airbnb.SharedKernel.csproj`
- Create: `backend/src/Airbnb.SharedKernel/ApiResponse.cs`
- Create: `backend/src/Airbnb.Api/Errors/EnvelopeProblemDetailsWriter.cs`
- Modify: `backend/src/Airbnb.Api/Airbnb.Api.csproj`
- Modify: `backend/src/Airbnb.Api/Program.cs`
- Create: `backend/tests/Airbnb.UnitTests/Airbnb.UnitTests.csproj`
- Create: `backend/tests/Airbnb.UnitTests/SharedKernel/ApiResponseTests.cs`
- Create: `backend/tests/Airbnb.UnitTests/Api/EnvelopeProblemDetailsWriterTests.cs`
- Create: `backend/tests/Airbnb.Api.Tests/ErrorEnvelopeTests.cs`
- Modify: `backend/Airbnb.slnx`

**Interfaces:**
- Consumes: `ApiFactory`, `PostgresFixture` (Task 2).
- Produces:
  - `Airbnb.SharedKernel.ApiResponse<T>`: `sealed record (bool Success, T? Data = default, string? Error = null, PageMeta? Meta = null)`. Null members are omitted when serialized.
  - `Airbnb.SharedKernel.PageMeta(int Total, int Page, int Limit)`.
  - `ApiResponse.Ok<T>(T data, PageMeta? meta = null)`.
  - `ApiResponse.Fail(string error)`, which returns `ApiResponse<object>`.
  - `Airbnb.Api.Errors.EnvelopeProblemDetailsWriter` (internal), with `const string ServerErrorMessage = "An unexpected error occurred."`.
- Note: this phase registers no validators. The spike showed that .NET 10's validation generator only registers types for `AddValidation()` calls in the same assembly, so each module calls `services.AddValidation()` in phase 2 (spec §1). This task makes sure validation failures leave the API as the envelope.

- [ ] **Step 1: Create the SharedKernel project (empty for now)**

Create `backend/src/Airbnb.SharedKernel/Airbnb.SharedKernel.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">

</Project>
```

Run: `dotnet sln Airbnb.slnx add src/Airbnb.SharedKernel/Airbnb.SharedKernel.csproj`

- [ ] **Step 2: Create the unit test project**

Create `backend/tests/Airbnb.UnitTests/Airbnb.UnitTests.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <IsPackable>false</IsPackable>
  </PropertyGroup>

  <ItemGroup>
    <FrameworkReference Include="Microsoft.AspNetCore.App" />
    <PackageReference Include="Microsoft.Testing.Extensions.CodeCoverage" />
    <PackageReference Include="xunit.v3" />
  </ItemGroup>

  <ItemGroup>
    <Using Include="Xunit" />
  </ItemGroup>

  <ItemGroup>
    <ProjectReference Include="..\..\src\Airbnb.Api\Airbnb.Api.csproj" />
    <ProjectReference Include="..\..\src\Airbnb.SharedKernel\Airbnb.SharedKernel.csproj" />
  </ItemGroup>

</Project>
```

Run: `dotnet sln Airbnb.slnx add tests/Airbnb.UnitTests/Airbnb.UnitTests.csproj`

- [ ] **Step 3: Write the failing envelope tests**

Create `backend/tests/Airbnb.UnitTests/SharedKernel/ApiResponseTests.cs`:

```csharp
using System.Text.Json;
using Airbnb.SharedKernel;

namespace Airbnb.UnitTests.SharedKernel;

public sealed class ApiResponseTests
{
    [Fact]
    public void Ok_without_meta_serializes_only_success_and_data()
    {
        var json = JsonSerializer.Serialize(ApiResponse.Ok(new[] { "l1", "l2" }), JsonSerializerOptions.Web);

        Assert.Equal("""{"success":true,"data":["l1","l2"]}""", json);
    }

    [Fact]
    public void Ok_with_meta_serializes_paging_metadata()
    {
        var json = JsonSerializer.Serialize(ApiResponse.Ok(new[] { "l1" }, new PageMeta(16, 1, 50)), JsonSerializerOptions.Web);

        Assert.Equal("""{"success":true,"data":["l1"],"meta":{"total":16,"page":1,"limit":50}}""", json);
    }

    [Fact]
    public void Fail_serializes_only_success_and_error()
    {
        var json = JsonSerializer.Serialize(ApiResponse.Fail("Listing was not found"), JsonSerializerOptions.Web);

        Assert.Equal("""{"success":false,"error":"Listing was not found"}""", json);
    }
}
```

Create `backend/tests/Airbnb.UnitTests/Api/EnvelopeProblemDetailsWriterTests.cs`:

```csharp
using Airbnb.Api.Errors;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Airbnb.UnitTests.Api;

public sealed class EnvelopeProblemDetailsWriterTests
{
    [Fact]
    public async Task Validation_problem_lists_every_field_in_order()
    {
        var problem = new HttpValidationProblemDetails(new Dictionary<string, string[]>
        {
            ["Limit"] = ["The field Limit must be between 1 and 100."],
            ["Location"] = ["Too long.", "Contains control characters."],
        });

        var body = await WriteAsync(problem, StatusCodes.Status400BadRequest);

        Assert.Equal(
            """{"success":false,"error":"Limit: The field Limit must be between 1 and 100.; Location: Too long. Contains control characters."}""",
            body);
    }

    [Theory]
    [InlineData(StatusCodes.Status500InternalServerError)]
    [InlineData(StatusCodes.Status503ServiceUnavailable)]
    public async Task Server_errors_never_expose_details(int status)
    {
        var problem = new ProblemDetails
        {
            Status = status,
            Title = "Boom",
            Detail = "NpgsqlException: password authentication failed for user admin",
        };

        var body = await WriteAsync(problem, status);

        Assert.Equal("""{"success":false,"error":"An unexpected error occurred."}""", body);
    }

    [Fact]
    public async Task Client_error_prefers_detail()
    {
        var problem = new ProblemDetails { Status = 404, Title = "Not Found", Detail = "Listing l99 was not found" };

        var body = await WriteAsync(problem, StatusCodes.Status404NotFound);

        Assert.Equal("""{"success":false,"error":"Listing l99 was not found"}""", body);
    }

    [Fact]
    public async Task Client_error_falls_back_to_title()
    {
        var body = await WriteAsync(new ProblemDetails { Status = 404, Title = "Not Found" }, StatusCodes.Status404NotFound);

        Assert.Equal("""{"success":false,"error":"Not Found"}""", body);
    }

    [Fact]
    public async Task Client_error_without_title_uses_the_response_reason_phrase()
    {
        var body = await WriteAsync(new ProblemDetails(), StatusCodes.Status429TooManyRequests);

        Assert.Equal("""{"success":false,"error":"Too Many Requests"}""", body);
    }

    [Fact]
    public void Writes_whatever_the_client_accepts()
    {
        var http = new DefaultHttpContext();
        http.Request.Headers.Accept = "text/html";

        Assert.True(new EnvelopeProblemDetailsWriter().CanWrite(new ProblemDetailsContext { HttpContext = http }));
    }

    private static async Task<string> WriteAsync(ProblemDetails problem, int responseStatus)
    {
        var http = new DefaultHttpContext();
        http.Response.StatusCode = responseStatus;
        http.Response.Body = new MemoryStream();

        await new EnvelopeProblemDetailsWriter().WriteAsync(new ProblemDetailsContext { HttpContext = http, ProblemDetails = problem });

        http.Response.Body.Position = 0;
        using var reader = new StreamReader(http.Response.Body);
        return await reader.ReadToEndAsync(TestContext.Current.CancellationToken);
    }
}
```

- [ ] **Step 4: Run the unit tests to verify they fail**

Run: `dotnet test --project tests/Airbnb.UnitTests`
Expected: FAIL to compile with `error CS0246` / `CS0234`, because `ApiResponse`, `PageMeta` and `Airbnb.Api.Errors` don't exist yet.

- [ ] **Step 5: Implement the envelope**

Create `backend/src/Airbnb.SharedKernel/ApiResponse.cs`:

```csharp
using System.Text.Json.Serialization;

namespace Airbnb.SharedKernel;

// The wire envelope shared with the frontend: { success, data?, error?, meta? }.
// Null members are omitted because the frontend's Zod schemas reject null for optional fields.
public sealed record ApiResponse<T>(
    bool Success,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] T? Data = default,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Error = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] PageMeta? Meta = null);

public sealed record PageMeta(int Total, int Page, int Limit);

public static class ApiResponse
{
    public static ApiResponse<T> Ok<T>(T data, PageMeta? meta = null) => new(true, data, null, meta);

    public static ApiResponse<object> Fail(string error) => new(false, null, error);
}
```

- [ ] **Step 6: Implement the envelope writer**

Create `backend/src/Airbnb.Api/Errors/EnvelopeProblemDetailsWriter.cs`:

```csharp
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.WebUtilities;

namespace Airbnb.Api.Errors;

// Every ProblemDetails the framework produces — built-in validation, unhandled exceptions,
// status-code pages, rate-limiter rejections — leaves the API as the frontend envelope.
internal sealed class EnvelopeProblemDetailsWriter : IProblemDetailsWriter
{
    public const string ServerErrorMessage = "An unexpected error occurred.";

    // JSON whatever the Accept header says: the API has exactly one error format.
    public bool CanWrite(ProblemDetailsContext context) => true;

    public ValueTask WriteAsync(ProblemDetailsContext context)
    {
        var response = context.HttpContext.Response;
        var status = context.ProblemDetails.Status ?? response.StatusCode;
        var message = context.ProblemDetails switch
        {
            HttpValidationProblemDetails { Errors.Count: > 0 } validation => string.Join("; ",
                validation.Errors.Select(field => $"{field.Key}: {string.Join(" ", field.Value)}")),
            _ when status >= StatusCodes.Status500InternalServerError => ServerErrorMessage,
            var problem => problem.Detail ?? problem.Title ?? ReasonPhrases.GetReasonPhrase(status),
        };

        return new ValueTask(response.WriteAsJsonAsync(ApiResponse.Fail(message)));
    }
}
```

Replace `backend/src/Airbnb.Api/Airbnb.Api.csproj` with:

```xml
<Project Sdk="Microsoft.NET.Sdk.Web">

  <ItemGroup>
    <InternalsVisibleTo Include="Airbnb.UnitTests" />
  </ItemGroup>

  <ItemGroup>
    <PackageReference Include="Aspire.Npgsql" />
  </ItemGroup>

  <ItemGroup>
    <ProjectReference Include="..\Airbnb.ServiceDefaults\Airbnb.ServiceDefaults.csproj" />
    <ProjectReference Include="..\Airbnb.SharedKernel\Airbnb.SharedKernel.csproj" />
  </ItemGroup>

</Project>
```

- [ ] **Step 7: Run the unit tests to verify they pass**

Run: `dotnet test --project tests/Airbnb.UnitTests`
Expected: PASS, `succeeded: 10`, `failed: 0`.

- [ ] **Step 8: Write the failing integration test**

Create `backend/tests/Airbnb.Api.Tests/ErrorEnvelopeTests.cs`:

```csharp
using System.Net;
using Airbnb.Api.Tests.Infrastructure;

namespace Airbnb.Api.Tests;

public sealed class ErrorEnvelopeTests(PostgresFixture postgres)
{
    [Theory]
    [InlineData("application/json")]
    [InlineData("text/html")]
    [InlineData("*/*")]
    public async Task Unknown_api_route_returns_the_404_envelope_whatever_the_client_accepts(string accept)
    {
        await using var factory = new ApiFactory(postgres.ConnectionString);
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/does-not-exist");
        request.Headers.Accept.ParseAdd(accept);

        using var response = await client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal(
            """{"success":false,"error":"Not Found"}""",
            await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
    }
}
```

- [ ] **Step 9: Run it to verify it fails**

Run: `dotnet test --project tests/Airbnb.Api.Tests --filter-class "Airbnb.Api.Tests.ErrorEnvelopeTests"`
Expected: FAIL, `failed: 3`. The 404 arrives with an empty body and no content type.

- [ ] **Step 10: Register the writer and the error middleware**

Replace `backend/src/Airbnb.Api/Program.cs` with:

```csharp
using Airbnb.Api.Errors;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.AddNpgsqlDataSource("airbnb");

// Registered before AddProblemDetails so it is chosen ahead of the default ProblemDetails JSON writer.
builder.Services.AddSingleton<IProblemDetailsWriter, EnvelopeProblemDetailsWriter>();
builder.Services.AddProblemDetails();

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();

app.MapDefaultEndpoints();

app.Run();
```

- [ ] **Step 11: Run all tests**

Run: `dotnet test`
Expected: PASS, with every project succeeding (integration: 6, unit: 10).

- [ ] **Step 12: Commit**

```bash
git add backend/Airbnb.slnx backend/src/Airbnb.SharedKernel backend/src/Airbnb.Api backend/tests/Airbnb.UnitTests backend/tests/Airbnb.Api.Tests/ErrorEnvelopeTests.cs
git commit -m "feat: return the frontend envelope for every API error" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Per-IP rate limiting with separate read and write budgets

**Files:**
- Create: `backend/src/Airbnb.Api/RateLimiting/ApiRateLimiting.cs`
- Modify: `backend/src/Airbnb.Api/Program.cs`
- Create: `backend/tests/Airbnb.Api.Tests/RateLimitingTests.cs`

**Interfaces:**
- Consumes: `ApiFactory`, `PostgresFixture`, and the envelope writer from Task 3 (the 429 body comes from status-code pages).
- Produces: `IServiceCollection AddApiRateLimiting(this IServiceCollection services, IConfiguration configuration)`. It reads configuration section `RateLimiting`, keys `ReadsPerMinute` (default 600) and `WritesPerMinute` (default 10).

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/Airbnb.Api.Tests/RateLimitingTests.cs`:

```csharp
using System.Net;
using Airbnb.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Airbnb.Api.Tests;

public sealed class RateLimitingTests(PostgresFixture postgres)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Reads_over_the_limit_get_the_429_envelope()
    {
        await using var factory = CreateFactory(readsPerMinute: 1, writesPerMinute: 10);
        using var client = factory.CreateClient();

        using var first = await client.GetAsync("/api/anything", Ct);
        using var second = await client.GetAsync("/api/anything", Ct);

        Assert.Equal(HttpStatusCode.NotFound, first.StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, second.StatusCode);
        Assert.Equal("""{"success":false,"error":"Too Many Requests"}""", await second.Content.ReadAsStringAsync(Ct));
    }

    [Fact]
    public async Task Writes_have_their_own_budget()
    {
        await using var factory = CreateFactory(readsPerMinute: 10, writesPerMinute: 1);
        using var client = factory.CreateClient();

        using var firstWrite = await client.PostAsync("/api/anything", content: null, Ct);
        using var secondWrite = await client.PostAsync("/api/anything", content: null, Ct);
        using var read = await client.GetAsync("/api/anything", Ct);

        Assert.Equal(HttpStatusCode.NotFound, firstWrite.StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, secondWrite.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, read.StatusCode);
    }

    [Fact]
    public async Task Health_probes_are_never_limited()
    {
        await using var factory = CreateFactory(readsPerMinute: 1, writesPerMinute: 1);
        using var client = factory.CreateClient();

        using var first = await client.GetAsync("/alive", Ct);
        using var second = await client.GetAsync("/alive", Ct);

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
    }

    private WebApplicationFactory<Program> CreateFactory(int readsPerMinute, int writesPerMinute) =>
        new ApiFactory(postgres.ConnectionString).WithWebHostBuilder(builder => builder
            .UseSetting("RateLimiting:ReadsPerMinute", readsPerMinute.ToString())
            .UseSetting("RateLimiting:WritesPerMinute", writesPerMinute.ToString()));
}
```

- [ ] **Step 2: Run them to verify they fail**

Run: `dotnet test --project tests/Airbnb.Api.Tests --filter-class "Airbnb.Api.Tests.RateLimitingTests"`
Expected: FAIL, `failed: 2`. The second GET and the second POST return 404 because nothing limits them yet. `Health_probes_are_never_limited` already passes; it guards the `/api`-only rule once the limiter exists.

- [ ] **Step 3: Implement the limiter**

Create `backend/src/Airbnb.Api/RateLimiting/ApiRateLimiting.cs`:

```csharp
using System.Threading.RateLimiting;

namespace Airbnb.Api.RateLimiting;

internal static class ApiRateLimiting
{
    public const string SectionName = "RateLimiting";

    // Only the public API is limited; health probes and API docs are not.
    private const string LimitedPathPrefix = "/api";
    private const int DefaultReadsPerMinute = 600;
    private const int DefaultWritesPerMinute = 10;
    private static readonly TimeSpan Window = TimeSpan.FromMinutes(1);

    public static IServiceCollection AddApiRateLimiting(this IServiceCollection services, IConfiguration configuration)
    {
        var section = configuration.GetSection(SectionName);
        var readsPerMinute = section.GetValue("ReadsPerMinute", DefaultReadsPerMinute);
        var writesPerMinute = section.GetValue("WritesPerMinute", DefaultWritesPerMinute);

        return services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
            {
                if (!context.Request.Path.StartsWithSegments(LimitedPathPrefix))
                {
                    return RateLimitPartition.GetNoLimiter(string.Empty);
                }

                var isRead = HttpMethods.IsGet(context.Request.Method) || HttpMethods.IsHead(context.Request.Method);
                // ponytail: keyed by client IP. Behind the Next.js server every browser shares its IP (spec §2);
                // forward client IPs from Next to make this per-user.
                var client = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";

                return RateLimitPartition.GetFixedWindowLimiter(
                    $"{client}:{(isRead ? "read" : "write")}",
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = isRead ? readsPerMinute : writesPerMinute,
                        Window = Window,
                    });
            });
        });
    }
}
```

- [ ] **Step 4: Wire it into the pipeline after status-code pages**

Replace `backend/src/Airbnb.Api/Program.cs` with the following. `UseRateLimiter` comes after `UseStatusCodePages`, so a rejected request's empty 429 is turned into the envelope.

```csharp
using Airbnb.Api.Errors;
using Airbnb.Api.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.AddNpgsqlDataSource("airbnb");

// Registered before AddProblemDetails so it is chosen ahead of the default ProblemDetails JSON writer.
builder.Services.AddSingleton<IProblemDetailsWriter, EnvelopeProblemDetailsWriter>();
builder.Services.AddProblemDetails();
builder.Services.AddApiRateLimiting(builder.Configuration);

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseRateLimiter();

app.MapDefaultEndpoints();

app.Run();
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `dotnet test --project tests/Airbnb.Api.Tests`
Expected: PASS, `succeeded: 9`, `failed: 0`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/Airbnb.Api backend/tests/Airbnb.Api.Tests/RateLimitingTests.cs
git commit -m "feat: rate-limit the API per client IP with separate read and write budgets" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: OpenAPI document and Scalar UI in Development

**Files:**
- Modify: `backend/src/Airbnb.Api/Airbnb.Api.csproj`
- Modify: `backend/src/Airbnb.Api/Program.cs`
- Create: `backend/tests/Airbnb.Api.Tests/ApiDocsTests.cs`

**Interfaces:**
- Consumes: `ApiFactory`, `PostgresFixture`.
- Produces: `GET /openapi/v1.json` and `GET /scalar` in Development only. Phase 2's module endpoints appear in them automatically.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/Airbnb.Api.Tests/ApiDocsTests.cs`:

```csharp
using System.Net;
using Airbnb.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Hosting;

namespace Airbnb.Api.Tests;

public sealed class ApiDocsTests(PostgresFixture postgres)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Theory]
    [InlineData("/openapi/v1.json", "application/json")]
    [InlineData("/scalar", "text/html")]
    public async Task Docs_are_served_in_development(string path, string mediaType)
    {
        await using var factory = new ApiFactory(postgres.ConnectionString);
        using var client = factory.CreateClient();

        using var response = await client.GetAsync(path, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(mediaType, response.Content.Headers.ContentType?.MediaType);
    }

    [Theory]
    [InlineData("/openapi/v1.json")]
    [InlineData("/scalar")]
    public async Task Docs_are_not_served_outside_development(string path)
    {
        await using var factory = new ApiFactory(postgres.ConnectionString)
            .WithWebHostBuilder(builder => builder.UseEnvironment("Production"));
        using var client = factory.CreateClient();

        using var response = await client.GetAsync(path, Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
```

- [ ] **Step 2: Run them to verify they fail**

Run: `dotnet test --project tests/Airbnb.Api.Tests --filter-class "Airbnb.Api.Tests.ApiDocsTests"`
Expected: FAIL, `failed: 2`. Both Development cases return 404. The Production cases already pass; they guard the Development-only rule.

- [ ] **Step 3: Add the packages**

Replace the package `ItemGroup` in `backend/src/Airbnb.Api/Airbnb.Api.csproj` with:

```xml
  <ItemGroup>
    <PackageReference Include="Aspire.Npgsql" />
    <PackageReference Include="Microsoft.AspNetCore.OpenApi" />
    <PackageReference Include="Scalar.AspNetCore" />
  </ItemGroup>
```

- [ ] **Step 4: Map the docs in Development**

Replace `backend/src/Airbnb.Api/Program.cs` with:

```csharp
using Airbnb.Api.Errors;
using Airbnb.Api.RateLimiting;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.AddNpgsqlDataSource("airbnb");

// Registered before AddProblemDetails so it is chosen ahead of the default ProblemDetails JSON writer.
builder.Services.AddSingleton<IProblemDetailsWriter, EnvelopeProblemDetailsWriter>();
builder.Services.AddProblemDetails();
builder.Services.AddApiRateLimiting(builder.Configuration);
builder.Services.AddOpenApi();

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseRateLimiter();

app.MapDefaultEndpoints();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();
}

app.Run();
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `dotnet test --project tests/Airbnb.Api.Tests`
Expected: PASS, `succeeded: 13`, `failed: 0`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/Airbnb.Api backend/tests/Airbnb.Api.Tests/ApiDocsTests.cs
git commit -m "feat: serve the OpenAPI document and Scalar UI in development" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Migration worker and the `IModuleMigrator` contract

**Files:**
- Create: `backend/src/Airbnb.SharedKernel/IModuleMigrator.cs`
- Create: `backend/src/Airbnb.MigrationService/Airbnb.MigrationService.csproj`
- Create: `backend/src/Airbnb.MigrationService/Program.cs`
- Create: `backend/src/Airbnb.MigrationService/MigrationWorker.cs`
- Modify: `backend/tests/Airbnb.UnitTests/Airbnb.UnitTests.csproj`
- Create: `backend/tests/Airbnb.UnitTests/MigrationService/MigrationWorkerTests.cs`
- Modify: `backend/Airbnb.slnx`

**Interfaces:**
- Consumes: SharedKernel and ServiceDefaults.
- Produces:
  - `public interface IModuleMigrator { string Module { get; } Task MigrateAsync(CancellationToken cancellationToken); }` in `Airbnb.SharedKernel`. In phase 2, each module registers an implementation in `AddXModuleDatabase`, and the worker's `Program.cs` calls those methods.
  - `internal sealed class MigrationWorker(IEnumerable<IModuleMigrator> migrators, IHostApplicationLifetime lifetime, ILogger<MigrationWorker> logger) : BackgroundService`. On failure it sets `Environment.ExitCode = 1`.

- [ ] **Step 1: Create the worker project so the tests can reference it**

Create `backend/src/Airbnb.MigrationService/Airbnb.MigrationService.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk.Worker">

  <ItemGroup>
    <InternalsVisibleTo Include="Airbnb.UnitTests" />
  </ItemGroup>

  <ItemGroup>
    <ProjectReference Include="..\Airbnb.ServiceDefaults\Airbnb.ServiceDefaults.csproj" />
    <ProjectReference Include="..\Airbnb.SharedKernel\Airbnb.SharedKernel.csproj" />
  </ItemGroup>

</Project>
```

Create `backend/src/Airbnb.MigrationService/Program.cs`:

```csharp
using Airbnb.MigrationService;

var builder = Host.CreateApplicationBuilder(args);

builder.AddServiceDefaults();
builder.Services.AddHostedService<MigrationWorker>();

builder.Build().Run();
```

Run: `dotnet sln Airbnb.slnx add src/Airbnb.MigrationService/Airbnb.MigrationService.csproj`

In `backend/tests/Airbnb.UnitTests/Airbnb.UnitTests.csproj`, replace the project reference `ItemGroup` with:

```xml
  <ItemGroup>
    <ProjectReference Include="..\..\src\Airbnb.Api\Airbnb.Api.csproj" />
    <ProjectReference Include="..\..\src\Airbnb.MigrationService\Airbnb.MigrationService.csproj" />
    <ProjectReference Include="..\..\src\Airbnb.SharedKernel\Airbnb.SharedKernel.csproj" />
  </ItemGroup>
```

- [ ] **Step 2: Write the failing tests**

Create `backend/tests/Airbnb.UnitTests/MigrationService/MigrationWorkerTests.cs`:

```csharp
using Airbnb.MigrationService;
using Airbnb.SharedKernel;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;

namespace Airbnb.UnitTests.MigrationService;

public sealed class MigrationWorkerTests
{
    [Fact]
    public async Task Runs_every_migrator_in_registration_order_then_stops_the_host()
    {
        var log = new List<string>();
        var lifetime = new FakeLifetime();

        await RunAsync(lifetime, new RecordingMigrator("stays", log), new RecordingMigrator("reviews", log));

        Assert.Equal(["stays", "reviews"], log);
        Assert.True(lifetime.StopRequested);
    }

    [Fact]
    public async Task A_failing_migrator_stops_the_run_and_exits_non_zero()
    {
        var log = new List<string>();
        var lifetime = new FakeLifetime();
        try
        {
            await RunAsync(lifetime, new FailingMigrator(), new RecordingMigrator("after-failure", log));

            Assert.Empty(log);
            Assert.Equal(1, Environment.ExitCode);
            Assert.True(lifetime.StopRequested);
        }
        finally
        {
            Environment.ExitCode = 0;
        }
    }

    [Fact]
    public async Task With_no_migrators_the_host_still_stops()
    {
        var lifetime = new FakeLifetime();

        await RunAsync(lifetime);

        Assert.True(lifetime.StopRequested);
    }

    private static async Task RunAsync(FakeLifetime lifetime, params IModuleMigrator[] migrators)
    {
        var worker = new MigrationWorker(migrators, lifetime, NullLogger<MigrationWorker>.Instance);

        await worker.StartAsync(TestContext.Current.CancellationToken);
        await worker.ExecuteTask!;
    }

    private sealed class RecordingMigrator(string module, List<string> log) : IModuleMigrator
    {
        public string Module => module;

        public Task MigrateAsync(CancellationToken cancellationToken)
        {
            log.Add(module);
            return Task.CompletedTask;
        }
    }

    private sealed class FailingMigrator : IModuleMigrator
    {
        public string Module => "broken";

        public Task MigrateAsync(CancellationToken cancellationToken) =>
            throw new InvalidOperationException("migration failed");
    }

    private sealed class FakeLifetime : IHostApplicationLifetime
    {
        public bool StopRequested { get; private set; }

        public CancellationToken ApplicationStarted => CancellationToken.None;

        public CancellationToken ApplicationStopping => CancellationToken.None;

        public CancellationToken ApplicationStopped => CancellationToken.None;

        public void StopApplication() => StopRequested = true;
    }
}
```

- [ ] **Step 3: Run them to verify they fail**

Run: `dotnet test --project tests/Airbnb.UnitTests`
Expected: FAIL to compile with `error CS0246`, because `IModuleMigrator` and `MigrationWorker` don't exist yet.

- [ ] **Step 4: Implement the contract and the worker**

Create `backend/src/Airbnb.SharedKernel/IModuleMigrator.cs`:

```csharp
namespace Airbnb.SharedKernel;

// Implemented by each module's persistence layer. The MigrationService runs every registered migrator once at startup.
public interface IModuleMigrator
{
    string Module { get; }

    Task MigrateAsync(CancellationToken cancellationToken);
}
```

Create `backend/src/Airbnb.MigrationService/MigrationWorker.cs`:

```csharp
using Airbnb.SharedKernel;

namespace Airbnb.MigrationService;

// Runs every module's migrations once, in registration order, then stops the process.
// A non-zero exit code keeps Aspire from starting the API (WaitForCompletion) on a half-migrated database.
internal sealed class MigrationWorker(
    IEnumerable<IModuleMigrator> migrators,
    IHostApplicationLifetime lifetime,
    ILogger<MigrationWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            foreach (var migrator in migrators)
            {
                logger.LogInformation("Migrating module {Module}", migrator.Module);
                await migrator.MigrateAsync(stoppingToken);
            }

            logger.LogInformation("All module migrations completed");
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Module migration failed");
            Environment.ExitCode = 1;
        }
        finally
        {
            lifetime.StopApplication();
        }
    }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `dotnet test --project tests/Airbnb.UnitTests`
Expected: PASS, `succeeded: 13`, `failed: 0`.

- [ ] **Step 6: Commit**

```bash
git add backend/Airbnb.slnx backend/src/Airbnb.SharedKernel/IModuleMigrator.cs backend/src/Airbnb.MigrationService backend/tests/Airbnb.UnitTests
git commit -m "feat: add migration worker that runs every module migrator then exits" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Architecture tests guarding the shared kernel

**Files:**
- Create: `backend/tests/Airbnb.ArchitectureTests/Airbnb.ArchitectureTests.csproj`
- Create: `backend/tests/Airbnb.ArchitectureTests/SharedKernelRulesTests.cs`
- Modify: `backend/Airbnb.slnx`

**Interfaces:**
- Consumes: `Airbnb.SharedKernel` (Tasks 3 and 6).
- Produces: the architecture test project. Phase 2 adds the module rules here: modules reference only other modules' Contracts, and each module assembly exports only its module class (checked with `Assembly.GetExportedTypes()`, because NetArchTest counts nested public types as public).

- [ ] **Step 1: Create the project**

Create `backend/tests/Airbnb.ArchitectureTests/Airbnb.ArchitectureTests.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <IsPackable>false</IsPackable>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="NetArchTest.eNhancedEdition" />
    <PackageReference Include="xunit.v3" />
  </ItemGroup>

  <ItemGroup>
    <Using Include="Xunit" />
  </ItemGroup>

  <ItemGroup>
    <ProjectReference Include="..\..\src\Airbnb.SharedKernel\Airbnb.SharedKernel.csproj" />
  </ItemGroup>

</Project>
```

Run: `dotnet sln Airbnb.slnx add tests/Airbnb.ArchitectureTests/Airbnb.ArchitectureTests.csproj`

- [ ] **Step 2: Write the rule**

Create `backend/tests/Airbnb.ArchitectureTests/SharedKernelRulesTests.cs`:

```csharp
using Airbnb.SharedKernel;
using NetArchTest.Rules;

namespace Airbnb.ArchitectureTests;

public sealed class SharedKernelRulesTests
{
    [Fact]
    public void Shared_kernel_depends_on_no_host_or_module()
    {
        var result = Types.InAssembly(typeof(IModuleMigrator).Assembly)
            .ShouldNot()
            .HaveDependencyOnAny("Airbnb.Api", "Airbnb.MigrationService", "Airbnb.AppHost", "Airbnb.Modules")
            .GetResult();

        Assert.True(
            result.IsSuccessful,
            $"SharedKernel types with forbidden dependencies: {string.Join(", ", result.FailingTypes?.Select(t => t.FullName) ?? [])}");
    }
}
```

- [ ] **Step 3: Run it**

Run: `dotnet test --project tests/Airbnb.ArchitectureTests`
Expected: PASS, `succeeded: 1`. This rule guards future changes, so it passes on today's code.

- [ ] **Step 4: Commit**

```bash
git add backend/Airbnb.slnx backend/tests/Airbnb.ArchitectureTests
git commit -m "test: add architecture tests guarding the shared kernel's dependencies" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Aspire AppHost, run instructions, full verification

**Files:**
- Create: `backend/src/Airbnb.AppHost/Airbnb.AppHost.csproj`
- Create: `backend/src/Airbnb.AppHost/AppHost.cs`
- Create: `backend/src/Airbnb.AppHost/appsettings.json`
- Create: `backend/src/Airbnb.AppHost/Properties/launchSettings.json`
- Create: `backend/aspire.config.json`
- Modify: `backend/Airbnb.slnx`
- Modify: `README.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `Airbnb.Api` (it needs `ConnectionStrings:airbnb`, which Aspire injects through `WithReference(db)`) and `Airbnb.MigrationService`.
- Produces:
  - Aspire resources `postgres`, `airbnb`, `redis`, `rabbitmq`, `migrations` and `api`.
  - The API is reachable at `http://localhost:5283` (proxied from its launch profile).
  - Phase 3 adds the `frontend` resource.

- [ ] **Step 1: Create the AppHost project**

Create `backend/src/Airbnb.AppHost/Airbnb.AppHost.csproj`:

```xml
<Project Sdk="Aspire.AppHost.Sdk/13.5.4">

  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <UserSecretsId>8f3b6c1e-2d47-4a9e-b5c8-1e6f0a7d9c42</UserSecretsId>
    <!-- AspireUseCliBundle stays off: DCP and the dashboard come from NuGet, so build/test work without the Aspire CLI (CI). -->
    <NoWarn>$(NoWarn);ASPIRE010</NoWarn>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Aspire.Hosting.PostgreSQL" />
    <PackageReference Include="Aspire.Hosting.RabbitMQ" />
    <PackageReference Include="Aspire.Hosting.Redis" />
  </ItemGroup>

  <ItemGroup>
    <ProjectReference Include="..\Airbnb.Api\Airbnb.Api.csproj" />
    <ProjectReference Include="..\Airbnb.MigrationService\Airbnb.MigrationService.csproj" />
  </ItemGroup>

</Project>
```

Create `backend/src/Airbnb.AppHost/AppHost.cs`:

```csharp
var builder = DistributedApplication.CreateBuilder(args);

var postgres = builder.AddPostgres("postgres")
    .WithDataVolume()
    .WithLifetime(ContainerLifetime.Persistent)
    .WithPgWeb();
var db = postgres.AddDatabase("airbnb");

var redis = builder.AddRedis("redis")
    .WithLifetime(ContainerLifetime.Persistent);

var rabbitmq = builder.AddRabbitMQ("rabbitmq")
    .WithManagementPlugin()
    .WithLifetime(ContainerLifetime.Persistent);

var migrations = builder.AddProject<Projects.Airbnb_MigrationService>("migrations")
    .WithReference(db)
    .WaitFor(db);

builder.AddProject<Projects.Airbnb_Api>("api")
    .WithReference(db)
    .WithReference(redis)
    .WithReference(rabbitmq)
    .WaitFor(db)
    .WaitFor(redis)
    .WaitFor(rabbitmq)
    .WaitForCompletion(migrations)
    .WithHttpHealthCheck("/health");

builder.Build().Run();
```

Create `backend/src/Airbnb.AppHost/appsettings.json`:

```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning",
      "Aspire.Hosting.Dcp": "Warning"
    }
  }
}
```

Create `backend/src/Airbnb.AppHost/Properties/launchSettings.json`:

```json
{
  "$schema": "https://json.schemastore.org/launchsettings.json",
  "profiles": {
    "https": {
      "commandName": "Project",
      "dotnetRunMessages": true,
      "launchBrowser": true,
      "applicationUrl": "https://localhost:17260;http://localhost:15169",
      "environmentVariables": {
        "ASPNETCORE_ENVIRONMENT": "Development",
        "DOTNET_ENVIRONMENT": "Development",
        "ASPIRE_DASHBOARD_OTLP_ENDPOINT_URL": "https://localhost:21214",
        "ASPIRE_RESOURCE_SERVICE_ENDPOINT_URL": "https://localhost:22006"
      }
    },
    "http": {
      "commandName": "Project",
      "dotnetRunMessages": true,
      "launchBrowser": true,
      "applicationUrl": "http://localhost:15169",
      "environmentVariables": {
        "ASPNETCORE_ENVIRONMENT": "Development",
        "DOTNET_ENVIRONMENT": "Development",
        "ASPIRE_DASHBOARD_OTLP_ENDPOINT_URL": "http://localhost:19149",
        "ASPIRE_RESOURCE_SERVICE_ENDPOINT_URL": "http://localhost:20132"
      }
    }
  }
}
```

Create `backend/aspire.config.json` so the Aspire CLI finds the AppHost when run from `backend/`:

```json
{
  "appHost": {
    "path": "src/Airbnb.AppHost/Airbnb.AppHost.csproj"
  }
}
```

Run: `dotnet sln Airbnb.slnx add src/Airbnb.AppHost/Airbnb.AppHost.csproj`

- [ ] **Step 2: Build the whole solution**

Run: `dotnet build`
Expected: `Build succeeded.` with `0 Warning(s)` and `0 Error(s)`.

- [ ] **Step 3: Start the stack in the background and check it (PowerShell, Docker running)**

```powershell
cd backend
aspire start --non-interactive
aspire wait api --timeout 240 --non-interactive
(Invoke-WebRequest -UseBasicParsing http://localhost:5283/health).Content
aspire describe --non-interactive
```

Expected:
- `aspire start` prints `✅ AppHost started successfully.` and a dashboard URL.
- `aspire wait api` prints `✅ Resource 'api' is healthy.`
- The health request prints `Healthy`.
- `aspire describe` lists `migrations` as `Finished`, and `postgres`, `redis`, `rabbitmq`, `pgweb`, `airbnb` and `api` as `Running` / `Healthy`.

Then stop it:

```powershell
aspire stop --non-interactive
```

The persistent containers keep running for the next start. `aspire stop --force` removes them; the Postgres data volume stays until `docker volume rm`.

- [ ] **Step 4: Update the README**

In `README.md`:

- In the layout table, replace the `backend/` row with:

```markdown
| `backend/` | API | ASP.NET Core (.NET 10) modular monolith, orchestrated by Aspire 13.5 |
```

- Replace the `## Prerequisites` list with:

```markdown
- Node.js 24
- .NET 10 SDK (pinned by `backend/global.json`)
- Docker Desktop (Aspire containers and backend integration tests)
- Aspire CLI: `dotnet tool install -g aspire.cli`
```

- Replace the whole `## Backend` section (heading, code block and all) with:

````markdown
## Backend

Run from PowerShell; Docker must be running.

```powershell
cd backend
aspire run    # dashboard + postgres, redis, rabbitmq, migrations, api
dotnet test   # unit, architecture and integration tests (integration uses Docker)
```

- The dashboard URL is printed on start. The API answers at http://localhost:5283 (`/health`, and `/scalar` for the API reference in Development).
- Without the Aspire CLI: `dotnet run --project src/Airbnb.AppHost`.
- Containers are persistent between runs. `aspire stop --force` removes them; the Postgres data volume survives until `docker volume rm`.
````

- [ ] **Step 5: Update CLAUDE.md**

In `CLAUDE.md`:

- Replace the `backend/` bullet under "Repository Layout" with:

```markdown
- `backend/` — ASP.NET Core (.NET 10) modular monolith orchestrated by Aspire 13.5. Solution `backend/Airbnb.slnx`: `src/Airbnb.AppHost` (Aspire), `src/Airbnb.Api` (host), `src/Airbnb.ServiceDefaults`, `src/Airbnb.SharedKernel`, `src/Airbnb.MigrationService`; tests in `tests/Airbnb.UnitTests`, `tests/Airbnb.ArchitectureTests`, `tests/Airbnb.Api.Tests` (integration). SDK and test runner pinned by `backend/global.json`. Design: `docs/superpowers/specs/2026-09-26-backend-modular-monolith-design.md`.
```

- Replace the backend block that starts `Backend:` under "Commands" with:

````markdown
Backend (run from `backend/`; Aspire commands from PowerShell; Docker must be running):
```bash
aspire run                         # whole stack + dashboard
dotnet test                        # all test projects (Microsoft Testing Platform)
dotnet test --project tests/Airbnb.UnitTests --filter-class "Airbnb.UnitTests.Api.EnvelopeProblemDetailsWriterTests"
dotnet test --coverage --coverage-output-format cobertura   # coverage files under TestResults/
reportgenerator -reports:"TestResults/*.cobertura.xml" -targetdir:TestResults/report -reporttypes:TextSummary "-classfilters:-*.Generated*;-System.Runtime.CompilerServices*"   # summary without source-generated code
```
````

- Add this section at the end of the file:

```markdown
### Backend Conventions
- Package versions live only in `backend/Directory.Packages.props`; shared settings in `backend/Directory.Build.props` (warnings are errors, so xUnit tests pass `TestContext.Current.CancellationToken`).
- Every response body is the frontend envelope `{ success, data?, error?, meta? }` (`Airbnb.SharedKernel.ApiResponse`). Framework errors are reshaped by `Airbnb.Api/Errors/EnvelopeProblemDetailsWriter`; 5xx messages never carry details.
- Modules: request records are `public` but nested inside `internal` slice classes, and each module calls `services.AddValidation()` in its own `AddXModule`. .NET 10's validation generator ignores `internal` types and only registers types for `AddValidation()` calls in the same assembly.
- Integration tests use `ApiFactory` plus the assembly-wide `PostgresFixture` (one Testcontainers Postgres per test run).
```

- [ ] **Step 6: Full verification**

Run from `backend/`:

```bash
dotnet build
rm -rf TestResults
dotnet test --coverage --coverage-output-format cobertura
reportgenerator -reports:"TestResults/*.cobertura.xml" -targetdir:TestResults/report -reporttypes:TextSummary "-classfilters:-*.Generated*;-System.Runtime.CompilerServices*"
cat TestResults/report/Summary.txt
```

Expected:
- **Build:** 0 warnings, 0 errors.
- **Tests:** every project succeeds (unit 13, architecture 1, integration 13).
- **Coverage (`Summary.txt`):** `Airbnb.Api`, `Airbnb.SharedKernel` and `Airbnb.MigrationService` each at least 80% line coverage.
  - The class filter drops source-generated classes (OpenAPI helpers, compiler attributes); without it they pull `Airbnb.Api` far below its real number.
  - The worker's `Program.cs` is the only uncovered hand-written file; the Aspire run in Step 3 exercises it.
  - `Airbnb.ServiceDefaults` is template code, reported but not gated.

From `frontend/`, confirm nothing changed there: `npm test` passes as before.

- [ ] **Step 7: Commit**

```bash
git add backend/aspire.config.json backend/Airbnb.slnx backend/src/Airbnb.AppHost README.md CLAUDE.md
git commit -m "feat: orchestrate postgres, redis, rabbitmq, migrations and the api with Aspire" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
