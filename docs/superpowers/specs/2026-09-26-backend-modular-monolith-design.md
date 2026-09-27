# Backend Modular Monolith — Design

**Date:** 2026-09-26
**Status:** Approved (design), pending spec review
**Builds on:** `2026-09-26-monorepo-restructure-design.md` (backend skeleton),
`2026-06-21-airbnb-frontend-clone-design.md` (repository seam)

## Goal

Replace the frontend's mock data with a real ASP.NET Core backend built as a
reference-quality modular monolith (vertical slices, CQRS, Polly), orchestrated
by Aspire together with the frontend, PostgreSQL, Redis and RabbitMQ. A
server-side feature flag switches the frontend between today's mock data and
the backend.

## Success criteria

1. `aspire run` starts postgres, redis, rabbitmq, the migration worker, the API
   and the frontend.
2. With the flag on (Aspire's default), every page shows the same content,
   served from Postgres through the API.
3. With the flag off (the default outside Aspire), the frontend behaves exactly
   as today and its existing tests pass unchanged.
4. One write flow — submitting a review — exercises the command side end to
   end: outbox → RabbitMQ → consumers in other modules → cache invalidation.
5. The backend has unit, architecture, integration and AppHost smoke tests; new
   code on both sides meets the 80% coverage rule.

## Context

- Frontend mock data: listings (16), hosts (16), reviews (37), cities (6),
  experiences (12), services (12). Everything is read-only; login/register and
  Reserve are UI-only.
- Current consumers: client hooks → Next `/api/{listings,experiences,services}`
  route handlers → mock repositories; the `/rooms/[id]`, `/experiences/[id]` and
  `/services/[id]` server components → mock repositories directly; the homepage
  → a static `cities` import.
- Backend: .NET 10 skeleton serving `GET /health` only.
- Tooling on the dev machine: .NET SDK 10.0.401 (plus an 11 preview, hence
  `global.json`), Aspire CLI 13.5.4, Docker Desktop, Node 24.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Runtime | .NET 10 (LTS) | Already pinned. .NET 11 is at RC1 (GA November 2026); bump later |
| Architecture | Modular monolith: one class library per module, `internal` slices | Boundaries enforced by the compiler, not just convention |
| Code organization | Vertical slice per feature: request + handler + endpoint in one file | |
| CQRS | Reads: handler injected directly, `AsNoTracking` projection to a DTO. Writes: Wolverine command handler working on domain entities | Reads gain nothing from a bus; writes need transaction + outbox middleware |
| Messaging | Wolverine 6 (MIT) with RabbitMQ transport, EF Core outbox, durable inbox | MassTransit v9 is commercial and v8 reaches end of life at the end of 2026; MediatR is commercial above its community tier |
| Database | PostgreSQL: one database `airbnb`, one schema per module | |
| Caching | HybridCache: in-memory L1 + Redis L2, tag invalidation | |
| Resilience | Polly (`Microsoft.Extensions.Resilience`) timeout + circuit breaker around Redis; Aspire's standard HTTP resilience handler | A slow or dead Redis must not stall requests |
| Validation | .NET 10 built-in Minimal API validation (DataAnnotations) | No extra library |
| Response format | The frontend's envelope `{ success, data?, error?, meta? }` for every response, errors included | Matches the frontend contract and the project's API envelope rule |
| Orchestration | Aspire 13.5, C# AppHost | |
| Migrations | Dedicated worker, `Airbnb.MigrationService` | Several DbContexts plus seeding; Aspire's `AddEFMigrations` needs one resource per context and doesn't seed |
| Feature flag | Server-only env var `DATA_SOURCE=mock\|api`, default `mock` | A quick flag; no flag service needed |
| Seed data | Exported from the frontend mock arrays by a script, drift-checked in CI | One source of truth |
| Tests | xUnit v3, Testcontainers, NetArchTest, Aspire.Hosting.Testing; Vitest on the frontend | |

## 1. Architecture

### Solution layout

```text
backend/
├── Airbnb.slnx
├── global.json                    # unchanged (SDK 10)
├── Directory.Build.props          # net10.0, nullable, implicit usings, warnings as errors
├── Directory.Packages.props       # central package versions
├── src/
│   ├── Airbnb.AppHost/            # Aspire AppHost
│   ├── Airbnb.ServiceDefaults/    # Aspire template: OpenTelemetry, health, service discovery, HTTP resilience
│   ├── Airbnb.Api/                # host: composes modules; envelope errors, validation, rate limits,
│   │                              #       OpenAPI, HybridCache + Polly-guarded Redis, Wolverine
│   ├── Airbnb.MigrationService/   # worker: migrates + seeds every module, then exits
│   ├── Airbnb.SharedKernel/       # envelope + result helpers, paging, IModuleMigrator
│   └── Modules/
│       ├── Stays/
│       │   ├── Airbnb.Modules.Stays/                  # listings + cities
│       │   └── Airbnb.Modules.Stays.Contracts/        # IListingLookup, IListingReviewStats
│       ├── Experiences/
│       │   ├── Airbnb.Modules.Experiences/
│       │   └── Airbnb.Modules.Experiences.Contracts/  # IExperienceLookup, IExperienceReviewStats
│       ├── Services/Airbnb.Modules.Services/
│       ├── Hosts/Airbnb.Modules.Hosts/
│       └── Reviews/
│           ├── Airbnb.Modules.Reviews/                # reviews + SubmitReview command
│           └── Airbnb.Modules.Reviews.Contracts/      # ReviewSubmitted, ReviewSubjectType
└── tests/
    ├── Airbnb.UnitTests/
    ├── Airbnb.ArchitectureTests/
    ├── Airbnb.Api.Tests/          # existing project; becomes the integration suite
    └── Airbnb.AppHost.Tests/
```

Inside a module (Stays shown):

```text
Airbnb.Modules.Stays/
├── StaysModule.cs                # the only public types: registration + endpoint mapping
├── Listings/
│   ├── SearchListings.cs         # slice: Query + Handler + Map
│   ├── GetListing.cs
│   ├── ListingDto.cs             # shared by both slices, with its projection expression
│   └── ListingLookup.cs          # implements Stays.Contracts.IListingLookup
├── Cities/GetCities.cs
├── Listings/ListingReviewStats.cs  # implements Stays.Contracts.IListingReviewStats (applies ReviewSubmitted)
├── Domain/                       # Listing, City
└── Data/
    ├── StaysDbContext.cs + entity configurations
    ├── Migrations/
    ├── StaysMigrator.cs          # IModuleMigrator
    └── Seed/listings.json, cities.json   # embedded resources, generated (section 6)
```

### Public surface of a module

- `AddXModule(IHostApplicationBuilder)` — everything the API needs; calls
  `AddXModuleDatabase`.
- `AddXModuleDatabase(IHostApplicationBuilder)` — DbContext + `IModuleMigrator`;
  used by the MigrationService, which must not register handlers whose
  dependencies (HybridCache, Wolverine) it doesn't have.
- `MapXEndpoints(IEndpointRouteBuilder)`.
- Its Contracts project, where one exists.

Nothing else is visible outside the assembly: `Assembly.GetExportedTypes()`
returns only the module class. Two .NET 10 validation rules, confirmed in a
spike, shape this:

- Request records are declared `public` but nested inside `internal` slice
  classes. The validation source generator ignores types declared `internal`;
  nesting keeps the records invisible outside the assembly.
- `AddXModule` calls `services.AddValidation()` itself. The generator only
  registers the request types of the assembly in which `AddValidation()` is
  called, so a single call in the API would validate nothing in the modules.

`InternalsVisibleTo` is granted to test projects only.

### Dependency rules

Enforced by the compiler (`internal`) and by architecture tests:

- A module references SharedKernel and other modules' `*.Contracts` only —
  never another module's implementation, never Api or MigrationService.
- Contracts projects reference nothing; they hold plain records and interfaces.
- SharedKernel references no module.
- Api and MigrationService reference modules.

Resulting module graph: Reviews → Stays.Contracts, Experiences.Contracts;
Stays → Reviews.Contracts; Experiences → Reviews.Contracts; Services and Hosts
depend on no other module.

### How modules talk

- **Synchronous, in-process:** Reviews checks that a review's subject exists
  through `IListingLookup` / `IExperienceLookup`.
- **Asynchronous, over RabbitMQ:** Reviews publishes `ReviewSubmitted`; handlers in the API host
  (`Airbnb.Api/Messaging/`) pass it to Stays and Experiences through `IListingReviewStats` /
  `IExperienceReviewStats`, which update each module's own copy of rating and review count. (Wolverine only
  runs public handler types, so consumers can't live inside a module whose only public type is its module class.)
- **Page assembly stays in the Next.js server:** a listing page fetches the
  listing, its host and its reviews separately, exactly as the server components
  do today. There is no backend "detail" aggregate endpoint.

### Data

- One Postgres database, `airbnb`. Schemas: `stays`, `experiences`, `services`,
  `hosts`, `reviews`, plus `wolverine` for Wolverine's outbox/inbox tables.
- Each module has its own DbContext, its own migrations, and its own migrations
  history table inside its schema. No foreign keys across schemas; modules refer
  to each other by ID only.
- Public IDs are unchanged (`l1`, `h3`, `e2`, `wilmington`…), so frontend URLs
  such as `/rooms/l1` keep working. New reviews get UUIDv7 IDs.
- Stored shapes mirror the frontend types: `Listing`, `City`, `Experience`,
  `Service`, `Host` keep every field. `location` is an EF complex type; `photos`
  and `amenities` are `text[]`; money is `numeric(10,2)`; ratings are
  `numeric(3,2)`. C# names avoid clashes with framework types (e.g. the host
  entity is `HostProfile`).
