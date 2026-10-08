# Backend Bookings with Availability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bookings persisted by a backend `Bookings` module. Postgres refuses overlapping stays, guests can cancel upcoming trips, and the listing calendar greys out booked nights. Mock mode behaves the same.

**Architecture:**
- **Backend:** a new `Bookings` module in schema `bookings`.
  - A `btree_gist` exclusion constraint over the `[CheckIn, CheckOut)` date range of confirmed rows enforces "no double-booking".
  - Prices come from Stays through a new `IListingLookup.FindForBookingAsync`, except for frontend-owned `hl-` listings, which carry a `quote`.
- **Frontend:**
  - `BookingRepository` grows `cancel`, `listForHost` and `availability`.
  - The mock keeps parity, and a new HTTP repository forwards the session token as a bearer in api mode.
  - The calendar uses availability through TanStack Query.

**Tech Stack:** .NET 10, EF Core 10 with Npgsql (`DateOnly` ↔ `date`), PostgreSQL 18 (`btree_gist`), xUnit v3, Testcontainers, Next.js 16, Zod v4, TanStack Query v5, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-08-backend-bookings-design.md`

**Paths:** backend paths are relative to `backend/` (run `dotnet` there; Docker must be running). Frontend paths are relative to `frontend/` (run npm/npx there).

## Global Constraints

### Backend

- **Module rules (CLAUDE.md):**
  - The only public type is `BookingsModule`. Request records are `public`, nested in `internal` slice classes.
  - The module calls `services.AddValidation()` itself.
  - Bodies use the envelope `ApiResponse.Ok`/`ApiResponse.Fail`.
  - Package versions live only in `Directory.Packages.props`.
  - Warnings are errors, so tests pass `TestContext.Current.CancellationToken`.
- **Registering the module:** in `Airbnb.Api/Program.cs`, `Airbnb.MigrationService/Program.cs`, the `InfrastructureFixture` of the integration tests, `ModuleRulesTests` (and the ArchitectureTests csproj), and `backend/Airbnb.slnx`.
- **Migrations** (from `backend/`): `dotnet tool restore`, then `dotnet ef migrations add <Name> --project src/Modules/Bookings/Airbnb.Modules.Bookings --startup-project src/Modules/Bookings/Airbnb.Modules.Bookings --output-dir Data/Migrations`.
- **Write tests** book only listings `l13`, `l14`, `l15` and `l16`, never `l1` or `l2`, and use random month offsets so test runs don't collide.
- **Booking ids:** `"bk_" + Guid.CreateVersion7().ToString("N")`.
- **Status values:** `confirmed`, `cancelled`.
- **Messages:**
  - `Those dates were just booked. Pick different dates.` (409)
  - `This trip has already started` (409)
  - `Booking not found` (404)
  - `Listing '<id>' was not found` (404)
  - `A quote is required for host listings` (400)
  - `This place allows at most N guests` (400)
  - `You can't book your own listing` (400)
  - `Check-in can't be in the past` (400)
  - `Check-out must be after check-in` (400)
  - `Stays can be at most 30 nights` (400)
  - `Dates must be YYYY-MM-DD` (400)
- **Pricing:**
  - cleaning fee 75;
  - service fee = round(nightly × nights × 0.14), rounding half away from zero;
  - labels `$<price> x <n> night` or `nights`, `Cleaning fee`, `Airbnb service fee`.
- **"Today":** the UTC calendar date from the injected `TimeProvider`. Check-in may be today minus 1 day; a cancel needs check-in after today.

### Frontend

- **Route handlers:** wrapped in `withErrorEnvelope`. Route handler tests start with `// @vitest-environment node`.
- **Mocks:** `mockRejectedValueOnce` only.
- **Tests:** import `render`, `screen` and `userEvent` from `@/lib/test-utils`.
- **Styling:** design tokens only.

### Commits

Conventional commits, each ending with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Rulings made while planning

- **`hl-` listings:** host listings (`hl-` ids) are frontend-owned until roadmap phase 4. The backend accepts a `quote` (`hostId`, `pricePerNight`, `maxGuests`) for them only. It ignores a quote sent for catalog ids and prices those from Stays.
- **`Booking` type changes:** `Booking` gains a required `hostId` and `guestId`, an optional `guestName`/`guestEmail`/`cancelledAt`, and `status` becomes `"confirmed" | "cancelled"`. Existing tests that build `Booking` literals get the new fields mechanically.
- **Trip lists:** `splitTrips` returns `{ upcoming, past, cancelled }`. Cancelled bookings never appear in upcoming or past.

## Review Focus

1. **Concurrent overlapping bookings:** exactly one wins, never a 500. Task 2 adds the test.
2. **Back-to-back stays:** check-out day = next check-in day is allowed, by the backend and by the calendar. Tasks 2 and 5 add tests.
3. **Cancelled bookings free their nights:** in the backend and in the mock. Tasks 3 and 4 add tests.
4. **A stranger can't read or cancel someone else's booking:** 404. Task 3 adds the test.
5. **Back-to-back checkout on the calendar:** the day a blocked range starts is still a valid check-out. Task 5 adds the test.

---

### Task 1: Stays booking lookup and the Bookings module skeleton (data, constraint, pricing, wiring)

**Files:**
- Modify: `src/Modules/Stays/Airbnb.Modules.Stays.Contracts/IListingLookup.cs`, `src/Modules/Stays/Airbnb.Modules.Stays/Listings/ListingLookup.cs`
- Create: `src/Modules/Stays/Airbnb.Modules.Stays.Contracts/ListingBookingInfo.cs`
- Create: `src/Modules/Bookings/Airbnb.Modules.Bookings/{Airbnb.Modules.Bookings.csproj, BookingsModule.cs, Booking.cs, BookingStatus.cs, BookingPricing.cs, BookingDto.cs, Data/BookingsDbContext.cs, Data/Migrations/*}`
- Modify: `Airbnb.slnx`, `src/Airbnb.Api/Airbnb.Api.csproj`, `src/Airbnb.Api/Program.cs`, `src/Airbnb.MigrationService/{Airbnb.MigrationService.csproj, Program.cs}`, `tests/Airbnb.Api.Tests/Infrastructure/InfrastructureFixture.cs`, `tests/Airbnb.ArchitectureTests/{Airbnb.ArchitectureTests.csproj, ModuleRulesTests.cs}`, `tests/Airbnb.UnitTests/Airbnb.UnitTests.csproj`
- Test: `tests/Airbnb.UnitTests/Bookings/BookingPricingTests.cs`

**Interfaces:**
- **Produces:**
  - `IListingLookup.FindForBookingAsync(string, CancellationToken)`, returning `Task<ListingBookingInfo?>`;
  - `ListingBookingInfo(string HostId, decimal PricePerNight, int MaxGuests)`;
  - internal `Booking` (entity), `BookingStatus.Confirmed`/`Cancelled` (string constants), `BookingPricing.Calculate(decimal nightly, int nights)`, which returns `(decimal Subtotal, decimal CleaningFee, decimal ServiceFee, decimal Total)`;
  - `BookingDto` (+ `PriceBreakdownDto`, `PriceLineItemDto`, `GuestCountsDto`) with `BookingDto.From(Booking)`;
  - `BookingsDbContext.Bookings`;
  - `BookingsModule.AddBookingsModule`, `AddBookingsModuleDatabase`, `MapBookingsEndpoints` (endpoints arrive in Tasks 2 and 3).

- [ ] **Step 1: Write the failing pricing tests**

`tests/Airbnb.UnitTests/Airbnb.UnitTests.csproj`: add a ProjectReference to the new module. `tests/Airbnb.UnitTests/Bookings/BookingPricingTests.cs`:

```csharp
using Airbnb.Modules.Bookings;

namespace Airbnb.UnitTests.Bookings;

// The same cases as frontend/lib/reservation/pricing.test.ts: both sides must price a stay identically.
public sealed class BookingPricingTests
{
    [Theory]
    [InlineData(100, 3, 300, 42, 417)]
    [InlineData(250, 1, 250, 35, 360)]
    [InlineData(95, 7, 665, 93, 833)]
    [InlineData(125, 1, 125, 18, 218)] // 17.5 rounds half away from zero, as Math.round does in JS
    public void A_stay_is_priced_like_the_frontend(int nightly, int nights, int subtotal, int serviceFee, int total)
    {
        var price = BookingPricing.Calculate(nightly, nights);

        Assert.Equal(subtotal, price.Subtotal);
        Assert.Equal(75, price.CleaningFee);
        Assert.Equal(serviceFee, price.ServiceFee);
        Assert.Equal(total, price.Total);
    }

    [Fact]
    public void The_line_item_labels_match_the_frontend()
    {
        var booking = TestBookings.Confirmed(nightly: 120, nights: 1);

        var labels = BookingDto.From(booking).PriceBreakdown.LineItems.Select(i => i.Label).ToArray();

        Assert.Equal(["$120 x 1 night", "Cleaning fee", "Airbnb service fee"], labels);
        Assert.Equal("$120 x 2 nights", BookingDto.From(TestBookings.Confirmed(nightly: 120, nights: 2)).PriceBreakdown.LineItems[0].Label);
    }
}

internal static class TestBookings
{
    internal static Booking Confirmed(decimal nightly, int nights)
    {
        var price = BookingPricing.Calculate(nightly, nights);
        var checkIn = new DateOnly(2031, 2, 1);
        return new Booking
        {
            Id = "bk_test",
            ListingId = "l13",
            HostId = "h1",
            GuestId = "usr_g",
            GuestName = "Ana",
            GuestEmail = "ana@example.com",
            CheckIn = checkIn,
            CheckOut = checkIn.AddDays(nights),
            Adults = 1,
            Children = 0,
            NightlyPrice = nightly,
            Nights = nights,
            CleaningFee = price.CleaningFee,
            ServiceFee = price.ServiceFee,
            Total = price.Total,
            Status = BookingStatus.Confirmed,
            CreatedAt = DateTimeOffset.UnixEpoch,
        };
    }
}
```

