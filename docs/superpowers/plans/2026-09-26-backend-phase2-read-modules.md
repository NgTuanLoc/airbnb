# Backend Phase 2 (Read Modules) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The API serves all of the frontend's mock data from Postgres. Five modules (Stays, Hosts, Experiences, Services, Reviews) each own a schema, a migration, seed data and cached read endpoints.

**Architecture:** Each module is a class library with `internal` feature slices: a validated `Query` record, a `Handler` and an endpoint. Each module has its own DbContext, schema and EF Core migration. It seeds itself from JSON exported by the frontend's mock arrays. Queries project straight to DTOs and are cached by HybridCache: in-memory first, then Redis, and a Polly timeout and circuit breaker keep a dead Redis from stalling requests.

**Tech Stack:** .NET 10, EF Core 10.0.12 with Npgsql 10.0.3, Microsoft.Extensions.Caching.Hybrid 10.10.0, Aspire.StackExchange.Redis.DistributedCaching 13.5.4, Microsoft.Extensions.Resilience 10.10.0 (Polly 8), Testcontainers (Postgres and Redis) 4.15.0, Node 24 (for the seed export script).

**Spec:** `docs/superpowers/specs/2026-09-26-backend-modular-monolith-design.md`. This plan covers phase 2 of its section 9. Phase 1 is merged on `master`.

A throwaway spike ran the riskiest parts first, against the real SDK, packages and Docker:

- **Seed export:** the script and its `--check` mode work.
- **Stays module:** EF Core schema, generated migration, complex type, `text[]` columns and seeding all work.
- **Validation and caching:** validated queries and HybridCache with the Polly Redis wrapper work.
- **Tests:** 28 integration tests and the wrapper's unit tests pass.
- **Architecture rule:** the "exports only the module class" rule behaves as expected.

It also exposed two problems, and this plan fixes both:

- **Flaky test startup:** two Testcontainers fixtures starting in parallel intermittently fail with "No such container". The fix is one fixture that starts both containers in sequence.
- **Mismatched EF Core versions:** the Npgsql provider pulls EF Core 10.0.4 while the design tools use 10.0.12. The fix is central transitive pinning.

## Global Constraints

- **Where commands run:** every backend command runs from `backend/`, and every frontend command from `frontend/`. Docker Desktop must be running for integration tests. On this SDK, run one test project with `dotnet test --project <path>`; a bare positional path runs zero tests.
- **Package versions:** they live only in `backend/Directory.Packages.props`, and a `<PackageReference>` never carries `Version`. Warnings are errors, so tests pass `TestContext.Current.CancellationToken` to any call that accepts a token.
- **Module layout:** each module lives at `backend/src/Modules/<Name>/Airbnb.Modules.<Name>/` and references only `Airbnb.SharedKernel`. A module never references another module (Contracts arrive in phase 4), the Api, or the MigrationService.
- **Module public surface:** each module exposes exactly one public class, `<Name>Module`, with three methods:
  - `Add<Name>Module(IHostApplicationBuilder)`, which calls `Add<Name>ModuleDatabase`, `services.AddValidation()` and registers the handlers;
  - `Add<Name>ModuleDatabase(IHostApplicationBuilder)`;
  - `Map<Name>Endpoints(IEndpointRouteBuilder)`.
- **Everything else is `internal`:** EF-generated migration classes are the only other exported types, and they are allowed.
- **Validation (spike-confirmed .NET 10 rules):**
  - Request records are declared `public` but nested inside `internal static` slice classes. The validation generator ignores `internal` types.
  - Each module calls `services.AddValidation()` itself, because the generator only registers types for `AddValidation()` calls in the same assembly.
- **DbContexts:** every module DbContext is registered through `AddModuleDbContext`, which gives it the shared `NpgsqlDataSource`, a migrations history table in the module's own schema, `UseAsyncSeeding`, and no retrying execution strategy.
- **Data:**
  - Schemas: `stays`, `experiences`, `services`, `hosts`, `reviews`.
  - Money is `numeric(10,2)`, ratings are `numeric(3,2)`, and `photos`/`amenities` are `text[]`.
  - Public IDs are unchanged (`l1`, `h1`, `e1`, `s1`, `wilmington`).
  - Lists keep the mock's order through a seeded `SortOrder` column.
  - There are no foreign keys across schemas.
- **Envelope:** every response is `{ success, data?, error?, meta? }`, camelCase, with nulls omitted. Lists carry `meta = { total, page, limit }`. `page` must be at least 1 (default 1) and `limit` must be 1–100 (default 50). `GET /api/cities` is the one list with no paging and no meta.
- **Validation limits:**

  | Input | Rule |
  |---|---|
  | Route `id` | 1–50 chars |
  | `location` | ≤ 100 chars |
  | `category` | ≤ 50 chars |
  | `minPrice`, `maxPrice` | 0–100,000 |
  | `guests` | 1–50 |
  | `bedrooms`, `beds`, `baths` | 0–50 |
  | `subjectId` | required, 1–50 chars |

  `min > max` is allowed and returns an empty list, like the mock.
