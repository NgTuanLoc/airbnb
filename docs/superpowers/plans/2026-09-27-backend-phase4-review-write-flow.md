# Backend Phase 4 — Review Write Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `POST /api/reviews` stores a review and publishes `ReviewSubmitted` through a Wolverine outbox to RabbitMQ; handlers then update the listing's or experience's rating and review count exactly once and invalidate their caches.

**Architecture:**
- The endpoint (Reviews module) checks that the subject exists through `IListingLookup` / `IExperienceLookup`. It then writes the review and the event in one Postgres transaction through Wolverine's `IDbContextOutbox<ReviewsDbContext>`, and invalidates the `reviews` cache tag after the commit.
- Wolverine relays the event to a durable RabbitMQ queue that the API also listens on. Two separated handlers in the API host pass it to Stays and Experiences through their Contracts interfaces (`IListingReviewStats`, `IExperienceReviewStats`).
- Each module applies a review with one atomic `UPDATE`, guarded by an `applied_reviews` table, in its own transaction. It then invalidates its cache tag.

**Tech Stack:** .NET 10, EF Core 10.0.12 + Npgsql, Wolverine 6.40.0 (`WolverineFx.EntityFrameworkCore`, `.Postgresql`, `.RabbitMQ`, `.RuntimeCompilation`), RabbitMQ 4.3 (Aspire's default image), HybridCache, xUnit v3 on Microsoft Testing Platform, Testcontainers 4.15 (Postgres, Redis, RabbitMQ), NetArchTest.

**Spec:** `docs/superpowers/specs/2026-09-26-backend-modular-monolith-design.md`: §1 (Contracts, dependency rules, how modules talk), §2 (validation, envelope), §3 (the write flow), §7 (tests), §9 phase 4, §11 items 4–5. The deviations that the spike forced are listed below; Task 6 records them in the spec.

## Global Constraints

- `POST /api/reviews` body: `{ subjectType: "stay" | "experience", subjectId, authorName, rating, body }`.
  - `subjectType`: required, `stay` or `experience`.
  - `subjectId`: required, 1–50 chars.
  - `authorName`: required, 1–60 chars, stored trimmed.
  - `rating`: integer 1–5.
  - `body`: required, 1–1,000 chars, stored trimmed.
- No avatar field: the server assigns a default avatar on `images.unsplash.com`. Reviews for services are not supported.
- Unauthenticated; writes are limited to 10/min per IP by the existing limiter.
- New reviews get UUIDv7 ids. `createdAt` comes from `TimeProvider`; `DateTime.UtcNow` is never called in production code.
- Responses:
  - 201 with the review envelope;
  - 404 envelope when the subject doesn't exist;
  - 400 envelope for validation or unparsable input.
- The review row and the outgoing `ReviewSubmitted` commit in **one Postgres transaction** (outbox).
- Consumers run one atomic statement: `UPDATE … SET "ReviewCount" = "ReviewCount" + 1, "Rating" = round(("Rating" * "ReviewCount" + @rating) / ("ReviewCount" + 1), 2) WHERE "Id" = @subjectId`. There is no read-modify-write.
  - Columns are PascalCase and quoted: the spec's snake_case SQL was illustrative.
- Events **increment** counters; they never recount them. A redelivered event is a no-op.
- Transient database errors retry 3 times with cooldowns **100 ms, 500 ms, 2 s**, then the message moves to the error queue.
- Queues are durable (RabbitMQ 4.3 rejects transient non-exclusive queues).
- Dependency rules:
  - A module references SharedKernel and other modules' `*.Contracts` only.
  - Contracts projects reference nothing of ours.
  - Each module assembly still exports only its module class (EF migrations excepted).
- Wolverine handler classes live only in `Airbnb.Api/Messaging/`.
- Package versions live only in `backend/Directory.Packages.props`. Warnings are errors, and xUnit tests pass `TestContext.Current.CancellationToken`.
- Run dotnet from `backend/`, and `dotnet test --project <path>` for one project (a positional path runs zero tests). Run `aspire` from PowerShell only.
- Migrations (from `backend/`): `dotnet tool restore`, then `dotnet ef migrations add <Name> --project src/Modules/<M>/Airbnb.Modules.<M> --startup-project src/Modules/<M>/Airbnb.Modules.<M> --output-dir Data/Migrations`.
- Write tests change seed rows, so they use subjects no read test asserts on:
  - Task 2: `l3`, `l5`, `l9`;
  - Task 3: `e3`, `e5`;
  - Task 4: `l12`, `e11`;
  - Task 5: `l10`, `l11`, `e10`.
  - Never use `l1` or `e1` (the read tests pin their reviews).
- Commits use conventional format and end with exactly:
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
  Never substitute another model name.
- Branch: `feat/backend-phase4-review-write-flow`, created from local `main`.

## Spike findings (verified — do not re-investigate)

The whole flow was spiked end to end in a scratch clone against Testcontainers Postgres, Redis and RabbitMQ.

1. **Wolverine only runs `public` handler types, and their parameter types must be public too.** Its generated code is compiled into a separate assembly. Internal module handlers are rejected ("Handler types must be public"), and internal implementations behind a public interface need `options.CodeGeneration.AlwaysUseServiceLocationFor<TInterface>()`.
   - So: the command side uses `IDbContextOutbox<ReviewsDbContext>` (no generated code) from a normal DI-registered slice handler.
   - Consumer handlers live in the API host and call the Contracts interfaces.
2. **Wolverine 6 needs `WolverineFx.RuntimeCompilation`.** Without it the host fails at start with "no IAssemblyGenerator (Roslyn) is registered".
3. **The outbox is atomic without mapping Wolverine's tables into the DbContext.** The SQL log shows the `wolverine_outgoing_envelopes` insert, then EF's `SAVEPOINT` / `INSERT INTO reviews.reviews` / `RELEASE SAVEPOINT` inside the same transaction.
4. **Publishing with no route or handler just drops the message.** So the endpoint (Task 4) works before the RabbitMQ route exists (Task 5).
5. **An EF `ExecuteUpdateAsync` rating formula overflows.** EF types the intermediate `Rating * ReviewCount + rating` as `numeric(3,2)`: 4.88 × 142 = 692.96 → "22003: numeric field overflow". Raw SQL computes it in unconstrained numeric.
6. **`MultipleHandlerBehavior.Separated` delivers one RabbitMQ message to every handler.** Verified with two handlers.
7. **`UseRabbitMqUsingNamedConnection("rabbitmq")` reads `ConnectionStrings:rabbitmq`.** It works with Testcontainers' `amqp://` string and is documented for Aspire.
8. **Wolverine fails to start without a reachable Postgres.** Tests that point the API at a dead database call `services.DisableAllWolverineMessagePersistence()` and `services.DisableAllExternalWolverineTransports()`.
9. **Testcontainers' default RabbitMQ readiness check is a log check, which hangs on this machine.** The Docker VM's clock lags the host's by about 80 s, so the startup log line is never seen.
   - A `rabbitmq-diagnostics` exec check breaks startup (it creates `.erlang.cookie` as root).
   - Use `Wait.ForUnixContainer().UntilInternalTcpPortIsAvailable(5672)`. RabbitMQ opens 5672 at the very end of startup.
10. **A malformed request (unparsable JSON body, `?page=abc`) currently returns 500.** `UseExceptionHandler` turns ASP.NET's `BadHttpRequestException` into 500. Passing `StatusCodeSelector` restores 400, and the envelope writer then returns `{"success":false,"error":"Bad Request"}`.
11. **Error-handling API:** `options.OnException<NpgsqlException>(e => e.IsTransient).RetryWithCooldown(…).Then.MoveToErrorQueue()` needs `using Wolverine.ErrorHandling;`.
12. **The whole existing integration suite passes with Wolverine in every API instance** (46/46 in about 28 s).

## Review Focus

1. **The same `ReviewSubmitted` delivered twice** (redelivery after a crash between commit and ack). Expected: the rating and count change once. → Task 2, test `The_same_review_applied_twice_counts_once`.
2. **Concurrent reviews of one listing.** Expected: every review is counted, with no lost update. → Task 2, test `Concurrent_reviews_are_all_counted`; end to end in Task 5, test `Concurrent_reviews_of_one_listing_are_all_counted`.
3. **Unparsable input** (`rating: 4.5`, `"five"`, malformed JSON, empty body, `?page=abc`). Expected: a 400 envelope, not a 500. → Task 1, test `Unparsable_query_values_get_the_400_envelope`; Task 4, test `Unparsable_bodies_get_the_400_envelope`.
4. **A page viewed just before the review is cached.** Expected: the next read shows the new rating or review immediately, not after the 10-minute cache expiry. → Task 2, test `Applying_a_review_updates_the_listing_and_its_cached_copy`; Task 4, test `A_new_review_shows_up_first_even_when_the_list_was_cached`.
5. **A subject id of the other type** (`subjectType: "experience"` with `l3`, `stay` with `e2`). Expected: 404, and no row of the wrong type is touched. → Task 4, theory `Unknown_subjects_get_the_404_envelope`.

---

## File Structure

**New projects**
- `backend/src/Modules/Stays/Airbnb.Modules.Stays.Contracts/`: `IListingLookup.cs`, `IListingReviewStats.cs`
- `backend/src/Modules/Experiences/Airbnb.Modules.Experiences.Contracts/`: `IExperienceLookup.cs`, `IExperienceReviewStats.cs`
- `backend/src/Modules/Reviews/Airbnb.Modules.Reviews.Contracts/`: `ReviewSubjectType.cs`, `ReviewSubmitted.cs`

**SharedKernel:** `Persistence/ReviewStatistics.cs`, containing `AppliedReview`, `MapAppliedReviews()` and `ApplyOnceAsync()`: the one implementation of "apply a review exactly once".

**Stays / Experiences:** `ListingLookup.cs` / `ExperienceLookup.cs`, `ListingReviewStats.cs` / `ExperienceReviewStats.cs`, DbContext gets `MapAppliedReviews()` plus a table-name constant, migration `AppliedReviews`, and the module registers the two services.

**Reviews:** `SubmitReview.cs` (Command + Handler + Map), a module registration line, a `Review.cs` comment.

**Api:**
- `Program.cs`: `StatusCodeSelector`, `TimeProvider`, `UseWolverine`.
- `Messaging/StaysReviewSubmittedHandler.cs`, `Messaging/ExperiencesReviewSubmittedHandler.cs`.
- `Airbnb.ServiceDefaults/Extensions.cs`: the `Wolverine` trace source.

**Tests:**
- Integration: `ErrorEnvelopeTests.cs` (+1 theory), `Stays/ListingReviewStatsTests.cs`, `Experiences/ExperienceReviewStatsTests.cs`, `Reviews/SubmitReviewTests.cs`, `Reviews/ReviewFlowTests.cs`.
- Infrastructure: `InfrastructureFixture.cs` (RabbitMQ), `ApiFactory.cs` (optional overrides and `withMessaging`).
- `HealthEndpointTests.cs`, `Stays/StaysEndpointTests.cs`: updated factory calls.
- Unit: `Api/ReviewSubmittedHandlerTests.cs`.
- Architecture: `ModuleRulesTests.cs` (assembly-reference rule and Contracts rules).

**Docs:** `README.md`, `CLAUDE.md`, the spec (§1, §3).

---

### Task 1: Malformed requests get a 400 envelope, not a 500

**Files:**
- Modify: `backend/src/Airbnb.Api/Program.cs` (the `app.UseExceptionHandler();` line)
- Test: `backend/tests/Airbnb.Api.Tests/ErrorEnvelopeTests.cs`

**Interfaces:**
- Consumes: the existing `EnvelopeProblemDetailsWriter`, which returns 4xx messages as-is.
- Produces: any `BadHttpRequestException` (unparsable query value or JSON body) → 400 `{"success":false,"error":"Bad Request"}`. Task 4 relies on this for bodies.

- [ ] **Step 1: Create the branch**

```bash
cd D:/PersonalProjects/airbnb
git checkout main
git checkout -b feat/backend-phase4-review-write-flow
```

- [ ] **Step 2: Write the failing test**

Add to `ErrorEnvelopeTests` (the class already has `using System.Net;` and `using Airbnb.Api.Tests.Infrastructure;`):

```csharp
    [Theory]
    [InlineData("/api/listings?page=abc")]
    [InlineData("/api/listings?guests=many")]
    public async Task Unparsable_query_values_get_the_400_envelope(string path)
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();

        using var response = await client.GetAsync(path, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(
            """{"success":false,"error":"Bad Request"}""",
            await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
    }
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `cd backend && dotnet test --project tests/Airbnb.Api.Tests --filter-class "Airbnb.Api.Tests.ErrorEnvelopeTests"`
Expected: both new cases FAIL with status `InternalServerError` instead of `BadRequest`.

- [ ] **Step 4: Implement**

In `backend/src/Airbnb.Api/Program.cs`, replace `app.UseExceptionHandler();` with:

```csharp
// A malformed request (an unparsable JSON body, "?page=abc") is the client's fault: keep its 400 instead of the default 500.
app.UseExceptionHandler(new ExceptionHandlerOptions
{
    StatusCodeSelector = exception => exception is BadHttpRequestException badRequest
        ? badRequest.StatusCode
        : StatusCodes.Status500InternalServerError,
});
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `dotnet test --project tests/Airbnb.Api.Tests --filter-class "Airbnb.Api.Tests.ErrorEnvelopeTests"`, then `dotnet test --project tests/Airbnb.UnitTests`.
Expected: all PASS. The unit suite still has 17 tests (the envelope writer is unchanged).

- [ ] **Step 6: Commit**

```bash
git add backend/src/Airbnb.Api/Program.cs backend/tests/Airbnb.Api.Tests/ErrorEnvelopeTests.cs
git commit -m "fix: return the 400 envelope for unparsable requests instead of a 500

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Apply-once review statistics and the Stays contracts

**Files:**
- Create: `backend/src/Airbnb.SharedKernel/Persistence/ReviewStatistics.cs`
- Create: `backend/src/Modules/Stays/Airbnb.Modules.Stays.Contracts/Airbnb.Modules.Stays.Contracts.csproj`, `IListingLookup.cs`, `IListingReviewStats.cs`
- Create: `backend/src/Modules/Stays/Airbnb.Modules.Stays/Listings/ListingLookup.cs`, `Listings/ListingReviewStats.cs`
- Modify: `backend/src/Modules/Stays/Airbnb.Modules.Stays/Airbnb.Modules.Stays.csproj`, `StaysModule.cs`, `Data/StaysDbContext.cs`
- Create (generated): `backend/src/Modules/Stays/Airbnb.Modules.Stays/Data/Migrations/*_AppliedReviews.cs` (+ Designer, updated snapshot)
- Modify: `backend/Airbnb.slnx`
- Modify: `backend/tests/Airbnb.ArchitectureTests/ModuleRulesTests.cs`, `Airbnb.ArchitectureTests.csproj`
- Test: `backend/tests/Airbnb.Api.Tests/Stays/ListingReviewStatsTests.cs`

**Interfaces:**
- Produces:
  - `Airbnb.SharedKernel.Persistence.AppliedReview`;
  - `ModelBuilder MapAppliedReviews(this ModelBuilder)`;
  - `Task ReviewStatistics.ApplyOnceAsync(DbContext db, string schema, string table, string reviewId, string subjectId, int rating, CancellationToken)`;
  - `Airbnb.Modules.Stays.Contracts.IListingLookup { Task<bool> ExistsAsync(string listingId, CancellationToken) }`;
  - `Airbnb.Modules.Stays.Contracts.IListingReviewStats { Task ApplyReviewAsync(string reviewId, string listingId, int rating, CancellationToken) }`.
  - Both Stays services are registered scoped by `AddStaysModule`.
- Consumes: `StaysModule.Schema` (`"stays"`), `StaysModule.CacheTag` (`"stays"`), `HybridCache`.

- [ ] **Step 1: Create the Stays.Contracts project**

`backend/src/Modules/Stays/Airbnb.Modules.Stays.Contracts/Airbnb.Modules.Stays.Contracts.csproj` (target framework, nullable and warnings-as-errors come from `Directory.Build.props`):

```xml
<Project Sdk="Microsoft.NET.Sdk">
</Project>
```

`IListingLookup.cs`:

```csharp
namespace Airbnb.Modules.Stays.Contracts;

// Lets other modules check that a listing exists without depending on the Stays module (spec §1).
public interface IListingLookup
{
    Task<bool> ExistsAsync(string listingId, CancellationToken cancellationToken);
}
```

`IListingReviewStats.cs`:

```csharp
namespace Airbnb.Modules.Stays.Contracts;

// Adds a submitted review to a listing's rating and review count. Calling it again with the same review id changes nothing.
public interface IListingReviewStats
{
    Task ApplyReviewAsync(string reviewId, string listingId, int rating, CancellationToken cancellationToken);
}
```

In `backend/Airbnb.slnx`, add `<Project Path="src/Modules/Stays/Airbnb.Modules.Stays.Contracts/Airbnb.Modules.Stays.Contracts.csproj" />` inside the existing `<Folder Name="/src/Modules/Stays/">`, after the Stays project line.

In `backend/src/Modules/Stays/Airbnb.Modules.Stays/Airbnb.Modules.Stays.csproj`, add `<ProjectReference Include="..\Airbnb.Modules.Stays.Contracts\Airbnb.Modules.Stays.Contracts.csproj" />` next to the SharedKernel reference.

- [ ] **Step 2: Write the failing integration tests**

`backend/tests/Airbnb.Api.Tests/Stays/ListingReviewStatsTests.cs`:

```csharp
using System.Net.Http.Json;
using System.Text.Json;
using Airbnb.Api.Tests.Infrastructure;
using Airbnb.Modules.Stays.Contracts;
using Microsoft.Extensions.DependencyInjection;

namespace Airbnb.Api.Tests.Stays;

// Uses listings no read test asserts on (l3, l5, l9): these tests change their rating and review count.
public sealed class ListingReviewStatsTests(InfrastructureFixture infrastructure)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Applying_a_review_updates_the_listing_and_its_cached_copy()
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();
        var before = await GetListingAsync(client, "l3"); // also puts the listing in the cache

        await ApplyAsync(factory, NewReviewId(), "l3", rating: 1);

        var after = await GetListingAsync(client, "l3");
        Assert.Equal(before.ReviewCount + 1, after.ReviewCount);
        Assert.Equal(ExpectedRating(before, 1), after.Rating);
    }

    [Fact]
    public async Task The_same_review_applied_twice_counts_once()
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();
        var before = await GetListingAsync(client, "l5");
        var reviewId = NewReviewId();

        await ApplyAsync(factory, reviewId, "l5", rating: 2);
        await ApplyAsync(factory, reviewId, "l5", rating: 2);

        var after = await GetListingAsync(client, "l5");
        Assert.Equal(before.ReviewCount + 1, after.ReviewCount);
        Assert.Equal(ExpectedRating(before, 2), after.Rating);
    }

    [Fact]
    public async Task Concurrent_reviews_are_all_counted()
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();
        var before = await GetListingAsync(client, "l9");

        // Same rating each time, so the expected average doesn't depend on the order the UPDATEs run in.
        await Task.WhenAll(Enumerable.Range(0, 5).Select(_ => ApplyAsync(factory, NewReviewId(), "l9", rating: 5)));

        var expected = before;
        for (var i = 0; i < 5; i++)
        {
            expected = (expected.ReviewCount + 1, ExpectedRating(expected, 5));
        }

        var after = await GetListingAsync(client, "l9");
        Assert.Equal(expected, after);
    }

    [Fact]
    public async Task The_lookup_finds_seeded_listings_only()
    {
        await using var factory = new ApiFactory(infrastructure);
        await using var scope = factory.Services.CreateAsyncScope();
        var lookup = scope.ServiceProvider.GetRequiredService<IListingLookup>();

        Assert.True(await lookup.ExistsAsync("l1", Ct));
        Assert.False(await lookup.ExistsAsync("l999", Ct));
    }

    // Each call gets its own scope, as each message handler does, so parallel calls never share a DbContext.
    private static async Task ApplyAsync(ApiFactory factory, string reviewId, string listingId, int rating)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<IListingReviewStats>().ApplyReviewAsync(reviewId, listingId, rating, Ct);
    }

    private static string NewReviewId() => Guid.CreateVersion7().ToString();

    private static async Task<(int ReviewCount, decimal Rating)> GetListingAsync(HttpClient client, string id)
    {
        var listing = (await client.GetFromJsonAsync<JsonElement>($"/api/listings/{id}", Ct)).GetProperty("data");
        return (listing.GetProperty("reviewCount").GetInt32(), listing.GetProperty("rating").GetDecimal());
    }

    // What the database computes: the new average rounded to 2 places, half away from zero like Postgres round().
    private static decimal ExpectedRating((int ReviewCount, decimal Rating) before, int rating) =>
        Math.Round((before.Rating * before.ReviewCount + rating) / (before.ReviewCount + 1), 2, MidpointRounding.AwayFromZero);
}
```

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `cd backend && dotnet test --project tests/Airbnb.Api.Tests --filter-class "Airbnb.Api.Tests.Stays.ListingReviewStatsTests"`
Expected: it builds, because Stays.Contracts reaches the test project through Api → Stays. All 4 tests FAIL with `No service for type 'Airbnb.Modules.Stays.Contracts.IListingReviewStats'` (or `IListingLookup`) `has been registered`.

- [ ] **Step 4: Implement the shared apply-once helper**

`backend/src/Airbnb.SharedKernel/Persistence/ReviewStatistics.cs`:

```csharp
using Microsoft.EntityFrameworkCore;

namespace Airbnb.SharedKernel.Persistence;

// A review id a module has already counted, so a redelivered ReviewSubmitted changes nothing (spec §3).
public sealed class AppliedReview
{
    public required string ReviewId { get; init; }
}

public static class ReviewStatistics
{
    private const string AppliedReviewsTable = "applied_reviews";

    // Maps the module's applied_reviews table in the DbContext's default schema.
    public static ModelBuilder MapAppliedReviews(this ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AppliedReview>(applied =>
        {
            applied.ToTable(AppliedReviewsTable);
            applied.HasKey(a => a.ReviewId);
            applied.Property(a => a.ReviewId).HasMaxLength(50);
        });
        return modelBuilder;
    }

    // Adds one review to a row's "Rating" and "ReviewCount", at most once per review id, in one transaction.
    // A single UPDATE computes both columns from the row's current values, so concurrent reviews can't lose updates,
    // and raw SQL keeps the intermediate sum out of the numeric(3,2) rating type (EF's ExecuteUpdate overflows there).
    public static async Task ApplyOnceAsync(
        DbContext db, string schema, string table, string reviewId, string subjectId, int rating, CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

#pragma warning disable EF1002 // schema and table are module constants, never user input; the values are parameters.
        var isFirstDelivery = await db.Database.ExecuteSqlRawAsync(
            $$"""INSERT INTO {{schema}}.{{AppliedReviewsTable}} ("ReviewId") VALUES ({0}) ON CONFLICT DO NOTHING""",
            [reviewId],
            cancellationToken) == 1;
        if (!isFirstDelivery)
        {
            return;
        }

        await db.Database.ExecuteSqlRawAsync(
            $$"""
            UPDATE {{schema}}.{{table}}
            SET "ReviewCount" = "ReviewCount" + 1,
                "Rating" = round(("Rating" * "ReviewCount" + {0}) / ("ReviewCount" + 1), 2)
            WHERE "Id" = {1}
            """,
            [rating, subjectId],
            cancellationToken);
#pragma warning restore EF1002

        await transaction.CommitAsync(cancellationToken);
    }
}
```

If the build reports no EF1002 warning, keep the pragma anyway: it documents why the interpolation is safe. If the compiler rejects the `[reviewId]` / `[rating, subjectId]` collection expressions for the `IEnumerable<object>` parameter, write `new object[] { reviewId }` / `new object[] { rating, subjectId }`.

- [ ] **Step 5: Implement the Stays side**

In `backend/src/Modules/Stays/Airbnb.Modules.Stays/Data/StaysDbContext.cs`:
- add `internal const string ListingsTable = "listings";` to the class;
- change `listing.ToTable("listings");` to `listing.ToTable(ListingsTable);`;
- add `modelBuilder.MapAppliedReviews();` right after `modelBuilder.HasDefaultSchema(StaysModule.Schema);`.

The file already has `using Airbnb.SharedKernel.Persistence;`.

`backend/src/Modules/Stays/Airbnb.Modules.Stays/Listings/ListingLookup.cs`:

```csharp
using Airbnb.Modules.Stays.Contracts;
using Airbnb.Modules.Stays.Data;
using Microsoft.EntityFrameworkCore;

namespace Airbnb.Modules.Stays.Listings;

internal sealed class ListingLookup(StaysDbContext db) : IListingLookup
{
    public Task<bool> ExistsAsync(string listingId, CancellationToken cancellationToken) =>
        db.Listings.AnyAsync(l => l.Id == listingId, cancellationToken);
}
```

`backend/src/Modules/Stays/Airbnb.Modules.Stays/Listings/ListingReviewStats.cs`:

```csharp
using Airbnb.Modules.Stays.Contracts;
using Airbnb.Modules.Stays.Data;
using Airbnb.SharedKernel.Persistence;
using Microsoft.Extensions.Caching.Hybrid;

namespace Airbnb.Modules.Stays.Listings;

internal sealed class ListingReviewStats(StaysDbContext db, HybridCache cache) : IListingReviewStats
{
    public async Task ApplyReviewAsync(string reviewId, string listingId, int rating, CancellationToken cancellationToken)
    {
        await ReviewStatistics.ApplyOnceAsync(db, StaysModule.Schema, StaysDbContext.ListingsTable, reviewId, listingId, rating, cancellationToken);
        // After the commit, and on a redelivery too, so a read racing the update can't keep the old values cached.
        await cache.RemoveByTagAsync(StaysModule.CacheTag, cancellationToken);
    }
}
```

In `StaysModule.AddStaysModule`, after the existing handler registrations, add:

```csharp
        builder.Services.AddScoped<IListingLookup, ListingLookup>();
        builder.Services.AddScoped<IListingReviewStats, ListingReviewStats>();
```

and add `using Airbnb.Modules.Stays.Contracts;` at the top.

- [ ] **Step 6: Add the migration**

```bash
cd backend
dotnet tool restore
dotnet ef migrations add AppliedReviews --project src/Modules/Stays/Airbnb.Modules.Stays --startup-project src/Modules/Stays/Airbnb.Modules.Stays --output-dir Data/Migrations
```

Expected: a new `*_AppliedReviews.cs` whose `Up` creates `stays.applied_reviews` with primary key `ReviewId` (`character varying(50)`) and changes nothing else. If `Up` touches any other table, stop and report.

- [ ] **Step 7: Update the architecture rules**

In `backend/tests/Airbnb.ArchitectureTests/Airbnb.ArchitectureTests.csproj`, add:
`<ProjectReference Include="..\..\src\Modules\Stays\Airbnb.Modules.Stays.Contracts\Airbnb.Modules.Stays.Contracts.csproj" />`

In `backend/tests/Airbnb.ArchitectureTests/ModuleRulesTests.cs`:
- remove `using NetArchTest.Rules;`;
- add `using Airbnb.Modules.Stays.Contracts;`;
- replace the whole `A_module_depends_on_no_other_module_or_host` test with the members below;
- keep `A_module_exports_only_its_module_class`, `Every_module_assembly_is_covered_by_these_rules` and `RepoBackend()` unchanged.

```csharp
    private static readonly Dictionary<string, Type> Contracts = new()
    {
        ["Airbnb.Modules.Stays.Contracts"] = typeof(IListingLookup),
    };

    public static TheoryData<string> ContractNames => new(Contracts.Keys.ToArray());

    // A module may use SharedKernel and other modules' Contracts, never another module's implementation or a host.
    // Exact assembly names: a namespace-prefix rule can't tell Airbnb.Modules.Stays from Airbnb.Modules.Stays.Contracts.
    [Theory]
    [MemberData(nameof(ModuleNames))]
    public void A_module_references_only_the_shared_kernel_and_contracts(string module)
    {
        var forbidden = Modules[module].Assembly.GetReferencedAssemblies()
            .Select(reference => reference.Name!)
            .Where(name => name.StartsWith("Airbnb.", StringComparison.Ordinal)
                && name != "Airbnb.SharedKernel"
                && !name.EndsWith(".Contracts", StringComparison.Ordinal))
            .ToArray();

        Assert.Empty(forbidden);
    }

    // Contracts hold plain records and interfaces that any module may reference, so they depend on nothing of ours.
    [Theory]
    [MemberData(nameof(ContractNames))]
    public void Contracts_reference_no_other_airbnb_assembly(string contracts)
    {
        var references = Contracts[contracts].Assembly.GetReferencedAssemblies()
            .Select(reference => reference.Name!)
            .Where(name => name.StartsWith("Airbnb.", StringComparison.Ordinal))
            .ToArray();

        Assert.Empty(references);
    }

    [Fact]
    public void Every_contracts_assembly_is_covered_by_these_rules()
    {
        var contractProjects = Directory.GetDirectories(Path.Combine(RepoBackend(), "src", "Modules"))
            .SelectMany(Directory.GetDirectories)
            .Select(Path.GetFileName)
            .Where(name => name!.EndsWith(".Contracts", StringComparison.Ordinal))
            .Order()
            .ToArray();

        Assert.Equal(contractProjects, Contracts.Keys.Order().ToArray());
    }
```

- [ ] **Step 8: Run the tests and confirm they pass**

```bash
cd backend
dotnet test --project tests/Airbnb.Api.Tests --filter-class "Airbnb.Api.Tests.Stays.ListingReviewStatsTests"
dotnet test --project tests/Airbnb.ArchitectureTests
dotnet test --project tests/Airbnb.Api.Tests
```

Expected:
- the 4 new integration tests PASS;
- architecture tests PASS: 5 exports-only + 5 references + 1 module coverage + 1 contracts rule + 1 contracts coverage + 1 SharedKernel = 14;
- the full integration suite passes: 45 existing + 2 from Task 1 + 4.

- [ ] **Step 9: Commit**

```bash
git add backend/src/Airbnb.SharedKernel/Persistence/ReviewStatistics.cs backend/src/Modules/Stays backend/Airbnb.slnx backend/tests/Airbnb.ArchitectureTests backend/tests/Airbnb.Api.Tests/Stays/ListingReviewStatsTests.cs
git status --short   # expect only this task's files
git commit -m "feat: add apply-once review statistics and the Stays contracts

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Experiences contracts and review statistics

**Files:**
- Create: `backend/src/Modules/Experiences/Airbnb.Modules.Experiences.Contracts/Airbnb.Modules.Experiences.Contracts.csproj`, `IExperienceLookup.cs`, `IExperienceReviewStats.cs`
- Create: `backend/src/Modules/Experiences/Airbnb.Modules.Experiences/ExperienceLookup.cs`, `ExperienceReviewStats.cs`
- Modify: `backend/src/Modules/Experiences/Airbnb.Modules.Experiences/Airbnb.Modules.Experiences.csproj`, `ExperiencesModule.cs`, `Data/ExperiencesDbContext.cs`
- Create (generated): `backend/src/Modules/Experiences/Airbnb.Modules.Experiences/Data/Migrations/*_AppliedReviews.cs` (+ Designer, updated snapshot)
- Modify: `backend/Airbnb.slnx`, `backend/tests/Airbnb.ArchitectureTests/ModuleRulesTests.cs`, `Airbnb.ArchitectureTests.csproj`
- Test: `backend/tests/Airbnb.Api.Tests/Experiences/ExperienceReviewStatsTests.cs`

**Interfaces:**
- Consumes: `ReviewStatistics.ApplyOnceAsync` and `MapAppliedReviews()` from Task 2 (exact signatures there); `ExperiencesModule.Schema` (`"experiences"`), `ExperiencesModule.CacheTag` (`"experiences"`).
- Produces:
  - `Airbnb.Modules.Experiences.Contracts.IExperienceLookup { Task<bool> ExistsAsync(string experienceId, CancellationToken) }`;
  - `Airbnb.Modules.Experiences.Contracts.IExperienceReviewStats { Task ApplyReviewAsync(string reviewId, string experienceId, int rating, CancellationToken) }`.
  - Both are registered scoped by `AddExperiencesModule`.

- [ ] **Step 1: Create the Experiences.Contracts project**

`backend/src/Modules/Experiences/Airbnb.Modules.Experiences.Contracts/Airbnb.Modules.Experiences.Contracts.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">
</Project>
```

`IExperienceLookup.cs`:

```csharp
namespace Airbnb.Modules.Experiences.Contracts;

// Lets other modules check that an experience exists without depending on the Experiences module (spec §1).
public interface IExperienceLookup
{
    Task<bool> ExistsAsync(string experienceId, CancellationToken cancellationToken);
}
```

`IExperienceReviewStats.cs`:

```csharp
namespace Airbnb.Modules.Experiences.Contracts;

// Adds a submitted review to an experience's rating and review count. Calling it again with the same review id changes nothing.
public interface IExperienceReviewStats
{
    Task ApplyReviewAsync(string reviewId, string experienceId, int rating, CancellationToken cancellationToken);
}
```

In `backend/Airbnb.slnx`, inside `<Folder Name="/src/Modules/Experiences/">`, add `<Project Path="src/Modules/Experiences/Airbnb.Modules.Experiences.Contracts/Airbnb.Modules.Experiences.Contracts.csproj" />`.

In `Airbnb.Modules.Experiences.csproj`, add `<ProjectReference Include="..\Airbnb.Modules.Experiences.Contracts\Airbnb.Modules.Experiences.Contracts.csproj" />`.

- [ ] **Step 2: Write the failing integration tests**

`backend/tests/Airbnb.Api.Tests/Experiences/ExperienceReviewStatsTests.cs`:

```csharp
using System.Net.Http.Json;
using System.Text.Json;
using Airbnb.Api.Tests.Infrastructure;
using Airbnb.Modules.Experiences.Contracts;
using Microsoft.Extensions.DependencyInjection;

namespace Airbnb.Api.Tests.Experiences;

// Uses experiences no read test asserts on (e3, e5): these tests change their rating and review count.
// Concurrency is covered once, for the shared ReviewStatistics helper, in ListingReviewStatsTests.
public sealed class ExperienceReviewStatsTests(InfrastructureFixture infrastructure)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Applying_a_review_updates_the_experience_and_its_cached_copy()
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();
        var before = await GetExperienceAsync(client, "e3"); // also puts the experience in the cache

        await ApplyAsync(factory, Guid.CreateVersion7().ToString(), "e3", rating: 3);

        var after = await GetExperienceAsync(client, "e3");
        Assert.Equal(before.ReviewCount + 1, after.ReviewCount);
        Assert.Equal(ExpectedRating(before, 3), after.Rating);
    }

    [Fact]
    public async Task The_same_review_applied_twice_counts_once()
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();
        var before = await GetExperienceAsync(client, "e5");
        var reviewId = Guid.CreateVersion7().ToString();

        await ApplyAsync(factory, reviewId, "e5", rating: 4);
        await ApplyAsync(factory, reviewId, "e5", rating: 4);

        var after = await GetExperienceAsync(client, "e5");
        Assert.Equal(before.ReviewCount + 1, after.ReviewCount);
        Assert.Equal(ExpectedRating(before, 4), after.Rating);
    }

    [Fact]
    public async Task The_lookup_finds_seeded_experiences_only()
    {
        await using var factory = new ApiFactory(infrastructure);
        await using var scope = factory.Services.CreateAsyncScope();
        var lookup = scope.ServiceProvider.GetRequiredService<IExperienceLookup>();

        Assert.True(await lookup.ExistsAsync("e1", Ct));
        Assert.False(await lookup.ExistsAsync("e999", Ct));
    }

    private static async Task ApplyAsync(ApiFactory factory, string reviewId, string experienceId, int rating)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<IExperienceReviewStats>().ApplyReviewAsync(reviewId, experienceId, rating, Ct);
    }

    private static async Task<(int ReviewCount, decimal Rating)> GetExperienceAsync(HttpClient client, string id)
    {
        var experience = (await client.GetFromJsonAsync<JsonElement>($"/api/experiences/{id}", Ct)).GetProperty("data");
        return (experience.GetProperty("reviewCount").GetInt32(), experience.GetProperty("rating").GetDecimal());
    }

    // What the database computes: the new average rounded to 2 places, half away from zero like Postgres round().
    private static decimal ExpectedRating((int ReviewCount, decimal Rating) before, int rating) =>
        Math.Round((before.Rating * before.ReviewCount + rating) / (before.ReviewCount + 1), 2, MidpointRounding.AwayFromZero);
}
```

- [ ] **Step 3: Run and confirm failure**

Run: `cd backend && dotnet test --project tests/Airbnb.Api.Tests --filter-class "Airbnb.Api.Tests.Experiences.ExperienceReviewStatsTests"`
Expected: it builds; all 3 tests FAIL with `No service for type 'Airbnb.Modules.Experiences.Contracts.IExperienceReviewStats'` (or `IExperienceLookup`) `has been registered`.

- [ ] **Step 4: Implement the Experiences side**

In `Data/ExperiencesDbContext.cs`:
- add `internal const string ExperiencesTable = "experiences";`;
- change `experience.ToTable("experiences");` to `experience.ToTable(ExperiencesTable);`;
- add `modelBuilder.MapAppliedReviews();` right after `modelBuilder.HasDefaultSchema(ExperiencesModule.Schema);`.

The file already has `using Airbnb.SharedKernel.Persistence;`.

`backend/src/Modules/Experiences/Airbnb.Modules.Experiences/ExperienceLookup.cs`:

```csharp
using Airbnb.Modules.Experiences.Contracts;
using Airbnb.Modules.Experiences.Data;
using Microsoft.EntityFrameworkCore;

namespace Airbnb.Modules.Experiences;

internal sealed class ExperienceLookup(ExperiencesDbContext db) : IExperienceLookup
{
    public Task<bool> ExistsAsync(string experienceId, CancellationToken cancellationToken) =>
        db.Experiences.AnyAsync(e => e.Id == experienceId, cancellationToken);
}
```

`backend/src/Modules/Experiences/Airbnb.Modules.Experiences/ExperienceReviewStats.cs`:

```csharp
using Airbnb.Modules.Experiences.Contracts;
using Airbnb.Modules.Experiences.Data;
using Airbnb.SharedKernel.Persistence;
using Microsoft.Extensions.Caching.Hybrid;

namespace Airbnb.Modules.Experiences;

internal sealed class ExperienceReviewStats(ExperiencesDbContext db, HybridCache cache) : IExperienceReviewStats
{
    public async Task ApplyReviewAsync(string reviewId, string experienceId, int rating, CancellationToken cancellationToken)
    {
        await ReviewStatistics.ApplyOnceAsync(
            db, ExperiencesModule.Schema, ExperiencesDbContext.ExperiencesTable, reviewId, experienceId, rating, cancellationToken);
        // After the commit, and on a redelivery too, so a read racing the update can't keep the old values cached.
        await cache.RemoveByTagAsync(ExperiencesModule.CacheTag, cancellationToken);
    }
}
```

In `ExperiencesModule.AddExperiencesModule`, after the handler registrations, add:

```csharp
        builder.Services.AddScoped<IExperienceLookup, ExperienceLookup>();
        builder.Services.AddScoped<IExperienceReviewStats, ExperienceReviewStats>();
```

and add `using Airbnb.Modules.Experiences.Contracts;`.

- [ ] **Step 5: Add the migration**

```bash
cd backend
dotnet ef migrations add AppliedReviews --project src/Modules/Experiences/Airbnb.Modules.Experiences --startup-project src/Modules/Experiences/Airbnb.Modules.Experiences --output-dir Data/Migrations
```

Expected: `Up` creates only `experiences.applied_reviews` with primary key `ReviewId`.

- [ ] **Step 6: Extend the architecture rules**

- Add `<ProjectReference Include="..\..\src\Modules\Experiences\Airbnb.Modules.Experiences.Contracts\Airbnb.Modules.Experiences.Contracts.csproj" />` to `Airbnb.ArchitectureTests.csproj`.
- In `ModuleRulesTests.cs`, add `using Airbnb.Modules.Experiences.Contracts;` and the dictionary entry `["Airbnb.Modules.Experiences.Contracts"] = typeof(IExperienceLookup),` to `Contracts`.

- [ ] **Step 7: Run the tests and confirm they pass**

```bash
dotnet test --project tests/Airbnb.Api.Tests --filter-class "Airbnb.Api.Tests.Experiences.ExperienceReviewStatsTests"
dotnet test --project tests/Airbnb.ArchitectureTests
dotnet test --project tests/Airbnb.Api.Tests
```

Expected: 3 new PASS; architecture 15; the full integration suite passes.

- [ ] **Step 8: Commit**

```bash
git add backend/src/Modules/Experiences backend/Airbnb.slnx backend/tests/Airbnb.ArchitectureTests backend/tests/Airbnb.Api.Tests/Experiences/ExperienceReviewStatsTests.cs
git status --short   # expect only this task's files
git commit -m "feat: add the Experiences contracts and apply-once review statistics

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `POST /api/reviews` with the Wolverine outbox

**Files:**
- Modify: `backend/Directory.Packages.props` (a new `Messaging` item group)
- Modify: `backend/src/Airbnb.Api/Airbnb.Api.csproj`, `backend/src/Airbnb.Api/Program.cs`
- Create: `backend/src/Modules/Reviews/Airbnb.Modules.Reviews.Contracts/Airbnb.Modules.Reviews.Contracts.csproj`, `ReviewSubjectType.cs`, `ReviewSubmitted.cs`
- Create: `backend/src/Modules/Reviews/Airbnb.Modules.Reviews/SubmitReview.cs`
- Modify: `backend/src/Modules/Reviews/Airbnb.Modules.Reviews/Airbnb.Modules.Reviews.csproj`, `ReviewsModule.cs`, `Review.cs` (comment only)
- Modify: `backend/Airbnb.slnx`, `backend/tests/Airbnb.ArchitectureTests/ModuleRulesTests.cs`, `Airbnb.ArchitectureTests.csproj`
- Modify: `backend/tests/Airbnb.Api.Tests/Infrastructure/ApiFactory.cs`, `HealthEndpointTests.cs`, `Stays/StaysEndpointTests.cs`
- Test: `backend/tests/Airbnb.Api.Tests/Reviews/SubmitReviewTests.cs`

**Interfaces:**
- Consumes: `IListingLookup`, `IExperienceLookup` (Tasks 2–3); `ReviewDto` (existing, in `ListReviews.cs`); Task 1's 400 mapping.
- Produces:
  - `Airbnb.Modules.Reviews.Contracts.ReviewSubjectType { Stay, Experience }`;
  - `Airbnb.Modules.Reviews.Contracts.ReviewSubmitted(string ReviewId, ReviewSubjectType SubjectType, string SubjectId, int Rating, DateTimeOffset OccurredAt)`;
  - `POST /api/reviews`;
  - `ApiFactory(InfrastructureFixture infrastructure, string? postgresConnectionString = null, string? redisConnectionString = null, bool withMessaging = true)`, which Task 5 extends.

- [ ] **Step 1: Add the packages and the Reviews.Contracts project**

In `backend/Directory.Packages.props`, add after the `API` item group:

```xml
  <ItemGroup Label="Messaging">
    <PackageVersion Include="WolverineFx.EntityFrameworkCore" Version="6.40.0" />
    <PackageVersion Include="WolverineFx.Postgresql" Version="6.40.0" />
    <PackageVersion Include="WolverineFx.RuntimeCompilation" Version="6.40.0" />
  </ItemGroup>
```

In `backend/src/Airbnb.Api/Airbnb.Api.csproj`, add after the `Scalar.AspNetCore` reference:

```xml
    <PackageReference Include="WolverineFx.EntityFrameworkCore" />
    <PackageReference Include="WolverineFx.Postgresql" />
    <PackageReference Include="WolverineFx.RuntimeCompilation" />
```

`backend/src/Modules/Reviews/Airbnb.Modules.Reviews.Contracts/Airbnb.Modules.Reviews.Contracts.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">
</Project>
```

`ReviewSubjectType.cs`:

```csharp
namespace Airbnb.Modules.Reviews.Contracts;

public enum ReviewSubjectType
{
    Stay,
    Experience,
}
```

`ReviewSubmitted.cs`:

```csharp
namespace Airbnb.Modules.Reviews.Contracts;

// Published once a review is stored; Stays and Experiences consume it to update their own rating copies (spec §3).
public sealed record ReviewSubmitted(string ReviewId, ReviewSubjectType SubjectType, string SubjectId, int Rating, DateTimeOffset OccurredAt);
```

In `backend/Airbnb.slnx`, inside `<Folder Name="/src/Modules/Reviews/">`, add `<Project Path="src/Modules/Reviews/Airbnb.Modules.Reviews.Contracts/Airbnb.Modules.Reviews.Contracts.csproj" />`.

In `Airbnb.Modules.Reviews.csproj`:
- add `<PackageReference Include="WolverineFx.EntityFrameworkCore" />` next to the EF Design reference;
- add the project references:

```xml
    <ProjectReference Include="..\Airbnb.Modules.Reviews.Contracts\Airbnb.Modules.Reviews.Contracts.csproj" />
    <ProjectReference Include="..\..\Stays\Airbnb.Modules.Stays.Contracts\Airbnb.Modules.Stays.Contracts.csproj" />
    <ProjectReference Include="..\..\Experiences\Airbnb.Modules.Experiences.Contracts\Airbnb.Modules.Experiences.Contracts.csproj" />
```

Architecture tests:
- add `<ProjectReference Include="..\..\src\Modules\Reviews\Airbnb.Modules.Reviews.Contracts\Airbnb.Modules.Reviews.Contracts.csproj" />` to `Airbnb.ArchitectureTests.csproj`;
- in `ModuleRulesTests.cs`, add `using Airbnb.Modules.Reviews.Contracts;` and `["Airbnb.Modules.Reviews.Contracts"] = typeof(ReviewSubmitted),` to `Contracts`.

- [ ] **Step 2: Rework `ApiFactory` and its explicit callers**

`backend/tests/Airbnb.Api.Tests/Infrastructure/ApiFactory.cs` in full:

```csharp
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Wolverine;

namespace Airbnb.Api.Tests.Infrastructure;

// The API against the shared test containers; a test overrides a connection string to simulate a dead dependency.
public sealed class ApiFactory(
    InfrastructureFixture infrastructure,
    string? postgresConnectionString = null,
    string? redisConnectionString = null,
    bool withMessaging = true) : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder
            .UseSetting("ConnectionStrings:airbnb", postgresConnectionString ?? infrastructure.PostgresConnectionString)
            .UseSetting("ConnectionStrings:redis", redisConnectionString ?? infrastructure.RedisConnectionString);

        // Wolverine can't start without a reachable Postgres; tests that point the API at a dead database switch it off.
        if (!withMessaging)
        {
            builder.ConfigureTestServices(services =>
            {
                services.DisableAllWolverineMessagePersistence();
                services.DisableAllExternalWolverineTransports();
            });
        }
    }
}
```

In `HealthEndpointTests.GetAsync`, replace
`new ApiFactory(connectionString, infrastructure.RedisConnectionString)` with
`new ApiFactory(infrastructure, postgresConnectionString: connectionString, withMessaging: false)`.

In `StaysEndpointTests.Listings_are_still_served_when_redis_is_unreachable`, replace
`new ApiFactory(infrastructure.PostgresConnectionString, "127.0.0.1:1,abortConnect=false,connectTimeout=200")` with
`new ApiFactory(infrastructure, redisConnectionString: "127.0.0.1:1,abortConnect=false,connectTimeout=200")`.

Every other caller already uses `new ApiFactory(infrastructure)`.

- [ ] **Step 3: Write the failing endpoint tests**

`backend/tests/Airbnb.Api.Tests/Reviews/SubmitReviewTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Airbnb.Api.Tests.Infrastructure;

namespace Airbnb.Api.Tests.Reviews;

// Posts reviews for l12 and e11, which no read test asserts on.
public sealed class SubmitReviewTests(InfrastructureFixture infrastructure)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private const string ValidBody = """{"subjectType":"stay","subjectId":"l12","authorName":"Ana","rating":4,"body":"Lovely stay."}""";

    [Fact]
    public async Task A_valid_review_gets_201_with_the_stored_review()
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();

        using var response = await PostAsync(client,
            """{"subjectType":"stay","subjectId":"l12","authorName":"  Ana  ","rating":4,"body":"  Lovely stay.  "}""");

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var review = (await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("data");
        Assert.Equal(7, Guid.Parse(review.GetProperty("id").GetString()!).Version);
        Assert.Equal("stay", review.GetProperty("subjectType").GetString());
        Assert.Equal("l12", review.GetProperty("subjectId").GetString());
        Assert.Equal("Ana", review.GetProperty("authorName").GetString());
        Assert.StartsWith("https://images.unsplash.com/", review.GetProperty("authorAvatar").GetString());
        Assert.Equal(4, review.GetProperty("rating").GetInt32());
        Assert.Equal("Lovely stay.", review.GetProperty("body").GetString());
        Assert.InRange(review.GetProperty("createdAt").GetDateTimeOffset(), DateTimeOffset.UtcNow.AddMinutes(-1), DateTimeOffset.UtcNow.AddMinutes(1));
    }

    [Fact]
    public async Task A_new_review_shows_up_first_even_when_the_list_was_cached()
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();
        var before = await client.GetFromJsonAsync<JsonElement>("/api/reviews?subjectId=e11", Ct); // puts the list in the cache

        using var response = await PostAsync(client,
            """{"subjectType":"experience","subjectId":"e11","authorName":"Kai","rating":5,"body":"Great guide."}""");
        var posted = (await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("data").GetProperty("id").GetString();

        var after = await client.GetFromJsonAsync<JsonElement>("/api/reviews?subjectId=e11", Ct);
        Assert.Equal(posted, after.Ids()[0]);
        Assert.Equal(before.GetProperty("meta").GetProperty("total").GetInt32() + 1, after.GetProperty("meta").GetProperty("total").GetInt32());
    }

    [Theory]
    [InlineData("stay", "l999", "Listing 'l999' was not found")]
    [InlineData("experience", "e999", "Experience 'e999' was not found")]
    [InlineData("experience", "l3", "Experience 'l3' was not found")]
    [InlineData("stay", "e2", "Listing 'e2' was not found")]
    public async Task Unknown_subjects_get_the_404_envelope(string subjectType, string subjectId, string error)
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();

        using var response = await PostAsync(client, With(("subjectType", $"\"{subjectType}\""), ("subjectId", $"\"{subjectId}\"")));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal($$"""{"success":false,"error":"{{error}}"}""", await response.Content.ReadAsStringAsync(Ct));
    }

    // Each value is a JSON literal that replaces one field of a valid body.
    public static TheoryData<string, string> InvalidFields => new()
    {
        { "subjectType", "\"service\"" },
        { "subjectType", "null" },
        { "subjectId", "\"\"" },
        { "subjectId", $"\"{new string('x', 51)}\"" },
        { "authorName", "\"   \"" },
        { "authorName", $"\"{new string('a', 61)}\"" },
        { "rating", "0" },
        { "rating", "6" },
        { "body", "\"\"" },
        { "body", $"\"{new string('b', 1001)}\"" },
    };

    [Theory]
    [MemberData(nameof(InvalidFields))]
    public async Task Invalid_fields_get_the_400_envelope_naming_the_field(string field, string json)
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();

        using var response = await PostAsync(client, With((field, json)));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
        Assert.False(body.GetProperty("success").GetBoolean());
        Assert.StartsWith($"{char.ToUpperInvariant(field[0])}{field[1..]}:", body.GetProperty("error").GetString());
    }

    [Theory]
    [InlineData("""{"subjectType":"stay","subjectId":"l12","authorName":"Ana","rating":4.5,"body":"b"}""")]
    [InlineData("""{"subjectType":"stay","subjectId":"l12","authorName":"Ana","rating":"five","body":"b"}""")]
    [InlineData("""{not json""")]
    [InlineData("")]
    public async Task Unparsable_bodies_get_the_400_envelope(string json)
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();

        using var response = await PostAsync(client, json);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("""{"success":false,"error":"Bad Request"}""", await response.Content.ReadAsStringAsync(Ct));
    }

    private static Task<HttpResponseMessage> PostAsync(HttpClient client, string json) =>
        client.PostAsync("/api/reviews", new StringContent(json, Encoding.UTF8, "application/json"), Ct);

    // A valid body with some fields replaced by raw JSON values.
    private static string With(params (string Field, string Json)[] overrides)
    {
        var body = JsonNode.Parse(ValidBody)!.AsObject();
        foreach (var (field, json) in overrides)
        {
            body[field] = JsonNode.Parse(json);
        }

        return body.ToJsonString();
    }
}
```

- [ ] **Step 4: Run and confirm failure**

Run: `cd backend && dotnet test --project tests/Airbnb.Api.Tests --filter-class "Airbnb.Api.Tests.Reviews.SubmitReviewTests"`
Expected: the tests FAIL: `POST /api/reviews` has no endpoint yet, so the valid/404/400 cases get 405/404 instead of 201 and the field messages.

- [ ] **Step 5: Wire Wolverine into the API**

In `backend/src/Airbnb.Api/Program.cs`, add the usings `using Wolverine;`, `using Wolverine.EntityFrameworkCore;` and `using Wolverine.Postgresql;`.

After `builder.AddServiceDefaults();`, add:

```csharp
builder.Services.AddSingleton(TimeProvider.System);
```

After `builder.AddReviewsModule();`, add:

```csharp
// The one write flow (spec §3): a review and its ReviewSubmitted event commit in one Postgres transaction (outbox),
// and Wolverine relays the event afterwards. Its tables live in their own "wolverine" schema, created at startup.
builder.UseWolverine(options =>
{
    options.PersistMessagesWithPostgresql(builder.Configuration.GetConnectionString("airbnb")!, "wolverine");
    options.UseEntityFrameworkCoreTransactions();
});
```

- [ ] **Step 6: Implement the slice**

`backend/src/Modules/Reviews/Airbnb.Modules.Reviews/SubmitReview.cs`:

```csharp
using System.ComponentModel.DataAnnotations;
using Airbnb.Modules.Experiences.Contracts;
using Airbnb.Modules.Reviews.Contracts;
using Airbnb.Modules.Reviews.Data;
using Airbnb.Modules.Stays.Contracts;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Caching.Hybrid;
using Wolverine.EntityFrameworkCore;

namespace Airbnb.Modules.Reviews;

internal static class SubmitReview
{
    // On images.unsplash.com, which next.config.ts allows; callers can't choose an avatar (spec §3).
    internal const string DefaultAvatar = "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=120&q=80";

    // public for the validation generator; still invisible outside the assembly because the class is internal.
    // Strings are nullable so a missing field reaches validation and gets a field-level message.
    public sealed record Command(
        [property: Required, AllowedValues("stay", "experience", ErrorMessage = "The SubjectType field must be 'stay' or 'experience'.")]
        string? SubjectType,
        [property: Required, StringLength(50, MinimumLength = 1)] string? SubjectId,
        [property: Required, StringLength(60, MinimumLength = 1)] string? AuthorName,
        [property: Range(1, 5)] int Rating,
        [property: Required, StringLength(1000, MinimumLength = 1)] string? Body);

    internal sealed class Handler(
        IDbContextOutbox<ReviewsDbContext> outbox,
        IListingLookup listings,
        IExperienceLookup experiences,
        TimeProvider time,
        HybridCache cache)
    {
        // Returns null when the subject doesn't exist.
        public async Task<ReviewDto?> HandleAsync(Command command, CancellationToken cancellationToken)
        {
            var subjectType = command.SubjectType == "stay" ? ReviewSubjectType.Stay : ReviewSubjectType.Experience;
            var exists = subjectType == ReviewSubjectType.Stay
                ? await listings.ExistsAsync(command.SubjectId!, cancellationToken)
                : await experiences.ExistsAsync(command.SubjectId!, cancellationToken);
            if (!exists)
            {
                return null;
            }

            var review = new Review
            {
                Id = Guid.CreateVersion7().ToString(),
                SubjectType = command.SubjectType!,
                SubjectId = command.SubjectId!,
                AuthorName = command.AuthorName!.Trim(),
                AuthorAvatar = DefaultAvatar,
                Rating = command.Rating,
                Body = command.Body!.Trim(),
                CreatedAt = time.GetUtcNow(),
            };

            outbox.DbContext.Reviews.Add(review);
            await outbox.PublishAsync(new ReviewSubmitted(review.Id, subjectType, review.SubjectId, review.Rating, review.CreatedAt));
            // One Postgres transaction for the review row and the outgoing event, then the event is relayed.
            await outbox.SaveChangesAndFlushMessagesAsync(cancellationToken);
            // After the commit, so a concurrent read can't re-cache the list without the new review.
            await cache.RemoveByTagAsync(ReviewsModule.CacheTag, cancellationToken);

            return new ReviewDto(
                review.Id, review.SubjectType, review.SubjectId, review.AuthorName, review.AuthorAvatar, review.Rating, review.Body, review.CreatedAt);
        }
    }

    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapPost("/reviews", async Task<Results<Created<ApiResponse<ReviewDto>>, NotFound<ApiResponse<object>>>> (
            Command command, Handler handler, CancellationToken cancellationToken) =>
            await handler.HandleAsync(command, cancellationToken) is { } review
                ? TypedResults.Created((string?)null, ApiResponse.Ok(review))
                : TypedResults.NotFound(ApiResponse.Fail(
                    $"{(command.SubjectType == "stay" ? "Listing" : "Experience")} '{command.SubjectId}' was not found")));
}
```

In `ReviewsModule.AddReviewsModule`, add `builder.Services.AddScoped<SubmitReview.Handler>();` after the `ListReviews.Handler` registration. In `MapReviewsEndpoints`, add `SubmitReview.Map(api);` after `ListReviews.Map(api);`.

In `Review.cs`, replace the comment `// "stay" or "experience" (phase 4 turns this into an enum in Reviews.Contracts).` with `// "stay" or "experience", as on the wire; ReviewSubmitted carries it as Reviews.Contracts.ReviewSubjectType.`

- [ ] **Step 7: Run the tests and confirm they pass**

```bash
dotnet test --project tests/Airbnb.Api.Tests --filter-class "Airbnb.Api.Tests.Reviews.SubmitReviewTests"
dotnet test --project tests/Airbnb.ArchitectureTests
dotnet test --project tests/Airbnb.Api.Tests
dotnet test --project tests/Airbnb.UnitTests
```

Expected:
- all SubmitReviewTests PASS: 1 + 1 + 4 + 10 + 4 = 20;
- architecture has 16 tests, with Reviews now referencing only SharedKernel and Contracts;
- the full integration suite passes, including the health and Redis-down tests on the reworked factory;
- unit tests: 17.

- [ ] **Step 8: Commit**

```bash
git add backend/Directory.Packages.props backend/Airbnb.slnx backend/src/Airbnb.Api backend/src/Modules/Reviews backend/tests
git status --short   # expect only this task's files
git commit -m "feat: add POST /api/reviews with a Wolverine outbox for ReviewSubmitted

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: RabbitMQ delivery, rating consumers and tracing

**Files:**
- Modify: `backend/Directory.Packages.props` (add `WolverineFx.RabbitMQ` and `Testcontainers.RabbitMq`)
- Modify: `backend/src/Airbnb.Api/Airbnb.Api.csproj`, `backend/src/Airbnb.Api/Program.cs`
- Create: `backend/src/Airbnb.Api/Messaging/StaysReviewSubmittedHandler.cs`, `Messaging/ExperiencesReviewSubmittedHandler.cs`
- Modify: `backend/src/Airbnb.ServiceDefaults/Extensions.cs`
- Modify: `backend/tests/Airbnb.Api.Tests/Airbnb.Api.Tests.csproj`, `Infrastructure/InfrastructureFixture.cs`, `Infrastructure/ApiFactory.cs`
- Test: `backend/tests/Airbnb.UnitTests/Api/ReviewSubmittedHandlerTests.cs`, `backend/tests/Airbnb.Api.Tests/Reviews/ReviewFlowTests.cs`

**Interfaces:**
- Consumes: `ReviewSubmitted`, `ReviewSubjectType` (Task 4); `IListingReviewStats` (Task 2); `IExperienceReviewStats` (Task 3); the existing Aspire `rabbitmq` resource, which the API already references.
- Produces:
  - `public static class StaysReviewSubmittedHandler { public static Task HandleAsync(ReviewSubmitted, IListingReviewStats, CancellationToken) }`;
  - `ExperiencesReviewSubmittedHandler`, the same with `IExperienceReviewStats`;
  - `InfrastructureFixture.RabbitMqConnectionString`.

- [ ] **Step 1: Write the failing unit tests for the handlers' routing**

`backend/tests/Airbnb.UnitTests/Api/ReviewSubmittedHandlerTests.cs`:

```csharp
using Airbnb.Api.Messaging;
using Airbnb.Modules.Experiences.Contracts;
using Airbnb.Modules.Reviews.Contracts;
using Airbnb.Modules.Stays.Contracts;

namespace Airbnb.UnitTests.Api;

public sealed class ReviewSubmittedHandlerTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static ReviewSubmitted Review(ReviewSubjectType type, string subjectId) =>
        new("r1", type, subjectId, 4, DateTimeOffset.UnixEpoch);

    [Fact]
    public async Task A_stay_review_reaches_the_listing_stats_only()
    {
        var listings = new FakeStats();
        var experiences = new FakeStats();

        await StaysReviewSubmittedHandler.HandleAsync(Review(ReviewSubjectType.Stay, "l3"), listings, Ct);
        await ExperiencesReviewSubmittedHandler.HandleAsync(Review(ReviewSubjectType.Stay, "l3"), experiences, Ct);

        Assert.Equal(["r1 l3 4"], listings.Applied);
        Assert.Empty(experiences.Applied);
    }

    [Fact]
    public async Task An_experience_review_reaches_the_experience_stats_only()
    {
        var listings = new FakeStats();
        var experiences = new FakeStats();

        await StaysReviewSubmittedHandler.HandleAsync(Review(ReviewSubjectType.Experience, "e2"), listings, Ct);
        await ExperiencesReviewSubmittedHandler.HandleAsync(Review(ReviewSubjectType.Experience, "e2"), experiences, Ct);

        Assert.Empty(listings.Applied);
        Assert.Equal(["r1 e2 4"], experiences.Applied);
    }

    private sealed class FakeStats : IListingReviewStats, IExperienceReviewStats
    {
        public List<string> Applied { get; } = [];

        public Task ApplyReviewAsync(string reviewId, string subjectId, int rating, CancellationToken cancellationToken)
        {
            Applied.Add($"{reviewId} {subjectId} {rating}");
            return Task.CompletedTask;
        }
    }
}
```

The UnitTests project already references `Airbnb.Api`, which brings the Contracts assemblies in transitively.

- [ ] **Step 2: Run and confirm failure**

Run: `cd backend && dotnet build tests/Airbnb.UnitTests`
Expected: build FAILS because `StaysReviewSubmittedHandler` / `ExperiencesReviewSubmittedHandler` don't exist.

- [ ] **Step 3: Implement the handlers**

`backend/src/Airbnb.Api/Messaging/StaysReviewSubmittedHandler.cs`:

```csharp
using Airbnb.Modules.Reviews.Contracts;
using Airbnb.Modules.Stays.Contracts;

namespace Airbnb.Api.Messaging;

// Wolverine runs only public handler types, and a module exposes nothing but its module class, so consumers live in
// the host and hand the event to the module through its Contracts interface.
public static class StaysReviewSubmittedHandler
{
    public static Task HandleAsync(ReviewSubmitted message, IListingReviewStats stats, CancellationToken cancellationToken) =>
        message.SubjectType == ReviewSubjectType.Stay
            ? stats.ApplyReviewAsync(message.ReviewId, message.SubjectId, message.Rating, cancellationToken)
            : Task.CompletedTask;
}
```

`backend/src/Airbnb.Api/Messaging/ExperiencesReviewSubmittedHandler.cs`:

```csharp
using Airbnb.Modules.Experiences.Contracts;
using Airbnb.Modules.Reviews.Contracts;

namespace Airbnb.Api.Messaging;

// Wolverine runs only public handler types, and a module exposes nothing but its module class, so consumers live in
// the host and hand the event to the module through its Contracts interface.
public static class ExperiencesReviewSubmittedHandler
{
    public static Task HandleAsync(ReviewSubmitted message, IExperienceReviewStats stats, CancellationToken cancellationToken) =>
        message.SubjectType == ReviewSubjectType.Experience
            ? stats.ApplyReviewAsync(message.ReviewId, message.SubjectId, message.Rating, cancellationToken)
            : Task.CompletedTask;
}
```

Run: `dotnet test --project tests/Airbnb.UnitTests`. Expected: 19 PASS (17 + 2).

- [ ] **Step 4: Add RabbitMQ to the test infrastructure**

In `backend/Directory.Packages.props`:
- in the `Messaging` group, add `<PackageVersion Include="WolverineFx.RabbitMQ" Version="6.40.0" />` (keep alphabetical order);
- in the `Tests` group, add `<PackageVersion Include="Testcontainers.RabbitMq" Version="4.15.0" />` after `Testcontainers.PostgreSql`.

In `backend/src/Airbnb.Api/Airbnb.Api.csproj`, add `<PackageReference Include="WolverineFx.RabbitMQ" />`.
In `backend/tests/Airbnb.Api.Tests/Airbnb.Api.Tests.csproj`, add `<PackageReference Include="Testcontainers.RabbitMq" />`.

`InfrastructureFixture.cs`:
- add `using DotNet.Testcontainers.Builders;` and `using Testcontainers.RabbitMq;`;
- update the class comment's first line to "One Postgres, one Redis and one RabbitMQ container for the whole test run";
- add the field and property after the Redis ones:

```csharp
    // Readiness by port, not the default log check: log checks miss RabbitMQ's startup line when the Docker VM's clock
    // lags the host's. RabbitMQ opens 5672 last, once it is ready.
    private readonly RabbitMqContainer _rabbitMq = new RabbitMqBuilder("rabbitmq:4.3-management")
        .WithWaitStrategy(Wait.ForUnixContainer().UntilInternalTcpPortIsAvailable(5672))
        .Build();

    public string RabbitMqConnectionString => _rabbitMq.GetConnectionString();
```

- in `InitializeAsync`, add `await _rabbitMq.StartAsync();` after `await _redis.StartAsync();`;
- in `DisposeAsync`, add `await _rabbitMq.DisposeAsync();` before `await _redis.DisposeAsync();`.

`ApiFactory.cs`: add `.UseSetting("ConnectionStrings:rabbitmq", infrastructure.RabbitMqConnectionString)` to the `UseSetting` chain.

- [ ] **Step 5: Write the failing end-to-end tests**

`backend/tests/Airbnb.Api.Tests/Reviews/ReviewFlowTests.cs`:

```csharp
using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Airbnb.Api.Tests.Infrastructure;

namespace Airbnb.Api.Tests.Reviews;

// The whole write flow: POST → outbox → RabbitMQ → module handler → rating update (spec §3).
// Uses l10, l11 and e10, which no read test asserts on.
public sealed class ReviewFlowTests(InfrastructureFixture infrastructure)
{
    private static readonly TimeSpan DeliveryTimeout = TimeSpan.FromSeconds(20);

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task A_stay_review_updates_the_listing_rating_and_count()
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();
        var before = await GetStatsAsync(client, "/api/listings/l10");

        await PostReviewAsync(client, "stay", "l10", rating: 1);

        var after = await WaitForStatsAsync(client, "/api/listings/l10", stats => stats.ReviewCount == before.ReviewCount + 1);
        Assert.Equal(ExpectedRating(before, 1), after.Rating);
    }

    [Fact]
    public async Task An_experience_review_updates_the_experience_rating_and_count()
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();
        var before = await GetStatsAsync(client, "/api/experiences/e10");

        await PostReviewAsync(client, "experience", "e10", rating: 2);

        var after = await WaitForStatsAsync(client, "/api/experiences/e10", stats => stats.ReviewCount == before.ReviewCount + 1);
        Assert.Equal(ExpectedRating(before, 2), after.Rating);
    }

    [Fact]
    public async Task Concurrent_reviews_of_one_listing_are_all_counted()
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();
        var before = await GetStatsAsync(client, "/api/listings/l11");

        // Three writes stay under the 10-per-minute write limit of one API instance.
        await Task.WhenAll(Enumerable.Range(0, 3).Select(_ => PostReviewAsync(client, "stay", "l11", rating: 5)));

        await WaitForStatsAsync(client, "/api/listings/l11", stats => stats.ReviewCount == before.ReviewCount + 3);
    }

    private static async Task PostReviewAsync(HttpClient client, string subjectType, string subjectId, int rating)
    {
        var json = JsonSerializer.Serialize(new { subjectType, subjectId, authorName = "Flow test", rating, body = "End to end." });
        using var response = await client.PostAsync("/api/reviews", new StringContent(json, Encoding.UTF8, "application/json"), Ct);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    private static async Task<(int ReviewCount, decimal Rating)> GetStatsAsync(HttpClient client, string path)
    {
        var item = (await client.GetFromJsonAsync<JsonElement>(path, Ct)).GetProperty("data");
        return (item.GetProperty("reviewCount").GetInt32(), item.GetProperty("rating").GetDecimal());
    }

    // The update is asynchronous (RabbitMQ in between), so poll until it lands or the timeout passes.
    private static async Task<(int ReviewCount, decimal Rating)> WaitForStatsAsync(
        HttpClient client, string path, Func<(int ReviewCount, decimal Rating), bool> isDone)
    {
        var stopwatch = Stopwatch.StartNew();
        while (true)
        {
            var stats = await GetStatsAsync(client, path);
            if (isDone(stats))
            {
                return stats;
            }

            Assert.True(stopwatch.Elapsed < DeliveryTimeout, $"{path} still shows {stats} after {DeliveryTimeout}");
            await Task.Delay(200, Ct);
        }
    }

    // What the database computes: the new average rounded to 2 places, half away from zero like Postgres round().
    private static decimal ExpectedRating((int ReviewCount, decimal Rating) before, int rating) =>
        Math.Round((before.Rating * before.ReviewCount + rating) / (before.ReviewCount + 1), 2, MidpointRounding.AwayFromZero);
}
```

Run: `dotnet test --project tests/Airbnb.Api.Tests --filter-class "Airbnb.Api.Tests.Reviews.ReviewFlowTests"`
Expected: FAIL after the 20 s timeout ("still shows …"). Nothing routes `ReviewSubmitted` yet, so no counter changes.

- [ ] **Step 6: Route the event through RabbitMQ to the handlers**

In `Program.cs`, add:
- `using Airbnb.Modules.Experiences.Contracts;`
- `using Airbnb.Modules.Reviews.Contracts;`
- `using Airbnb.Modules.Stays.Contracts;`
- `using Npgsql;`
- `using Wolverine.ErrorHandling;`
- `using Wolverine.RabbitMQ;`

Replace the `builder.UseWolverine(...)` block from Task 4, including its comment, with:

```csharp
// The one write flow (spec §3): a review and its ReviewSubmitted event commit in one Postgres transaction (outbox),
// then Wolverine relays the event to a durable RabbitMQ queue that this API also listens on (durable inbox).
// Its tables live in their own "wolverine" schema, and its exchange and queues are created at startup.
builder.UseWolverine(options =>
{
    const string reviewSubmittedQueue = "reviews.review-submitted";

    options.PersistMessagesWithPostgresql(builder.Configuration.GetConnectionString("airbnb")!, "wolverine");
    options.UseEntityFrameworkCoreTransactions();

    options.UseRabbitMqUsingNamedConnection("rabbitmq").AutoProvision();
    options.PublishMessage<ReviewSubmitted>().ToRabbitQueue(reviewSubmittedQueue);
    options.ListenToRabbitQueue(reviewSubmittedQueue).UseDurableInbox();

    // Each module's handler gets the message on its own, with its own retries: one failing never blocks or re-runs another.
    options.MultipleHandlerBehavior = MultipleHandlerBehavior.Separated;

    // The handlers in Messaging/ reach each module through its Contracts interface; the implementations are internal,
    // so Wolverine's generated code has to resolve them from the container.
    options.CodeGeneration.AlwaysUseServiceLocationFor<IListingReviewStats>();
    options.CodeGeneration.AlwaysUseServiceLocationFor<IExperienceReviewStats>();

    // Transient database errors: three retries with cooldowns, then the error queue (spec §3).
    options.OnException<NpgsqlException>(exception => exception.IsTransient)
        .RetryWithCooldown(TimeSpan.FromMilliseconds(100), TimeSpan.FromMilliseconds(500), TimeSpan.FromSeconds(2))
        .Then.MoveToErrorQueue();
});
```

Wolverine finds the two handlers by convention: public classes in the application assembly whose names end in `Handler` and that have a `Handle`/`HandleAsync` method.

In `backend/src/Airbnb.ServiceDefaults/Extensions.cs`, in `ConfigureOpenTelemetry`, change

```csharp
                tracing.AddSource(builder.Environment.ApplicationName)
```

to

```csharp
                tracing.AddSource(builder.Environment.ApplicationName)
                    // Wolverine's spans, so one trace shows POST /api/reviews → outbox → RabbitMQ → each module's handler.
                    .AddSource("Wolverine")
```

- [ ] **Step 7: Run everything and confirm it passes**

```bash
dotnet test --project tests/Airbnb.Api.Tests --filter-class "Airbnb.Api.Tests.Reviews.ReviewFlowTests"
dotnet test --project tests/Airbnb.Api.Tests
dotnet test --project tests/Airbnb.UnitTests
dotnet test --project tests/Airbnb.ArchitectureTests
```

Expected:
- the 3 flow tests PASS, each within a few seconds;
- the full integration suite passes;
- unit tests 19;
- architecture tests 16.

Then the AppHost smoke test, which proves the API still starts under Aspire with RabbitMQ. Port 3000 must be free; if something holds it, report that instead of stopping it.
`dotnet test --project tests/Airbnb.AppHost.Tests`: expected 1 PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/Directory.Packages.props backend/src/Airbnb.Api backend/src/Airbnb.ServiceDefaults backend/tests
git status --short   # expect only this task's files
git commit -m "feat: deliver ReviewSubmitted through RabbitMQ to rating handlers

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Docs, spec amendments and verification

**Files:**
- Modify: `README.md`, `CLAUDE.md`, `docs/superpowers/specs/2026-09-26-backend-modular-monolith-design.md`

- [ ] **Step 1: README**

In the **Backend** section's bullet list, after the "Read API" bullet, add:

```markdown
- Write API: `POST /api/reviews` with `{ subjectType: "stay" | "experience", subjectId, authorName, rating (1–5), body }` → 201 with the review. The listing's or experience's rating and review count update a moment later, via RabbitMQ; the trace shows up in the dashboard. Try it in `/scalar`.
```

- [ ] **Step 2: CLAUDE.md**

In **Repository Layout**, in the backend bullet's project list, add after `src/Airbnb.MigrationService`:
`, module Contracts projects (`src/Modules/<Name>/Airbnb.Modules.<Name>.Contracts`: plain interfaces and records other modules may reference)`.

Append to **Backend Conventions**:

```markdown
- Cross-module calls go through `*.Contracts` projects (interfaces and records, referencing nothing of ours). A module references SharedKernel and other modules' Contracts only; `ModuleRulesTests` checks exact assembly names.
- Wolverine runs only public handler types, so message handlers live in `Airbnb.Api/Messaging/` and call a module through its Contracts interface; register each such interface with `options.CodeGeneration.AlwaysUseServiceLocationFor<T>()` in `Program.cs`. The review command doesn't use a handler: `SubmitReview` writes through `IDbContextOutbox<ReviewsDbContext>` (review row + event in one transaction).
- Consumers apply a review once per review id: `SharedKernel.Persistence.ReviewStatistics.ApplyOnceAsync` records it in the module's `applied_reviews` table and runs one atomic `UPDATE` in the same transaction, then the module invalidates its cache tag. Raw SQL quotes the PascalCase column names (`"ReviewCount"`).
- Integration tests also run a RabbitMQ container (readiness by port 5672: the default log check hangs when the Docker VM clock lags). `new ApiFactory(infrastructure, postgresConnectionString: …, withMessaging: false)` is for tests that point the API at a dead database. Write tests use subjects no read test asserts on (never `l1`/`e1`).
```

- [ ] **Step 3: Record the spike-forced deviations in the spec**

In `docs/superpowers/specs/2026-09-26-backend-modular-monolith-design.md`, make these edits.

1. In the §1 module tree, replace the line
   `├── ReviewSubmittedHandler.cs     # consumes Reviews.Contracts.ReviewSubmitted`
   with
   `├── Listings/ListingReviewStats.cs  # implements Stays.Contracts.IListingReviewStats (applies ReviewSubmitted)`.
2. In the §1 solution layout, change the Stays.Contracts comment `# IListingLookup` to `# IListingLookup, IListingReviewStats`, and the Experiences.Contracts comment `# IExperienceLookup` to `# IExperienceLookup, IExperienceReviewStats`.
3. In §1 **How modules talk**, replace the bullet that begins `- **Asynchronous, over RabbitMQ:**` with:

   ```markdown
   - **Asynchronous, over RabbitMQ:** Reviews publishes `ReviewSubmitted`; handlers in the API host
     (`Airbnb.Api/Messaging/`) pass it to Stays and Experiences through `IListingReviewStats` /
     `IExperienceReviewStats`, which update each module's own copy of rating and review count. (Wolverine only
     runs public handler types, so consumers can't live inside a module whose only public type is its module class.)
   ```

4. In §3 **Flow**, replace steps 1–5 with:

   ```markdown
   1. Built-in validation runs; the slice handler (a plain DI-registered class, like the read slices) takes over.
      Malformed bodies get the 400 envelope too.
   2. It asks `IListingLookup` or `IExperienceLookup` whether the subject exists → 404 envelope if not.
   3. It adds the review (UUIDv7 id, `createdAt` from `TimeProvider`, default avatar) through
      `IDbContextOutbox<ReviewsDbContext>` and publishes
      `ReviewSubmitted { reviewId, subjectType, subjectId, rating, occurredAt }`;
      `SaveChangesAndFlushMessagesAsync` commits the review row and the outgoing envelope in **one Postgres
      transaction** (outbox), then Wolverine relays the message to RabbitMQ. The endpoint then invalidates the
      `reviews` tag (after the commit, so a read can't re-cache pre-commit data) and responds **201**.
   4. The API listens on the RabbitMQ queue with a durable inbox. With `MultipleHandlerBehavior.Separated`,
      Wolverine hands the message to each handler separately — own retries; one failing never blocks or re-runs
      another:
      - **Stays / Experiences:** ignore subjects that aren't theirs; otherwise, in one transaction, record the review
        id in the module's `applied_reviews` table and run one atomic statement —
        `UPDATE … SET "ReviewCount" = "ReviewCount" + 1, "Rating" = round(("Rating" * "ReviewCount" + @rating) / ("ReviewCount" + 1), 2) WHERE "Id" = @subjectId`
        — then invalidate their cache tag. No read-modify-write, so concurrent reviews can't lose updates.
   5. **Duplicates:** a redelivered message finds its review id in `applied_reviews` and changes nothing.
   ```

   Leave step 6 (failures) and the paragraphs after it as they are.

- [ ] **Step 4: Full verification (from `backend/`; port 3000 free; Docker running)**

Run: `dotnet test`
Expected: unit 19, architecture 16, integration all passing (45 existing + 2 + 4 + 3 + 20 + 3 = 77), AppHost 1.

- [ ] **Step 5: The write flow under Aspire (spec §11.5), from PowerShell**

If `aspire run` is already running this repository, reuse it after restarting it so it picks up this branch's code (`aspire stop --non-interactive`, then start). Otherwise:

```powershell
cd D:\PersonalProjects\airbnb\backend
aspire start --non-interactive
aspire wait api --non-interactive
$before = (Invoke-RestMethod http://localhost:5283/api/listings/l14).data
$body = '{"subjectType":"stay","subjectId":"l14","authorName":"Aspire check","rating":5,"body":"Works end to end."}'
Invoke-WebRequest -Method Post -Uri http://localhost:5283/api/reviews -ContentType 'application/json' -Body $body | Select-Object StatusCode
Start-Sleep -Seconds 3
$after = (Invoke-RestMethod http://localhost:5283/api/listings/l14).data
"$($before.reviewCount) $($before.rating) -> $($after.reviewCount) $($after.rating)"
aspire stop --non-interactive
```

Expected: `StatusCode 201`, and the review count increases by 1 with a recomputed rating.

Leave the stack running long enough for a person to open the dashboard's Traces page and see one trace spanning `POST /api/reviews` → RabbitMQ → the Stays handler's `UPDATE` (spec §11.5). Report the dashboard URL printed by `aspire start`; the trace check itself is visual.

This writes one real review into the persistent dev database. That is intended: the spec keeps submitted reviews.

- [ ] **Step 6: Commit the docs**

```bash
cd D:/PersonalProjects/airbnb
git add README.md CLAUDE.md docs/superpowers/specs/2026-09-26-backend-modular-monolith-design.md
git commit -m "docs: document the review write flow and the Wolverine-driven design changes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