The service fee for 120 × 1 is `round(16.8) = 17`, and the expected values above follow the same formula. Before writing them, check the four `InlineData` rows against `frontend/lib/reservation/pricing.ts`. If the frontend test file has different cases, use those as well.

- [ ] **Step 2: Run them to verify they fail**

Run: `dotnet test --project tests/Airbnb.UnitTests --filter-namespace "Airbnb.UnitTests.Bookings"`. Expected: build FAIL.

- [ ] **Step 3: Implement**

`ListingBookingInfo.cs` (Stays.Contracts):

```csharp
namespace Airbnb.Modules.Stays.Contracts;

// What booking a listing needs to know: who hosts it, its nightly price and how many guests it takes.
public sealed record ListingBookingInfo(string HostId, decimal PricePerNight, int MaxGuests);
```

`IListingLookup` adds:

```csharp
    // Null when the listing doesn't exist.
    Task<ListingBookingInfo?> FindForBookingAsync(string listingId, CancellationToken cancellationToken);
```

`ListingLookup` adds:

```csharp
    public Task<ListingBookingInfo?> FindForBookingAsync(string listingId, CancellationToken cancellationToken) =>
        db.Listings
            .Where(l => l.Id == listingId)
            .Select(l => new ListingBookingInfo(l.HostId, l.PricePerNight, l.MaxGuests))
            .SingleOrDefaultAsync(cancellationToken);
```

Any test double of `IListingLookup` must implement the new method. Grep for `IListingLookup` in `tests/`.

`Airbnb.Modules.Bookings.csproj`: copy the Identity module's csproj. That gives `InternalsVisibleTo Airbnb.UnitTests`, the FrameworkReference, EF Design and SharedKernel. Add a ProjectReference to `..\..\Stays\Airbnb.Modules.Stays.Contracts\Airbnb.Modules.Stays.Contracts.csproj`.

`BookingStatus.cs`:

```csharp
namespace Airbnb.Modules.Bookings;

internal static class BookingStatus
{
    internal const string Confirmed = "confirmed";
    internal const string Cancelled = "cancelled";
}
```

`Booking.cs`:

```csharp
namespace Airbnb.Modules.Bookings;

internal sealed class Booking
{
    public required string Id { get; init; }
    public required string ListingId { get; init; }
    public required string HostId { get; init; }
    public required string GuestId { get; init; }
    // Snapshots: the Identity module's tables aren't ours to read (spec §1).
    public required string GuestName { get; init; }
    public required string GuestEmail { get; init; }
    public required DateOnly CheckIn { get; init; }
    public required DateOnly CheckOut { get; init; }
    public required int Adults { get; init; }
    public required int Children { get; init; }
    public required decimal NightlyPrice { get; init; }
    public required int Nights { get; init; }
    public required decimal CleaningFee { get; init; }
    public required decimal ServiceFee { get; init; }
    public required decimal Total { get; init; }
    public required string Status { get; set; }
    public required DateTimeOffset CreatedAt { get; init; }
    public DateTimeOffset? CancelledAt { get; set; }
}
```

`BookingPricing.cs`:

```csharp
namespace Airbnb.Modules.Bookings;

// Mirrors frontend/lib/reservation/pricing.ts; BookingPricingTests pins both to the same cases.
internal static class BookingPricing
{
    internal const decimal CleaningFee = 75m;
    internal const decimal ServiceFeeRate = 0.14m;

    internal static (decimal Subtotal, decimal CleaningFee, decimal ServiceFee, decimal Total) Calculate(decimal nightly, int nights)
    {
        var subtotal = nightly * nights;
        var serviceFee = Math.Round(subtotal * ServiceFeeRate, MidpointRounding.AwayFromZero);
        return (subtotal, CleaningFee, serviceFee, subtotal + CleaningFee + serviceFee);
    }
}
```

`BookingDto.cs`:

```csharp
using System.Text.Json.Serialization;

namespace Airbnb.Modules.Bookings;

internal sealed record PriceLineItemDto(string Label, decimal Amount);

internal sealed record PriceBreakdownDto(IReadOnlyList<PriceLineItemDto> LineItems, decimal Total);

internal sealed record GuestCountsDto(int Adults, int Children);

internal sealed record BookingDto(
    string Id,
    string ListingId,
    string HostId,
    string GuestId,
    string GuestName,
    string GuestEmail,
    DateOnly CheckIn,
    DateOnly CheckOut,
    GuestCountsDto Guests,
    PriceBreakdownDto PriceBreakdown,
    string Status,
    DateTimeOffset CreatedAt,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] DateTimeOffset? CancelledAt)
{
    internal static BookingDto From(Booking booking)
    {
        var nights = booking.Nights == 1 ? "night" : "nights";
        var lineItems = new[]
        {
            new PriceLineItemDto($"${booking.NightlyPrice:0.##} x {booking.Nights} {nights}", booking.NightlyPrice * booking.Nights),
            new PriceLineItemDto("Cleaning fee", booking.CleaningFee),
            new PriceLineItemDto("Airbnb service fee", booking.ServiceFee),
        };
        return new BookingDto(
            booking.Id, booking.ListingId, booking.HostId, booking.GuestId, booking.GuestName, booking.GuestEmail,
            booking.CheckIn, booking.CheckOut, new GuestCountsDto(booking.Adults, booking.Children),
            new PriceBreakdownDto(lineItems, booking.Total), booking.Status, booking.CreatedAt, booking.CancelledAt);
    }
}

internal sealed record StayDto(DateOnly CheckIn, DateOnly CheckOut);
```

`$"{x:0.##}"` uses the current culture. Format with `CultureInfo.InvariantCulture` instead, for example `booking.NightlyPrice.ToString("0.##", CultureInfo.InvariantCulture)`, so a machine set to a comma-decimal culture can't change the label.

`Data/BookingsDbContext.cs`:

```csharp
using Airbnb.SharedKernel.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Airbnb.Modules.Bookings.Data;

internal sealed class BookingsDbContext(DbContextOptions<BookingsDbContext> options) : DbContext(options)
{
    // The name of the exclusion constraint that refuses overlapping confirmed stays (spec §1).
    internal const string NoOverlapConstraint = "bookings_no_overlap";

    public DbSet<Booking> Bookings => Set<Booking>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(BookingsModule.Schema);
        modelBuilder.Entity<Booking>(booking =>
        {
            booking.ToTable("bookings");
            booking.Property(b => b.Id).HasMaxLength(40);
            booking.Property(b => b.ListingId).HasMaxLength(50);
            booking.Property(b => b.HostId).HasMaxLength(50);
            booking.Property(b => b.GuestId).HasMaxLength(40);
            booking.Property(b => b.GuestName).HasMaxLength(60);
            booking.Property(b => b.GuestEmail).HasMaxLength(254);
            booking.Property(b => b.Status).HasMaxLength(20);
            booking.Property(b => b.NightlyPrice).HasPrecision(10, 2);
            booking.Property(b => b.CleaningFee).HasPrecision(10, 2);
            booking.Property(b => b.ServiceFee).HasPrecision(10, 2);
            booking.Property(b => b.Total).HasPrecision(12, 2);
            booking.HasIndex(b => b.GuestId);
            booking.HasIndex(b => b.HostId);
            booking.HasIndex(b => new { b.ListingId, b.CheckIn });
        });
    }

    internal static Task SeedAsync(BookingsDbContext db, CancellationToken cancellationToken) => Task.CompletedTask;
}

internal sealed class BookingsDbContextFactory : IDesignTimeDbContextFactory<BookingsDbContext>
{
    public BookingsDbContext CreateDbContext(string[] args) =>
        new(ModuleDatabase.DesignTimeOptions<BookingsDbContext>(BookingsModule.Schema));
}
```

`BookingsModule.cs`:

