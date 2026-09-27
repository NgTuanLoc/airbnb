# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Layout

Monorepo:
- `frontend/` — Next.js app. **All frontend commands run from `frontend/`, and all frontend paths below are relative to `frontend/`.**
- `backend/` — ASP.NET Core (.NET 10) modular monolith orchestrated by Aspire 13.5. Solution `backend/Airbnb.slnx`: `src/Airbnb.AppHost` (Aspire), `src/Airbnb.Api` (host), `src/Airbnb.ServiceDefaults`, `src/Airbnb.SharedKernel`, `src/Airbnb.MigrationService`, module Contracts projects (`src/Modules/<Name>/Airbnb.Modules.<Name>.Contracts`: plain interfaces and records other modules may reference); tests in `tests/Airbnb.UnitTests`, `tests/Airbnb.ArchitectureTests`, `tests/Airbnb.Api.Tests` (integration), `tests/Airbnb.AppHost.Tests` (Aspire smoke test). SDK and test runner pinned by `backend/global.json`. Design: `docs/superpowers/specs/2026-09-26-backend-modular-monolith-design.md`.
- `docs/` — specs and plans (repo root).

## Commands

```bash
cd frontend
npm run dev          # Start Next.js dev server (http://localhost:3000)
npm run build        # Production build
npm test             # Run Vitest unit tests (single run)
npm run test:watch   # Vitest in watch mode
npm run test:coverage # Vitest with v8 coverage report
npm run e2e          # Playwright E2E tests (requires dev server or auto-starts it)
npm run lint         # ESLint
```

Run a single test file:
```bash
cd frontend && npx vitest run components/design-system/button.test.tsx
cd frontend && npx vitest run lib/utils.test.ts
```

Backend (run from `backend/`; Aspire commands from PowerShell; Docker must be running):
```bash
aspire run                         # whole stack + dashboard
dotnet test                        # all test projects (Microsoft Testing Platform)
dotnet test --project tests/Airbnb.UnitTests --filter-class "Airbnb.UnitTests.Api.EnvelopeProblemDetailsWriterTests"
dotnet test --coverage --coverage-output-format cobertura   # coverage files under TestResults/
reportgenerator -reports:"TestResults/*.cobertura.xml" -targetdir:TestResults/report -reporttypes:TextSummary "-classfilters:-*.Generated*;-System.Runtime.CompilerServices*"   # summary without source-generated code
```

## Architecture

### Technology Stack
- **Next.js 16 App Router** + **React 19** + **TypeScript strict mode**
- **Tailwind CSS v4** with a custom `@theme` block in `app/globals.css` — all design tokens are CSS custom properties there, not `tailwind.config.js`
- **TanStack Query v5** for server state on the client
- **Zod v4** for API response validation
- **Vitest** + **React Testing Library** for unit/component tests; **Playwright** for E2E

### Design Token System
`frontend/DESIGN.md` is the source of truth for the visual design. All tokens are encoded in `frontend/app/globals.css`:
- **Colors:** `bg-rausch`, `text-ink`, `bg-canvas`, `border-hairline`, etc.
- **Typography:** CSS component classes `.text-display-xl`, `.text-body-md`, `.text-caption`, etc. (not Tailwind utility classes)
- **Radii:** `rounded-sm` (8px), `rounded-md` (14px), `rounded-full`
- **Shadow:** single tier `shadow-airbnb`

Always use these named tokens rather than arbitrary Tailwind values.

### Component Layers

**`components/design-system/`** — tokenized atoms. Barrel export via `components/design-system/index.ts`. Components here: `Button`, `TextInput`, `SearchBar`, `TopNav`, `Footer`, `PropertyCard`, `ExperienceCard`, `RatingDisplay`, `DatePickerDay`, `HostCard`, `NewBadge`, `GuestFavoriteBadge`.

**`components/features/`** — composed feature components that assemble atoms and connect to data hooks. Components here: `HomeListings`, `CategoryStrip`, `PropertyGrid`, `CityLinkGrid`, `ListingGallery`, `ListingOverview`, `AmenityList`, `ReviewsGrid`, `ReservationCard`, `BookingCalendar`, `GuestStepper`.

### Data Layer (bottom-up)

```
lib/data/              Static mock data arrays (listings, hosts, reviews, cities, experiences, services)
lib/repositories/      Repository interfaces + getRepositories() (index.ts) — the DATA_SOURCE switch
  mock/                mock*Repository implementations over lib/data
  http/                apiFetch + createHttpRepositories(API_HTTP) — the .NET API, Zod-validated
lib/api/envelope.ts    ApiResponse<T> type + ok()/fail() helpers
app/api/*/route.ts     GET /api/{listings,experiences,services} — call getRepositories()
lib/api-client/        fetch* functions + Zod schemas validating the envelope
lib/hooks/             TanStack Query wrappers (useListings, …)
```