- Listings, cities, experiences and services carry a seeded `SortOrder`, so
  lists come back in the mock's order (IDs like `l10` don't sort naturally).
- Reviews store `id, subjectType (stay|experience), subjectId, authorName,
  authorAvatar, rating (1–5), body, createdAt (timestamptz)`, indexed on
  `(subjectId, createdAt desc)`.

## 2. API

### Endpoints

All under `/api`. JSON shapes match the frontend types (reviews excepted,
below), so the existing listing, experience and service Zod schemas validate
them unchanged.

| Endpoint | Module | Notes |
|---|---|---|
| `GET /listings?location&category&minPrice&maxPrice&guests&bedrooms&beds&baths&page&limit` | Stays | Same filter semantics as `mockListingRepository`: case-insensitive exact city match; `>=`/`<=` ranges |
| `GET /listings/{id}` | Stays | 404 if missing |
| `GET /cities` | Stays | Curated reference data (6 rows) returned whole — the one list without paging |
| `GET /experiences?category&page&limit` · `GET /experiences/{id}` | Experiences | |
| `GET /services?category&page&limit` · `GET /services/{id}` | Services | `category` matches `serviceCategory` |
| `GET /hosts/{id}` | Hosts | |
| `GET /reviews?subjectId&page&limit` | Reviews | Newest first |
| `POST /reviews` | Reviews | The one command (section 3) |