```csharp
using Airbnb.Modules.Bookings.Data;
using Airbnb.SharedKernel.Persistence;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Airbnb.Modules.Bookings;

public static class BookingsModule
{
    internal const string Schema = "bookings";

    public static IHostApplicationBuilder AddBookingsModule(this IHostApplicationBuilder builder)
    {
        builder.AddBookingsModuleDatabase();
        // The validation generator only registers request types for AddValidation() calls in this assembly.
        builder.Services.AddValidation();
        return builder;
    }

    public static IHostApplicationBuilder AddBookingsModuleDatabase(this IHostApplicationBuilder builder) =>
        builder.AddModuleDbContext<BookingsDbContext>(Schema, BookingsDbContext.SeedAsync);

    public static IEndpointRouteBuilder MapBookingsEndpoints(this IEndpointRouteBuilder api) => api;
}
```

- [ ] **Step 4: Generate the migration and add the constraint**

Run the migrations command from Global Constraints with the name `InitialBookings`. Then edit the generated `Up`:
- Make the first statement `migrationBuilder.Sql("CREATE EXTENSION IF NOT EXISTS btree_gist;");`.
- After the table, the index creation and the generated code, add:

  ```csharp
              // No two confirmed stays of one listing may share a night; [CheckIn, CheckOut) is half-open, so back-to-back is fine.
              migrationBuilder.Sql("""
                  ALTER TABLE bookings.bookings ADD CONSTRAINT bookings_no_overlap
                  EXCLUDE USING gist ("ListingId" WITH =, daterange("CheckIn", "CheckOut", '[)') WITH &&)
                  WHERE ("Status" = 'confirmed');
                  """);
  ```

- In `Down`, drop the constraint before dropping the table: `migrationBuilder.Sql("ALTER TABLE bookings.bookings DROP CONSTRAINT IF EXISTS bookings_no_overlap;");`. Leave the extension in place.

- [ ] **Step 5: Wire the module**

Wire it exactly as the Identity module is wired:
- `Airbnb.Api` csproj reference and `Program.cs`: `builder.AddBookingsModule();` after `AddIdentityModule`, and `api.MapBookingsEndpoints();` after `MapIdentityEndpoints`.
- `MigrationService` csproj and `Program.cs`: `AddBookingsModuleDatabase()`.
- `InfrastructureFixture`: `AddBookingsModuleDatabase()`.
- ArchitectureTests: csproj reference, plus `["Airbnb.Modules.Bookings"] = typeof(BookingsModule)` in `ModuleRulesTests`, in alphabetical order (first).
- `Airbnb.slnx`: a `/src/Modules/Bookings/` folder before Experiences.

- [ ] **Step 6: Run the tests**

Run:
- `dotnet build Airbnb.slnx` (0 warnings);
- `dotnet test --project tests/Airbnb.UnitTests`;
- `dotnet test --project tests/Airbnb.ArchitectureTests`;
- `dotnet test --project tests/Airbnb.Api.Tests` (the fixture applies the migration, so a constraint SQL error surfaces here).

Expected: all pass.

- [ ] **Step 7: Commit**

`git add -A && git commit -m "feat: add the bookings module with a no-overlap constraint and the stays booking lookup"`

---

### Task 2: Create a booking, and public availability

**Files:**
- Create: `src/Modules/Bookings/Airbnb.Modules.Bookings/{BookingDates.cs, CreateBooking.cs, GetAvailability.cs}`
- Modify: `BookingsModule.cs`
- Test: `tests/Airbnb.Api.Tests/Bookings/CreateBookingTests.cs`, `tests/Airbnb.Api.Tests/Infrastructure/AuthHelpers.cs`

**Interfaces:**
- **Consumes:** Task 1 types; the Identity endpoints (register, to get a bearer token in tests); `MutableTimeProvider`.
- **Produces:** `POST /api/bookings` → 201 `BookingDto`; `GET /api/bookings/availability?listingId=` → 200 `StayDto[]`; and the test helper `AuthHelpers.RegisterAsync(HttpClient, string? name = null)`, which returns `(string Token, string UserId, string Email)`.

- [ ] **Step 1: Write the failing tests**

`tests/Airbnb.Api.Tests/Infrastructure/AuthHelpers.cs`:

```csharp
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace Airbnb.Api.Tests.Infrastructure;

public static class AuthHelpers
{
    // Registers a fresh account and returns its bearer token, user id and email.
    public static async Task<(string Token, string UserId, string Email)> RegisterAsync(HttpClient client, string? name = null)
    {
        var email = $"u-{Guid.NewGuid():N}@example.com";
        var body = JsonSerializer.Serialize(new { name = name ?? "Guest", email, password = "correct-horse" });
        using var response = await client.PostAsync("/api/auth/register", new StringContent(body, Encoding.UTF8, "application/json"), TestContext.Current.CancellationToken);
        response.EnsureSuccessStatusCode();
        var data = (await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken)).GetProperty("data");
        return (data.GetProperty("token").GetString()!, data.GetProperty("user").GetProperty("id").GetString()!, email);
    }

    public static HttpRequestMessage Authorized(this HttpRequestMessage request, string token)
    {
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return request;
    }
}
```

