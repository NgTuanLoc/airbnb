# Listing Views over Kafka Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guests' listing views flow through a Kafka topic into exactly-once daily counts, shown to guests on listing pages and to hosts on their dashboard, with a one-click rebuild from the log.

**Architecture:** A new Insights module (no Contracts project: nothing else calls it) produces `listing-views` events and runs a batch projection that stores counts and offsets in one Postgres transaction. Next relays view pings from the browser and reads counts through a repository. Aspire runs Kafka + Kafka UI and exposes the rebuild as a dashboard command.

**Tech Stack:** Aspire 13.6.3 (`Aspire.Hosting.Kafka`, `Aspire.Confluent.Kafka`), Confluent.Kafka, EF Core + Npgsql, Testcontainers.Kafka, Next.js 16, Vitest, k6.

**Spec:** `docs/superpowers/specs/2026-10-28-listing-views-kafka-design.md`

## Global Constraints

- Packages pinned in `backend/Directory.Packages.props`: `Aspire.Hosting.Kafka` 13.6.3, `Aspire.Confluent.Kafka` 13.6.3, `Testcontainers.Kafka` 4.15.0.
- Aspire resource/connection name `kafka`; topic `listing-views`, 3 partitions, `retention.ms=-1`; consumer group `insights-listing-views`.
- Schema `insights`; tables `listing_daily_views (ListingId varchar(50), Day date, Views bigint, PK (ListingId, Day))`, `consumer_offsets (Topic varchar(100), Partition int, NextOffset bigint, PK (Topic, Partition))`.
- Listing id pattern: `^(l[0-9]{1,6}|hl-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$`.
- Batch: 500 messages or 1 s; consume poll 250 ms.
- Config: `Insights:Projection:Enabled` (default true), `Insights:AdminKey`, `RateLimiting:ViewsPerMinute` (default 120); header `X-Admin-Key`.
- Copy exactly as in the spec's Frontend section.
- Warnings are errors; tests pass `TestContext.Current.CancellationToken`; frontend tests import from `@/lib/test-utils`.

## Review Focus