Also: `/health` and `/alive` from ServiceDefaults (Development only, the
template default), and in Development `/openapi/v1.json` plus the Scalar UI —
the way to submit reviews, since there is no review UI.

**Deliberate contract differences (reviews only)**, absorbed by the frontend's
HTTP adapter (section 5):

- `subjectType` + `subjectId` replace `listingId`, which the mock also uses for
  experience reviews.
- `createdAt` is an ISO timestamp instead of the preformatted `"March 2026"`.

### Envelope and JSON

- Every response body is `{ success, data?, error?, meta? }`, camelCase, with
  null members omitted (Zod's `.optional()` rejects `null`). Enums serialize as
  camelCase strings.
- Lists: `meta = { total, page, limit }`.
- Errors: `{ "success": false, "error": "<message>" }` with status 400
  (validation, message lists the failing fields), 404, 429 or 500 (generic
  message; details only in logs and traces).
- Slices return envelopes through small SharedKernel helpers. Errors the
  framework produces (built-in validation, unhandled exceptions via
  `IExceptionHandler`, status-code pages, rate-limiter rejections) are routed
  through one envelope writer plugged into ASP.NET Core's ProblemDetails
  pipeline, so they come out in the same shape.

### Validation

.NET 10 built-in validation on the request records; limits are named constants.

| Input | Rule |
|---|---|
| route `id` | 1–50 chars |
| `location` | ≤ 100 chars |
| `category` | ≤ 50 chars; any value (unknown → empty result, like the mock) |
| `minPrice`, `maxPrice` | 0–100,000; `min > max` allowed (empty result, like the mock) |
| `guests` | 1–50 |
| `bedrooms`, `beds`, `baths` | 0–50 |
| `page` | ≥ 1, default 1 |
| `limit` | 1–100, default 50 (returns all seed data while keeping every paged query bounded) |
| `subjectId` on `GET /reviews` | required, 1–50 chars |
| `POST /reviews` body | section 3 |

Only out-of-range input behaves differently from the mock: for example a
negative price or `guests=0` now gets a 400 instead of being silently accepted.

### Slice anatomy

One file per feature. Illustrative — the plan pins exact APIs:

```csharp
// Modules/Stays/Airbnb.Modules.Stays/Listings/GetListing.cs
internal static class GetListing
{
    // public for the validation generator; still invisible outside the assembly (nested)
    public sealed record Query([property: StringLength(50, MinimumLength = 1)] string Id);

    internal sealed class Handler(StaysDbContext db, HybridCache cache)
    {
        public ValueTask<ListingDto?> HandleAsync(Query query, CancellationToken ct) =>
            cache.GetOrCreateAsync(
                $"stays:listing:{query.Id}",
                async token => await db.Listings.AsNoTracking()
                    .Where(l => l.Id == query.Id)
                    .Select(ListingDto.Projection)
                    .FirstOrDefaultAsync(token),
                tags: [StaysModule.CacheTag],
                cancellationToken: ct);
    }

    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/listings/{id}", async ([AsParameters] Query query, Handler handler, CancellationToken ct) =>
            await handler.HandleAsync(query, ct) is { } listing
                ? ApiResults.Ok(listing)
                : ApiResults.NotFound($"Listing '{query.Id}' was not found"));
}
```

- The read side never loads domain entities; it projects straight to DTOs.
- Handlers are registered in DI by their module and injected into the endpoint.
  Queries don't go through a bus. The command goes through Wolverine because it
  needs the transaction and outbox middleware.

### Caching

- Keys: module + slice + normalized parameters (e.g. lower-cased location).
- L1 in-memory 1 minute, L2 Redis 10 minutes.
- One tag per module (`stays`, `experiences`, `services`, `hosts`, `reviews`);
  the write path invalidates by tag.

### Rate limiting

Built-in limiter on the `/api` group (health endpoints excluded), fixed window
per client IP: reads 600/min, writes 10/min. In API mode every browser request
reaches the backend through the Next.js server, so this is effectively a
site-wide limit until Next forwards client IPs (out of scope).

### Other

- No CORS: the browser never calls the backend directly.
- `DateTime.UtcNow` is never called directly; time comes from `TimeProvider`.

## 3. Review write flow

### `POST /api/reviews`

Body: `{ subjectType: "stay" | "experience", subjectId, authorName, rating, body }`

| Field | Rule |
|---|---|
| `subjectType` | required, `stay` or `experience` |
| `subjectId` | required, 1–50 chars |
| `authorName` | required, 1–60 chars, stored trimmed |
| `rating` | integer 1–5 |
| `body` | required, 1–1,000 chars, stored trimmed |

- **No avatar field.** The server assigns a default avatar hosted on
  `images.unsplash.com`. Accepting arbitrary URLs from anonymous callers would
  let one review break the listing page, because `next/image` throws for hosts
  not configured in `next.config.ts`.
- **Unauthenticated** until an auth spec exists; writes are limited to
  10/min/IP.
- Reviews for services are not supported (services have ratings but no review
  rows today).

### Flow

1. Built-in validation runs; the slice handler (a plain DI-registered class, like the read slices) takes over.
   Malformed bodies get the 400 envelope too.
2. It asks `IListingLookup` or `IExperienceLookup` whether the subject exists → 404 envelope if not.
3. It adds the review (UUIDv7 id, `createdAt` from `TimeProvider`, default avatar) through
   `IDbContextOutbox<ReviewsDbContext>` and publishes
   `ReviewSubmitted { reviewId, subjectType, subjectId, rating, occurredAt }`;
   `SaveChangesAndFlushMessagesAsync` commits the review row and the outgoing envelope in **one Postgres
   transaction** (outbox), then Wolverine relays the message to RabbitMQ. The endpoint then invalidates the
   `reviews` tag (after the commit, so a read can't re-cache pre-commit data) and responds **201**.
4. The API listens on the RabbitMQ queue with a durable inbox. With
   `MultipleHandlerBehavior.Separated`, Wolverine hands the message to each handler separately — own retries; one failing never blocks or re-runs
   another:
   - **Stays / Experiences:** ignore subjects that aren't theirs; otherwise, in one transaction, record the review
     id in the module's `applied_reviews` table and run one atomic statement —
     `UPDATE … SET "ReviewCount" = "ReviewCount" + 1, "Rating" = round(("Rating" * "ReviewCount" + @rating) / ("ReviewCount" + 1), 2) WHERE "Id" = @subjectId`
     — then invalidate their cache tag. No read-modify-write, so concurrent reviews can't lose updates.
5. **Duplicates:** a redelivered message finds its review id in `applied_reviews` and changes nothing.
6. **Failures:** transient database errors retry 3 times with cooldowns
   (100 ms, 500 ms, 2 s), then the message moves to Wolverine's dead-letter
   storage.

Seed ratings are the historical aggregate (l1 says 88 reviews but has 4 sample
rows), so events **increment** the counters rather than recount them.

### Transactions and retries

EF Core's retrying execution strategy (which Aspire's Npgsql integration
enables by default) cannot be combined with the transactions Wolverine opens.
Every module DbContext is registered the same way, with that strategy turned
off. Transient failures on the write path are covered by Wolverine's retry
policy; reads fail fast.

### RabbitMQ topology

Wolverine auto-provisions a durable exchange and a durable queue for
`ReviewSubmitted` at startup. Queues must be durable: RabbitMQ 4.3 (Aspire's
default image) rejects transient non-exclusive queues.

## 4. Resilience: Polly around Redis

HybridCache ignores failed Redis writes, but a hung Redis still stalls reads
until the StackExchange.Redis client times out (seconds per call).

- The Redis `IDistributedCache` used as HybridCache's L2 is wrapped in a
  decorator that runs every call through a Polly pipeline registered with
  `AddResiliencePipeline`: **250 ms timeout + circuit breaker** (opens at ≥ 50%
  failures over 10 s with at least 10 calls; stays open 30 s).
- On timeout or an open circuit: reads count as a cache miss (served from
  Postgres; L1 keeps working), writes and removals are skipped and logged.
- The circuit closes automatically once Redis responds again.

Also Polly-based: ServiceDefaults' standard resilience handler on every
`HttpClient`, ready for future outbound calls. Messaging retries are
Wolverine's own policies (section 3).

## 5. Frontend integration and the flag

### The flag

- `DATA_SOURCE` — server-only env var, `mock` (default) or `api`. Any other
  value throws a clear error.
- `API_HTTP` — backend base URL, injected by Aspire through
  `WithReference(api)`. `DATA_SOURCE=api` without it fails fast with a clear
  message.
- `npm run dev`, unit tests, e2e and CI keep running on mock data.

### One switch point

- New `lib/repositories/index.ts` exports `getRepositories()`, returning
  `{ listings, experiences, services, hosts, reviews, cities }` — mock or HTTP
  implementations of the existing repository interfaces. It reads the env on
  every call so tests can stub it.
- Callers switch from `mock*Repository` to `getRepositories()`: the three route
  handlers (`app/api/{listings,experiences,services}/route.ts`), the three
  detail pages, and the homepage.
- New `CityRepository` + `mockCityRepository`; the homepage becomes an async
  server component that loads cities through the repository, so the flag covers
  them too.
- ESLint `no-restricted-imports` forbids importing `@/lib/repositories/mock/*`
  from outside `lib/repositories/`, so nothing can bypass the flag again.
- Client code — hooks, components, `/api/*` URLs — does not change. The browser
  keeps calling Next; Next calls the backend server-side.

### HTTP repositories

In `lib/repositories/http/`, sharing one `apiFetch(path, schema)` helper:

- List URLs reuse `listingQueryString` for listings, and the same
  `category !== "All"` rule the api-client uses for experiences and services, so
  "All"/"anywhere" semantics stay identical.
- Every response is validated with Zod: the existing listing, experience and
  service schemas, plus new host, city, review-DTO and single-item envelope
  schemas.
- `findById`: 404 → `null` (pages still call `notFound()`); any other non-2xx
  or an invalid payload throws. Requests time out after 5 s and bypass Next's
  data cache (the backend caches).
- The reviews adapter maps `subjectId → listingId` and
  `createdAt → "March 2026"` using
  `Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" })`,
  so a local timezone can never shift the month.

### Parity check

Aspire pins the frontend to port 3000, and Playwright locally reuses a server
that's already running (`reuseExistingServer: !CI`). So `aspire run` followed
by `npm run e2e` runs the whole e2e suite against the real backend.

## 6. Aspire orchestration, migrations and seed data

### AppHost

Illustrative:

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

var api = builder.AddProject<Projects.Airbnb_Api>("api")
    .WithReference(db).WithReference(redis).WithReference(rabbitmq)
    .WaitFor(db).WaitFor(redis).WaitFor(rabbitmq)
    .WaitForCompletion(migrations)
    .WithHttpHealthCheck("/health");

builder.AddJavaScriptApp("frontend", "../../../frontend")
    .WithHttpEndpoint(port: 3000, env: "PORT")
    .WithReference(api)
    .WaitFor(api)
    .WithEnvironment("DATA_SOURCE", builder.Configuration["Frontend:DataSource"] ?? "api");

builder.Build().Run();
```

- The API also waits for `db` and declares `WithHttpHealthCheck("/health")`, so
  "healthy" in the dashboard means its own health checks pass.
- `backend/aspire.config.json` points the Aspire CLI at the AppHost, so
  `aspire run` works from `backend/`. `aspire start`, `aspire wait api` and
  `aspire stop` give a scriptable background check.
- Persistent containers plus a Postgres data volume make restarts fast and keep
  submitted reviews. `aspire stop --force` removes the containers; data volumes
  survive until deleted with `docker volume rm`.
- `Frontend:DataSource` in the AppHost's `appsettings.json` (default `api`)
  flips the Aspire-run frontend back to mock data.
- `AddJavaScriptApp` (stable) is used rather than `AddNextJsApp`, which is
  experimental and requires `output: "standalone"` — only relevant when
  publishing.

### ServiceDefaults

- Aspire template: OpenTelemetry (logs, metrics, traces → dashboard), health
  checks, service discovery, standard HTTP resilience.
- Wolverine's `ActivitySource` is added to tracing, so one trace shows the whole
  review flow: POST → insert + outbox → RabbitMQ → each consumer's UPDATE.
- Replaces today's hand-written `/health`: Development gets `/health` (with the
  Postgres, Redis and RabbitMQ checks from the client integrations) and
  `/alive`. The existing health test moves to the integration suite and asserts
  the new response.

### Migrations

- `Airbnb.MigrationService` is a worker (the pattern Aspire documents). It
  calls every module's `AddXModuleDatabase`, then runs each registered
  `IModuleMigrator` — `MigrateAsync()` on the module's DbContext — and stops.
  The API starts only after it completes successfully. The API never migrates.
- Wolverine provisions its own `wolverine` schema tables and its RabbitMQ
  exchange/queue at API startup (idempotent).

### Seed data

- `frontend/scripts/export-seed.ts` imports the mock arrays from
  `lib/data/*.ts` and writes backend-shaped JSON into each module's
  `Data/Seed/`: it adds `sortOrder` (array index) and converts reviews to
  `subjectType` / `subjectId` / `createdAt` (`"March 2026"` → `2026-03-01T00:00:00Z`).
- It runs on Node 24's built-in TypeScript support — the data files only have
  type imports — so no new dependency. Scripts: `npm run seed:export` and
  `npm run seed:check` (`--check` exits non-zero if the committed JSON differs
  from a fresh export). CI runs `seed:check`, so mock and backend data cannot
  drift.
- Each module seeds through EF Core's `UseAsyncSeeding`, which `MigrateAsync()`
  triggers, and only inserts when its tables are empty.

## 7. Testing

### Backend (xUnit v3 4.x on Microsoft Testing Platform, enabled in `global.json`; the existing project moves from v2)

- **`Airbnb.UnitTests`:** the Polly Redis decorator (a hung cache becomes a
  miss within 250 ms; the circuit opens and short-circuits), request validation
  rules, the envelope writer, seed JSON loading and counts.
- **`Airbnb.ArchitectureTests`** (NetArchTest.eNhancedEdition): the dependency
  rules in section 1 — modules reference only other modules' Contracts; each
  module assembly exports only its module class (checked with
  `Assembly.GetExportedTypes()`, because NetArchTest counts nested public types
  as public); SharedKernel and Contracts depend on no module.
- **`Airbnb.Api.Tests`** (integration): `WebApplicationFactory` against
  Postgres, Redis and RabbitMQ Testcontainers started once per run, migrated
  and seeded through the module migrators. Covers every endpoint's success, 404,
  400, envelope and paging metadata; filter parity with the mock (e.g. `Aspen` →
  4 listings); and the write flow end to end — POST a review, then poll until
  the listing's review count and rating change.
- **`Airbnb.AppHost.Tests`** (Aspire.Hosting.Testing): one smoke test that
  starts the whole AppHost, checks `GET /api/listings` reports 16, and checks the
  homepage HTML contains a seeded listing title — proving the flag wiring.

### Frontend

- New Vitest tests: HTTP repositories (success, 404 → `null`, 5xx and invalid
  payload throw), `getRepositories()` flag selection and errors, the review
  mapping (UTC month formatting), `mockCityRepository`, the seed script's
  conversion.
- Existing unit and e2e tests run unchanged in mock mode.
- Adds `@vitest/coverage-v8` so `npm run test:coverage` works and the 80% rule
  can be checked.

## 8. CI

- **frontend** job: adds `npm run seed:check`.
- **backend** job: runs the unit, architecture and integration test projects
  (Docker is available on GitHub-hosted Ubuntu runners). It installs the latest
  .NET 10 SDK (`10.0.x`) instead of the `global.json` floor, matching local
  development.
- New **apphost** job: .NET + Node, runs `Airbnb.AppHost.Tests`.

## 9. Phases

One implementation plan per phase. Each phase updates `README.md` and
`CLAUDE.md` for what it adds.

1. **Foundation** — `Directory.Build.props`, central packages, xUnit v3;
   ServiceDefaults; SharedKernel; API host (envelope errors, validation, rate
   limits, OpenAPI + Scalar); AppHost with postgres, redis, rabbitmq, migrations
   and api; MigrationService; unit, architecture and integration test projects
   (integration with a shared Testcontainers fixture); CI backend job.
   *Done when:* `aspire run` shows a healthy API with no modules yet.
2. **Read modules** — seed export script and CI check; Stays, Experiences,
   Services, Hosts and Reviews (read side) with schemas, migrations, seeding,
   slices, DTOs; HybridCache + Redis + the Polly decorator; integration tests
   for every endpoint.
   *Done when:* the API serves all mock data.
3. **Frontend flag** — `getRepositories()`, HTTP repositories, `CityRepository`,
   new Zod schemas, call-site switch, ESLint guard, coverage tooling; frontend
   resource in the AppHost; `Airbnb.AppHost.Tests` smoke test and the CI
   `apphost` job.
   *Done when:* the site runs on the backend under Aspire and e2e passes in both
   modes.
4. **Review write flow** — Contracts projects; Wolverine (Postgres message
   store, EF Core transactions, RabbitMQ transport, separated handlers, retry and
   dead-letter policies, tracing); `POST /api/reviews`; consumers with the atomic
   update and cache invalidation; end-to-end integration test.
   *Done when:* a submitted review updates the listing's rating and appears as
   one trace in the dashboard.

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| EF Core retrying strategy conflicts with Wolverine's transactions | Retries off for module DbContexts (section 3); Wolverine policies retry the write path |
| Built-in validation only sees `public` request types, and only in the assembly that calls `AddValidation()` (confirmed in a spike) | Public request records nested in internal slices; each module calls `AddValidation()` (section 1). The envelope writer was spike-verified for 400, 404, 500 and 429 responses |
| xUnit v3 4.x runs only on Microsoft Testing Platform under the .NET 10 SDK | `global.json` sets `"test": { "runner": "Microsoft.Testing.Platform" }`; coverage via `Microsoft.Testing.Extensions.CodeCoverage` (coverlet's collector is VSTest-only) |
| RabbitMQ 4.3 rejects transient non-exclusive queues | All Wolverine queues durable |
| Aspire 13.4+ defaults to Postgres 18, whose on-disk layout differs | Fresh data volume; no volumes carried over from older Aspire versions |
| Node type stripping needs `.ts` extensions in the script's imports; `tsc` rejects them by default and type-checks `scripts/` | Enable `allowImportingTsExtensions` (valid because `noEmit` is on) |
| Development host validates DI on build | MigrationService registers only `AddXModuleDatabase`, never full modules |
| HybridCache tag invalidation is per process for L1 | Single API instance today; multi-instance staleness bounded by the 1-minute L1 TTL |
| AppHost smoke test is slow (containers, `npm install`, `next dev`) | Separate CI job so it doesn't slow the main backend job |
| The Aspire CLI is a .NET global tool (`aspire.cmd`), not resolvable from Git Bash | Docs run `aspire` commands from PowerShell, with `dotnet run --project src/Airbnb.AppHost` as the fallback |
| Aspire 13.5 templates enable `AspireUseCliBundle`, which resolves DCP and the dashboard from the installed CLI | Bundle left off, so DCP and the dashboard come from NuGet and CI needs no CLI; the resulting ASPIRE010 warning is suppressed in the AppHost project |

## 11. Verification (definition of done)

1. From `backend/`, `aspire run` shows postgres, redis, rabbitmq (running),
   migrations (finished), api (healthy) and frontend (running); every page at
   `http://localhost:3000` is served from the backend.
2. With Aspire running, `npm run e2e` in `frontend/` passes against the
   backend.
3. With `DATA_SOURCE` unset: `npm test`, `npx tsc --noEmit`, `npm run lint`,
   `npm run build`, `npm run e2e` and `npm run seed:check` pass.
4. `dotnet test` in `backend/` passes: unit, architecture, integration
   (including the write flow) and the AppHost smoke test.
5. `POST /api/reviews` from Scalar returns 201; within seconds
   `GET /api/listings/{id}` shows the incremented review count and new rating;
   the dashboard shows a single trace spanning POST → outbox → RabbitMQ →
   consumers.
6. Stopping the Redis container in the dashboard leaves the API responding at
   normal latency; restarting it resumes caching.
7. Coverage on new code is at least 80% (backend via coverlet, frontend via
   v8).

## 12. Out of scope

- Auth and identity, bookings, wishlists, host pages, any review UI.
- Frontend traces in the Aspire dashboard (Next.js OpenTelemetry).
- Deployment and publishing (containers, cloud, Kubernetes).
- Per-user rate limits via client IPs forwarded from Next.js.
- Generating a TypeScript client from OpenAPI (Zod schemas remain the contract
  check).
- .NET 11 — bump at GA in November 2026.

### Known, accepted limitations

- `POST /api/reviews` is unauthenticated (rate-limited only).
- In API mode the rate limit is effectively site-wide (section 2).
- Lists show at most 50 items per request; the frontend has no paging UI yet
  (all seed data fits).