`tests/Airbnb.Api.Tests/Bookings/CreateBookingTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Airbnb.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Airbnb.Api.Tests.Bookings;

// Books only l13–l16, each test in its own random far-future month, so runs never collide.
public sealed class CreateBookingTests(InfrastructureFixture infrastructure)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static DateOnly RandomMonth() =>
        DateOnly.FromDateTime(DateTime.UtcNow).AddMonths(Random.Shared.Next(13, 600));

    private WebApplicationFactory<Program> Factory() =>
        new ApiFactory(infrastructure).WithWebHostBuilder(builder => builder.UseSetting("RateLimiting:WritesPerMinute", "1000"));

    private static async Task<HttpResponseMessage> BookAsync(HttpClient client, string token, object body)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/bookings")
        {
            Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json"),
        }.Authorized(token);
        return await client.SendAsync(request, Ct);
    }

    private static object Stay(string listingId, DateOnly checkIn, int nights, int adults = 2, object? quote = null) => new
    {
        listingId,
        checkIn = checkIn.ToString("yyyy-MM-dd"),
        checkOut = checkIn.AddDays(nights).ToString("yyyy-MM-dd"),
        adults,
        children = 0,
        quote,
    };

    private static async Task<string> ErrorAsync(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("error").GetString()!;

    [Fact]
    public async Task A_catalog_booking_is_priced_on_the_server_whatever_the_quote_says()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var (token, userId, email) = await AuthHelpers.RegisterAsync(client, "Ana");
        var listing = (await client.GetFromJsonAsync<JsonElement>("/api/listings/l13", Ct)).GetProperty("data");
        var nightly = listing.GetProperty("pricePerNight").GetDecimal();

        using var response = await BookAsync(client, token, Stay("l13", RandomMonth(), 3, quote: new { hostId = "x", pricePerNight = 1, maxGuests = 16 }));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var booking = (await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("data");
        Assert.StartsWith("bk_", booking.GetProperty("id").GetString());
        Assert.Equal(listing.GetProperty("hostId").GetString(), booking.GetProperty("hostId").GetString());
        Assert.Equal(userId, booking.GetProperty("guestId").GetString());
        Assert.Equal("Ana", booking.GetProperty("guestName").GetString());
        Assert.Equal(email, booking.GetProperty("guestEmail").GetString());
        Assert.Equal("confirmed", booking.GetProperty("status").GetString());
        var subtotal = nightly * 3;
        var serviceFee = Math.Round(subtotal * 0.14m, MidpointRounding.AwayFromZero);
        Assert.Equal(subtotal + 75 + serviceFee, booking.GetProperty("priceBreakdown").GetProperty("total").GetDecimal());
    }

    [Fact]
    public async Task A_host_listing_needs_a_quote_and_is_priced_from_it()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var (token, _, _) = await AuthHelpers.RegisterAsync(client);
        var listingId = $"hl-{Guid.NewGuid()}";
        var month = RandomMonth();

        using var withoutQuote = await BookAsync(client, token, Stay(listingId, month, 2));
        using var withQuote = await BookAsync(client, token, Stay(listingId, month, 2, quote: new { hostId = "usr_host", pricePerNight = 100, maxGuests = 4 }));

        Assert.Equal(HttpStatusCode.BadRequest, withoutQuote.StatusCode);
        Assert.Equal("A quote is required for host listings", await ErrorAsync(withoutQuote));
        Assert.Equal(HttpStatusCode.Created, withQuote.StatusCode);
        var booking = (await withQuote.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("data");
        Assert.Equal("usr_host", booking.GetProperty("hostId").GetString());
        Assert.Equal(303m, booking.GetProperty("priceBreakdown").GetProperty("total").GetDecimal()); // 200 + 75 + 28
    }

    [Fact]
    public async Task Overlapping_nights_get_409_and_back_to_back_stays_are_fine()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var (first, _, _) = await AuthHelpers.RegisterAsync(client);
        var (second, _, _) = await AuthHelpers.RegisterAsync(client);
        var month = RandomMonth();

        using var booked = await BookAsync(client, first, Stay("l14", month, 3));
        using var overlapping = await BookAsync(client, second, Stay("l14", month.AddDays(2), 3));
        using var backToBack = await BookAsync(client, second, Stay("l14", month.AddDays(3), 2));

        Assert.Equal(HttpStatusCode.Created, booked.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, overlapping.StatusCode);
        Assert.Equal("Those dates were just booked. Pick different dates.", await ErrorAsync(overlapping));
        Assert.Equal(HttpStatusCode.Created, backToBack.StatusCode);
    }

    [Fact]
    public async Task Concurrent_overlapping_bookings_give_exactly_one_201()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var guests = await Task.WhenAll(Enumerable.Range(0, 5).Select(_ => AuthHelpers.RegisterAsync(client)));
        var month = RandomMonth();

        var responses = await Task.WhenAll(guests.Select(g => BookAsync(client, g.Token, Stay("l15", month, 4))));

        Assert.Equal(1, responses.Count(r => r.StatusCode == HttpStatusCode.Created));
        Assert.Equal(4, responses.Count(r => r.StatusCode == HttpStatusCode.Conflict));
        foreach (var response in responses) response.Dispose();
    }

    [Theory]
    [InlineData("2031-02-30", 2, "Dates must be YYYY-MM-DD")]
    [InlineData("2000-01-01", 2, "Check-in can't be in the past")]
    [InlineData(null, 0, "Check-out must be after check-in")]
    [InlineData(null, 31, "Stays can be at most 30 nights")]
    public async Task Bad_dates_get_400(string? checkIn, int nights, string error)
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var (token, _, _) = await AuthHelpers.RegisterAsync(client);
        var start = RandomMonth();
        var body = checkIn is null
            ? Stay("l16", start, nights)
            : new { listingId = "l16", checkIn, checkOut = "2031-03-05", adults = 1, children = 0 };

        using var response = await BookAsync(client, token, body);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(error, await ErrorAsync(response));
    }

    [Fact]
    public async Task Too_many_guests_an_unknown_listing_and_your_own_listing_are_refused()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var (token, userId, _) = await AuthHelpers.RegisterAsync(client);
        var month = RandomMonth();

        using var tooMany = await BookAsync(client, token, Stay("l16", month, 1, adults: 16));
        using var unknown = await BookAsync(client, token, Stay("l999", month, 1));
        using var own = await BookAsync(client, token, Stay($"hl-{Guid.NewGuid()}", month, 1, quote: new { hostId = userId, pricePerNight = 50, maxGuests = 2 }));

        Assert.Equal(HttpStatusCode.BadRequest, tooMany.StatusCode);
        Assert.StartsWith("This place allows at most", await ErrorAsync(tooMany));
        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
        Assert.Equal("Listing 'l999' was not found", await ErrorAsync(unknown));
        Assert.Equal(HttpStatusCode.BadRequest, own.StatusCode);
        Assert.Equal("You can't book your own listing", await ErrorAsync(own));
    }

    [Fact]
    public async Task Booking_without_a_session_gets_401()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();

        using var response = await client.PostAsync("/api/bookings",
            new StringContent(JsonSerializer.Serialize(Stay("l16", RandomMonth(), 1)), Encoding.UTF8, "application/json"), Ct);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Availability_lists_the_confirmed_future_stays_without_a_session()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var (token, _, _) = await AuthHelpers.RegisterAsync(client);
        var listingId = $"hl-{Guid.NewGuid()}";
        var month = RandomMonth();
        var quote = new { hostId = "usr_host", pricePerNight = 80, maxGuests = 2 };
        using var a = await BookAsync(client, token, Stay(listingId, month, 2, quote: quote));
        using var b = await BookAsync(client, token, Stay(listingId, month.AddDays(5), 1, quote: quote));

        var stays = await client.GetFromJsonAsync<JsonElement>($"/api/bookings/availability?listingId={listingId}", Ct);

        var data = stays.GetProperty("data").EnumerateArray().Select(s => (s.GetProperty("checkIn").GetString(), s.GetProperty("checkOut").GetString())).ToArray();
        Assert.Equal(
            [(month.ToString("yyyy-MM-dd"), month.AddDays(2).ToString("yyyy-MM-dd")), (month.AddDays(5).ToString("yyyy-MM-dd"), month.AddDays(6).ToString("yyyy-MM-dd"))],
            data);
    }
}
```

If the `l13` listing DTO's JSON names differ (`pricePerNight`, `hostId`), adapt the test to the real names from `GET /api/listings/{id}`.

- [ ] **Step 2: Run them to verify they fail**

Run: `dotnet test --project tests/Airbnb.Api.Tests --filter-class "Airbnb.Api.Tests.Bookings.CreateBookingTests"`. Expected: FAIL (404s).

- [ ] **Step 3: Implement**

`BookingDates.cs`:

```csharp
using System.Globalization;

namespace Airbnb.Modules.Bookings;

internal static class BookingDates
{
    internal const int MaxNights = 30;

    internal static DateOnly Today(TimeProvider time) => DateOnly.FromDateTime(time.GetUtcNow().UtcDateTime);

    // The stay's dates, or the 400 message explaining what's wrong with them.
    internal static (DateOnly CheckIn, DateOnly CheckOut)? Parse(string checkIn, string checkOut, DateOnly today, out string? error)
    {
        error = null;
        if (!DateOnly.TryParseExact(checkIn, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var from)
            || !DateOnly.TryParseExact(checkOut, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var to))
        {
            error = "Dates must be YYYY-MM-DD";
            return null;
        }
        // One day of slack, as the frontend allows, so a guest whose "today" is still yesterday in UTC can book it.
        if (from < today.AddDays(-1))
        {
            error = "Check-in can't be in the past";
            return null;
        }
        var nights = to.DayNumber - from.DayNumber;
        if (nights <= 0)
        {
            error = "Check-out must be after check-in";
            return null;
        }
        if (nights > MaxNights)
        {
            error = $"Stays can be at most {MaxNights} nights";
            return null;
        }
        return (from, to);
    }
}
```

`CreateBooking.cs`:

```csharp
using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Airbnb.Modules.Bookings.Data;
using Airbnb.Modules.Stays.Contracts;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Airbnb.Modules.Bookings;

internal static class CreateBooking
{
    // Host listings live in the frontend until roadmap phase 4 (spec §1); only they may carry a quote.
    internal const string HostListingPrefix = "hl-";
    internal const string Taken = "Those dates were just booked. Pick different dates.";

    public sealed record QuoteInput(
        [property: Required, StringLength(50, MinimumLength = 1)] string? HostId,
        [property: Range(1, 100_000)] decimal PricePerNight,
        [property: Range(1, 16)] int MaxGuests);

    public sealed record Command(
        [property: Required, StringLength(50, MinimumLength = 1)] string? ListingId,
        [property: Required, StringLength(10)] string? CheckIn,
        [property: Required, StringLength(10)] string? CheckOut,
        [property: Range(1, 16)] int Adults,
        [property: Range(0, 15)] int Children,
        QuoteInput? Quote);

    internal sealed class Handler(BookingsDbContext db, IListingLookup listings, TimeProvider time)
    {
        public async Task<Results<Created<ApiResponse<BookingDto>>, BadRequest<ApiResponse<object>>, NotFound<ApiResponse<object>>, Conflict<ApiResponse<object>>>> HandleAsync(
            Command command, ClaimsPrincipal user, CancellationToken cancellationToken)
        {
            var dates = BookingDates.Parse(command.CheckIn!, command.CheckOut!, BookingDates.Today(time), out var dateError);
            if (dates is not { } stay)
            {
                return TypedResults.BadRequest(ApiResponse.Fail(dateError!));
            }

            ListingBookingInfo? info;
            if (command.ListingId!.StartsWith(HostListingPrefix, StringComparison.Ordinal))
            {
                if (command.Quote is not { } quote)
                {
                    return TypedResults.BadRequest(ApiResponse.Fail("A quote is required for host listings"));
                }
                info = new ListingBookingInfo(quote.HostId!, quote.PricePerNight, quote.MaxGuests);
            }
            else
            {
                info = await listings.FindForBookingAsync(command.ListingId, cancellationToken);
                if (info is null)
                {
                    return TypedResults.NotFound(ApiResponse.Fail($"Listing '{command.ListingId}' was not found"));
                }
            }

            if (command.Adults + command.Children > info.MaxGuests)
            {
                return TypedResults.BadRequest(ApiResponse.Fail($"This place allows at most {info.MaxGuests} guests"));
            }
            var guestId = user.FindFirstValue(ClaimTypes.NameIdentifier)!;
            if (info.HostId == guestId)
            {
                return TypedResults.BadRequest(ApiResponse.Fail("You can't book your own listing"));
            }

            var nights = stay.CheckOut.DayNumber - stay.CheckIn.DayNumber;
            var price = BookingPricing.Calculate(info.PricePerNight, nights);
            var booking = new Booking
            {
                Id = "bk_" + Guid.CreateVersion7().ToString("N"),
                ListingId = command.ListingId,
                HostId = info.HostId,
                GuestId = guestId,
                GuestName = user.FindFirstValue(ClaimTypes.Name)!,
                GuestEmail = user.FindFirstValue(ClaimTypes.Email)!,
                CheckIn = stay.CheckIn,
                CheckOut = stay.CheckOut,
                Adults = command.Adults,
                Children = command.Children,
                NightlyPrice = info.PricePerNight,
                Nights = nights,
                CleaningFee = price.CleaningFee,
                ServiceFee = price.ServiceFee,
                Total = price.Total,
                Status = BookingStatus.Confirmed,
                CreatedAt = time.GetUtcNow(),
            };
            db.Bookings.Add(booking);
            try
            {
                await db.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException exception) when (exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.ExclusionViolation })
            {
                // The database refuses overlapping confirmed stays, however many guests confirm at once (spec §1).
                return TypedResults.Conflict(ApiResponse.Fail(Taken));
            }

            return TypedResults.Created($"/api/bookings/{booking.Id}", ApiResponse.Ok(BookingDto.From(booking)));
        }
    }

    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapPost("/bookings", (Command command, ClaimsPrincipal user, Handler handler, CancellationToken cancellationToken) =>
                handler.HandleAsync(command, user, cancellationToken))
            .RequireAuthorization();
}
```