- **Caching:** keys are prefixed with the module name (`stays:…`), and each entry is tagged with its module's cache tag. Entries live 1 minute in memory and 10 minutes in Redis. Redis sits behind a Polly wrapper (circuit breaker outside a 250 ms timeout). A failure becomes a cache miss and is logged.
- **Commits:** conventional commit messages that end with the line `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Commit locally only; never push.

## Review Focus

- **Redis unreachable:** endpoints still answer 200 from Postgres at normal speed. Tested in Task 3 (`Listings_are_still_served_when_redis_is_unreachable`).
- **Out-of-range query values** (`limit=0`, `limit=101`, `minPrice=-5`, `guests=0`): one 400 envelope whose error starts with the field name, not an unhandled 500. Tested in Task 3.
- **Mixed-case city** (`ASPEN`) and **`minPrice > maxPrice`:** these behave exactly like the frontend mock, a case-insensitive match and an empty list. Tested in Task 3.
- **Reviews for an unknown subject:** an empty list with 200, not a 404. **A missing `subjectId`:** a 400 naming `SubjectId`. Tested in Task 7.
- **A review date in the mock that isn't "Month YYYY":** the seed export fails with a message naming the bad value, rather than writing a wrong date. Tested in Task 1.

---

## File Structure

```text
frontend/
├── scripts/export-seed.mts                 CREATE  mock arrays → backend seed JSON; --check for CI (Task 1)
├── scripts/seed/transform.ts               CREATE  pure conversions: sortOrder, review subject/date (Task 1)
├── scripts/seed/transform.test.ts          CREATE  (Task 1)
├── package.json                            MODIFY  seed:export, seed:check scripts (Task 1)
└── tsconfig.json                           MODIFY  allowImportingTsExtensions (Task 1)
.github/workflows/ci.yml                    MODIFY  frontend job runs seed:check (Task 1)
backend/
├── Directory.Packages.props                MODIFY  EF, HybridCache, Redis, Resilience, Testcontainers.Redis, transitive pinning (Task 2, Task 3)
├── dotnet-tools.json                       CREATE  local dotnet-ef 10.0.12 (Task 3)
├── Airbnb.slnx                             MODIFY  one project per module (Tasks 3–7)
├── src/Airbnb.SharedKernel/
│   ├── Airbnb.SharedKernel.csproj          MODIFY  ASP.NET framework + EF Npgsql (Task 3)
│   ├── Paging.cs                           CREATE  defaults + ToPageAsync (Task 3)
│   └── Persistence/
│       ├── ModuleDatabase.cs               CREATE  AddModuleDbContext, DbContextMigrator, DesignTimeOptions (Task 3)
│       └── SeedData.cs                     CREATE  loads embedded seed JSON (Task 3)
├── src/Airbnb.Api/
│   ├── Airbnb.Api.csproj                   MODIFY  cache packages; module references (Tasks 2–7)
│   ├── Program.cs                          MODIFY  cache wiring; module registration + /api group (Tasks 2–7)
│   └── Caching/ResilientDistributedCache.cs CREATE Polly wrapper + registration (Task 2)
├── src/Airbnb.MigrationService/
│   ├── Airbnb.MigrationService.csproj      MODIFY  Aspire.Npgsql + module references (Tasks 3–7)
│   └── Program.cs                          MODIFY  data source + each module database (Tasks 3–7)
├── src/Modules/Stays/Airbnb.Modules.Stays/          CREATE (Task 3)
│   ├── Airbnb.Modules.Stays.csproj, StaysModule.cs
│   ├── Data/StaysDbContext.cs, Data/Migrations/*   (migrations generated by dotnet ef)
│   ├── Data/Seed/listings.json, cities.json          (generated by Task 1)
│   ├── Listings/Listing.cs, ListingDto.cs, SearchListings.cs, GetListing.cs
│   └── Cities/City.cs, GetCities.cs
├── src/Modules/Hosts/Airbnb.Modules.Hosts/          CREATE (Task 4)
│   └── csproj, HostsModule.cs, HostProfile.cs, GetHost.cs, Data/HostsDbContext.cs, Data/Migrations/*, Data/Seed/hosts.json
├── src/Modules/Experiences/Airbnb.Modules.Experiences/  CREATE (Task 5)
│   └── csproj, ExperiencesModule.cs, Experience.cs, ExperienceDto.cs, ListExperiences.cs, GetExperience.cs, Data/…
├── src/Modules/Services/Airbnb.Modules.Services/    CREATE (Task 6)
│   └── csproj, ServicesModule.cs, Service.cs, ServiceDto.cs, ListServices.cs, GetService.cs, Data/…
├── src/Modules/Reviews/Airbnb.Modules.Reviews/      CREATE (Task 7)
│   └── csproj, ReviewsModule.cs, Review.cs, ListReviews.cs, Data/…
└── tests/
    ├── Airbnb.UnitTests/Api/ResilientDistributedCacheTests.cs        CREATE (Task 2)
    ├── Airbnb.ArchitectureTests/                                      MODIFY (Task 8)
    │   ├── Airbnb.ArchitectureTests.csproj, ModuleRulesTests.cs
    └── Airbnb.Api.Tests/
        ├── Airbnb.Api.Tests.csproj                                    MODIFY (Task 2)
        ├── Infrastructure/InfrastructureFixture.cs                    CREATE, replaces PostgresFixture.cs (Task 2)
        ├── Infrastructure/ApiFactory.cs                               MODIFY (Task 2)
        ├── Infrastructure/ApiRequests.cs                              CREATE (Task 3)
        ├── HealthEndpointTests.cs, ErrorEnvelopeTests.cs,
        │   RateLimitingTests.cs, ApiDocsTests.cs                      MODIFY (Task 2)
        └── Stays/, Hosts/, Experiences/, Services/, Reviews/ …EndpointTests.cs  CREATE (Tasks 3–7)
CLAUDE.md                                   MODIFY  module conventions, migration and seed commands (Task 8)
```

---

### Task 1: Seed export script with a CI drift check

**Files:**
- Create: `frontend/scripts/seed/transform.ts`
- Create: `frontend/scripts/seed/transform.test.ts`
- Create: `frontend/scripts/export-seed.mts`
- Modify: `frontend/package.json` (scripts)
- Modify: `frontend/tsconfig.json`
- Modify: `.github/workflows/ci.yml` (frontend job)
- Create (generated): `backend/src/Modules/Stays/Airbnb.Modules.Stays/Data/Seed/listings.json`, `…/Stays/…/Data/Seed/cities.json`, `backend/src/Modules/Experiences/Airbnb.Modules.Experiences/Data/Seed/experiences.json`, `backend/src/Modules/Services/Airbnb.Modules.Services/Data/Seed/services.json`, `backend/src/Modules/Hosts/Airbnb.Modules.Hosts/Data/Seed/hosts.json`, `backend/src/Modules/Reviews/Airbnb.Modules.Reviews/Data/Seed/reviews.json`

**Interfaces:**
- Consumes: the frontend mock arrays in `frontend/lib/data/*.ts`. They contain only type imports, so Node 24 can run them directly.
- Produces: seed JSON in backend shape, used by Tasks 3–7.
  - **Listings, cities, experiences and services:** the frontend objects plus `sortOrder` (their array index).
  - **Hosts:** unchanged.
  - **Reviews:** `{ id, authorName, authorAvatar, rating, body, subjectType: "stay"|"experience", subjectId, createdAt: "YYYY-MM-01T00:00:00Z" }`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/scripts/seed/transform.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Experience, Review } from "@/lib/types";
import { toBackendReviews, toCreatedAt, withSortOrder } from "./transform";

describe("toCreatedAt", () => {
  it("turns the mock's month-year text into the first of that month in UTC", () => {
    expect(toCreatedAt("March 2026")).toBe("2026-03-01T00:00:00Z");
    expect(toCreatedAt("December 2025")).toBe("2025-12-01T00:00:00Z");
  });

  it.each(["Mar 2026", "March", "2026-03-01", ""])("rejects %j with a message naming the value", (date) => {
    expect(() => toCreatedAt(date)).toThrow(`Unexpected review date: "${date}"`);
  });
});

describe("withSortOrder", () => {
  it("adds each item's array position as sortOrder", () => {
    expect(withSortOrder([{ id: "a" }, { id: "b" }])).toEqual([
      { id: "a", sortOrder: 0 },
      { id: "b", sortOrder: 1 },
    ]);
  });
});

describe("toBackendReviews", () => {
  const review = (id: string, listingId: string): Review => ({
    id,
    listingId,
    authorName: "Sarah",
    authorAvatar: "https://images.unsplash.com/a.jpg",
    date: "March 2026",
    rating: 5,
    body: "Great",
  });
  const experiences = [{ id: "e1" }] as Experience[];

  it("types experience reviews by the experience ids and everything else as stays", () => {
    const [stay, experience] = toBackendReviews([review("l1-r1", "l1"), review("re1", "e1")], experiences);

    expect(stay).toEqual({
      id: "l1-r1",
      authorName: "Sarah",
      authorAvatar: "https://images.unsplash.com/a.jpg",
      rating: 5,
      body: "Great",
      subjectType: "stay",
      subjectId: "l1",
      createdAt: "2026-03-01T00:00:00Z",
    });
    expect(experience.subjectType).toBe("experience");
    expect(experience.subjectId).toBe("e1");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `frontend/`): `npx vitest run scripts/seed/transform.test.ts`
Expected: FAIL. `./transform` cannot be resolved.

- [ ] **Step 3: Implement the conversions**

Create `frontend/scripts/seed/transform.ts`:

```ts
import type { Experience, Review } from "@/lib/types";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// The mock stores review dates preformatted ("March 2026"); the backend stores an ISO timestamp.
export function toCreatedAt(date: string): string {
  const [month, year] = date.split(" ");
  const index = MONTHS.indexOf(month);
  if (index < 0 || !/^\d{4}$/.test(year ?? "")) throw new Error(`Unexpected review date: "${date}"`);
  return `${year}-${String(index + 1).padStart(2, "0")}-01T00:00:00Z`;
}

export function withSortOrder<T extends object>(items: readonly T[]): (T & { sortOrder: number })[] {
  return items.map((item, sortOrder) => ({ ...item, sortOrder }));
}

// The mock misuses listingId for experience reviews too; the backend stores subjectType + subjectId.
export function toBackendReviews(reviews: readonly Review[], experiences: readonly Experience[]) {
  const experienceIds = new Set(experiences.map((e) => e.id));
  return reviews.map(({ listingId, date, ...rest }) => ({
    ...rest,
    subjectType: experienceIds.has(listingId) ? "experience" : "stay",
    subjectId: listingId,
    createdAt: toCreatedAt(date),
  }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run scripts/seed/transform.test.ts`
Expected: PASS, with 7 tests.

- [ ] **Step 5: Write the export script**

Create `frontend/scripts/export-seed.mts`:

```ts
// Writes the frontend mock data as the backend modules' seed JSON (spec §6), so mock and API modes serve identical data.
// `--check` exits non-zero when the committed seed files differ from a fresh export (CI guard).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cities } from "../lib/data/cities.ts";
import { experiences } from "../lib/data/experiences.ts";
import { hosts } from "../lib/data/hosts.ts";
import { listings } from "../lib/data/listings.ts";
import { reviews } from "../lib/data/reviews.ts";
import { services } from "../lib/data/services.ts";
import { toBackendReviews, withSortOrder } from "./seed/transform.ts";

const modulesDir = fileURLToPath(new URL("../../backend/src/Modules/", import.meta.url));

const seedFiles: Record<string, unknown> = {
  "Stays/Airbnb.Modules.Stays/Data/Seed/listings.json": withSortOrder(listings),
  "Stays/Airbnb.Modules.Stays/Data/Seed/cities.json": withSortOrder(cities),
  "Experiences/Airbnb.Modules.Experiences/Data/Seed/experiences.json": withSortOrder(experiences),
  "Services/Airbnb.Modules.Services/Data/Seed/services.json": withSortOrder(services),
  "Hosts/Airbnb.Modules.Hosts/Data/Seed/hosts.json": hosts,
  "Reviews/Airbnb.Modules.Reviews/Data/Seed/reviews.json": toBackendReviews(reviews, experiences),
};

const check = process.argv.includes("--check");
const stale: string[] = [];

for (const [relativePath, data] of Object.entries(seedFiles)) {
  const target = modulesDir + relativePath;
  const json = `${JSON.stringify(data, null, 2)}\n`;
  if (check) {
    let committed = "";
    try {
      committed = readFileSync(target, "utf8").replace(/\r\n/g, "\n");
    } catch {
      // A missing file counts as stale.
    }
    if (committed !== json) stale.push(relativePath);
  } else {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, json);
    console.log(`wrote ${relativePath}`);
  }
}

if (stale.length > 0) {
  console.error(`Seed files differ from the frontend mock data (run \`npm run seed:export\`):\n  ${stale.join("\n  ")}`);
  process.exit(1);
}
```

In `frontend/package.json`, add these two entries to `"scripts"`, after `"e2e"`. Put a comma after the `"e2e"` line.

```json
    "seed:export": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/export-seed.mts",
    "seed:check": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/export-seed.mts --check"
```

In `frontend/tsconfig.json`, add `"allowImportingTsExtensions": true,` to `compilerOptions`, right after `"noEmit": true,`. It's valid because `noEmit` is on, and the script needs `.ts` import paths for Node's type stripping.

- [ ] **Step 6: Generate the seed files and prove the check works**

Run (from `frontend/`):

```bash
npm run seed:check
```

Expected: FAIL with exit code 1, listing all six seed paths, because none exist yet.

```bash
npm run seed:export
npm run seed:check
```

Expected: six `wrote …` lines, then the check exits 0 and prints nothing.

Then confirm the conversion (from the repo root):

```bash
grep -c '"subjectType": "experience"' backend/src/Modules/Reviews/Airbnb.Modules.Reviews/Data/Seed/reviews.json
```

Expected: `3`.

- [ ] **Step 7: Add the drift check to CI**

In `.github/workflows/ci.yml`, in the `frontend` job, add a step directly after `- run: npx tsc --noEmit`:

```yaml
      - run: npm run seed:check
```

- [ ] **Step 8: Verify the frontend still passes**

Run (from `frontend/`): `npx tsc --noEmit && npm run lint && npm test`
Expected: no type errors, no lint errors, and every test passes (225 existing plus 7 new).

- [ ] **Step 9: Commit**

```bash
git add frontend/scripts frontend/package.json frontend/tsconfig.json .github/workflows/ci.yml backend/src/Modules
git commit -m "feat: export the frontend mock data as backend seed JSON with a CI drift check" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: HybridCache over Redis behind a Polly wrapper; test infrastructure with Redis

**Files:**
- Modify: `backend/Directory.Packages.props`
- Create: `backend/src/Airbnb.Api/Caching/ResilientDistributedCache.cs`
- Modify: `backend/src/Airbnb.Api/Airbnb.Api.csproj`
- Modify: `backend/src/Airbnb.Api/Program.cs`
- Create: `backend/tests/Airbnb.UnitTests/Api/ResilientDistributedCacheTests.cs`
- Create: `backend/tests/Airbnb.Api.Tests/Infrastructure/InfrastructureFixture.cs`
- Delete: `backend/tests/Airbnb.Api.Tests/Infrastructure/PostgresFixture.cs`
- Modify: `backend/tests/Airbnb.Api.Tests/Infrastructure/ApiFactory.cs`
- Modify: `backend/tests/Airbnb.Api.Tests/Airbnb.Api.Tests.csproj`
- Modify: `backend/tests/Airbnb.Api.Tests/HealthEndpointTests.cs`, `ErrorEnvelopeTests.cs`, `RateLimitingTests.cs`, `ApiDocsTests.cs`

**Interfaces:**
- Consumes: the phase 1 API host. The AppHost already passes `ConnectionStrings:redis` to the API.
- Produces:
  - `HybridCache` in DI, with a 1-minute in-memory layer and a 10-minute Redis layer.
  - `IDistributedCache` is now `Airbnb.Api.Caching.ResilientDistributedCache` (internal), which wraps Aspire's Redis cache. It exposes `const string PipelineName = "redis-l2"`, `static readonly TimeSpan Timeout` (250 ms), and `static ResiliencePipelineBuilder Configure(ResiliencePipelineBuilder)`.
  - `Airbnb.Api.Tests.Infrastructure.InfrastructureFixture`, an assembly fixture exposing `string PostgresConnectionString` and `string RedisConnectionString`. Task 3 adds migration and seeding to its `InitializeAsync`.
  - `ApiFactory(InfrastructureFixture)` and `ApiFactory(string postgresConnectionString, string redisConnectionString)`.
  - The API now requires `ConnectionStrings:redis`, and `/health` includes a Redis check.

- [ ] **Step 1: Add the package versions**

In `backend/Directory.Packages.props`, replace the `API` item group with:

```xml
  <ItemGroup Label="API">
    <PackageVersion Include="Aspire.Npgsql" Version="13.5.4" />
    <PackageVersion Include="Aspire.StackExchange.Redis.DistributedCaching" Version="13.5.4" />
    <PackageVersion Include="Microsoft.AspNetCore.OpenApi" Version="10.0.12" />
    <PackageVersion Include="Microsoft.Extensions.Caching.Hybrid" Version="10.10.0" />
    <PackageVersion Include="Microsoft.Extensions.Resilience" Version="10.10.0" />
    <PackageVersion Include="Scalar.AspNetCore" Version="2.17.10" />
  </ItemGroup>
```

In the `Tests` item group, add this line after the `Testcontainers.PostgreSql` line:

```xml
    <PackageVersion Include="Testcontainers.Redis" Version="4.15.0" />
```

- [ ] **Step 2: Write the failing unit tests for the Redis wrapper**

Create `backend/tests/Airbnb.UnitTests/Api/ResilientDistributedCacheTests.cs`:

```csharp
using System.Diagnostics;
using Airbnb.Api.Caching;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Logging.Abstractions;
using Polly;

namespace Airbnb.UnitTests.Api;

public sealed class ResilientDistributedCacheTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task A_healthy_cache_passes_values_through()
    {
        var inner = new FakeCache { Value = [1, 2, 3] };

        var value = await CreateCache(inner).GetAsync("key", Ct);

        Assert.Equal([1, 2, 3], value);
    }

    [Fact]
    public async Task A_hung_cache_becomes_a_miss_within_the_timeout()
    {
        var inner = new FakeCache { Hang = true };
        var stopwatch = Stopwatch.StartNew();

        var value = await CreateCache(inner).GetAsync("key", Ct);

        Assert.Null(value);
        Assert.True(stopwatch.Elapsed < TimeSpan.FromSeconds(2), $"took {stopwatch.Elapsed}");
    }

    [Fact]
    public async Task Writes_to_a_failing_cache_are_skipped_without_throwing()
    {
        var inner = new FakeCache { Fail = true };

        await CreateCache(inner).SetAsync("key", [1], new DistributedCacheEntryOptions(), Ct);

        Assert.Equal(1, inner.Calls);
    }

    [Fact]
    public async Task Repeated_failures_open_the_circuit_so_later_calls_skip_redis()
    {
        var inner = new FakeCache { Fail = true };
        var cache = CreateCache(inner);

        for (var i = 0; i < 10; i++)
        {
            Assert.Null(await cache.GetAsync("key", Ct));
        }

        var callsWhenOpened = inner.Calls;
        Assert.Null(await cache.GetAsync("key", Ct));

        Assert.Equal(callsWhenOpened, inner.Calls);
    }

    private static ResilientDistributedCache CreateCache(IDistributedCache inner) =>
        new(inner, ResilientDistributedCache.Configure(new ResiliencePipelineBuilder()).Build(), NullLogger<ResilientDistributedCache>.Instance);

    private sealed class FakeCache : IDistributedCache
    {
        public byte[]? Value { get; init; }

        public bool Hang { get; init; }

        public bool Fail { get; init; }

        public int Calls { get; private set; }

        public byte[]? Get(string key) => throw new NotSupportedException();

        public Task<byte[]?> GetAsync(string key, CancellationToken token = default) => Respond(Value);

        public void Set(string key, byte[] value, DistributedCacheEntryOptions options) => throw new NotSupportedException();

        public Task SetAsync(string key, byte[] value, DistributedCacheEntryOptions options, CancellationToken token = default) =>
            Respond<byte[]>(null);

        public void Refresh(string key) => throw new NotSupportedException();

        public Task RefreshAsync(string key, CancellationToken token = default) => Respond<byte[]>(null);

        public void Remove(string key) => throw new NotSupportedException();

        public Task RemoveAsync(string key, CancellationToken token = default) => Respond<byte[]>(null);

        // Hang ignores cancellation on purpose: the StackExchange.Redis client does too.
        private Task<T?> Respond<T>(T? value)
        {
            Calls++;
            if (Hang) return new TaskCompletionSource<T?>().Task;
            if (Fail) return Task.FromException<T?>(new InvalidOperationException("redis down"));
            return Task.FromResult(value);
        }
    }
}
```

- [ ] **Step 3: Run them to verify they fail**

Run (from `backend/`): `dotnet test --project tests/Airbnb.UnitTests`
Expected: the build fails with `error CS0234`: `Airbnb.Api.Caching` does not exist.

- [ ] **Step 4: Implement the wrapper**

Create `backend/src/Airbnb.Api/Caching/ResilientDistributedCache.cs`:

```csharp
using Microsoft.Extensions.Caching.Distributed;
using Polly;
using Polly.CircuitBreaker;
using Polly.Registry;

namespace Airbnb.Api.Caching;

// Polly guard around HybridCache's Redis layer (spec §4): a slow or dead Redis becomes a cache miss
// (served from Postgres) instead of a request stalled until the Redis client times out.
internal sealed class ResilientDistributedCache(
    IDistributedCache inner,
    ResiliencePipeline pipeline,
    ILogger<ResilientDistributedCache> logger) : IDistributedCache
{
    public const string PipelineName = "redis-l2";
    public static readonly TimeSpan Timeout = TimeSpan.FromMilliseconds(250);

    // Circuit breaker outside, timeout inside, so timeouts count as failures.
    public static ResiliencePipelineBuilder Configure(ResiliencePipelineBuilder builder) => builder
        .AddCircuitBreaker(new CircuitBreakerStrategyOptions
        {
            FailureRatio = 0.5,
            SamplingDuration = TimeSpan.FromSeconds(10),
            MinimumThroughput = 10,
            BreakDuration = TimeSpan.FromSeconds(30),
        })
        .AddTimeout(Timeout);

    public byte[]? Get(string key) => Try(() => inner.Get(key));

    public Task<byte[]?> GetAsync(string key, CancellationToken token = default) =>
        TryAsync(ct => inner.GetAsync(key, ct), token);

    public void Set(string key, byte[] value, DistributedCacheEntryOptions options) =>
        Try(() => { inner.Set(key, value, options); return true; });

    public Task SetAsync(string key, byte[] value, DistributedCacheEntryOptions options, CancellationToken token = default) =>
        TryAsync(async ct => { await inner.SetAsync(key, value, options, ct); return true; }, token);

    public void Refresh(string key) => Try(() => { inner.Refresh(key); return true; });

    public Task RefreshAsync(string key, CancellationToken token = default) =>
        TryAsync(async ct => { await inner.RefreshAsync(key, ct); return true; }, token);

    public void Remove(string key) => Try(() => { inner.Remove(key); return true; });

    public Task RemoveAsync(string key, CancellationToken token = default) =>
        TryAsync(async ct => { await inner.RemoveAsync(key, ct); return true; }, token);

    private T? Try<T>(Func<T?> operation)
    {
        try
        {
            return pipeline.Execute(operation);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            LogUnavailable(exception);
            return default;
        }
    }

    private async Task<T?> TryAsync<T>(Func<CancellationToken, Task<T?>> operation, CancellationToken token)
    {
        try
        {
            // WaitAsync makes the timeout real even when the Redis client ignores the cancellation token.
            return await pipeline.ExecuteAsync(async ct => await operation(ct).WaitAsync(ct), token);
        }
        catch (Exception exception) when (exception is not OperationCanceledException || !token.IsCancellationRequested)
        {
            LogUnavailable(exception);
            return default;
        }
    }

    // An open circuit is expected while Redis is down; log it quietly instead of once per request at Warning.
    private void LogUnavailable(Exception exception)
    {
        if (exception is BrokenCircuitException)
        {
            logger.LogDebug("Redis cache circuit is open; treating as a cache miss");
        }
        else
        {
            logger.LogWarning(exception, "Redis cache unavailable; treating as a cache miss");
        }
    }
}

internal static class ResilientDistributedCacheExtensions
{
    // Wraps whatever IDistributedCache is registered (Aspire's Redis cache) with the Polly pipeline.
    public static IServiceCollection AddResilientDistributedCache(this IServiceCollection services)
    {
        services.AddResiliencePipeline(ResilientDistributedCache.PipelineName, builder => ResilientDistributedCache.Configure(builder));

        var redis = services.Last(descriptor => descriptor.ServiceType == typeof(IDistributedCache));
        services.Remove(redis);
        services.AddSingleton<IDistributedCache>(provider => new ResilientDistributedCache(
            (IDistributedCache)(redis.ImplementationInstance
                ?? redis.ImplementationFactory?.Invoke(provider)
                ?? ActivatorUtilities.CreateInstance(provider, redis.ImplementationType!)),
            provider.GetRequiredService<ResiliencePipelineProvider<string>>().GetPipeline(ResilientDistributedCache.PipelineName),
            provider.GetRequiredService<ILogger<ResilientDistributedCache>>()));

        return services;
    }
}
```

In `backend/src/Airbnb.Api/Airbnb.Api.csproj`, replace the package `ItemGroup` with:

```xml
  <ItemGroup>
    <PackageReference Include="Aspire.Npgsql" />
    <PackageReference Include="Aspire.StackExchange.Redis.DistributedCaching" />
    <PackageReference Include="Microsoft.AspNetCore.OpenApi" />
    <PackageReference Include="Microsoft.Extensions.Caching.Hybrid" />
    <PackageReference Include="Microsoft.Extensions.Resilience" />
    <PackageReference Include="Scalar.AspNetCore" />
  </ItemGroup>
```

- [ ] **Step 5: Run the unit tests to verify they pass**

Run: `dotnet test --project tests/Airbnb.UnitTests`
Expected: PASS, with `succeeded: 17` (13 existing plus 4 new).

- [ ] **Step 6: Wire HybridCache and Redis into the API**

Replace `backend/src/Airbnb.Api/Program.cs` with:

```csharp
using Airbnb.Api.Caching;
using Airbnb.Api.Errors;
using Airbnb.Api.RateLimiting;
using Microsoft.Extensions.Caching.Hybrid;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.AddNpgsqlDataSource("airbnb");

// HybridCache: 1-minute in-memory layer over a 10-minute Redis layer guarded by Polly (spec §2, §4).
builder.AddRedisDistributedCache("redis");
builder.Services.AddResilientDistributedCache();
builder.Services.AddHybridCache(options => options.DefaultEntryOptions = new HybridCacheEntryOptions
{
    Expiration = TimeSpan.FromMinutes(10),
    LocalCacheExpiration = TimeSpan.FromMinutes(1),
});

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

- [ ] **Step 7: Run the integration tests to verify they now fail**

Run: `dotnet test --project tests/Airbnb.Api.Tests`
Expected: FAIL. The API can't start because `ConnectionStrings:redis` is missing. Aspire's Redis integration throws a message naming the `redis` connection string.

- [ ] **Step 8: One fixture for both containers**

Delete `backend/tests/Airbnb.Api.Tests/Infrastructure/PostgresFixture.cs`.

Create `backend/tests/Airbnb.Api.Tests/Infrastructure/InfrastructureFixture.cs`:

```csharp
using Airbnb.Api.Tests.Infrastructure;
using Testcontainers.PostgreSql;
using Testcontainers.Redis;

[assembly: AssemblyFixture(typeof(InfrastructureFixture))]

namespace Airbnb.Api.Tests.Infrastructure;

// One Postgres and one Redis container for the whole test run; xUnit injects this into any test class constructor
// that asks for it. The containers start one after the other: starting them from two fixtures in parallel races
// Testcontainers' resource reaper and intermittently fails with "No such container".
public sealed class InfrastructureFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:18.3").Build();
    private readonly RedisContainer _redis = new RedisBuilder("redis:8.6").Build();

    public string PostgresConnectionString => _postgres.GetConnectionString();

    public string RedisConnectionString => _redis.GetConnectionString();

    public async ValueTask InitializeAsync()
    {
        await _postgres.StartAsync();
        await _redis.StartAsync();
    }

    public async ValueTask DisposeAsync()
    {
        await _redis.DisposeAsync();
        await _postgres.DisposeAsync();
    }
}
```

Replace `backend/tests/Airbnb.Api.Tests/Infrastructure/ApiFactory.cs` with:

```csharp
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Airbnb.Api.Tests.Infrastructure;

public sealed class ApiFactory(string postgresConnectionString, string redisConnectionString) : WebApplicationFactory<Program>
{
    public ApiFactory(InfrastructureFixture infrastructure)
        : this(infrastructure.PostgresConnectionString, infrastructure.RedisConnectionString)
    {
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder) => builder
        .UseSetting("ConnectionStrings:airbnb", postgresConnectionString)
        .UseSetting("ConnectionStrings:redis", redisConnectionString);
}
```

In `backend/tests/Airbnb.Api.Tests/Airbnb.Api.Tests.csproj`, add after the `Testcontainers.PostgreSql` reference:

```xml
    <PackageReference Include="Testcontainers.Redis" />
```

- [ ] **Step 9: Point the existing tests at the new fixture**

In each of `ApiDocsTests.cs`, `ErrorEnvelopeTests.cs` and `RateLimitingTests.cs` (in `backend/tests/Airbnb.Api.Tests/`):
- replace the constructor parameter `(PostgresFixture postgres)` with `(InfrastructureFixture infrastructure)`;
- replace every `new ApiFactory(postgres.ConnectionString)` with `new ApiFactory(infrastructure)`.

In `HealthEndpointTests.cs`:
- replace `(PostgresFixture postgres)` with `(InfrastructureFixture infrastructure)`;
- replace `GetAsync(postgres.ConnectionString, "/health")` with `GetAsync(infrastructure.PostgresConnectionString, "/health")`;
- in the helper, change `private static async Task<(HttpStatusCode Status, string Body)> GetAsync(` to `private async Task<(HttpStatusCode Status, string Body)> GetAsync(`, because it now reads the fixture;
- inside the helper, replace `new ApiFactory(connectionString)` with `new ApiFactory(connectionString, infrastructure.RedisConnectionString)`.

Then confirm (from `backend/`) that nothing refers to the old fixture: `grep -rn "PostgresFixture\|postgres\.ConnectionString" tests --include=*.cs` must print nothing.

- [ ] **Step 10: Run all tests to verify they pass**

Run: `dotnet test`
Expected: PASS, with unit 17, architecture 1, integration 13. `Health_is_healthy_when_postgres_is_reachable` still passes because both the Postgres and Redis checks are healthy.

- [ ] **Step 11: Commit**

```bash
git add backend/Directory.Packages.props backend/src/Airbnb.Api backend/tests
git commit -m "feat: cache through HybridCache with a Polly-guarded Redis layer" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Shared persistence and the Stays module (listings and cities)

**Files:**
- Modify: `backend/Directory.Packages.props`
- Create: `backend/dotnet-tools.json` (via `dotnet new tool-manifest`)
- Modify: `backend/src/Airbnb.SharedKernel/Airbnb.SharedKernel.csproj`
- Create: `backend/src/Airbnb.SharedKernel/Paging.cs`
- Create: `backend/src/Airbnb.SharedKernel/Persistence/ModuleDatabase.cs`
- Create: `backend/src/Airbnb.SharedKernel/Persistence/SeedData.cs`
- Create: `backend/src/Modules/Stays/Airbnb.Modules.Stays/Airbnb.Modules.Stays.csproj`
- Create: `backend/src/Modules/Stays/Airbnb.Modules.Stays/StaysModule.cs`
- Create: `backend/src/Modules/Stays/Airbnb.Modules.Stays/Data/StaysDbContext.cs`
- Create (generated): `backend/src/Modules/Stays/Airbnb.Modules.Stays/Data/Migrations/*`
- Create: `backend/src/Modules/Stays/Airbnb.Modules.Stays/Listings/Listing.cs`, `ListingDto.cs`, `SearchListings.cs`, `GetListing.cs`
- Create: `backend/src/Modules/Stays/Airbnb.Modules.Stays/Cities/City.cs`, `GetCities.cs`
- Modify: `backend/src/Airbnb.Api/Airbnb.Api.csproj`, `Program.cs`
- Modify: `backend/src/Airbnb.MigrationService/Airbnb.MigrationService.csproj`, `Program.cs`
- Modify: `backend/tests/Airbnb.Api.Tests/Infrastructure/InfrastructureFixture.cs`
- Create: `backend/tests/Airbnb.Api.Tests/Infrastructure/ApiRequests.cs`
- Create: `backend/tests/Airbnb.Api.Tests/Stays/StaysEndpointTests.cs`
- Modify: `backend/Airbnb.slnx`

**Interfaces:**
- Consumes:
  - `HybridCache` (Task 2);
  - the seed JSON in `Data/Seed/` (Task 1);
  - `IModuleMigrator` and `ApiResponse`/`PageMeta` (phase 1);
  - `InfrastructureFixture` and `ApiFactory(InfrastructureFixture)` (Task 2).
- Produces, from SharedKernel (used by every later module):
  - `Airbnb.SharedKernel.Persistence.ModuleDatabase.AddModuleDbContext<TContext>(this IHostApplicationBuilder builder, string schema, Func<TContext, CancellationToken, Task> seedAsync)`.
  - `ModuleDatabase.DesignTimeOptions<TContext>(string schema)`.
  - `SeedData.Load<T>(Assembly assembly, string fileName)`.
  - `Airbnb.SharedKernel.Paging`: constants `DefaultPage = 1`, `DefaultLimit = 50`, `MaxLimit = 100`, plus `IQueryable<T>.ToPageAsync(int page, int limit, CancellationToken)`, which returns `Task<ApiResponse<IReadOnlyList<T>>>`.
- Produces, from the Stays module:
  - `StaysModule.AddStaysModule`, `AddStaysModuleDatabase` and `MapStaysEndpoints`;
  - `GET /api/listings`, `GET /api/listings/{id}` and `GET /api/cities`.
- Produces for tests:
  - `InfrastructureFixture` now migrates and seeds every registered module database in `InitializeAsync`;
  - `ApiRequests.GetJsonAsync(this InfrastructureFixture, string path)` returns `(HttpStatusCode Status, JsonElement Body)`;
  - `ApiRequests.Ids(this JsonElement envelope)` returns `string[]`.
- Pattern: the API maps module endpoints on `var api = app.MapGroup("/api");`, and later tasks add one line each.

- [ ] **Step 1: Add the EF Core packages, pinned to one version**

In `backend/Directory.Packages.props`:
- In the first `PropertyGroup`, add after `<ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>`:

```xml
    <!-- Pins transitive packages to the versions below, so EF Core stays on one version across the Npgsql provider and the design tools. -->
    <CentralPackageTransitivePinningEnabled>true</CentralPackageTransitivePinningEnabled>
```

- Add this item group before the `Tests` item group:

```xml
  <ItemGroup Label="Persistence">
    <PackageVersion Include="Microsoft.EntityFrameworkCore.Design" Version="10.0.12" />
    <PackageVersion Include="Microsoft.EntityFrameworkCore.Relational" Version="10.0.12" />
    <PackageVersion Include="Npgsql.EntityFrameworkCore.PostgreSQL" Version="10.0.3" />
  </ItemGroup>
```

Install the EF tools as a local tool (from `backend/`):

```bash
dotnet new tool-manifest
dotnet tool install dotnet-ef --version 10.0.12
```

Expected: `backend/dotnet-tools.json` now lists `dotnet-ef` 10.0.12. On .NET 10 the manifest lives in the folder itself, not in `.config/`.

- [ ] **Step 2: Add the shared persistence code to SharedKernel**

Replace `backend/src/Airbnb.SharedKernel/Airbnb.SharedKernel.csproj` with:

```xml
<Project Sdk="Microsoft.NET.Sdk">

  <ItemGroup>
    <FrameworkReference Include="Microsoft.AspNetCore.App" />
    <PackageReference Include="Npgsql.EntityFrameworkCore.PostgreSQL" />
  </ItemGroup>

</Project>
```

Create `backend/src/Airbnb.SharedKernel/Persistence/ModuleDatabase.cs`:

```csharp
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Npgsql;

namespace Airbnb.SharedKernel.Persistence;

public static class ModuleDatabase
{
    // Every module DbContext is registered the same way (spec §3): the shared NpgsqlDataSource, its own schema
    // for the migrations history table, seeding that MigrateAsync triggers, and no retrying execution strategy.
    public static IHostApplicationBuilder AddModuleDbContext<TContext>(
        this IHostApplicationBuilder builder,
        string schema,
        Func<TContext, CancellationToken, Task> seedAsync)
        where TContext : DbContext
    {
        builder.Services.AddDbContext<TContext>((services, options) => options
            .UseNpgsql(
                services.GetRequiredService<NpgsqlDataSource>(),
                npgsql => npgsql.MigrationsHistoryTable(HistoryRepository.DefaultTableName, schema))
            .UseAsyncSeeding((context, _, cancellationToken) => seedAsync((TContext)context, cancellationToken)));

        builder.Services.AddSingleton<IModuleMigrator>(services =>
            new DbContextMigrator<TContext>(services.GetRequiredService<IServiceScopeFactory>(), schema));

        return builder;
    }

    // Design-time options for `dotnet ef migrations add`: no database is contacted when generating migrations.
    public static DbContextOptions<TContext> DesignTimeOptions<TContext>(string schema)
        where TContext : DbContext =>
        new DbContextOptionsBuilder<TContext>()
            .UseNpgsql("Host=localhost;Database=design-time", npgsql => npgsql.MigrationsHistoryTable(HistoryRepository.DefaultTableName, schema))
            .Options;
}

// Singleton so the MigrationService's hosted worker can depend on it; each run gets its own scope and DbContext.
internal sealed class DbContextMigrator<TContext>(IServiceScopeFactory scopes, string module) : IModuleMigrator
    where TContext : DbContext
{
    public string Module => module;

    public async Task MigrateAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopes.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<TContext>().Database.MigrateAsync(cancellationToken);
    }
}
```

Create `backend/src/Airbnb.SharedKernel/Persistence/SeedData.cs`:

```csharp
using System.Reflection;
using System.Text.Json;

namespace Airbnb.SharedKernel.Persistence;

public static class SeedData
{
    // Reads a JSON array embedded in the calling module's assembly (generated by frontend/scripts/export-seed.mts).
    public static IReadOnlyList<T> Load<T>(Assembly assembly, string fileName)
    {
        var resource = assembly.GetManifestResourceNames().SingleOrDefault(name => name.EndsWith($".Seed.{fileName}", StringComparison.Ordinal))
            ?? throw new InvalidOperationException($"Seed file '{fileName}' is not embedded in {assembly.GetName().Name}.");

        using var stream = assembly.GetManifestResourceStream(resource)!;
        return JsonSerializer.Deserialize<List<T>>(stream, JsonSerializerOptions.Web)
            ?? throw new InvalidOperationException($"Seed file '{fileName}' is empty.");
    }
}
```

Create `backend/src/Airbnb.SharedKernel/Paging.cs`:

```csharp
using Microsoft.EntityFrameworkCore;

namespace Airbnb.SharedKernel;

public static class Paging
{
    public const int DefaultPage = 1;
    public const int DefaultLimit = 50;
    public const int MaxLimit = 100;

    // One page of an ordered query plus the { total, page, limit } meta the frontend envelope carries.
    public static async Task<ApiResponse<IReadOnlyList<T>>> ToPageAsync<T>(
        this IQueryable<T> orderedQuery, int page, int limit, CancellationToken cancellationToken)
    {
        var total = await orderedQuery.CountAsync(cancellationToken);
        var items = await orderedQuery.Skip((page - 1) * limit).Take(limit).ToListAsync(cancellationToken);
        return ApiResponse.Ok<IReadOnlyList<T>>(items, new PageMeta(total, page, limit));
    }
}
```

- [ ] **Step 3: Write the test helper and the failing Stays tests**

Create `backend/tests/Airbnb.Api.Tests/Infrastructure/ApiRequests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Airbnb.Api.Tests.Infrastructure;

public static class ApiRequests
{
    // GETs a path on a fresh API instance and returns the status code and parsed JSON body.
    public static async Task<(HttpStatusCode Status, JsonElement Body)> GetJsonAsync(this InfrastructureFixture infrastructure, string path)
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();

        using var response = await client.GetAsync(path, TestContext.Current.CancellationToken);

        return (response.StatusCode, await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken));
    }

    // The "id" of every item in an envelope's data array, in order.
    public static string[] Ids(this JsonElement envelope) =>
        envelope.GetProperty("data").EnumerateArray().Select(item => item.GetProperty("id").GetString()!).ToArray();
}
```

Create `backend/tests/Airbnb.Api.Tests/Stays/StaysEndpointTests.cs`:

```csharp
using System.Net;
using Airbnb.Api.Tests.Infrastructure;

namespace Airbnb.Api.Tests.Stays;

public sealed class StaysEndpointTests(InfrastructureFixture infrastructure)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Listings_return_every_seeded_listing_in_mock_order_with_paging_meta()
    {
        var (status, body) = await infrastructure.GetJsonAsync("/api/listings");

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal(Enumerable.Range(1, 16).Select(n => $"l{n}"), body.Ids());
        Assert.Equal(16, body.GetProperty("meta").GetProperty("total").GetInt32());
        Assert.Equal(1, body.GetProperty("meta").GetProperty("page").GetInt32());
        Assert.Equal(50, body.GetProperty("meta").GetProperty("limit").GetInt32());
    }

    [Fact]
    public async Task Listing_json_matches_the_frontend_listing_shape()
    {
        var (status, body) = await infrastructure.GetJsonAsync("/api/listings/l1");

        Assert.Equal(HttpStatusCode.OK, status);
        var listing = body.GetProperty("data");
        Assert.Equal("Cozy cabin in the pines", listing.GetProperty("title").GetString());
        Assert.Equal("Aspen", listing.GetProperty("location").GetProperty("city").GetString());
        Assert.Equal(39.19, listing.GetProperty("location").GetProperty("lat").GetDouble());
        Assert.Equal(220m, listing.GetProperty("pricePerNight").GetDecimal());
        Assert.Equal(5, listing.GetProperty("photos").GetArrayLength());
        Assert.Equal(6, listing.GetProperty("amenities").GetArrayLength());
        Assert.False(listing.TryGetProperty("sortOrder", out _));
    }

    [Theory]
    [InlineData("?location=aspen", new[] { "l1", "l6", "l8", "l15" })]
    [InlineData("?location=ASPEN&category=Cabins", new[] { "l1", "l8", "l15" })]
    [InlineData("?minPrice=300&maxPrice=400", new[] { "l4", "l13", "l16" })]
    [InlineData("?guests=8", new[] { "l2" })]
    [InlineData("?minPrice=500&maxPrice=100", new string[0])]
    public async Task Filters_match_the_mock_repository(string query, string[] expectedIds)
    {
        var (status, body) = await infrastructure.GetJsonAsync($"/api/listings{query}");

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal(expectedIds, body.Ids());
    }

    [Fact]
    public async Task Paging_returns_the_requested_slice_and_the_full_total()
    {
        var (status, body) = await infrastructure.GetJsonAsync("/api/listings?page=2&limit=5");

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal(new[] { "l6", "l7", "l8", "l9", "l10" }, body.Ids());
        Assert.Equal(16, body.GetProperty("meta").GetProperty("total").GetInt32());
    }

    [Theory]
    [InlineData("?limit=0", "Limit")]
    [InlineData("?limit=101", "Limit")]
    [InlineData("?minPrice=-5", "MinPrice")]
    [InlineData("?guests=0", "Guests")]
    public async Task Out_of_range_queries_get_the_400_envelope_naming_the_field(string query, string field)
    {
        var (status, body) = await infrastructure.GetJsonAsync($"/api/listings{query}");

        Assert.Equal(HttpStatusCode.BadRequest, status);
        Assert.False(body.GetProperty("success").GetBoolean());
        Assert.StartsWith($"{field}:", body.GetProperty("error").GetString());
    }

    [Fact]
    public async Task Unknown_listing_gets_the_404_envelope()
    {
        var (status, body) = await infrastructure.GetJsonAsync("/api/listings/l999");

        Assert.Equal(HttpStatusCode.NotFound, status);
        Assert.Equal("Listing 'l999' was not found", body.GetProperty("error").GetString());
    }

    [Fact]
    public async Task Cities_return_all_six_in_mock_order_without_paging()
    {
        var (status, body) = await infrastructure.GetJsonAsync("/api/cities");

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal(new[] { "wilmington", "athens", "aspen", "malibu", "kyoto", "lisbon" }, body.Ids());
        Assert.False(body.TryGetProperty("meta", out _));
    }

    [Fact]
    public async Task Listings_are_still_served_when_redis_is_unreachable()
    {
        await using var factory = new ApiFactory(infrastructure.PostgresConnectionString, "127.0.0.1:1,abortConnect=false,connectTimeout=200");
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/api/listings/l1", Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
```

- [ ] **Step 4: Run them to verify they fail**

Run: `dotnet test --project tests/Airbnb.Api.Tests --filter-class "Airbnb.Api.Tests.Stays.StaysEndpointTests"`
Expected: FAIL, `failed: 15`. Every `/api/listings` and `/api/cities` request returns the 404 envelope because no endpoint exists yet.

- [ ] **Step 5: Create the Stays module**

Create `backend/src/Modules/Stays/Airbnb.Modules.Stays/Airbnb.Modules.Stays.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">

  <ItemGroup>
    <FrameworkReference Include="Microsoft.AspNetCore.App" />
    <PackageReference Include="Microsoft.EntityFrameworkCore.Design" PrivateAssets="all" />
  </ItemGroup>

  <ItemGroup>
    <EmbeddedResource Include="Data\Seed\*.json" />
  </ItemGroup>

  <ItemGroup>
    <ProjectReference Include="..\..\..\Airbnb.SharedKernel\Airbnb.SharedKernel.csproj" />
  </ItemGroup>

</Project>
```

Create `backend/src/Modules/Stays/Airbnb.Modules.Stays/StaysModule.cs`:

```csharp
using Airbnb.Modules.Stays.Cities;
using Airbnb.Modules.Stays.Data;
using Airbnb.Modules.Stays.Listings;
using Airbnb.SharedKernel.Persistence;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Airbnb.Modules.Stays;

public static class StaysModule
{
    internal const string Schema = "stays";
    internal const string CacheTag = "stays";

    public static IHostApplicationBuilder AddStaysModule(this IHostApplicationBuilder builder)
    {
        builder.AddStaysModuleDatabase();
        // The validation generator only registers request types for AddValidation() calls in this assembly.
        builder.Services.AddValidation();
        builder.Services.AddScoped<SearchListings.Handler>();
        builder.Services.AddScoped<GetListing.Handler>();
        builder.Services.AddScoped<GetCities.Handler>();
        return builder;
    }

    public static IHostApplicationBuilder AddStaysModuleDatabase(this IHostApplicationBuilder builder) =>
        builder.AddModuleDbContext<StaysDbContext>(Schema, StaysDbContext.SeedAsync);

    public static IEndpointRouteBuilder MapStaysEndpoints(this IEndpointRouteBuilder api)
    {
        SearchListings.Map(api);
        GetListing.Map(api);
        GetCities.Map(api);
        return api;
    }
}
```

Create `backend/src/Modules/Stays/Airbnb.Modules.Stays/Data/StaysDbContext.cs`:

```csharp
using Airbnb.Modules.Stays.Cities;
using Airbnb.Modules.Stays.Listings;
using Airbnb.SharedKernel.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Airbnb.Modules.Stays.Data;

internal sealed class StaysDbContext(DbContextOptions<StaysDbContext> options) : DbContext(options)
{
    public DbSet<Listing> Listings => Set<Listing>();

    public DbSet<City> Cities => Set<City>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(StaysModule.Schema);

        modelBuilder.Entity<Listing>(listing =>
        {
            listing.ToTable("listings");
            listing.Property(l => l.Id).HasMaxLength(50);
            listing.ComplexProperty(l => l.Location);
            listing.Property(l => l.PricePerNight).HasPrecision(10, 2);
            listing.Property(l => l.Rating).HasPrecision(3, 2);
            listing.Property(l => l.Baths).HasPrecision(4, 1);
        });

        modelBuilder.Entity<City>(city =>
        {
            city.ToTable("cities");
            city.Property(c => c.Id).HasMaxLength(50);
        });
    }

    // Runs inside MigrateAsync; inserts only into empty tables, so restarts never duplicate data.
    internal static async Task SeedAsync(StaysDbContext db, CancellationToken cancellationToken)
    {
        if (!await db.Listings.AnyAsync(cancellationToken))
        {
            db.Listings.AddRange(SeedData.Load<Listing>(typeof(StaysDbContext).Assembly, "listings.json"));
        }

        if (!await db.Cities.AnyAsync(cancellationToken))
        {
            db.Cities.AddRange(SeedData.Load<City>(typeof(StaysDbContext).Assembly, "cities.json"));
        }

        await db.SaveChangesAsync(cancellationToken);
    }
}

// Lets `dotnet ef migrations add` build the context without a running host.
internal sealed class StaysDbContextFactory : IDesignTimeDbContextFactory<StaysDbContext>
{
    public StaysDbContext CreateDbContext(string[] args) => new(ModuleDatabase.DesignTimeOptions<StaysDbContext>(StaysModule.Schema));
}
```

Create `backend/src/Modules/Stays/Airbnb.Modules.Stays/Listings/Listing.cs`:

```csharp
namespace Airbnb.Modules.Stays.Listings;

internal sealed class Listing
{
    public required string Id { get; init; }

    public required string Title { get; init; }

    public required Location Location { get; init; }

    public required List<string> Photos { get; init; }

    public decimal PricePerNight { get; init; }

    public decimal Rating { get; init; }

    public int ReviewCount { get; init; }

    public bool IsGuestFavorite { get; init; }

    public required string HostId { get; init; }

    public required string Category { get; init; }

    public required string Description { get; init; }

    public required string PropertyType { get; init; }

    public int MaxGuests { get; init; }

    public int Bedrooms { get; init; }

    public int Beds { get; init; }

    public decimal Baths { get; init; }

    public required List<string> Amenities { get; init; }

    // Position in the frontend mock array, so lists come back in the same order (IDs like "l10" don't sort naturally).
    public int SortOrder { get; init; }
}

internal sealed class Location
{
    public required string City { get; init; }

    public required string Country { get; init; }

    public double Lat { get; init; }

    public double Lng { get; init; }
}
```

Create `backend/src/Modules/Stays/Airbnb.Modules.Stays/Listings/ListingDto.cs`:

```csharp
using System.Linq.Expressions;

namespace Airbnb.Modules.Stays.Listings;

// Wire shape of the frontend's Listing type.
internal sealed record ListingDto(
    string Id,
    string Title,
    LocationDto Location,
    IReadOnlyList<string> Photos,
    decimal PricePerNight,
    decimal Rating,
    int ReviewCount,
    bool IsGuestFavorite,
    string HostId,
    string Category,
    string Description,
    string PropertyType,
    int MaxGuests,
    int Bedrooms,
    int Beds,
    decimal Baths,
    IReadOnlyList<string> Amenities)
{
    public static readonly Expression<Func<Listing, ListingDto>> Projection = l => new ListingDto(
        l.Id,
        l.Title,
        new LocationDto(l.Location.City, l.Location.Country, l.Location.Lat, l.Location.Lng),
        l.Photos,
        l.PricePerNight,
        l.Rating,
        l.ReviewCount,
        l.IsGuestFavorite,
        l.HostId,
        l.Category,
        l.Description,
        l.PropertyType,
        l.MaxGuests,
        l.Bedrooms,
        l.Beds,
        l.Baths,
        l.Amenities);
}

internal sealed record LocationDto(string City, string Country, double Lat, double Lng);
```

Create `backend/src/Modules/Stays/Airbnb.Modules.Stays/Listings/SearchListings.cs`:

```csharp
using System.ComponentModel.DataAnnotations;
using System.Globalization;
using Airbnb.Modules.Stays.Data;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;

namespace Airbnb.Modules.Stays.Listings;

internal static class SearchListings
{
    // public for the validation generator; still invisible outside the assembly because the class is internal.
    public sealed record Query(
        [property: StringLength(100)] string? Location,
        [property: StringLength(50)] string? Category,
        [property: Range(0d, 100_000d)] decimal? MinPrice,
        [property: Range(0d, 100_000d)] decimal? MaxPrice,
        [property: Range(1, 50)] int? Guests,
        [property: Range(0, 50)] int? Bedrooms,
        [property: Range(0, 50)] int? Beds,
        [property: Range(0d, 50d)] decimal? Baths,
        [property: Range(1, int.MaxValue)] int Page = Paging.DefaultPage,
        [property: Range(1, Paging.MaxLimit)] int Limit = Paging.DefaultLimit);

    internal sealed class Handler(StaysDbContext db, HybridCache cache)
    {
        public ValueTask<ApiResponse<IReadOnlyList<ListingDto>>> HandleAsync(Query query, CancellationToken cancellationToken) =>
            cache.GetOrCreateAsync(
                CacheKey(query),
                async token => await Filter(db.Listings.AsNoTracking(), query)
                    .OrderBy(l => l.SortOrder)
                    .Select(ListingDto.Projection)
                    .ToPageAsync(query.Page, query.Limit, token),
                tags: [StaysModule.CacheTag],
                cancellationToken: cancellationToken);
    }

    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/listings", async ([AsParameters] Query query, Handler handler, CancellationToken cancellationToken) =>
            TypedResults.Ok(await handler.HandleAsync(query, cancellationToken)));

    // Same semantics as the frontend's mockListingRepository: case-insensitive exact city, exact category, inclusive ranges.
    private static IQueryable<Listing> Filter(IQueryable<Listing> listings, Query query)
    {
        if (!string.IsNullOrWhiteSpace(query.Location))
        {
            var city = query.Location.ToLowerInvariant();
            listings = listings.Where(l => l.Location.City.ToLower() == city);
        }

        if (!string.IsNullOrWhiteSpace(query.Category))
        {
            listings = listings.Where(l => l.Category == query.Category);
        }

        if (query.MinPrice is { } minPrice)
        {
            listings = listings.Where(l => l.PricePerNight >= minPrice);
        }

        if (query.MaxPrice is { } maxPrice)
        {
            listings = listings.Where(l => l.PricePerNight <= maxPrice);
        }

        if (query.Guests is { } guests)
        {
            listings = listings.Where(l => l.MaxGuests >= guests);
        }

        if (query.Bedrooms is { } bedrooms)
        {
            listings = listings.Where(l => l.Bedrooms >= bedrooms);
        }

        if (query.Beds is { } beds)
        {
            listings = listings.Where(l => l.Beds >= beds);
        }

        if (query.Baths is { } baths)
        {
            listings = listings.Where(l => l.Baths >= baths);
        }

        return listings;
    }

    private static string CacheKey(Query q) => string.Create(
        CultureInfo.InvariantCulture,
        $"stays:listings:{q.Location?.ToLowerInvariant()}|{q.Category}|{q.MinPrice}|{q.MaxPrice}|{q.Guests}|{q.Bedrooms}|{q.Beds}|{q.Baths}|{q.Page}|{q.Limit}");
}
```

Create `backend/src/Modules/Stays/Airbnb.Modules.Stays/Listings/GetListing.cs`:

```csharp
using System.ComponentModel.DataAnnotations;
using Airbnb.Modules.Stays.Data;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;

namespace Airbnb.Modules.Stays.Listings;

internal static class GetListing
{
    // public for the validation generator; still invisible outside the assembly because the class is internal.
    public sealed record Query([property: StringLength(50, MinimumLength = 1)] string Id);

    internal sealed class Handler(StaysDbContext db, HybridCache cache)
    {
        public ValueTask<ListingDto?> HandleAsync(Query query, CancellationToken cancellationToken) =>
            cache.GetOrCreateAsync(
                $"stays:listing:{query.Id}",
                async token => await db.Listings.AsNoTracking()
                    .Where(l => l.Id == query.Id)
                    .Select(ListingDto.Projection)
                    .FirstOrDefaultAsync(token),
                tags: [StaysModule.CacheTag],
                cancellationToken: cancellationToken);
    }

    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/listings/{id}", async Task<Results<Ok<ApiResponse<ListingDto>>, NotFound<ApiResponse<object>>>> (
            [AsParameters] Query query, Handler handler, CancellationToken cancellationToken) =>
            await handler.HandleAsync(query, cancellationToken) is { } listing
                ? TypedResults.Ok(ApiResponse.Ok(listing))
                : TypedResults.NotFound(ApiResponse.Fail($"Listing '{query.Id}' was not found")));
}
```

Create `backend/src/Modules/Stays/Airbnb.Modules.Stays/Cities/City.cs`:

```csharp
namespace Airbnb.Modules.Stays.Cities;

internal sealed class City
{
    public required string Id { get; init; }

    public required string Name { get; init; }

    public required string SubLabel { get; init; }

    public required string Image { get; init; }

    public int ListingCount { get; init; }

    public int SortOrder { get; init; }
}
```

Create `backend/src/Modules/Stays/Airbnb.Modules.Stays/Cities/GetCities.cs`:

```csharp
using Airbnb.Modules.Stays.Data;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;

namespace Airbnb.Modules.Stays.Cities;

// Wire shape of the frontend's City type.
internal sealed record CityDto(string Id, string Name, string SubLabel, string Image, int ListingCount);

internal static class GetCities
{
    internal sealed class Handler(StaysDbContext db, HybridCache cache)
    {
        // Curated reference data (6 rows) returned whole — the one list without paging (spec §2).
        public ValueTask<ApiResponse<IReadOnlyList<CityDto>>> HandleAsync(CancellationToken cancellationToken) =>
            cache.GetOrCreateAsync(
                "stays:cities",
                async token => ApiResponse.Ok<IReadOnlyList<CityDto>>(await db.Cities.AsNoTracking()
                    .OrderBy(c => c.SortOrder)
                    .Select(c => new CityDto(c.Id, c.Name, c.SubLabel, c.Image, c.ListingCount))
                    .ToListAsync(token)),
                tags: [StaysModule.CacheTag],
                cancellationToken: cancellationToken);
    }

    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/cities", async (Handler handler, CancellationToken cancellationToken) =>
            TypedResults.Ok(await handler.HandleAsync(cancellationToken)));
}
```

Run (from `backend/`):

```bash
dotnet sln Airbnb.slnx add src/Modules/Stays/Airbnb.Modules.Stays/Airbnb.Modules.Stays.csproj
dotnet build src/Modules/Stays/Airbnb.Modules.Stays
```

Expected: `Build succeeded.` with 0 warnings.

- [ ] **Step 6: Generate the Stays migration**

Run (from `backend/`):

```bash
dotnet ef migrations add InitialCreate --project src/Modules/Stays/Airbnb.Modules.Stays --startup-project src/Modules/Stays/Airbnb.Modules.Stays --output-dir Data/Migrations
```

Expected: `Done.` The command creates three files in `src/Modules/Stays/Airbnb.Modules.Stays/Data/Migrations/`: `<timestamp>_InitialCreate.cs`, `<timestamp>_InitialCreate.Designer.cs` and `StaysDbContextModelSnapshot.cs`.

Check the generated migration:
- it creates schema `stays` with tables `listings` and `cities`;
- `Photos` and `Amenities` are `text[]`;
- `PricePerNight` is `numeric(10,2)`, `Rating` is `numeric(3,2)` and `Baths` is `numeric(4,1)`;
- the location is stored as columns `Location_City`, `Location_Country`, `Location_Lat` and `Location_Lng`.

Do not edit the generated files.

- [ ] **Step 7: Register the module in the API, the MigrationService and the test fixture**

In `backend/src/Airbnb.Api/Airbnb.Api.csproj`, add to the `ProjectReference` item group:

```xml
    <ProjectReference Include="..\Modules\Stays\Airbnb.Modules.Stays\Airbnb.Modules.Stays.csproj" />
```

In `backend/src/Airbnb.Api/Program.cs`:
- add `using Airbnb.Modules.Stays;` after `using Airbnb.Api.RateLimiting;`;
- add `builder.AddStaysModule();` on its own line after `builder.Services.AddOpenApi();`, with a blank line before it;
- replace the final `app.Run();` with:

```csharp
var api = app.MapGroup("/api");
api.MapStaysEndpoints();

app.Run();
```

Replace `backend/src/Airbnb.MigrationService/Airbnb.MigrationService.csproj` with:

```xml
<Project Sdk="Microsoft.NET.Sdk.Worker">

  <ItemGroup>
    <InternalsVisibleTo Include="Airbnb.UnitTests" />
  </ItemGroup>

  <ItemGroup>
    <PackageReference Include="Aspire.Npgsql" />
  </ItemGroup>

  <ItemGroup>
    <ProjectReference Include="..\Airbnb.ServiceDefaults\Airbnb.ServiceDefaults.csproj" />
    <ProjectReference Include="..\Airbnb.SharedKernel\Airbnb.SharedKernel.csproj" />
    <ProjectReference Include="..\Modules\Stays\Airbnb.Modules.Stays\Airbnb.Modules.Stays.csproj" />
  </ItemGroup>

</Project>
```

Replace `backend/src/Airbnb.MigrationService/Program.cs` with:

```csharp
using Airbnb.MigrationService;
using Airbnb.Modules.Stays;

var builder = Host.CreateApplicationBuilder(args);

builder.AddServiceDefaults();
builder.AddNpgsqlDataSource("airbnb");

// Every module's database; each registers an IModuleMigrator that the worker runs.
builder.AddStaysModuleDatabase();

builder.Services.AddHostedService<MigrationWorker>();

builder.Build().Run();
```

Replace `backend/tests/Airbnb.Api.Tests/Infrastructure/InfrastructureFixture.cs` with:

```csharp
using Airbnb.Api.Tests.Infrastructure;
using Airbnb.Modules.Stays;
using Airbnb.SharedKernel;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Testcontainers.PostgreSql;
using Testcontainers.Redis;

[assembly: AssemblyFixture(typeof(InfrastructureFixture))]

namespace Airbnb.Api.Tests.Infrastructure;

// One Postgres and one Redis container for the whole test run; xUnit injects this into any test class constructor
// that asks for it. The containers start one after the other: starting them from two fixtures in parallel races
// Testcontainers' resource reaper and intermittently fails with "No such container".
public sealed class InfrastructureFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:18.3").Build();
    private readonly RedisContainer _redis = new RedisBuilder("redis:8.6").Build();

    public string PostgresConnectionString => _postgres.GetConnectionString();

    public string RedisConnectionString => _redis.GetConnectionString();

    public async ValueTask InitializeAsync()
    {
        await _postgres.StartAsync();
        await _redis.StartAsync();
        await MigrateAndSeedAsync();
    }

    public async ValueTask DisposeAsync()
    {
        await _redis.DisposeAsync();
        await _postgres.DisposeAsync();
    }

    // Migrates and seeds every module once, exactly as the MigrationService does.
    private async Task MigrateAndSeedAsync()
    {
        var builder = Host.CreateApplicationBuilder();
        builder.Configuration["ConnectionStrings:airbnb"] = PostgresConnectionString;
        builder.AddNpgsqlDataSource("airbnb");
        builder.AddStaysModuleDatabase();

        using var host = builder.Build();
        foreach (var migrator in host.Services.GetServices<IModuleMigrator>())
        {
            await migrator.MigrateAsync(CancellationToken.None);
        }
    }
}
```

- [ ] **Step 8: Run all tests to verify they pass**

Run: `dotnet build`
Expected: `Build succeeded.` with 0 warnings. If an MSB3277 EF Core version-conflict warning appears, Step 1's transitive pinning is missing.

Run: `dotnet test`
Expected: PASS, with unit 17, architecture 1, integration 28.

- [ ] **Step 9: Commit**

```bash
git add backend/Directory.Packages.props backend/dotnet-tools.json backend/Airbnb.slnx backend/src backend/tests
git commit -m "feat: add the Stays module with listings and cities read endpoints" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Hosts module

**Files:**
- Create: `backend/src/Modules/Hosts/Airbnb.Modules.Hosts/Airbnb.Modules.Hosts.csproj`
- Create: `backend/src/Modules/Hosts/Airbnb.Modules.Hosts/HostsModule.cs`, `HostProfile.cs`, `GetHost.cs`
- Create: `backend/src/Modules/Hosts/Airbnb.Modules.Hosts/Data/HostsDbContext.cs`
- Create (generated): `backend/src/Modules/Hosts/Airbnb.Modules.Hosts/Data/Migrations/*`
- Modify: `backend/src/Airbnb.Api/Airbnb.Api.csproj`, `Program.cs`
- Modify: `backend/src/Airbnb.MigrationService/Airbnb.MigrationService.csproj`, `Program.cs`
- Modify: `backend/tests/Airbnb.Api.Tests/Infrastructure/InfrastructureFixture.cs`
- Create: `backend/tests/Airbnb.Api.Tests/Hosts/HostsEndpointTests.cs`
- Modify: `backend/Airbnb.slnx`

**Interfaces:**
- Consumes (from Task 3):
  - `ModuleDatabase.AddModuleDbContext<TContext>(schema, seedAsync)`, `ModuleDatabase.DesignTimeOptions<TContext>(schema)`, `SeedData.Load<T>(assembly, fileName)`;
  - `ApiRequests.GetJsonAsync` and `InfrastructureFixture`;
  - the `/api` group in `Program.cs`;
  - `hosts.json` (from Task 1).
- Produces: `HostsModule.AddHostsModule`, `AddHostsModuleDatabase` and `MapHostsEndpoints`; `GET /api/hosts/{id}` returns the frontend `Host` shape `{ id, name, avatar, isSuperhost, responseRate, joinedYear }`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/Airbnb.Api.Tests/Hosts/HostsEndpointTests.cs`:

```csharp
using System.Net;
using Airbnb.Api.Tests.Infrastructure;

namespace Airbnb.Api.Tests.Hosts;

public sealed class HostsEndpointTests(InfrastructureFixture infrastructure)
{
    [Fact]
    public async Task Host_json_matches_the_frontend_host_shape()
    {
        var (status, body) = await infrastructure.GetJsonAsync("/api/hosts/h1");

        Assert.Equal(HttpStatusCode.OK, status);
        var host = body.GetProperty("data");
        Assert.Equal("h1", host.GetProperty("id").GetString());
        Assert.Equal("Maya", host.GetProperty("name").GetString());
        Assert.StartsWith("https://images.unsplash.com/", host.GetProperty("avatar").GetString());
        Assert.True(host.GetProperty("isSuperhost").GetBoolean());
        Assert.Equal(100, host.GetProperty("responseRate").GetInt32());
        Assert.Equal(2016, host.GetProperty("joinedYear").GetInt32());
    }

    [Fact]
    public async Task Unknown_host_gets_the_404_envelope()
    {
        var (status, body) = await infrastructure.GetJsonAsync("/api/hosts/h999");

        Assert.Equal(HttpStatusCode.NotFound, status);
        Assert.Equal("Host 'h999' was not found", body.GetProperty("error").GetString());
    }

    [Fact]
    public async Task An_id_longer_than_50_characters_gets_the_400_envelope()
    {
        var (status, body) = await infrastructure.GetJsonAsync($"/api/hosts/{new string('h', 51)}");

        Assert.Equal(HttpStatusCode.BadRequest, status);
        Assert.StartsWith("Id:", body.GetProperty("error").GetString());
    }
}
```

- [ ] **Step 2: Run them to verify they fail**

Run: `dotnet test --project tests/Airbnb.Api.Tests --filter-class "Airbnb.Api.Tests.Hosts.HostsEndpointTests"`
Expected: FAIL, `failed: 3`. Without the endpoint every request returns the generic 404 envelope (`"error":"Not Found"`), so the host request, the long-id request, and the exact-message check all fail.

- [ ] **Step 3: Create the module**

Create `backend/src/Modules/Hosts/Airbnb.Modules.Hosts/Airbnb.Modules.Hosts.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">

  <ItemGroup>
    <FrameworkReference Include="Microsoft.AspNetCore.App" />
    <PackageReference Include="Microsoft.EntityFrameworkCore.Design" PrivateAssets="all" />
  </ItemGroup>

  <ItemGroup>
    <EmbeddedResource Include="Data\Seed\*.json" />
  </ItemGroup>

  <ItemGroup>
    <ProjectReference Include="..\..\..\Airbnb.SharedKernel\Airbnb.SharedKernel.csproj" />
  </ItemGroup>

</Project>
```

Create `backend/src/Modules/Hosts/Airbnb.Modules.Hosts/HostsModule.cs`:

```csharp
using Airbnb.Modules.Hosts.Data;
using Airbnb.SharedKernel.Persistence;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Airbnb.Modules.Hosts;

public static class HostsModule
{
    internal const string Schema = "hosts";
    internal const string CacheTag = "hosts";

    public static IHostApplicationBuilder AddHostsModule(this IHostApplicationBuilder builder)
    {
        builder.AddHostsModuleDatabase();
        // The validation generator only registers request types for AddValidation() calls in this assembly.
        builder.Services.AddValidation();
        builder.Services.AddScoped<GetHost.Handler>();
        return builder;
    }

    public static IHostApplicationBuilder AddHostsModuleDatabase(this IHostApplicationBuilder builder) =>
        builder.AddModuleDbContext<HostsDbContext>(Schema, HostsDbContext.SeedAsync);

    public static IEndpointRouteBuilder MapHostsEndpoints(this IEndpointRouteBuilder api)
    {
        GetHost.Map(api);
        return api;
    }
}
```

Create `backend/src/Modules/Hosts/Airbnb.Modules.Hosts/HostProfile.cs`:

```csharp
namespace Airbnb.Modules.Hosts;

// Named HostProfile to avoid clashing with Microsoft.Extensions.Hosting.Host.
internal sealed class HostProfile
{
    public required string Id { get; init; }

    public required string Name { get; init; }

    public required string Avatar { get; init; }

    public bool IsSuperhost { get; init; }

    public int ResponseRate { get; init; }

    public int JoinedYear { get; init; }
}
```

Create `backend/src/Modules/Hosts/Airbnb.Modules.Hosts/GetHost.cs`:

```csharp
using System.ComponentModel.DataAnnotations;
using Airbnb.Modules.Hosts.Data;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;

namespace Airbnb.Modules.Hosts;

// Wire shape of the frontend's Host type.
internal sealed record HostDto(string Id, string Name, string Avatar, bool IsSuperhost, int ResponseRate, int JoinedYear);

internal static class GetHost
{
    // public for the validation generator; still invisible outside the assembly because the class is internal.
    public sealed record Query([property: StringLength(50, MinimumLength = 1)] string Id);

    internal sealed class Handler(HostsDbContext db, HybridCache cache)
    {
        public ValueTask<HostDto?> HandleAsync(Query query, CancellationToken cancellationToken) =>
            cache.GetOrCreateAsync(
                $"hosts:host:{query.Id}",
                async token => await db.Hosts.AsNoTracking()
                    .Where(h => h.Id == query.Id)
                    .Select(h => new HostDto(h.Id, h.Name, h.Avatar, h.IsSuperhost, h.ResponseRate, h.JoinedYear))
                    .FirstOrDefaultAsync(token),
                tags: [HostsModule.CacheTag],
                cancellationToken: cancellationToken);
    }

    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/hosts/{id}", async Task<Results<Ok<ApiResponse<HostDto>>, NotFound<ApiResponse<object>>>> (
            [AsParameters] Query query, Handler handler, CancellationToken cancellationToken) =>
            await handler.HandleAsync(query, cancellationToken) is { } host
                ? TypedResults.Ok(ApiResponse.Ok(host))
                : TypedResults.NotFound(ApiResponse.Fail($"Host '{query.Id}' was not found")));
}
```

Create `backend/src/Modules/Hosts/Airbnb.Modules.Hosts/Data/HostsDbContext.cs`:

```csharp
using Airbnb.SharedKernel.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Airbnb.Modules.Hosts.Data;

internal sealed class HostsDbContext(DbContextOptions<HostsDbContext> options) : DbContext(options)
{
    public DbSet<HostProfile> Hosts => Set<HostProfile>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(HostsModule.Schema);

        modelBuilder.Entity<HostProfile>(host =>
        {
            host.ToTable("hosts");
            host.Property(h => h.Id).HasMaxLength(50);
        });
    }

    // Runs inside MigrateAsync; inserts only into an empty table, so restarts never duplicate data.
    internal static async Task SeedAsync(HostsDbContext db, CancellationToken cancellationToken)
    {
        if (!await db.Hosts.AnyAsync(cancellationToken))
        {
            db.Hosts.AddRange(SeedData.Load<HostProfile>(typeof(HostsDbContext).Assembly, "hosts.json"));
            await db.SaveChangesAsync(cancellationToken);
        }
    }
}

// Lets `dotnet ef migrations add` build the context without a running host.
internal sealed class HostsDbContextFactory : IDesignTimeDbContextFactory<HostsDbContext>
{
    public HostsDbContext CreateDbContext(string[] args) => new(ModuleDatabase.DesignTimeOptions<HostsDbContext>(HostsModule.Schema));
}
```

Run (from `backend/`):

```bash
dotnet sln Airbnb.slnx add src/Modules/Hosts/Airbnb.Modules.Hosts/Airbnb.Modules.Hosts.csproj
dotnet build src/Modules/Hosts/Airbnb.Modules.Hosts
dotnet ef migrations add InitialCreate --project src/Modules/Hosts/Airbnb.Modules.Hosts --startup-project src/Modules/Hosts/Airbnb.Modules.Hosts --output-dir Data/Migrations
```

Expected: `Build succeeded.` with 0 warnings, then `Done.` The migration creates schema `hosts` with table `hosts`.

- [ ] **Step 4: Register the module**

- **API csproj:** add `<ProjectReference Include="..\Modules\Hosts\Airbnb.Modules.Hosts\Airbnb.Modules.Hosts.csproj" />` to `backend/src/Airbnb.Api/Airbnb.Api.csproj`.
- **API `Program.cs`:** in `backend/src/Airbnb.Api/Program.cs`, add `using Airbnb.Modules.Hosts;`, add `builder.AddHostsModule();` after `builder.AddStaysModule();`, and add `api.MapHostsEndpoints();` after `api.MapStaysEndpoints();`.
- **MigrationService csproj:** add the same `ProjectReference` to `backend/src/Airbnb.MigrationService/Airbnb.MigrationService.csproj`.
- **MigrationService `Program.cs`:** in `backend/src/Airbnb.MigrationService/Program.cs`, add `using Airbnb.Modules.Hosts;` and `builder.AddHostsModuleDatabase();` after `builder.AddStaysModuleDatabase();`.
- **Test fixture:** in `backend/tests/Airbnb.Api.Tests/Infrastructure/InfrastructureFixture.cs`, add `using Airbnb.Modules.Hosts;` and `builder.AddHostsModuleDatabase();` after `builder.AddStaysModuleDatabase();`.

- [ ] **Step 5: Run all tests to verify they pass**

Run: `dotnet test`
Expected: PASS, with unit 17, architecture 1, integration 31.

- [ ] **Step 6: Commit**

```bash
git add backend/Airbnb.slnx backend/src backend/tests
git commit -m "feat: add the Hosts module with the host profile read endpoint" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Experiences module

**Files:**
- Create: `backend/src/Modules/Experiences/Airbnb.Modules.Experiences/Airbnb.Modules.Experiences.csproj`
- Create: `backend/src/Modules/Experiences/Airbnb.Modules.Experiences/ExperiencesModule.cs`, `Experience.cs`, `ExperienceDto.cs`, `ListExperiences.cs`, `GetExperience.cs`
- Create: `backend/src/Modules/Experiences/Airbnb.Modules.Experiences/Data/ExperiencesDbContext.cs`
- Create (generated): `backend/src/Modules/Experiences/Airbnb.Modules.Experiences/Data/Migrations/*`
- Modify: `backend/src/Airbnb.Api/Airbnb.Api.csproj`, `Program.cs`
- Modify: `backend/src/Airbnb.MigrationService/Airbnb.MigrationService.csproj`, `Program.cs`
- Modify: `backend/tests/Airbnb.Api.Tests/Infrastructure/InfrastructureFixture.cs`
- Create: `backend/tests/Airbnb.Api.Tests/Experiences/ExperiencesEndpointTests.cs`
- Modify: `backend/Airbnb.slnx`

**Interfaces:**
- Consumes (from Task 3): `ModuleDatabase`, `SeedData`, `Paging`, `ApiRequests`, `InfrastructureFixture`, the `/api` group, and `experiences.json` (from Task 1).
- Produces:
  - `ExperiencesModule.AddExperiencesModule`, `AddExperiencesModuleDatabase` and `MapExperiencesEndpoints`;
  - `GET /api/experiences?category&page&limit` and `GET /api/experiences/{id}`, returning the frontend `Experience` shape.
- The module has its own `Location` class. Modules share no types.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/Airbnb.Api.Tests/Experiences/ExperiencesEndpointTests.cs`:

```csharp
using System.Net;
using Airbnb.Api.Tests.Infrastructure;

namespace Airbnb.Api.Tests.Experiences;

public sealed class ExperiencesEndpointTests(InfrastructureFixture infrastructure)
{
    [Fact]
    public async Task Experiences_return_all_twelve_in_mock_order_with_paging_meta()
    {
        var (status, body) = await infrastructure.GetJsonAsync("/api/experiences");

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal(Enumerable.Range(1, 12).Select(n => $"e{n}"), body.Ids());
        Assert.Equal(12, body.GetProperty("meta").GetProperty("total").GetInt32());
    }

    [Fact]
    public async Task Category_filter_matches_the_mock_repository()
    {
        var (status, body) = await infrastructure.GetJsonAsync($"/api/experiences?category={Uri.EscapeDataString("Food & drink")}");

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal(new[] { "e1", "e4", "e8", "e12" }, body.Ids());
    }

    [Fact]
    public async Task Experience_json_matches_the_frontend_experience_shape()
    {
        var (status, body) = await infrastructure.GetJsonAsync("/api/experiences/e1");

        Assert.Equal(HttpStatusCode.OK, status);
        var experience = body.GetProperty("data");
        Assert.Equal("Pasta-making with a Roman nonna", experience.GetProperty("title").GetString());
        Assert.Equal("Rome", experience.GetProperty("location").GetProperty("city").GetString());
        Assert.Equal(65m, experience.GetProperty("pricePerPerson").GetDecimal());
        Assert.Equal(3m, experience.GetProperty("durationHours").GetDecimal());
        Assert.False(experience.GetProperty("isNew").GetBoolean());
        Assert.Equal("h1", experience.GetProperty("hostId").GetString());
        Assert.False(experience.TryGetProperty("sortOrder", out _));
    }

    [Fact]
    public async Task Unknown_experience_gets_the_404_envelope()
    {
        var (status, body) = await infrastructure.GetJsonAsync("/api/experiences/e999");

        Assert.Equal(HttpStatusCode.NotFound, status);
        Assert.Equal("Experience 'e999' was not found", body.GetProperty("error").GetString());
    }

    [Fact]
    public async Task A_limit_above_100_gets_the_400_envelope()
    {
        var (status, body) = await infrastructure.GetJsonAsync("/api/experiences?limit=101");

        Assert.Equal(HttpStatusCode.BadRequest, status);
        Assert.StartsWith("Limit:", body.GetProperty("error").GetString());
    }
}
```

- [ ] **Step 2: Run them to verify they fail**

Run: `dotnet test --project tests/Airbnb.Api.Tests --filter-class "Airbnb.Api.Tests.Experiences.ExperiencesEndpointTests"`
Expected: FAIL, `failed: 5`. There are no endpoints yet.

- [ ] **Step 3: Create the module**

Create `backend/src/Modules/Experiences/Airbnb.Modules.Experiences/Airbnb.Modules.Experiences.csproj`. Its content is identical to the Hosts project file:

```xml
<Project Sdk="Microsoft.NET.Sdk">

  <ItemGroup>
    <FrameworkReference Include="Microsoft.AspNetCore.App" />
    <PackageReference Include="Microsoft.EntityFrameworkCore.Design" PrivateAssets="all" />
  </ItemGroup>

  <ItemGroup>
    <EmbeddedResource Include="Data\Seed\*.json" />
  </ItemGroup>

  <ItemGroup>
    <ProjectReference Include="..\..\..\Airbnb.SharedKernel\Airbnb.SharedKernel.csproj" />
  </ItemGroup>

</Project>
```

Create `backend/src/Modules/Experiences/Airbnb.Modules.Experiences/ExperiencesModule.cs`:

```csharp
using Airbnb.Modules.Experiences.Data;
using Airbnb.SharedKernel.Persistence;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Airbnb.Modules.Experiences;

public static class ExperiencesModule
{
    internal const string Schema = "experiences";
    internal const string CacheTag = "experiences";

    public static IHostApplicationBuilder AddExperiencesModule(this IHostApplicationBuilder builder)
    {
        builder.AddExperiencesModuleDatabase();
        // The validation generator only registers request types for AddValidation() calls in this assembly.
        builder.Services.AddValidation();
        builder.Services.AddScoped<ListExperiences.Handler>();
        builder.Services.AddScoped<GetExperience.Handler>();
        return builder;
    }

    public static IHostApplicationBuilder AddExperiencesModuleDatabase(this IHostApplicationBuilder builder) =>
        builder.AddModuleDbContext<ExperiencesDbContext>(Schema, ExperiencesDbContext.SeedAsync);

    public static IEndpointRouteBuilder MapExperiencesEndpoints(this IEndpointRouteBuilder api)
    {
        ListExperiences.Map(api);
        GetExperience.Map(api);
        return api;
    }
}
```

Create `backend/src/Modules/Experiences/Airbnb.Modules.Experiences/Experience.cs`:

```csharp
namespace Airbnb.Modules.Experiences;

internal sealed class Experience
{
    public required string Id { get; init; }

    public required string Title { get; init; }

    public required Location Location { get; init; }

    public required List<string> Photos { get; init; }

    public decimal PricePerPerson { get; init; }

    public decimal DurationHours { get; init; }

    public decimal Rating { get; init; }

    public int ReviewCount { get; init; }

    public bool IsNew { get; init; }

    public required string HostId { get; init; }

    public required string Category { get; init; }

    public required string Description { get; init; }

    // Position in the frontend mock array, so lists come back in the same order.
    public int SortOrder { get; init; }
}

internal sealed class Location
{
    public required string City { get; init; }

    public required string Country { get; init; }

    public double Lat { get; init; }

    public double Lng { get; init; }
}
```

Create `backend/src/Modules/Experiences/Airbnb.Modules.Experiences/ExperienceDto.cs`:

```csharp
using System.Linq.Expressions;

namespace Airbnb.Modules.Experiences;

// Wire shape of the frontend's Experience type.
internal sealed record ExperienceDto(
    string Id,
    string Title,
    LocationDto Location,
    IReadOnlyList<string> Photos,
    decimal PricePerPerson,
    decimal DurationHours,
    decimal Rating,
    int ReviewCount,
    bool IsNew,
    string HostId,
    string Category,
    string Description)
{
    public static readonly Expression<Func<Experience, ExperienceDto>> Projection = e => new ExperienceDto(
        e.Id,
        e.Title,
        new LocationDto(e.Location.City, e.Location.Country, e.Location.Lat, e.Location.Lng),
        e.Photos,
        e.PricePerPerson,
        e.DurationHours,
        e.Rating,
        e.ReviewCount,
        e.IsNew,
        e.HostId,
        e.Category,
        e.Description);
}

internal sealed record LocationDto(string City, string Country, double Lat, double Lng);
```

Create `backend/src/Modules/Experiences/Airbnb.Modules.Experiences/ListExperiences.cs`:

```csharp
using System.ComponentModel.DataAnnotations;
using System.Globalization;
using Airbnb.Modules.Experiences.Data;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Caching.Hybrid;

namespace Airbnb.Modules.Experiences;

internal static class ListExperiences
{
    // public for the validation generator; still invisible outside the assembly because the class is internal.
    public sealed record Query(
        [property: StringLength(50)] string? Category,
        [property: Range(1, int.MaxValue)] int Page = Paging.DefaultPage,
        [property: Range(1, Paging.MaxLimit)] int Limit = Paging.DefaultLimit);

    internal sealed class Handler(ExperiencesDbContext db, HybridCache cache)
    {
        public ValueTask<ApiResponse<IReadOnlyList<ExperienceDto>>> HandleAsync(Query query, CancellationToken cancellationToken) =>
            cache.GetOrCreateAsync(
                string.Create(CultureInfo.InvariantCulture, $"experiences:list:{query.Category}|{query.Page}|{query.Limit}"),
                async token => await db.Experiences.AsNoTracking()
                    .Where(e => string.IsNullOrWhiteSpace(query.Category) || e.Category == query.Category)
                    .OrderBy(e => e.SortOrder)
                    .Select(ExperienceDto.Projection)
                    .ToPageAsync(query.Page, query.Limit, token),
                tags: [ExperiencesModule.CacheTag],
                cancellationToken: cancellationToken);
    }

    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/experiences", async ([AsParameters] Query query, Handler handler, CancellationToken cancellationToken) =>
            TypedResults.Ok(await handler.HandleAsync(query, cancellationToken)));
}
```

Create `backend/src/Modules/Experiences/Airbnb.Modules.Experiences/GetExperience.cs`:

```csharp
using System.ComponentModel.DataAnnotations;
using Airbnb.Modules.Experiences.Data;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;

namespace Airbnb.Modules.Experiences;

internal static class GetExperience
{
    // public for the validation generator; still invisible outside the assembly because the class is internal.
    public sealed record Query([property: StringLength(50, MinimumLength = 1)] string Id);

    internal sealed class Handler(ExperiencesDbContext db, HybridCache cache)
    {
        public ValueTask<ExperienceDto?> HandleAsync(Query query, CancellationToken cancellationToken) =>
            cache.GetOrCreateAsync(
                $"experiences:experience:{query.Id}",
                async token => await db.Experiences.AsNoTracking()
                    .Where(e => e.Id == query.Id)
                    .Select(ExperienceDto.Projection)
                    .FirstOrDefaultAsync(token),
                tags: [ExperiencesModule.CacheTag],
                cancellationToken: cancellationToken);
    }

    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/experiences/{id}", async Task<Results<Ok<ApiResponse<ExperienceDto>>, NotFound<ApiResponse<object>>>> (
            [AsParameters] Query query, Handler handler, CancellationToken cancellationToken) =>
            await handler.HandleAsync(query, cancellationToken) is { } experience
                ? TypedResults.Ok(ApiResponse.Ok(experience))
                : TypedResults.NotFound(ApiResponse.Fail($"Experience '{query.Id}' was not found")));
}
```

Create `backend/src/Modules/Experiences/Airbnb.Modules.Experiences/Data/ExperiencesDbContext.cs`:

```csharp
using Airbnb.SharedKernel.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Airbnb.Modules.Experiences.Data;

internal sealed class ExperiencesDbContext(DbContextOptions<ExperiencesDbContext> options) : DbContext(options)
{
    public DbSet<Experience> Experiences => Set<Experience>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(ExperiencesModule.Schema);

        modelBuilder.Entity<Experience>(experience =>
        {
            experience.ToTable("experiences");
            experience.Property(e => e.Id).HasMaxLength(50);
            experience.ComplexProperty(e => e.Location);
            experience.Property(e => e.PricePerPerson).HasPrecision(10, 2);
            experience.Property(e => e.DurationHours).HasPrecision(4, 1);
            experience.Property(e => e.Rating).HasPrecision(3, 2);
        });
    }

    // Runs inside MigrateAsync; inserts only into an empty table, so restarts never duplicate data.
    internal static async Task SeedAsync(ExperiencesDbContext db, CancellationToken cancellationToken)
    {
        if (!await db.Experiences.AnyAsync(cancellationToken))
        {
            db.Experiences.AddRange(SeedData.Load<Experience>(typeof(ExperiencesDbContext).Assembly, "experiences.json"));
            await db.SaveChangesAsync(cancellationToken);
        }
    }
}

// Lets `dotnet ef migrations add` build the context without a running host.
internal sealed class ExperiencesDbContextFactory : IDesignTimeDbContextFactory<ExperiencesDbContext>
{
    public ExperiencesDbContext CreateDbContext(string[] args) =>
        new(ModuleDatabase.DesignTimeOptions<ExperiencesDbContext>(ExperiencesModule.Schema));
}
```

Run (from `backend/`):

```bash
dotnet sln Airbnb.slnx add src/Modules/Experiences/Airbnb.Modules.Experiences/Airbnb.Modules.Experiences.csproj
dotnet build src/Modules/Experiences/Airbnb.Modules.Experiences
dotnet ef migrations add InitialCreate --project src/Modules/Experiences/Airbnb.Modules.Experiences --startup-project src/Modules/Experiences/Airbnb.Modules.Experiences --output-dir Data/Migrations
```

Expected: `Build succeeded.` with 0 warnings, then `Done.` The migration creates schema `experiences` with table `experiences`, including the `Location_*` columns and a `text[]` `Photos` column.

- [ ] **Step 4: Register the module**

- **API csproj:** add `<ProjectReference Include="..\Modules\Experiences\Airbnb.Modules.Experiences\Airbnb.Modules.Experiences.csproj" />` to `backend/src/Airbnb.Api/Airbnb.Api.csproj`.
- **API `Program.cs`:** add `using Airbnb.Modules.Experiences;`, add `builder.AddExperiencesModule();` after `builder.AddHostsModule();`, and add `api.MapExperiencesEndpoints();` after `api.MapHostsEndpoints();`.
- **MigrationService csproj:** add the same `ProjectReference` to `backend/src/Airbnb.MigrationService/Airbnb.MigrationService.csproj`.
- **MigrationService `Program.cs`:** add `using Airbnb.Modules.Experiences;` and `builder.AddExperiencesModuleDatabase();` after `builder.AddHostsModuleDatabase();`.
- **Test fixture:** in `InfrastructureFixture.cs`, add `using Airbnb.Modules.Experiences;` and `builder.AddExperiencesModuleDatabase();` after `builder.AddHostsModuleDatabase();`.

- [ ] **Step 5: Run all tests to verify they pass**

Run: `dotnet test`
Expected: PASS, with unit 17, architecture 1, integration 36.

- [ ] **Step 6: Commit**

```bash
git add backend/Airbnb.slnx backend/src backend/tests
git commit -m "feat: add the Experiences module with list and detail read endpoints" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Services module

**Files:**
- Create: `backend/src/Modules/Services/Airbnb.Modules.Services/Airbnb.Modules.Services.csproj`
- Create: `backend/src/Modules/Services/Airbnb.Modules.Services/ServicesModule.cs`, `Service.cs`, `ServiceDto.cs`, `ListServices.cs`, `GetService.cs`
- Create: `backend/src/Modules/Services/Airbnb.Modules.Services/Data/ServicesDbContext.cs`
- Create (generated): `backend/src/Modules/Services/Airbnb.Modules.Services/Data/Migrations/*`
- Modify: `backend/src/Airbnb.Api/Airbnb.Api.csproj`, `Program.cs`
- Modify: `backend/src/Airbnb.MigrationService/Airbnb.MigrationService.csproj`, `Program.cs`
- Modify: `backend/tests/Airbnb.Api.Tests/Infrastructure/InfrastructureFixture.cs`
- Create: `backend/tests/Airbnb.Api.Tests/Services/ServicesEndpointTests.cs`
- Modify: `backend/Airbnb.slnx`

**Interfaces:**
- Consumes (from Task 3): `ModuleDatabase`, `SeedData`, `Paging`, `ApiRequests`, `InfrastructureFixture`, the `/api` group, and `services.json` (from Task 1).
- Produces:
  - `ServicesModule.AddServicesModule`, `AddServicesModuleDatabase` and `MapServicesEndpoints`;
  - `GET /api/services?category&page&limit`, where `category` matches `serviceCategory`, like the mock;
  - `GET /api/services/{id}`, returning the frontend `Service` shape.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/Airbnb.Api.Tests/Services/ServicesEndpointTests.cs`:

```csharp
using System.Net;
using Airbnb.Api.Tests.Infrastructure;

namespace Airbnb.Api.Tests.Services;

public sealed class ServicesEndpointTests(InfrastructureFixture infrastructure)
{
    [Fact]
    public async Task Services_return_all_twelve_in_mock_order_with_paging_meta()
    {
        var (status, body) = await infrastructure.GetJsonAsync("/api/services");

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal(Enumerable.Range(1, 12).Select(n => $"s{n}"), body.Ids());
        Assert.Equal(12, body.GetProperty("meta").GetProperty("total").GetInt32());
    }

    [Fact]
    public async Task Category_filter_matches_the_service_category_like_the_mock()
    {
        var (status, body) = await infrastructure.GetJsonAsync("/api/services?category=Photography");

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal(new[] { "s1", "s6", "s11" }, body.Ids());
    }

    [Fact]
    public async Task Service_json_matches_the_frontend_service_shape()
    {
        var (status, body) = await infrastructure.GetJsonAsync("/api/services/s1");

        Assert.Equal(HttpStatusCode.OK, status);
        var service = body.GetProperty("data");
        Assert.Equal("Portrait photography session", service.GetProperty("title").GetString());
        Assert.Equal("Mara Lensworth", service.GetProperty("provider").GetString());
        Assert.Equal("Photography", service.GetProperty("serviceCategory").GetString());
        Assert.Equal(180m, service.GetProperty("price").GetDecimal());
        Assert.Equal("Lisbon", service.GetProperty("city").GetString());
        Assert.False(service.TryGetProperty("sortOrder", out _));
    }

    [Fact]
    public async Task Unknown_service_gets_the_404_envelope()
    {
        var (status, body) = await infrastructure.GetJsonAsync("/api/services/s999");

        Assert.Equal(HttpStatusCode.NotFound, status);
        Assert.Equal("Service 's999' was not found", body.GetProperty("error").GetString());
    }
}
```

- [ ] **Step 2: Run them to verify they fail**

Run: `dotnet test --project tests/Airbnb.Api.Tests --filter-class "Airbnb.Api.Tests.Services.ServicesEndpointTests"`
Expected: FAIL, `failed: 4`.

- [ ] **Step 3: Create the module**

Create `backend/src/Modules/Services/Airbnb.Modules.Services/Airbnb.Modules.Services.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">

  <ItemGroup>
    <FrameworkReference Include="Microsoft.AspNetCore.App" />
    <PackageReference Include="Microsoft.EntityFrameworkCore.Design" PrivateAssets="all" />
  </ItemGroup>

  <ItemGroup>
    <EmbeddedResource Include="Data\Seed\*.json" />
  </ItemGroup>

  <ItemGroup>
    <ProjectReference Include="..\..\..\Airbnb.SharedKernel\Airbnb.SharedKernel.csproj" />
  </ItemGroup>

</Project>
```

Create `backend/src/Modules/Services/Airbnb.Modules.Services/ServicesModule.cs`:

```csharp
using Airbnb.Modules.Services.Data;
using Airbnb.SharedKernel.Persistence;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Airbnb.Modules.Services;

public static class ServicesModule
{
    internal const string Schema = "services";
    internal const string CacheTag = "services";

    public static IHostApplicationBuilder AddServicesModule(this IHostApplicationBuilder builder)
    {
        builder.AddServicesModuleDatabase();
        // The validation generator only registers request types for AddValidation() calls in this assembly.
        builder.Services.AddValidation();
        builder.Services.AddScoped<ListServices.Handler>();
        builder.Services.AddScoped<GetService.Handler>();
        return builder;
    }

    public static IHostApplicationBuilder AddServicesModuleDatabase(this IHostApplicationBuilder builder) =>
        builder.AddModuleDbContext<ServicesDbContext>(Schema, ServicesDbContext.SeedAsync);

    public static IEndpointRouteBuilder MapServicesEndpoints(this IEndpointRouteBuilder api)
    {
        ListServices.Map(api);
        GetService.Map(api);
        return api;
    }
}
```

Create `backend/src/Modules/Services/Airbnb.Modules.Services/Service.cs`:

```csharp
namespace Airbnb.Modules.Services;

internal sealed class Service
{
    public required string Id { get; init; }

    public required string Title { get; init; }

    public required string Provider { get; init; }

    public required string ServiceCategory { get; init; }

    public required List<string> Photos { get; init; }

    public decimal Price { get; init; }

    public decimal Rating { get; init; }

    public int ReviewCount { get; init; }

    public required string City { get; init; }

    public required string Description { get; init; }

    // Position in the frontend mock array, so lists come back in the same order.
    public int SortOrder { get; init; }
}
```

Create `backend/src/Modules/Services/Airbnb.Modules.Services/ServiceDto.cs`:

```csharp
using System.Linq.Expressions;

namespace Airbnb.Modules.Services;

// Wire shape of the frontend's Service type.
internal sealed record ServiceDto(
    string Id,
    string Title,
    string Provider,
    string ServiceCategory,
    IReadOnlyList<string> Photos,
    decimal Price,
    decimal Rating,
    int ReviewCount,
    string City,
    string Description)
{
    public static readonly Expression<Func<Service, ServiceDto>> Projection = s => new ServiceDto(
        s.Id, s.Title, s.Provider, s.ServiceCategory, s.Photos, s.Price, s.Rating, s.ReviewCount, s.City, s.Description);
}
```

Create `backend/src/Modules/Services/Airbnb.Modules.Services/ListServices.cs`:

```csharp
using System.ComponentModel.DataAnnotations;
using System.Globalization;
using Airbnb.Modules.Services.Data;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Caching.Hybrid;

namespace Airbnb.Modules.Services;

internal static class ListServices
{
    // public for the validation generator; still invisible outside the assembly because the class is internal.
    public sealed record Query(
        [property: StringLength(50)] string? Category,
        [property: Range(1, int.MaxValue)] int Page = Paging.DefaultPage,
        [property: Range(1, Paging.MaxLimit)] int Limit = Paging.DefaultLimit);

    internal sealed class Handler(ServicesDbContext db, HybridCache cache)
    {
        public ValueTask<ApiResponse<IReadOnlyList<ServiceDto>>> HandleAsync(Query query, CancellationToken cancellationToken) =>
            cache.GetOrCreateAsync(
                string.Create(CultureInfo.InvariantCulture, $"services:list:{query.Category}|{query.Page}|{query.Limit}"),
                async token => await db.Services.AsNoTracking()
                    .Where(s => string.IsNullOrWhiteSpace(query.Category) || s.ServiceCategory == query.Category)
                    .OrderBy(s => s.SortOrder)
                    .Select(ServiceDto.Projection)
                    .ToPageAsync(query.Page, query.Limit, token),
                tags: [ServicesModule.CacheTag],
                cancellationToken: cancellationToken);
    }

    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/services", async ([AsParameters] Query query, Handler handler, CancellationToken cancellationToken) =>
            TypedResults.Ok(await handler.HandleAsync(query, cancellationToken)));
}
```

Create `backend/src/Modules/Services/Airbnb.Modules.Services/GetService.cs`:

```csharp
using System.ComponentModel.DataAnnotations;
using Airbnb.Modules.Services.Data;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;

namespace Airbnb.Modules.Services;

internal static class GetService
{
    // public for the validation generator; still invisible outside the assembly because the class is internal.
    public sealed record Query([property: StringLength(50, MinimumLength = 1)] string Id);

    internal sealed class Handler(ServicesDbContext db, HybridCache cache)
    {
        public ValueTask<ServiceDto?> HandleAsync(Query query, CancellationToken cancellationToken) =>
            cache.GetOrCreateAsync(
                $"services:service:{query.Id}",
                async token => await db.Services.AsNoTracking()
                    .Where(s => s.Id == query.Id)
                    .Select(ServiceDto.Projection)
                    .FirstOrDefaultAsync(token),
                tags: [ServicesModule.CacheTag],
                cancellationToken: cancellationToken);
    }

    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/services/{id}", async Task<Results<Ok<ApiResponse<ServiceDto>>, NotFound<ApiResponse<object>>>> (
            [AsParameters] Query query, Handler handler, CancellationToken cancellationToken) =>
            await handler.HandleAsync(query, cancellationToken) is { } service
                ? TypedResults.Ok(ApiResponse.Ok(service))
                : TypedResults.NotFound(ApiResponse.Fail($"Service '{query.Id}' was not found")));
}
```

Create `backend/src/Modules/Services/Airbnb.Modules.Services/Data/ServicesDbContext.cs`:

```csharp
using Airbnb.SharedKernel.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Airbnb.Modules.Services.Data;

internal sealed class ServicesDbContext(DbContextOptions<ServicesDbContext> options) : DbContext(options)
{
    public DbSet<Service> Services => Set<Service>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(ServicesModule.Schema);

        modelBuilder.Entity<Service>(service =>
        {
            service.ToTable("services");
            service.Property(s => s.Id).HasMaxLength(50);
            service.Property(s => s.Price).HasPrecision(10, 2);
            service.Property(s => s.Rating).HasPrecision(3, 2);
        });
    }

    // Runs inside MigrateAsync; inserts only into an empty table, so restarts never duplicate data.
    internal static async Task SeedAsync(ServicesDbContext db, CancellationToken cancellationToken)
    {
        if (!await db.Services.AnyAsync(cancellationToken))
        {
            db.Services.AddRange(SeedData.Load<Service>(typeof(ServicesDbContext).Assembly, "services.json"));
            await db.SaveChangesAsync(cancellationToken);
        }
    }
}

// Lets `dotnet ef migrations add` build the context without a running host.
internal sealed class ServicesDbContextFactory : IDesignTimeDbContextFactory<ServicesDbContext>
{
    public ServicesDbContext CreateDbContext(string[] args) =>
        new(ModuleDatabase.DesignTimeOptions<ServicesDbContext>(ServicesModule.Schema));
}
```

Run (from `backend/`):

```bash
dotnet sln Airbnb.slnx add src/Modules/Services/Airbnb.Modules.Services/Airbnb.Modules.Services.csproj
dotnet build src/Modules/Services/Airbnb.Modules.Services
dotnet ef migrations add InitialCreate --project src/Modules/Services/Airbnb.Modules.Services --startup-project src/Modules/Services/Airbnb.Modules.Services --output-dir Data/Migrations
```

Expected: `Build succeeded.` with 0 warnings, then `Done.` The migration creates schema `services` with table `services`.

- [ ] **Step 4: Register the module**

- **API csproj:** add `<ProjectReference Include="..\Modules\Services\Airbnb.Modules.Services\Airbnb.Modules.Services.csproj" />` to `backend/src/Airbnb.Api/Airbnb.Api.csproj`.
- **API `Program.cs`:** add `using Airbnb.Modules.Services;`, add `builder.AddServicesModule();` after `builder.AddExperiencesModule();`, and add `api.MapServicesEndpoints();` after `api.MapExperiencesEndpoints();`.
- **MigrationService csproj:** add the same `ProjectReference` to `backend/src/Airbnb.MigrationService/Airbnb.MigrationService.csproj`.
- **MigrationService `Program.cs`:** add `using Airbnb.Modules.Services;` and `builder.AddServicesModuleDatabase();` after `builder.AddExperiencesModuleDatabase();`.
- **Test fixture:** in `InfrastructureFixture.cs`, add `using Airbnb.Modules.Services;` and `builder.AddServicesModuleDatabase();` after `builder.AddExperiencesModuleDatabase();`.

- [ ] **Step 5: Run all tests to verify they pass**

Run: `dotnet test`
Expected: PASS, with unit 17, architecture 1, integration 40.

- [ ] **Step 6: Commit**

```bash
git add backend/Airbnb.slnx backend/src backend/tests
git commit -m "feat: add the Services module with list and detail read endpoints" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Reviews module (read side)

**Files:**
- Create: `backend/src/Modules/Reviews/Airbnb.Modules.Reviews/Airbnb.Modules.Reviews.csproj`
- Create: `backend/src/Modules/Reviews/Airbnb.Modules.Reviews/ReviewsModule.cs`, `Review.cs`, `ListReviews.cs`
- Create: `backend/src/Modules/Reviews/Airbnb.Modules.Reviews/Data/ReviewsDbContext.cs`
- Create (generated): `backend/src/Modules/Reviews/Airbnb.Modules.Reviews/Data/Migrations/*`
- Modify: `backend/src/Airbnb.Api/Airbnb.Api.csproj`, `Program.cs`
- Modify: `backend/src/Airbnb.MigrationService/Airbnb.MigrationService.csproj`, `Program.cs`
- Modify: `backend/tests/Airbnb.Api.Tests/Infrastructure/InfrastructureFixture.cs`
- Create: `backend/tests/Airbnb.Api.Tests/Reviews/ReviewsEndpointTests.cs`
- Modify: `backend/Airbnb.slnx`

**Interfaces:**
- Consumes (from Task 3): `ModuleDatabase`, `SeedData`, `Paging`, `ApiRequests`, `InfrastructureFixture`, the `/api` group, and `reviews.json` (from Task 1).
- Produces:
  - `ReviewsModule.AddReviewsModule`, `AddReviewsModuleDatabase` and `MapReviewsEndpoints`.
  - `GET /api/reviews?subjectId&page&limit`, newest first, then by id. Each item is `{ id, subjectType, subjectId, authorName, authorAvatar, rating, body, createdAt }`, where `subjectType` is `"stay"` or `"experience"` and `createdAt` is an ISO-8601 timestamp with offset.
- Phase 4 adds `POST /api/reviews` and moves `subjectType` to an enum in `Reviews.Contracts`. Here it is a string column holding `stay` or `experience`, exactly as the seed exports it.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/Airbnb.Api.Tests/Reviews/ReviewsEndpointTests.cs`:

```csharp
using System.Net;
using Airbnb.Api.Tests.Infrastructure;

namespace Airbnb.Api.Tests.Reviews;

public sealed class ReviewsEndpointTests(InfrastructureFixture infrastructure)
{
    [Fact]
    public async Task Listing_reviews_come_newest_first_with_paging_meta()
    {
        var (status, body) = await infrastructure.GetJsonAsync("/api/reviews?subjectId=l1");

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal(new[] { "l1-r1", "l1-r2", "l1-r3", "l1-r4" }, body.Ids());
        Assert.Equal(4, body.GetProperty("meta").GetProperty("total").GetInt32());
    }

    [Fact]
    public async Task Review_json_carries_subject_and_iso_created_at()
    {
        var (status, body) = await infrastructure.GetJsonAsync("/api/reviews?subjectId=e1");

        Assert.Equal(HttpStatusCode.OK, status);
        var review = body.GetProperty("data")[0];
        Assert.Equal("re1", review.GetProperty("id").GetString());
        Assert.Equal("experience", review.GetProperty("subjectType").GetString());
        Assert.Equal("e1", review.GetProperty("subjectId").GetString());
        Assert.Equal("Priya", review.GetProperty("authorName").GetString());
        Assert.Equal(5, review.GetProperty("rating").GetInt32());
        Assert.Equal(new DateTimeOffset(2026, 3, 1, 0, 0, 0, TimeSpan.Zero), review.GetProperty("createdAt").GetDateTimeOffset());
        Assert.False(review.TryGetProperty("listingId", out _));
    }

    [Fact]
    public async Task A_subject_without_reviews_gets_an_empty_list_not_a_404()
    {
        var (status, body) = await infrastructure.GetJsonAsync("/api/reviews?subjectId=s1");

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Empty(body.Ids());
        Assert.Equal(0, body.GetProperty("meta").GetProperty("total").GetInt32());
    }

    [Fact]
    public async Task A_missing_subject_id_gets_the_400_envelope_naming_the_field()
    {
        var (status, body) = await infrastructure.GetJsonAsync("/api/reviews");

        Assert.Equal(HttpStatusCode.BadRequest, status);
        Assert.StartsWith("SubjectId:", body.GetProperty("error").GetString());
    }
}
```

- [ ] **Step 2: Run them to verify they fail**

Run: `dotnet test --project tests/Airbnb.Api.Tests --filter-class "Airbnb.Api.Tests.Reviews.ReviewsEndpointTests"`
Expected: FAIL, `failed: 4`.

- [ ] **Step 3: Create the module**

Create `backend/src/Modules/Reviews/Airbnb.Modules.Reviews/Airbnb.Modules.Reviews.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">

  <ItemGroup>
    <FrameworkReference Include="Microsoft.AspNetCore.App" />
    <PackageReference Include="Microsoft.EntityFrameworkCore.Design" PrivateAssets="all" />
  </ItemGroup>

  <ItemGroup>
    <EmbeddedResource Include="Data\Seed\*.json" />
  </ItemGroup>

  <ItemGroup>
    <ProjectReference Include="..\..\..\Airbnb.SharedKernel\Airbnb.SharedKernel.csproj" />
  </ItemGroup>

</Project>
```

Create `backend/src/Modules/Reviews/Airbnb.Modules.Reviews/ReviewsModule.cs`:

```csharp
using Airbnb.Modules.Reviews.Data;
using Airbnb.SharedKernel.Persistence;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Airbnb.Modules.Reviews;

public static class ReviewsModule
{
    internal const string Schema = "reviews";
    internal const string CacheTag = "reviews";

    public static IHostApplicationBuilder AddReviewsModule(this IHostApplicationBuilder builder)
    {
        builder.AddReviewsModuleDatabase();
        // The validation generator only registers request types for AddValidation() calls in this assembly.
        builder.Services.AddValidation();
        builder.Services.AddScoped<ListReviews.Handler>();
        return builder;
    }

    public static IHostApplicationBuilder AddReviewsModuleDatabase(this IHostApplicationBuilder builder) =>
        builder.AddModuleDbContext<ReviewsDbContext>(Schema, ReviewsDbContext.SeedAsync);

    public static IEndpointRouteBuilder MapReviewsEndpoints(this IEndpointRouteBuilder api)
    {
        ListReviews.Map(api);
        return api;
    }
}
```

Create `backend/src/Modules/Reviews/Airbnb.Modules.Reviews/Review.cs`:

```csharp
namespace Airbnb.Modules.Reviews;

internal sealed class Review
{
    public required string Id { get; init; }

    // "stay" or "experience" (phase 4 turns this into an enum in Reviews.Contracts).
    public required string SubjectType { get; init; }

    public required string SubjectId { get; init; }

    public required string AuthorName { get; init; }

    public required string AuthorAvatar { get; init; }

    public int Rating { get; init; }

    public required string Body { get; init; }

    public DateTimeOffset CreatedAt { get; init; }
}
```

Create `backend/src/Modules/Reviews/Airbnb.Modules.Reviews/ListReviews.cs`:

```csharp
using System.ComponentModel.DataAnnotations;
using System.Globalization;
using Airbnb.Modules.Reviews.Data;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Caching.Hybrid;

namespace Airbnb.Modules.Reviews;

internal sealed record ReviewDto(
    string Id,
    string SubjectType,
    string SubjectId,
    string AuthorName,
    string AuthorAvatar,
    int Rating,
    string Body,
    DateTimeOffset CreatedAt);

internal static class ListReviews
{
    // public for the validation generator; still invisible outside the assembly because the class is internal.
    // SubjectId is nullable so a missing value reaches validation and gets a field-level message.
    public sealed record Query(
        [property: Required, StringLength(50, MinimumLength = 1)] string? SubjectId,
        [property: Range(1, int.MaxValue)] int Page = Paging.DefaultPage,
        [property: Range(1, Paging.MaxLimit)] int Limit = Paging.DefaultLimit);

    internal sealed class Handler(ReviewsDbContext db, HybridCache cache)
    {
        public ValueTask<ApiResponse<IReadOnlyList<ReviewDto>>> HandleAsync(Query query, CancellationToken cancellationToken) =>
            cache.GetOrCreateAsync(
                string.Create(CultureInfo.InvariantCulture, $"reviews:list:{query.SubjectId}|{query.Page}|{query.Limit}"),
                async token => await db.Reviews.AsNoTracking()
                    .Where(r => r.SubjectId == query.SubjectId)
                    .OrderByDescending(r => r.CreatedAt)
                    .ThenBy(r => r.Id)
                    .Select(r => new ReviewDto(r.Id, r.SubjectType, r.SubjectId, r.AuthorName, r.AuthorAvatar, r.Rating, r.Body, r.CreatedAt))
                    .ToPageAsync(query.Page, query.Limit, token),
                tags: [ReviewsModule.CacheTag],
                cancellationToken: cancellationToken);
    }

    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/reviews", async ([AsParameters] Query query, Handler handler, CancellationToken cancellationToken) =>
            TypedResults.Ok(await handler.HandleAsync(query, cancellationToken)));
}
```

Create `backend/src/Modules/Reviews/Airbnb.Modules.Reviews/Data/ReviewsDbContext.cs`:

```csharp
using Airbnb.SharedKernel.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Airbnb.Modules.Reviews.Data;

internal sealed class ReviewsDbContext(DbContextOptions<ReviewsDbContext> options) : DbContext(options)
{
    public DbSet<Review> Reviews => Set<Review>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(ReviewsModule.Schema);

        modelBuilder.Entity<Review>(review =>
        {
            review.ToTable("reviews");
            review.Property(r => r.Id).HasMaxLength(50);
            review.Property(r => r.SubjectType).HasMaxLength(20);
            review.Property(r => r.SubjectId).HasMaxLength(50);
            // Serves "reviews of one subject, newest first".
            review.HasIndex(r => new { r.SubjectId, r.CreatedAt }).IsDescending(false, true);
        });
    }

    // Runs inside MigrateAsync; inserts only into an empty table, so restarts never duplicate data.
    internal static async Task SeedAsync(ReviewsDbContext db, CancellationToken cancellationToken)
    {
        if (!await db.Reviews.AnyAsync(cancellationToken))
        {
            db.Reviews.AddRange(SeedData.Load<Review>(typeof(ReviewsDbContext).Assembly, "reviews.json"));
            await db.SaveChangesAsync(cancellationToken);
        }
    }
}

// Lets `dotnet ef migrations add` build the context without a running host.
internal sealed class ReviewsDbContextFactory : IDesignTimeDbContextFactory<ReviewsDbContext>
{
    public ReviewsDbContext CreateDbContext(string[] args) =>
        new(ModuleDatabase.DesignTimeOptions<ReviewsDbContext>(ReviewsModule.Schema));
}
```

Run (from `backend/`):

```bash
dotnet sln Airbnb.slnx add src/Modules/Reviews/Airbnb.Modules.Reviews/Airbnb.Modules.Reviews.csproj
dotnet build src/Modules/Reviews/Airbnb.Modules.Reviews
dotnet ef migrations add InitialCreate --project src/Modules/Reviews/Airbnb.Modules.Reviews --startup-project src/Modules/Reviews/Airbnb.Modules.Reviews --output-dir Data/Migrations
```

Expected: `Build succeeded.` with 0 warnings, then `Done.` The migration creates schema `reviews` with table `reviews`, a `timestamp with time zone` `CreatedAt` column, and the `(SubjectId, CreatedAt DESC)` index.

- [ ] **Step 4: Register the module**

- **API csproj:** add `<ProjectReference Include="..\Modules\Reviews\Airbnb.Modules.Reviews\Airbnb.Modules.Reviews.csproj" />` to `backend/src/Airbnb.Api/Airbnb.Api.csproj`.
- **API `Program.cs`:** add `using Airbnb.Modules.Reviews;`, add `builder.AddReviewsModule();` after `builder.AddServicesModule();`, and add `api.MapReviewsEndpoints();` after `api.MapServicesEndpoints();`.
- **MigrationService csproj:** add the same `ProjectReference` to `backend/src/Airbnb.MigrationService/Airbnb.MigrationService.csproj`.
- **MigrationService `Program.cs`:** add `using Airbnb.Modules.Reviews;` and `builder.AddReviewsModuleDatabase();` after `builder.AddServicesModuleDatabase();`.
- **Test fixture:** in `InfrastructureFixture.cs`, add `using Airbnb.Modules.Reviews;` and `builder.AddReviewsModuleDatabase();` after `builder.AddServicesModuleDatabase();`.

- [ ] **Step 5: Run all tests to verify they pass**

Run: `dotnet test`
Expected: PASS, with unit 17, architecture 1, integration 44.

- [ ] **Step 6: Commit**

```bash
git add backend/Airbnb.slnx backend/src backend/tests
git commit -m "feat: add the Reviews module with the reviews-by-subject read endpoint" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Module architecture rules, docs, and full verification

**Files:**
- Modify: `backend/tests/Airbnb.ArchitectureTests/Airbnb.ArchitectureTests.csproj`
- Create: `backend/tests/Airbnb.ArchitectureTests/ModuleRulesTests.cs`
- Modify: `CLAUDE.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: all five module assemblies (Tasks 3–7).
- Produces: architecture rules that later phases extend. Phase 4 adds the Contracts exception to the dependency rule.

- [ ] **Step 1: Reference the modules from the architecture tests**

In `backend/tests/Airbnb.ArchitectureTests/Airbnb.ArchitectureTests.csproj`, replace the `ProjectReference` item group with:

```xml
  <ItemGroup>
    <ProjectReference Include="..\..\src\Airbnb.SharedKernel\Airbnb.SharedKernel.csproj" />
    <ProjectReference Include="..\..\src\Modules\Experiences\Airbnb.Modules.Experiences\Airbnb.Modules.Experiences.csproj" />
    <ProjectReference Include="..\..\src\Modules\Hosts\Airbnb.Modules.Hosts\Airbnb.Modules.Hosts.csproj" />
    <ProjectReference Include="..\..\src\Modules\Reviews\Airbnb.Modules.Reviews\Airbnb.Modules.Reviews.csproj" />
    <ProjectReference Include="..\..\src\Modules\Services\Airbnb.Modules.Services\Airbnb.Modules.Services.csproj" />
    <ProjectReference Include="..\..\src\Modules\Stays\Airbnb.Modules.Stays\Airbnb.Modules.Stays.csproj" />
  </ItemGroup>
```

- [ ] **Step 2: Write the rules**

Create `backend/tests/Airbnb.ArchitectureTests/ModuleRulesTests.cs`:

```csharp
using System.Reflection;
using Airbnb.Modules.Experiences;
using Airbnb.Modules.Hosts;
using Airbnb.Modules.Reviews;
using Airbnb.Modules.Services;
using Airbnb.Modules.Stays;
using NetArchTest.Rules;

namespace Airbnb.ArchitectureTests;

public sealed class ModuleRulesTests
{
    private static readonly Dictionary<string, Type> Modules = new()
    {
        ["Airbnb.Modules.Experiences"] = typeof(ExperiencesModule),
        ["Airbnb.Modules.Hosts"] = typeof(HostsModule),
        ["Airbnb.Modules.Reviews"] = typeof(ReviewsModule),
        ["Airbnb.Modules.Services"] = typeof(ServicesModule),
        ["Airbnb.Modules.Stays"] = typeof(StaysModule),
    };

    public static TheoryData<string> ModuleNames => new(Modules.Keys.ToArray());

    // The module class is the whole public surface; EF-generated migration classes are the only other exported types.
    [Theory]
    [MemberData(nameof(ModuleNames))]
    public void A_module_exports_only_its_module_class(string module)
    {
        var assembly = Modules[module].Assembly;

        var exported = assembly.GetExportedTypes()
            .Where(type => !(type.Namespace ?? string.Empty).EndsWith(".Data.Migrations", StringComparison.Ordinal))
            .Select(type => type.FullName)
            .ToArray();

        Assert.Equal([Modules[module].FullName], exported);
    }

    [Theory]
    [MemberData(nameof(ModuleNames))]
    public void A_module_depends_on_no_other_module_or_host(string module)
    {
        string[] forbidden = [.. Modules.Keys.Where(other => other != module), "Airbnb.Api", "Airbnb.MigrationService", "Airbnb.AppHost"];

        var result = Types.InAssembly(Modules[module].Assembly)
            .ShouldNot()
            .HaveDependencyOnAny(forbidden)
            .GetResult();

        Assert.True(
            result.IsSuccessful,
            $"{module} types with forbidden dependencies: {string.Join(", ", result.FailingTypes?.Select(t => t.FullName) ?? [])}");
    }

    [Fact]
    public void Every_module_assembly_is_covered_by_these_rules()
    {
        var moduleProjects = Directory.GetDirectories(Path.Combine(RepoBackend(), "src", "Modules"))
            .Select(directory => $"Airbnb.Modules.{Path.GetFileName(directory)}")
            .Order()
            .ToArray();

        Assert.Equal(moduleProjects, Modules.Keys.Order().ToArray());
    }

    // backend/ from this test assembly's output folder (backend/tests/Airbnb.ArchitectureTests/bin/<config>/<tfm>/).
    private static string RepoBackend() =>
        Path.GetFullPath(Path.Combine(Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location)!, "..", "..", "..", "..", ".."));
}
```

- [ ] **Step 3: Run the architecture tests**

Run: `dotnet test --project tests/Airbnb.ArchitectureTests`
Expected: PASS, `succeeded: 12`: the SharedKernel rule, 5 export rules, 5 dependency rules and the coverage guard. These rules guard future changes, so they pass on today's code.

- [ ] **Step 4: Document the module conventions**

In `CLAUDE.md`, add these bullets to the end of the `### Backend Conventions` section:

```markdown
- A module lives at `backend/src/Modules/<Name>/Airbnb.Modules.<Name>/`: `<Name>Module.cs` (the only public type — `Add<Name>Module`, `Add<Name>ModuleDatabase`, `Map<Name>Endpoints`), one file per slice (`Query` record + `Handler` + `Map`), `Data/<Name>DbContext.cs` registered through `SharedKernel.Persistence.ModuleDatabase.AddModuleDbContext`, `Data/Migrations/`, `Data/Seed/*.json`. Register a new module in `Airbnb.Api/Program.cs`, `Airbnb.MigrationService/Program.cs`, the tests' `InfrastructureFixture`, and `ModuleRulesTests`.
- Migrations (from `backend/`): `dotnet tool restore`, then `dotnet ef migrations add <Name> --project src/Modules/<M>/Airbnb.Modules.<M> --startup-project src/Modules/<M>/Airbnb.Modules.<M> --output-dir Data/Migrations`. The MigrationService applies them and each DbContext's `UseAsyncSeeding` fills empty tables.
- Seed data is generated, not hand-edited: change `frontend/lib/data/*.ts`, then `npm run seed:export` in `frontend/` (CI runs `npm run seed:check`).
- Queries are cached through `HybridCache` with keys prefixed by the module name and tagged with the module's cache tag.
```

In `README.md`, in the `## Backend` section, add this bullet to the end of the bullet list:

```markdown
- Read API (all under `/api`, try them in `/scalar`): `GET /listings`, `/listings/{id}`, `/cities`, `/experiences`, `/experiences/{id}`, `/services`, `/services/{id}`, `/hosts/{id}`, `/reviews?subjectId=…`. Data is seeded from the frontend mock (`npm run seed:export` in `frontend/` regenerates it).
```

- [ ] **Step 5: Full verification**

Run from `backend/`:

```bash
dotnet build
rm -rf TestResults
dotnet test --coverage --coverage-output-format cobertura
reportgenerator -reports:"TestResults/*.cobertura.xml" -targetdir:TestResults/report -reporttypes:TextSummary "-classfilters:-*.Generated*;-System.Runtime.CompilerServices*;-*.Data.Migrations.*"
cat TestResults/report/Summary.txt
```

Expected:
- **Build:** 0 warnings, 0 errors.
- **Tests:** unit 17, architecture 12, integration 44.
- **Coverage:** `Airbnb.SharedKernel`, `Airbnb.Api` and each `Airbnb.Modules.*` assembly show at least 80% line coverage. The filter removes source-generated classes and EF-generated migrations.

Then run the real stack (PowerShell, Docker running, from `backend/`):

```powershell
aspire start --non-interactive
aspire wait api --timeout 240 --non-interactive
(Invoke-RestMethod http://localhost:5283/api/listings).meta.total
(Invoke-RestMethod http://localhost:5283/api/cities).data.Count
(Invoke-RestMethod "http://localhost:5283/api/reviews?subjectId=l1").meta.total
aspire describe --non-interactive
aspire stop --non-interactive
```

Expected:
- the three requests print `16`, `6` and `4`;
- `aspire describe` shows `migrations` as `Finished` and `api` as `Healthy`.

The persistent Postgres container keeps its data volume, so a second `aspire start` migrates nothing and seeds nothing new.

From `frontend/`: `npm test` and `npm run seed:check` both pass.

- [ ] **Step 6: Commit**

```bash
git add backend/tests/Airbnb.ArchitectureTests CLAUDE.md README.md
git commit -m "test: enforce module boundaries and document the module conventions" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