- A partition moving between consumers mid-batch (rebalance) must not double count or drop views. Covered by the revoke flush; exercised by the restart test in Task 2.
- Rebuild while views keep arriving must end with counts equal to everything in the log. Task 2's rebuild test posts views before and checks the total after.
- A view for the listing's own host must not be sent. Task 4 room page test.
- Kafka down: `POST …/views` still answers 202 quickly and the listing page still renders. Task 2 (endpoint doesn't await delivery), Task 4 (repository returns null on failure).
- `..` or a malformed id in the Next view route must not reach another API path. Task 4 route test.

---

### Task 1: Insights module core (ids, batches, weekly windows, data)

**Files:** create `backend/src/Modules/Insights/Airbnb.Modules.Insights/` (`Airbnb.Modules.Insights.csproj`, `InsightsModule.cs`, `ListingIds.cs`, `ListingViewEvent.cs`, `ViewBatch.cs`, `WeeklyViews.cs`, `Data/InsightsDbContext.cs`, `Data/Migrations/*`); modify `Airbnb.slnx`, `Directory.Packages.props`, `Airbnb.MigrationService/Program.cs`, `tests/Airbnb.Api.Tests/Infrastructure/InfrastructureFixture.cs`, `tests/Airbnb.ArchitectureTests/ModuleRulesTests.cs` (+ csproj refs), `tests/Airbnb.UnitTests/Airbnb.UnitTests.csproj`. Test: `tests/Airbnb.UnitTests/Insights/*Tests.cs`.

**Produces:** `ListingIds.IsValid(string)`; `ListingViewEvent(string ListingId, DateTimeOffset ViewedAt)` with `Serialize()`/`TryParse(string, out ListingViewEvent?)`; `ViewBatch` (`Add(int partition, long offset, string? value)`, `Count`, `Counts: IReadOnlyDictionary<(string ListingId, DateOnly Day), long>`, `NextOffsets: IReadOnlyDictionary<int, long>`, `Clear()`); `WeeklyViews(string ListingId, long Last7Days, long Previous7Days)` with `static WeeklyViews From(string listingId, IEnumerable<(DateOnly Day, long Views)>, DateOnly today)`; `InsightsModule.AddInsightsModuleDatabase`.

- [ ] Failing unit tests: `ListingIdsTests` (accepts `l1`, `l16`, `hl-<guid>`; refuses `..`, `l`, `L1`, `hl-x`, `l1234567`, uppercase GUID); `ViewBatchTests` (two views of `l1` same day + one of `l2` → counts 2 and 1 per day; views across midnight UTC split by day; next offset per partition = max + 1; a malformed value advances the offset without counting; `Clear` empties); `WeeklyViewsTests` (today and today−6 are last week; today−7 and today−13 are the week before; today−14 ignored).
- [ ] Run `dotnet test --project tests/Airbnb.UnitTests --filter-namespace "Airbnb.UnitTests.Insights"` → fails (types missing).
- [ ] Implement; DbContext + migration `InitialInsights`; register the database in the MigrationService and the fixture; module added to `ModuleRulesTests`.
- [ ] Tests pass; solution builds with 0 warnings; architecture tests pass. Commit `feat: add the Insights module's view counting core`.

### Task 2: Kafka producer, projection, endpoints, rate-limit bucket

**Files:** `Insights` module: `RecordListingView.cs`, `GetListingViews.cs`, `RebuildListingViews.cs`, `ListingViewsTopic.cs` (topic setup hosted service), `ListingViewsProjection.cs`, `ProjectionControl.cs`; `SharedKernel/RateLimitBucket.cs`; `Airbnb.Api/RateLimiting/ApiRateLimiting.cs`, `Airbnb.Api/Program.cs`, `Airbnb.Api.csproj`; tests: `Infrastructure/InfrastructureFixture.cs` (Kafka container), `Infrastructure/ApiFactory.cs` (`ConnectionStrings:kafka`, projection off), `Insights/ListingViewsTests.cs`, `RateLimitingTests.cs`.

**Produces:** HTTP `POST /api/listings/{id}/views` → 202 `{success:true}` / 404; `GET /api/listings/{id}/views` → `{ listingId, last7Days, previous7Days }` / 404; `POST /api/insights/rebuild` → 202 / 401 / 404 / 503. `RateLimitBucket.Views` endpoint metadata. `InfrastructureFixture.KafkaBootstrapAddress`.

- [ ] Failing tests (`ListingViewsTests`, one class so tests run in sequence; factories enable the projection):
  - `Views_are_counted_through_kafka` (3 posts to a fresh `hl-` id → `last7Days` reaches 3 within 30 s, `previous7Days` 0);
  - `Malformed_ids_are_404` (post and get `not-a-listing`);
  - `Counts_survive_a_restart_without_double_counting` (2 views, wait 2, dispose; new factory, 1 view, wait 3, still 3 after 3 s);
  - `Rebuild_needs_the_admin_key` (no key configured → 404; wrong key → 401);
  - `Rebuild_recounts_everything_from_the_log` (2 views of A, wait; rebuild → 202; A comes back to 2; a view posted after the rebuild request is also counted).
  - `RateLimitingTests.Views_have_their_own_budget` (views 2/min, writes 1/min: two views 202, third 429, then a write still 404).
- [ ] Run → fail.
- [ ] Implement per the spec (Aspire producer/consumer registration in `AddInsightsModule`, consumer handlers bound to the projection singleton, topic setup as an `IHostedService` before the server starts, `consumer.Close()` on stop).
- [ ] All Api.Tests, UnitTests, ArchitectureTests pass. Commit `feat: count listing views through Kafka with an exactly-once projection`.

### Task 3: AppHost, k6, smoke test, docs

**Files:** `Airbnb.AppHost/AppHost.cs`, `Airbnb.AppHost.csproj`, `perf/k6/load.js`, `tests/Airbnb.AppHost.Tests/AppHostSmokeTests.cs`, `README.md`, `CLAUDE.md`.

- [ ] Kafka + Kafka UI (persistent, data volume), API references/waits for it, `insights-admin-key` parameter, `WithHttpCommand("/api/insights/rebuild", "Rebuild view stats", …)` adding `X-Admin-Key`, run-mode `RateLimiting__ViewsPerMinute=100000`.
- [ ] k6: guest posts `POST /listings/{id}/views` (expects 202), endpoint in `ENDPOINTS`.
- [ ] Smoke test: post a view for `l16`, poll `GET /api/listings/l16/views` until `last7Days ≥ 1` (60 s).
- [ ] Run the AppHost test → pass; run k6 once under `aspire start` and check counts rose. Docs. Commit `feat: run Kafka under Aspire and load it from k6`.

### Task 4: Frontend

**Files:** move `lib/host/photo-relay.ts` → `lib/api/relay.ts` (+ `session` option; update the three photo routes); create `lib/insights/views.ts` (+ test), `lib/repositories/listing-views-repository.ts`, `lib/repositories/http/http-listing-views-repository.ts` (+ test), `app/api/listings/[id]/views/route.ts` (+ test), `components/features/listing-view-beacon.tsx` (+ test); modify `lib/repositories/index.ts`, `app/rooms/[id]/page.tsx` (+ test), `app/host/listings/page.tsx` (+ test), `CLAUDE.md`.

**Produces:** `LISTING_ID_PATTERN`, `weeklyViewsSchema`, `type WeeklyViews`, `guestViewsText(views: WeeklyViews | null): string | null`, `hostViewsText(views: WeeklyViews): string`; `ListingViewsRepository { weekly(listingId: string): Promise<WeeklyViews | null> }`; `ListingViewBeacon({ listingId })`.

- [ ] Failing tests: copy (every string in the spec), repository (mock null; http maps, 404 → null, failure → null and logged, `..` never fetched), route (mock 204 without fetch; api relays with browser IP and no bearer, passes 202; bad id 404 without fetch), beacon (posts once under `<StrictMode>`, ignores a rejected fetch), room page (line shown when > 0; beacon only for non-hosts), host page (line per listing), image proxy no longer forwards the bearer.
- [ ] Implement; `npm test`, `npm run lint`, `npx tsc --noEmit` pass. Commit `feat: send listing views from the browser and show the counts`.