`GetAvailability.cs`:

```csharp
using Airbnb.Modules.Bookings.Data;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace Airbnb.Modules.Bookings;

internal static class GetAvailability
{
    // Public and uncached: the calendar must see a stay the moment it's booked (spec §1).
    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/bookings/availability", async (string listingId, BookingsDbContext db, TimeProvider time, CancellationToken cancellationToken) =>
        {
            var today = BookingDates.Today(time);
            var stays = await db.Bookings
                .AsNoTracking()
                .Where(b => b.ListingId == listingId && b.Status == BookingStatus.Confirmed && b.CheckOut > today)
                .OrderBy(b => b.CheckIn)
                .Select(b => new StayDto(b.CheckIn, b.CheckOut))
                .ToListAsync(cancellationToken);
            return TypedResults.Ok(ApiResponse.Ok(stays));
        });
}
```

`BookingsModule.AddBookingsModule` also registers `builder.Services.AddScoped<CreateBooking.Handler>();`. `MapBookingsEndpoints` calls `CreateBooking.Map(api); GetAvailability.Map(api); return api;`.

- **Route clash:** `/bookings/availability` is a literal segment and `/bookings/{id}` (Task 3) is a parameter. ASP.NET routing prefers the literal, so they don't clash. Keep both.
- **`QuoteInput`:** if nested validation doesn't run on `QuoteInput` (an invalid quote passes), add a manual check in the handler for the same ranges, and say so in the report.

- [ ] **Step 4: Run the tests**

Run: `dotnet test --project tests/Airbnb.Api.Tests --filter-class "Airbnb.Api.Tests.Bookings.CreateBookingTests"`, then the full `dotnet test`. Expected: all pass, 0 warnings.

- [ ] **Step 5: Commit**

`git add -A && git commit -m "feat: create bookings that postgres refuses to overlap, and serve listing availability"`

---

### Task 3: My bookings, one booking, hosting, and cancel

**Files:**
- Create: `src/Modules/Bookings/Airbnb.Modules.Bookings/{ListMyBookings.cs, GetBooking.cs, ListHosting.cs, CancelBooking.cs}`
- Modify: `BookingsModule.cs`
- Test: `tests/Airbnb.Api.Tests/Bookings/BookingAccessTests.cs`

**Interfaces:**
- **Consumes:** Tasks 1–2 and `AuthHelpers`.
- **Produces:**
  - `GET /api/bookings/mine` and `GET /api/bookings/hosting` → 200 `BookingDto[]`, soonest check-in first;
  - `GET /api/bookings/{id}` → 200 or 404;
  - `POST /api/bookings/{id}/cancel` → 200, 404 or 409.

- [ ] **Step 1: Write the failing tests**

`tests/Airbnb.Api.Tests/Bookings/BookingAccessTests.cs`:
- Use the same `Factory()`, `BookAsync`, `Stay` and `RandomMonth` helpers as `CreateBookingTests`. To avoid duplication, move those helpers into `tests/Airbnb.Api.Tests/Bookings/BookingRequests.cs` as `internal static` members, and update `CreateBookingTests` to use them.
- Each test creates its own `hl-` listing with a quote whose `hostId` is a registered host's user id. That way hosting visibility is real.

```csharp
    [Fact]
    public async Task Guests_see_their_trips_hosts_see_their_reservations_and_strangers_see_nothing()
    {
        // Arrange: host, guest, stranger registered; guest books an hl- listing quoted with hostId = host.UserId.
        // Act + Assert:
        //  GET /api/bookings/mine as guest → contains the booking id; as stranger → doesn't.
        //  GET /api/bookings/hosting as host → contains it, with guestEmail = guest email; as guest → doesn't.
        //  GET /api/bookings/{id} as guest → 200; as host → 200; as stranger → 404 "Booking not found".
    }

    [Fact]
    public async Task A_guest_can_cancel_before_check_in_and_the_nights_free_up()
    {
        // Arrange: guest books listing X for month..month+3.
        // Act: POST /api/bookings/{id}/cancel as guest → 200, data.status == "cancelled", data.cancelledAt present.
        // Then: POST again → 200 (idempotent, still cancelled).
        // Then: another guest books the same nights on X → 201.
        // Then: GET availability for X doesn't list the cancelled stay.
    }

    [Fact]
    public async Task Strangers_and_hosts_cannot_cancel_a_guests_booking()
    {
        // POST cancel as stranger → 404; as host → 404; booking stays confirmed (GET as guest).
    }

    [Fact]
    public async Task A_trip_that_has_started_cannot_be_cancelled()
    {
        // Use a MutableTimeProvider clock (ConfigureTestServices AddSingleton<TimeProvider>(clock)).
        // Book check-in = today+5; move clock.Now forward 5 days; POST cancel → 409 "This trip has already started".
    }

    [Theory]
    [InlineData("GET", "/api/bookings/mine")]
    [InlineData("GET", "/api/bookings/hosting")]
    [InlineData("GET", "/api/bookings/bk_x")]
    [InlineData("POST", "/api/bookings/bk_x/cancel")]
    public async Task Booking_endpoints_need_a_session(string method, string path)
    {
        // No bearer → 401.
    }
```

Write each test body fully, following the patterns in `CreateBookingTests` and `AuthEndpointTests`. The comments state the required arrange, act and assert. Each assertion named there must be present.

- [ ] **Step 2: Run them to verify they fail**

Run: `dotnet test --project tests/Airbnb.Api.Tests --filter-class "Airbnb.Api.Tests.Bookings.BookingAccessTests"`. Expected: FAIL.

- [ ] **Step 3: Implement**

`ListMyBookings.cs`:

```csharp
using System.Security.Claims;
using Airbnb.Modules.Bookings.Data;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace Airbnb.Modules.Bookings;

internal static class ListMyBookings
{
    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/bookings/mine", async (ClaimsPrincipal user, BookingsDbContext db, CancellationToken cancellationToken) =>
        {
            var guestId = user.FindFirstValue(ClaimTypes.NameIdentifier)!;
            var bookings = await db.Bookings.AsNoTracking().Where(b => b.GuestId == guestId).OrderBy(b => b.CheckIn).ToListAsync(cancellationToken);
            return TypedResults.Ok(ApiResponse.Ok(bookings.Select(BookingDto.From).ToList()));
        }).RequireAuthorization();
}
```

`ListHosting.cs` is the same, with route `/bookings/hosting` and `b.HostId == userId`.

`GetBooking.cs`:

```csharp
using System.Security.Claims;
using Airbnb.Modules.Bookings.Data;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace Airbnb.Modules.Bookings;

internal static class GetBooking
{
    internal const string NotFoundMessage = "Booking not found";

    // Visible to its guest and its host; anyone else gets the same 404 as for a missing booking.
    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/bookings/{id}", async Task<Results<Ok<ApiResponse<BookingDto>>, NotFound<ApiResponse<object>>>> (
            string id, ClaimsPrincipal user, BookingsDbContext db, CancellationToken cancellationToken) =>
        {
            var userId = user.FindFirstValue(ClaimTypes.NameIdentifier)!;
            var booking = await db.Bookings.AsNoTracking()
                .SingleOrDefaultAsync(b => b.Id == id && (b.GuestId == userId || b.HostId == userId), cancellationToken);
            return booking is null
                ? TypedResults.NotFound(ApiResponse.Fail(NotFoundMessage))
                : TypedResults.Ok(ApiResponse.Ok(BookingDto.From(booking)));
        }).RequireAuthorization();
}
```

`CancelBooking.cs`:

```csharp
using System.Security.Claims;
using Airbnb.Modules.Bookings.Data;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace Airbnb.Modules.Bookings;

internal static class CancelBooking
{
    // Only the guest cancels, and only before the check-in day; cancelling frees the nights for the exclusion constraint.
    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapPost("/bookings/{id}/cancel", async Task<Results<Ok<ApiResponse<BookingDto>>, NotFound<ApiResponse<object>>, Conflict<ApiResponse<object>>>> (
            string id, ClaimsPrincipal user, BookingsDbContext db, TimeProvider time, CancellationToken cancellationToken) =>
        {
            var guestId = user.FindFirstValue(ClaimTypes.NameIdentifier)!;
            var booking = await db.Bookings.SingleOrDefaultAsync(b => b.Id == id && b.GuestId == guestId, cancellationToken);
            if (booking is null)
            {
                return TypedResults.NotFound(ApiResponse.Fail(GetBooking.NotFoundMessage));
            }
            if (booking.Status == BookingStatus.Cancelled)
            {
                return TypedResults.Ok(ApiResponse.Ok(BookingDto.From(booking)));
            }
            if (booking.CheckIn <= BookingDates.Today(time))
            {
                return TypedResults.Conflict(ApiResponse.Fail("This trip has already started"));
            }

            booking.Status = BookingStatus.Cancelled;
            booking.CancelledAt = time.GetUtcNow();
            await db.SaveChangesAsync(cancellationToken);
            return TypedResults.Ok(ApiResponse.Ok(BookingDto.From(booking)));
        }).RequireAuthorization();
}
```

`MapBookingsEndpoints` maps all six slices. Keep `GetAvailability.Map` before `GetBooking.Map` for readability; routing prefers the literal either way.

- [ ] **Step 4: Run the tests**

Run: `dotnet test --project tests/Airbnb.Api.Tests --filter-class "Airbnb.Api.Tests.Bookings.BookingAccessTests"`, then the full `dotnet test`. Expected: all pass.

- [ ] **Step 5: Commit**

`git add -A && git commit -m "feat: list, view, host and cancel bookings"`

---

### Task 4: Frontend data layer: types, mock parity, the HTTP booking repository, routes

**Files:**
- Modify: `lib/types.ts`, `lib/api-client/schemas.ts`, `lib/repositories/booking-repository.ts`, `lib/repositories/mock/mock-booking-repository.ts`, `lib/repositories/index.ts`, `lib/bookings/trips.ts`, `app/api/bookings/route.ts`, `app/host/reservations/page.tsx` (`listForHost` and the guest label only), `app/trips/page.tsx` (the new `splitTrips` shape only), and the existing tests that build `Booking` literals (mechanical)
- Create: `lib/repositories/http/http-booking-repository.ts`, `app/api/bookings/[id]/cancel/route.ts`, `app/api/listings/[id]/availability/route.ts`, `lib/api-client/availability.ts` (`fetchAvailability`, `cancelBooking`)
- Test: `lib/repositories/mock/mock-booking-repository.test.ts` (append), `lib/repositories/http/http-booking-repository.test.ts`, `app/api/bookings/route.test.ts` (append), `app/api/bookings/[id]/cancel/route.test.ts`, `app/api/listings/[id]/availability/route.test.ts`, `lib/bookings/trips.test.ts` (update)

**Interfaces:**
- **Consumes:** the backend endpoints from Tasks 2–3; `SESSION_COOKIE` (`lib/auth/session.ts`); `dataSource()`; `HOST_LISTING_ID_PREFIX` (`lib/host/options.ts`).
- **Produces:**

  ```ts
  // lib/types.ts
  export interface Booking {
    id: string; listingId: string; hostId: string; guestId: string;
    guestName?: string; guestEmail?: string;
    checkIn: string; checkOut: string;
    guests: { adults: number; children: number };
    priceBreakdown: PriceBreakdown;
    status: "confirmed" | "cancelled";
    createdAt: string; cancelledAt?: string;
  }
  export interface Stay { checkIn: string; checkOut: string }
  ```

  ```ts
  // lib/repositories/booking-repository.ts
  export interface GuestRef { id: string; name: string; email: string }
  export interface BookingQuote { hostId: string; pricePerNight: number; maxGuests: number }
  export type NewBooking = Pick<Booking, "listingId" | "hostId" | "checkIn" | "checkOut" | "guests" | "priceBreakdown">;
  export interface BookingRepository {
    listForUser(userId: string): Promise<Booking[]>;
    /** Visible to the booking's guest and host. */
    findById(userId: string, id: string): Promise<Booking | null>;
    /** "unavailable" when a confirmed stay of the listing shares a night (half-open [checkIn, checkOut)). */
    create(guest: GuestRef, booking: NewBooking, quote?: BookingQuote): Promise<Booking | "unavailable">;
    /** Guest only; "started" once check-in day has come. */
    cancel(userId: string, id: string): Promise<Booking | "not-found" | "started">;
    listForHost(hostId: string): Promise<Booking[]>;
    /** Confirmed stays that end after today, by check-in. */
    availability(listingId: string): Promise<Stay[]>;
  }
  ```

  - `splitTrips<T extends Booking>(bookings, today)` returns `{ upcoming: T[]; past: T[]; cancelled: T[] }`.
  - `fetchAvailability(listingId)` returns `Promise<Stay[]>`.
  - `cancelBooking(id)` returns `Promise<Booking>`.

- [ ] **Step 1: Write the failing tests**

**Mock repository** (`mock-booking-repository.test.ts`, appended; reset the `globalThis.__mockBookings` store the way the existing tests do):
- A cancelled booking no longer blocks its nights. Create, cancel, then create the same nights for another guest: that succeeds.
- `cancel` rules:
  - another user gets `"not-found"`;
  - a check-in on or before today gets `"started"`, with dates built from `new Date()`;
  - cancelling twice returns the cancelled booking.
- `availability` lists only confirmed stays whose check-out is after today, ordered by check-in.
- `listForHost` returns only the host's bookings, with `guestName` and `guestEmail` set from the `GuestRef`.
- `findById` works for the host and returns null for a stranger.
- Back-to-back stays succeed.

**HTTP booking repository** (`http-booking-repository.test.ts`, `// @vitest-environment node`):
- Mock `next/headers` so `cookies().get("session")` returns `{ value: "tok_abc" }`.
- Mock `fetch` with `vi.spyOn(globalThis, "fetch")`.
- Assert:
  - every call sends `authorization: Bearer tok_abc`, except `availability`, which needs no auth;
  - `create` POSTs `{ listingId, checkIn, checkOut, adults, children, quote? }` to `/api/bookings`, and maps 201 to a `Booking` and 409 to `"unavailable"`;
  - `cancel` maps 200 to a `Booking`, 404 to `"not-found"` and 409 to `"started"`;
  - `findById` maps 404 to null;
  - `listForUser` and `listForHost` call `/api/bookings/mine` and `/api/bookings/hosting`;
  - `availability` calls `/api/bookings/availability?listingId=…`;
  - a 500 or an invalid payload throws;
  - with no session cookie, every call except `availability` throws `"No session for the bookings API"`.

**Routes:**
- `app/api/bookings/route.test.ts` (append): booking a host listing (an `hl-` id in the host-listing mock) passes a quote `{ hostId, pricePerNight, maxGuests }` to `bookings.create`, and a catalog listing passes no quote. Use `vi.spyOn(getRepositories().bookings, "create")` in mock mode. A 409 now says `Those dates were just booked. Pick different dates.`.
- `app/api/bookings/[id]/cancel/route.test.ts`: 401 without a session; 404 `Booking not found`; 409 `This trip has already started`; 200 with the cancelled booking.
- `app/api/listings/[id]/availability/route.test.ts`: returns `ok(stays)` from `getRepositories().bookings.availability(id)`, and needs no session.

**`lib/bookings/trips.test.ts`:** update it for `{ upcoming, past, cancelled }`. Cancelled bookings go only to `cancelled`, most recent check-in first.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run lib/repositories lib/bookings app/api/bookings app/api/listings`. Expected: FAIL.

- [ ] **Step 3: Implement**

**Types:**
- Update `lib/types.ts` as in the Interfaces block above, and export `Stay`.
- Update `bookingSchema` in `lib/api-client/schemas.ts` to match: `hostId`, `guestId`, `guestName` and `guestEmail` optional, `status: z.enum(["confirmed","cancelled"])`, `cancelledAt` optional. Export `staySchema = z.object({ checkIn: z.string(), checkOut: z.string() })`.

**Mock repository** (`mock-booking-repository.ts`):
- The store keeps `Booking[]` per guest id as today. `create(guest, booking, quote)` stores `{ ...booking, id, guestId: guest.id, guestName: guest.name, guestEmail: guest.email, status: "confirmed", createdAt }`. The `quote` is unused in the mock: the route already priced the booking and sets `hostId`.
- The overlap check considers only `status === "confirmed"`.
- `cancel` finds the booking by guest. If it's missing, return `"not-found"`. If it's already cancelled, return it. If `checkIn <= today` (`new Date().toISOString().slice(0, 10)`), return `"started"`. Otherwise replace it immutably with `{ ...b, status: "cancelled", cancelledAt: new Date().toISOString() }`.
- `listForHost` filters every guest's bookings by `hostId`, sorted by check-in.
- `availability` returns confirmed stays with `checkOut > today`, sorted.
- `findById(userId, id)` searches all bookings for a matching id where `guestId === userId || hostId === userId`.

**HTTP repository** (`lib/repositories/http/http-booking-repository.ts`):

```ts
import { cookies } from "next/headers";
import { z } from "zod";
import { bookingSchema, envelopeSchema, staySchema } from "@/lib/api-client/schemas";
import { SESSION_COOKIE } from "@/lib/auth/session";
import type { Booking, Stay } from "@/lib/types";
import type { BookingRepository } from "../booking-repository";