- `DATA_SOURCE=mock|api` (server-only, default `mock`; `api` needs `API_HTTP`) selects the implementations. Server code gets data only through `getRepositories()`; ESLint forbids importing `repositories/mock/*` outside `lib/repositories/`.
- Server components (detail pages, the homepage's cities) call `getRepositories()` directly; client components fetch the Next `/api/*` route handlers, which call it too.

### Core Types
All shared domain types live in `lib/types.ts`: `Listing`, `Host`, `Review`, `City`, `CATEGORIES`, `Category`.

### Pages
- `/` — Homepage: `TopNav` + `SearchBar` + `HomeListings` (category filter + property grid) + `CityLinkGrid` + `Footer`
- `/rooms/[id]` — Listing detail: server component, fetches listing/host/reviews from repositories
- `/design-system` — Component gallery (development reference)

### Testing Conventions
- Import `render`, `screen`, `userEvent` from `@/lib/test-utils` (not directly from RTL)
- Tests assert class names to verify token usage (e.g., `expect(el.className).toContain("bg-rausch")`)
- E2E tests live in `e2e/`; Playwright config in `playwright.config.ts` auto-starts the dev server
- TDD workflow: write failing test → minimal implementation → passing test → commit

### Path Alias
`@/*` maps to the repo root (e.g., `@/lib/utils`, `@/components/design-system`).

### Backend Conventions
- Package versions live only in `backend/Directory.Packages.props`; shared settings in `backend/Directory.Build.props` (warnings are errors, so xUnit tests pass `TestContext.Current.CancellationToken`).
- Every `/api` response body and every framework-generated error body is the frontend envelope `{ success, data?, error?, meta? }` (`Airbnb.SharedKernel.ApiResponse`); `/health`, `/alive`, `/openapi/v1.json` and `/scalar` keep their standard formats. Framework errors are reshaped by `Airbnb.Api/Errors/EnvelopeProblemDetailsWriter`; 5xx messages never carry details.
- Modules: request records are `public` but nested inside `internal` slice classes, and each module calls `services.AddValidation()` in its own `AddXModule`. .NET 10's validation generator ignores `internal` types and only registers types for `AddValidation()` calls in the same assembly.
- Integration tests use `ApiFactory` plus the assembly-wide `InfrastructureFixture` (one Testcontainers Postgres and one Redis per test run, started in sequence, with every module migrated and seeded once).
- A module lives at `backend/src/Modules/<Name>/Airbnb.Modules.<Name>/`: `<Name>Module.cs` (the only public type — `Add<Name>Module`, `Add<Name>ModuleDatabase`, `Map<Name>Endpoints`), one file per slice (`Query` record + `Handler` + `Map`), `Data/<Name>DbContext.cs` registered through `SharedKernel.Persistence.ModuleDatabase.AddModuleDbContext`, `Data/Migrations/`, `Data/Seed/*.json`. Register a new module in `Airbnb.Api/Program.cs`, `Airbnb.MigrationService/Program.cs`, the tests' `InfrastructureFixture`, and `ModuleRulesTests`.
- Migrations (from `backend/`): `dotnet tool restore`, then `dotnet ef migrations add <Name> --project src/Modules/<M>/Airbnb.Modules.<M> --startup-project src/Modules/<M>/Airbnb.Modules.<M> --output-dir Data/Migrations`. The MigrationService applies them and each DbContext's `UseAsyncSeeding` fills empty tables.
- Seed data is generated, not hand-edited: change `frontend/lib/data/*.ts`, then `npm run seed:export` in `frontend/` (CI runs `npm run seed:check`).
- Queries are cached through `HybridCache` with keys prefixed by the module name and tagged with the module's cache tag.
- The AppHost runs the frontend (`AddJavaScriptApp`, port 3000, `DATA_SOURCE` from `Frontend:DataSource`, default `api`) and the API on its `http` launch profile only. `tests/Airbnb.AppHost.Tests` starts the whole AppHost, so it needs Docker and port 3000 free; CI runs it in its own `apphost` job.
- Cross-module calls go through `*.Contracts` projects (interfaces and records, referencing nothing of ours). A module references SharedKernel and other modules' Contracts only; `ModuleRulesTests` checks exact assembly names.
- Wolverine runs only public handler types, so message handlers live in `Airbnb.Api/Messaging/` and call a module through its Contracts interface; register each such interface with `options.CodeGeneration.AlwaysUseServiceLocationFor<T>()` in `Program.cs`. The review command doesn't use a handler: `SubmitReview` writes through `IDbContextOutbox<ReviewsDbContext>` (review row + event in one transaction).
- Consumers apply a review once per review id: `SharedKernel.Persistence.ReviewStatistics.ApplyOnceAsync` records it in the module's `applied_reviews` table and runs one atomic `UPDATE` in the same transaction, then the module invalidates its cache tag. Raw SQL quotes the PascalCase column names (`"ReviewCount"`).
- Integration tests also run a RabbitMQ container (readiness by port 5672: the default log check hangs when the Docker VM clock lags). `new ApiFactory(infrastructure, postgresConnectionString: …, withMessaging: false)` is for tests that point the API at a dead database. Write tests use subjects no read test asserts on (never `l1`/`e1`).