const REQUEST_TIMEOUT_MS = 5_000;

async function sessionToken(): Promise<string> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) throw new Error("No session for the bookings API");
  return token;
}

/** One call to the backend's Bookings module; returns the status and the parsed envelope (data validated by `schema`). */
async function call<T extends z.ZodType>(baseUrl: string, method: string, path: string, schema: T, options: { body?: unknown; auth?: boolean } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.auth !== false) headers.authorization = `Bearer ${await sessionToken()}`;
  let response: Response;
  try {
    response = await fetch(new URL(path, baseUrl), {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    throw new Error(`${method} ${path} failed: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
  }
  const parsed = envelopeSchema(schema).safeParse(await response.json().catch(() => undefined));
  return { status: response.status, data: parsed.success ? (parsed.data.data as z.infer<T> | undefined) : undefined, valid: parsed.success };
}

function expectData<T>(result: { status: number; data: T | undefined; valid: boolean }, method: string, path: string): T {
  if (result.status >= 200 && result.status < 300 && result.valid && result.data !== undefined) return result.data;
  throw new Error(`${method} ${path} failed with ${result.status}`);
}

/** Bookings in the backend (spec §2): the session token from the cookie is the bearer. */
export function createHttpBookingRepository(baseUrl: string): BookingRepository {
  return {
    async listForUser() {
      return expectData(await call(baseUrl, "GET", "/api/bookings/mine", z.array(bookingSchema)), "GET", "/api/bookings/mine") as Booking[];
    },
    async listForHost() {
      return expectData(await call(baseUrl, "GET", "/api/bookings/hosting", z.array(bookingSchema)), "GET", "/api/bookings/hosting") as Booking[];
    },
    async findById(_userId, id) {
      const path = `/api/bookings/${encodeURIComponent(id)}`;
      const result = await call(baseUrl, "GET", path, bookingSchema);
      return result.status === 404 ? null : (expectData(result, "GET", path) as Booking);
    },
    async create(_guest, booking, quote) {
      const body = {
        listingId: booking.listingId,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        adults: booking.guests.adults,
        children: booking.guests.children,
        quote,
      };
      const result = await call(baseUrl, "POST", "/api/bookings", bookingSchema, { body });
      return result.status === 409 ? "unavailable" : (expectData(result, "POST", "/api/bookings") as Booking);
    },
    async cancel(_userId, id) {
      const path = `/api/bookings/${encodeURIComponent(id)}/cancel`;
      const result = await call(baseUrl, "POST", path, bookingSchema);
      if (result.status === 404) return "not-found";
      if (result.status === 409) return "started";
      return expectData(result, "POST", path) as Booking;
    },
    async availability(listingId) {
      const path = `/api/bookings/availability?listingId=${encodeURIComponent(listingId)}`;
      return expectData(await call(baseUrl, "GET", path, z.array(staySchema), { auth: false }), "GET", path) as Stay[];
    },
  };
}
```

Use the backend's status codes directly; other failures throw, and `withErrorEnvelope` turns them into the 500 envelope.

**`lib/repositories/index.ts`:** in api mode, `bookings` comes from `createHttpBookingRepository(baseUrl)`. Wishlists and host data stay mocks. Restructure `accountRepositories` so mock mode keeps `mockBookingRepository`.

**`app/api/bookings/route.ts`:**
- Call `repos.bookings.create({ id: user.id, name: user.name, email: user.email }, { listingId, hostId: listing.hostId, checkIn, checkOut, guests: { adults, children }, priceBreakdown }, listing.id.startsWith(HOST_LISTING_ID_PREFIX) ? { hostId: listing.hostId, pricePerNight: listing.pricePerNight, maxGuests: listing.maxGuests } : undefined)`.
- The 409 message becomes `Those dates were just booked. Pick different dates.`.

**`app/api/bookings/[id]/cancel/route.ts`:**

```ts
export const POST = withErrorEnvelope(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await sessionFromRequest(request);
  if (!user) return unauthorized();
  const { id } = await params;
  const result = await getRepositories().bookings.cancel(user.id, id);
  if (result === "not-found") return jsonError("Booking not found", 404);
  if (result === "started") return jsonError("This trip has already started", 409);
  return Response.json(ok(result));
});
```

`parseBody` isn't used here: the request has no body, so the JSON-only (415) rule doesn't apply.

**`app/api/listings/[id]/availability/route.ts`:** a `GET` that returns `Response.json(ok(await getRepositories().bookings.availability(id)))`, wrapped in `withErrorEnvelope`.

**`lib/api-client/availability.ts`:**

```ts
import { z } from "zod";
import type { Booking, Stay } from "@/lib/types";
import { callApi } from "./request";
import { bookingSchema, staySchema } from "./schemas";

export function fetchAvailability(listingId: string): Promise<Stay[]> {
  return callApi(`/api/listings/${encodeURIComponent(listingId)}/availability`, z.array(staySchema));
}

export function cancelBooking(id: string): Promise<Booking> {
  return callApi(`/api/bookings/${encodeURIComponent(id)}/cancel`, bookingSchema, { method: "POST" });
}
```

Check the signature of `callApi` in `lib/api-client/request.ts` and adapt the calls if it differs.

**`lib/bookings/trips.ts`:**

```ts
/** Confirmed trips split into upcoming (check-out today or later, soonest first) and past (most recent first); cancelled ones apart. */
export function splitTrips<T extends Booking>(bookings: T[], today: string): { upcoming: T[]; past: T[]; cancelled: T[] } {
  const confirmed = bookings.filter((b) => b.status === "confirmed");
  return {
    upcoming: confirmed.filter((b) => b.checkOut >= today).sort((a, b) => a.checkIn.localeCompare(b.checkIn)),
    past: confirmed.filter((b) => b.checkOut < today).sort((a, b) => b.checkOut.localeCompare(a.checkOut)),
    cancelled: bookings.filter((b) => b.status === "cancelled").sort((a, b) => b.checkIn.localeCompare(a.checkIn)),
  };
}
```

**Pages:**
- `app/host/reservations/page.tsx`: use `repos.bookings.listForHost(user.id)`; the guest label becomes `r.guestEmail ?? r.guestId`; the `Reservation` type becomes `Booking`. Leave the cancelled UI for Task 5, but keep it compiling.
- `app/trips/page.tsx`: destructure the new shape.

**Existing tests:** update every `Booking` literal mechanically with `hostId` and `guestId`, plus anything that called `listForListings` or `create(userId, …)`. List each file in the report. `e2e/host.spec.ts` asserts the guest email on `/host/reservations`; that still holds because the mock stores `guestEmail`.

- [ ] **Step 4: Run the checks**

Run: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`. Expected: green.

- [ ] **Step 5: Commit**

`git add -A && git commit -m "feat: back bookings with the bookings API in api mode, with cancel and availability"`

---

### Task 5: Calendar availability, trip cancellation, cancelled badges

**Files:**
- Create: `lib/reservation/availability.ts`, `lib/hooks/use-listing-availability.ts`, `components/features/bookings/cancel-trip-button.tsx`
- Modify: `components/features/booking-calendar.tsx`, `lib/hooks/use-reservation-state.ts`, `components/features/reservation-card.tsx` (only to pass `blockedRanges` through), `app/trips/page.tsx`, `app/trips/[id]/page.tsx`, `app/host/reservations/page.tsx`
- Test: `lib/reservation/availability.test.ts`, `components/features/booking-calendar.test.tsx` (append), `lib/hooks/use-reservation-state.test.ts` (create or append), `components/features/bookings/cancel-trip-button.test.tsx`, `app/trips/page.test.tsx` and `app/trips/[id]/page.test.tsx` (append), `app/host/reservations/page.test.tsx` (append)

**Interfaces:**
- **Consumes:** `Stay`, `fetchAvailability`, `cancelBooking` and `splitTrips` (Task 4).
- **Produces:**
  - `isNightBooked(iso: string, stays: Stay[]): boolean` and `isStayFree(checkIn: string, checkOut: string, stays: Stay[]): boolean`;
  - `useListingAvailability(listingId)`, returning `Stay[]` (empty while loading);
  - the `BookingCalendar` prop `blockedRanges?: Stay[]`;
  - `CancelTripButton({ bookingId })`.

- [ ] **Step 1: Write the failing tests**

`lib/reservation/availability.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { isNightBooked, isStayFree } from "./availability";

const stays = [{ checkIn: "2031-02-10", checkOut: "2031-02-13" }];

describe("availability", () => {
  test("nights inside [checkIn, checkOut) are booked; the check-out day is not", () => {
    expect(isNightBooked("2031-02-10", stays)).toBe(true);
    expect(isNightBooked("2031-02-12", stays)).toBe(true);
    expect(isNightBooked("2031-02-13", stays)).toBe(false);
    expect(isNightBooked("2031-02-09", stays)).toBe(false);
  });

  test("a stay is free only when none of its nights is booked; back-to-back stays are free", () => {
    expect(isStayFree("2031-02-07", "2031-02-10", stays)).toBe(true);
    expect(isStayFree("2031-02-13", "2031-02-15", stays)).toBe(true);
    expect(isStayFree("2031-02-08", "2031-02-11", stays)).toBe(false);
    expect(isStayFree("2031-02-05", "2031-02-20", stays)).toBe(false);
  });
});
```

`components/features/booking-calendar.test.tsx` (append; render February 2031 with `minDate` early enough that no day is in the past):
- With `blockedRanges=[{checkIn:"2031-02-10",checkOut:"2031-02-13"}]` and no selection, the day buttons 10, 11 and 12 are disabled, and 9 and 13 are enabled.
- With `checkIn = Feb 7` selected and no check-out, day 10 is enabled, because checking out on the day a booking starts is a free stay. Days 11 and 12 stay disabled.

`use-reservation-state` (via `renderHook`, with the clock frozen at 2031-01-15 and `blockedRanges` as above): select Feb 7, then Feb 15. Because [Feb 7, Feb 15) spans booked nights, the selection restarts with `checkIn = Feb 15` and `checkOut = null`. Selecting Feb 7, then Feb 10, gives `checkOut = Feb 10`.

`cancel-trip-button.test.tsx`:
- Clicking "Cancel trip" opens a dialog named "Cancel this trip?".
- "Keep trip" closes it without calling the API.
- "Cancel trip" in the dialog calls `cancelBooking("bk_1")`, then `router.refresh()`.
- A rejected cancel (`mockRejectedValueOnce(new Error("This trip has already started"))`) shows an alert with that message.

**Pages:**
- `/trips`: a cancelled booking appears under a "Cancelled" heading with a "Cancelled" badge, and not under Upcoming.
- `/trips/[id]`:
  - a confirmed future trip shows the "Cancel trip" button;
  - a cancelled trip shows "Cancelled" and no button;
  - a trip whose check-in has come shows no button;
  - the status line reads `Booking <8 chars> · Confirmed` or `· Cancelled`.
- `/host/reservations`: a cancelled booking shows a "Cancelled" badge.

Follow each page test's existing mocking setup.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run lib/reservation components/features/booking-calendar.test.tsx lib/hooks components/features/bookings app/trips app/host/reservations`. Expected: FAIL.

- [ ] **Step 3: Implement**

`lib/reservation/availability.ts`:

```ts
import type { Stay } from "@/lib/types";

/** True when the night starting on `iso` (YYYY-MM-DD) belongs to a booked stay; stays are half-open [checkIn, checkOut). */
export function isNightBooked(iso: string, stays: Stay[]): boolean {
  return stays.some((stay) => stay.checkIn <= iso && iso < stay.checkOut);
}

/** True when no night of [checkIn, checkOut) is booked; checking out on another stay's check-in day is fine. */
export function isStayFree(checkIn: string, checkOut: string, stays: Stay[]): boolean {
  return stays.every((stay) => checkOut <= stay.checkIn || stay.checkOut <= checkIn);
}
```

`lib/hooks/use-listing-availability.ts`:

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchAvailability } from "@/lib/api-client/availability";
import type { Stay } from "@/lib/types";

const NO_STAYS: Stay[] = [];

/** The listing's booked stays for the calendar; empty while loading or if the request fails (the server still refuses overlaps). */
export function useListingAvailability(listingId: string): Stay[] {
  const { data } = useQuery({ queryKey: ["availability", listingId], queryFn: () => fetchAvailability(listingId) });
  return data ?? NO_STAYS;
}
```

**`BookingCalendar`:**
- Add the prop `blockedRanges?: Stay[]` (default `[]`).
- Per day, compute `iso = toIsoDate(date)`.
- `const choosingCheckOut = checkIn !== null && checkOut === null && date > checkIn;`
- `disabled = pastDisabled || (isNightBooked(iso, blockedRanges) && !(choosingCheckOut && isStayFree(toIsoDate(checkIn), iso, blockedRanges)))`.

**`useReservationState`:**
- Call `useListingAvailability(listingId)` and return it as `blockedRanges` on the state.
- In `select`, when a check-in is set, no check-out is set and `date > checkIn`, but `!isStayFree(toIsoDate(checkIn), toIsoDate(date), blockedRanges)`, start a new selection at `date` (`setCheckIn(date); setCheckOut(null)`). The calendar normally prevents this, but query-param dates and races can still reach it.
- `ReservationCard` passes `s.blockedRanges` to `BookingCalendar`.

`components/features/bookings/cancel-trip-button.tsx`:
- A client component holding a "Cancel trip" secondary button.
- The button opens a native `<dialog aria-labelledby>` titled "Cancel this trip?", with the body text "Your nights will be released and you won't be charged." and two buttons:
  - "Keep trip" closes the dialog;
  - "Cancel trip" calls `cancelBooking(bookingId)`, then `router.refresh()`. On error it shows `role="alert"` with the message and re-enables the button.
- Follow the `<dialog>` pattern in `components/features/wishlists/save-to-wishlist-dialog.tsx`: showModal in an effect, and focus returns to the opener.
- Use design tokens.

**Pages:**
- `/trips`: render a `TripSection title="Cancelled"` for `cancelled`. `TripCard` shows a "Cancelled" badge (`text-caption` muted pill) when `booking.status === "cancelled"`.
- `/trips/[id]`: the status line reads `· Cancelled` or `· Confirmed`. Show `<CancelTripButton bookingId={booking.id} />` only when `booking.status === "confirmed"`, the viewer is the guest (`booking.guestId === user.id`), and `booking.checkIn > today` (UTC date).
- `/host/reservations`: show a "Cancelled" badge on cancelled rows, and list them in their own "Cancelled" section using `splitTrips`'s `cancelled`.

- [ ] **Step 4: Run the checks**

Run: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`. Expected: green.

- [ ] **Step 5: Commit**

`git add -A && git commit -m "feat: grey out booked nights and let guests cancel upcoming trips"`

---

### Task 6: E2E, docs and full verification

**Files:**
- Create: `frontend/e2e/availability.spec.ts`
- Modify (repo root): `CLAUDE.md`, `docs/superpowers/specs/2026-09-26-backend-modular-monolith-design.md`

- [ ] **Step 1: Write the e2e spec** (desktop project, mock mode)

`frontend/e2e/availability.spec.ts`:
- Guest A, in a fresh context logged in with `logIn` from `e2e/helpers.ts`, opens `/rooms/l3`.
- A moves to a random month 2–11 months ahead with "Next month", picks two adjacent enabled days in `#reserve`, reserves, and confirms and pays.
- Guest B, in another context, opens `/rooms/l3` and moves to the same month. The first night A booked is disabled.
- A opens the trip (it lands on `/trips/<id>?confirmed=1`), clicks "Cancel trip", and confirms in the dialog. The page shows "Cancelled".
- B reloads, moves to that month again, and the night is enabled.

Use `[data-calendar-day]` selectors as in `e2e/keyboard.spec.ts` and `mobile.spec.ts`, and wait for `networkidle` before acting. Choose the month randomly so parallel runs don't collide.

- [ ] **Step 2: Update the docs**

**`CLAUDE.md`:**
- Add `Bookings` to the module list.
- Add a backend bullet: "Bookings: `bookings` schema; a `btree_gist` exclusion constraint refuses overlapping confirmed stays (`[CheckIn, CheckOut)`, `23P01` → 409); prices come from Stays via `IListingLookup.FindForBookingAsync`, except `hl-` host listings, which take a `quote` from the Next server until host listings move to the backend; guest name/email are snapshots; endpoints `POST /api/bookings`, `GET /api/bookings/mine|hosting|{id}`, `POST /api/bookings/{id}/cancel`, public `GET /api/bookings/availability?listingId=`."
- Frontend data layer: in api mode, bookings use `lib/repositories/http/http-booking-repository.ts`, which forwards the session cookie's token as the bearer. Wishlists and host data stay mocks.

**The backend spec:** add a line linking `2026-10-08-backend-bookings-design.md` next to the identity line.

- [ ] **Step 3: Verify**

- Backend, from `backend/`: `dotnet build Airbnb.slnx` (0 warnings), then `dotnet test`. This includes the AppHost smoke test, which needs Docker and a free port 3000. Report a port conflict rather than killing unknown processes.
- Frontend, from `frontend/`: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, then `npm run e2e`.

If a run flakes, rerun it once and report both runs.

- [ ] **Step 4: Commit**

`git add -A && git commit -m "test: cover booked-night availability end to end and document the bookings module"`
