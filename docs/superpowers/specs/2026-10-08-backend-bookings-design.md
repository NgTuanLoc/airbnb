# Backend Phase 6 — Bookings with Availability — Design

**Date:** 2026-10-08
**Status:** Approved by the user in advance ("fix push and start phase 2, do not need to ask me again"). Design calls below are the controller's.
**Roadmap:** phase 2 of 4: Identity (done), **Bookings**, reviews from trips, then persisting wishlists and host listings.
**Builds on:**
- `2026-10-07-backend-identity-design.md`: the `Session` auth scheme and the user id in `ClaimTypes.NameIdentifier`;
- `2026-09-27-frontend-phase6-auth-wishlists-trips-design.md`: the booking flow, trips and the mock bookings.

## Goal

Bookings live in Postgres, owned by a backend `Bookings` module. The database makes double-booking impossible: two guests can never hold overlapping nights on one listing, even when they confirm at the same instant. Guests can cancel upcoming trips, which frees the nights. The listing calendar greys out booked nights, so guests can't pick them.

## Success criteria

1. With `DATA_SOURCE=api`, a confirmed booking:
   - survives restarts;
   - shows up in the guest's `/trips`;
   - shows up in the host's `/host/reservations`.
2. Two concurrent bookings for overlapping nights on one listing produce exactly one 201 and one 409 `Those dates were just booked. Pick different dates.`. Back-to-back stays are allowed: one stay's check-out day can be the next stay's check-in day.
3. A guest can cancel a confirmed booking before its check-in day. The booking becomes `cancelled` and its nights can be booked again. A trip that has started can't be cancelled (409).
4. The listing calendar disables every booked night, and a guest can't select a range that spans one.
5. `DATA_SOURCE=mock` behaves the same way, using the in-memory mock.
6. Existing unit and e2e tests pass, except where a test's component changes on purpose (listed in the plan).

## Decisions

| Decision | Choice | Why |
|---|---|---|
| No double-booking | A Postgres `EXCLUDE USING gist ("ListingId" WITH =, daterange("CheckIn","CheckOut",'[)') WITH &&) WHERE ("Status" = 'confirmed')`, needing `btree_gist`. An `exclusion_violation` (`23P01`) maps to 409. | The invariant lives in the database, so no race can break it and no lock code is needed. A half-open range allows back-to-back stays. |
| Who prices a booking | The backend prices catalog listings itself, from Stays through a new Contracts method. Host listings (`hl-` ids) still live in the frontend until roadmap phase 4, so for those only, the Next server sends a `quote` (`hostId`, `pricePerNight`, `maxGuests`), which the backend uses. | The browser never sets a price. The `hl-` exception is temporary and documented. Phase 4 moves host listings into Stays and deletes `quote`. |
| Listing rules (exists, unlisted, guest cap) | The backend checks existence and the guest cap for catalog listings. The Next server keeps checking all rules for every listing before it calls the backend, as today. | It's the same layering as today, and the backend still refuses impossible requests. |
| Who's who | The backend takes the guest from the session token, and stores guest name and email snapshots on the booking. | A module can't read another module's tables. The host's reservations list needs a guest label without calling Identity. |
| Host access | Each booking stores `HostId`. `GET /bookings/hosting` returns rows where `HostId` is the current user. | Hosts see only their own listings' bookings, never someone else's by passing listing ids. |
| Events | None in this phase | YAGNI. Phase 3 asks Bookings "did this guest stay here?" through a Contracts interface, not through events. |
| Frontend auth to the backend | The HTTP booking repository sends `Authorization: Bearer <session token>`, read from the `session` cookie with `cookies()` | The cookie already holds the backend token in api mode. The repository signatures don't change. |

## 1. Backend

### Stays (Contracts addition)

`IListingLookup` gains:

```csharp
Task<ListingBookingInfo?> FindForBookingAsync(string listingId, CancellationToken cancellationToken);
```

```csharp
public sealed record ListingBookingInfo(string HostId, decimal PricePerNight, int MaxGuests);
```

It returns null for an unknown id.

### The `Bookings` module

It lives at `backend/src/Modules/Bookings/Airbnb.Modules.Bookings/`, in schema `bookings`, and follows the module rules in CLAUDE.md.

**Table `bookings`:**
- `Id` (text PK, `bk_` + UUID v7 `N`)
- `ListingId`, `HostId`, `GuestId`, `GuestName`, `GuestEmail`
- `CheckIn`, `CheckOut` (date)
- `Adults`, `Children`
- `NightlyPrice`, `Nights`, `CleaningFee`, `ServiceFee`, `Total` (numeric)
- `Status` (`confirmed` | `cancelled`)
- `CreatedAt`, `CancelledAt` (nullable)

Indexes:
- `GuestId`;
- `HostId`;
- `(ListingId, CheckIn)`.

Plus the exclusion constraint above.

**Pricing** (`BookingPricing`) mirrors `frontend/lib/reservation/pricing.ts`:
- subtotal = nightly × nights;
- cleaning fee 75;
- service fee = round(subtotal × 0.14), rounding half away from zero;
- total = subtotal + cleaning fee + service fee.

A unit test pins the same cases as the frontend's pricing tests.

### Endpoints (under `/api`; envelope bodies; all require auth except availability)

| Endpoint | Behaviour |
|---|---|
| `POST /bookings` | Body `{ listingId, checkIn, checkOut, adults, children, quote? }`. **Validation (400):** dates are `YYYY-MM-DD`; check-in ≥ today − 1 day (UTC, as the frontend allows); 1–30 nights; adults 1–16; children 0–15. **Listing:** `hl-` ids need a `quote`, and its absence is a 400 `A quote is required for host listings`. Other ids are looked up in Stays, and an unknown one is a 404 `Listing '<id>' was not found`; any `quote` sent for them is ignored. **Guests:** more than `maxGuests` is a 400 `This place allows at most N guests`. **Own listing:** a `hostId` equal to the user id is a 400 `You can't book your own listing`. **Overlap:** 409 `Those dates were just booked. Pick different dates.`. **Success:** 201 booking. |
| `GET /bookings/mine` | The guest's bookings, soonest check-in first. |
| `GET /bookings/{id}` | The booking if the user is its guest or host, otherwise 404 `Booking not found`. |
| `POST /bookings/{id}/cancel` | Guest only, otherwise 404. Confirmed and check-in > today (UTC): status becomes `cancelled`, `CancelledAt` is set, 200 booking. Already cancelled: 200, idempotent. Check-in ≤ today: 409 `This trip has already started`. |
| `GET /bookings/hosting` | Bookings where `HostId` is the user, soonest check-in first. |
| `GET /bookings/availability?listingId=` | Public. `[{ checkIn, checkOut }]` for the listing's confirmed bookings with check-out after today, ordered. Not cached: availability must be fresh. |

**Booking JSON:**

```
{ id, listingId, hostId, guestId, guestName, guestEmail, checkIn, checkOut,
  guests: { adults, children },
  priceBreakdown: { lineItems: [{ label, amount }], total },
  status, createdAt, cancelledAt? }
```

`priceBreakdown` uses the frontend labels: `$<price> x <n> night(s)`, `Cleaning fee` and `Airbnb service fee`. Amounts are JSON numbers.

## 2. Frontend

### Types and repository

`Booking`:
- `status` becomes `"confirmed" | "cancelled"`;
- it gains `hostId`, an optional `cancelledAt`, and optional `guestName`/`guestEmail` (set on host views).

`BookingRepository`:
- `create(userId, booking: NewBooking & { hostId; quote? })`, returning `Booking | "unavailable"`;
- `listForUser`, `findById(userId, id)` (now also visible to the host);
- `cancel(userId, id)`, returning `Booking | "not-found" | "started"`;
- `listForHost(hostId)`, replacing `listForListings`;
- `availability(listingId)`, returning `{ checkIn, checkOut }[]`.

### Implementations

**Mock:** the existing in-memory store gains:
- `hostId`;
- cancellation, with the same rules;
- availability (confirmed bookings only);
- `listForHost`.

The overlap check now ignores cancelled bookings.

**HTTP** (`lib/repositories/http/http-booking-repository.ts`):
- calls the backend with the bearer token from the `session` cookie;
- validates responses with Zod;
- maps 409 to `"unavailable"` or `"started"`, and 404 to null or `"not-found"`;
- throws on anything else.

In api mode, `getRepositories().bookings` is this repository. Wishlists and host data stay mocks until phase 4.

### Routes and pages

- **`POST /api/bookings`:** keeps its listing checks. It sends `hostId` and, for `hl-` listings, a `quote` built from the listing. A 409 says `Those dates were just booked. Pick different dates.`.
- **`POST /api/bookings/[id]/cancel` (new):** session-guarded; 404 `Booking not found`; 409 `This trip has already started`; 200 booking.
- **`GET /api/listings/[id]/availability` (new):** public; returns `{ checkIn, checkOut }[]`.
- **Calendar:**
  - `ReservationCard` and the mobile bar's shared state fetch the availability with TanStack Query (`["availability", listingId]`).
  - `BookingCalendar` gets `blockedRanges`. Nights inside `[checkIn, checkOut)` are disabled.
  - Choosing a check-out whose range would span a blocked night starts a new selection at that date instead.
- **`/trips`:** upcoming shows confirmed trips with check-out ≥ today. Past shows the rest. A new "Cancelled" section lists cancelled trips with a "Cancelled" badge.
- **`/trips/[id]`:** confirmed trips with check-in > today get a "Cancel trip" button. It asks for confirmation with a native `<dialog>`, posts to the cancel route, then refreshes. Cancelled trips show the badge and no button.
- **`/host/reservations`:** uses `listForHost(user.id)` and shows a "Cancelled" badge on cancelled rows.

## 3. Testing

### Backend

**Unit:** pricing parity cases.

**Integration:**
- create a catalog booking: 201, and the price is computed on the server even when the body sends a lower `quote`;
- an `hl-` booking without a quote: 400; with one: 201;
- unknown listing: 404;
- validation 400s;
- too many guests;
- own listing;
- overlap: 409;
- back-to-back stays: both 201;
- concurrent overlapping creates: exactly one 201;
- mine, get, and hosting visibility (a stranger gets 404);
- cancel: before check-in 200, after starting 409, idempotent, a stranger gets 404, and the nights can be booked again;
- availability lists only confirmed future stays;
- all non-public endpoints without a token: 401.

**Wiring:** `ModuleRulesTests` lists the module; `InfrastructureFixture` and `MigrationService` migrate it.

### Frontend (Vitest)

- the mock repository's parity: cancel rules, availability, `listForHost`, cancelled bookings no longer block nights;
- the HTTP booking repository against a mocked `fetch`: bearer header, status mapping, invalid payloads;
- the cancel and availability routes;
- `POST /api/bookings` sends a quote only for `hl-` listings;
- `BookingCalendar` blocked nights and span-reset;
- the trips cancel button and dialog, and the cancelled badges;
- host reservations badges.

### E2E (mock mode)

- Guest A books nights. Guest B sees those nights disabled on the listing calendar.
- A cancels from `/trips/[id]`. B can then book the same nights.

## 4. Docs

- **CLAUDE.md:** the Bookings module (exclusion constraint, endpoints, the `hl-` quote exception), the HTTP booking repository and bearer forwarding, and bookings being backend-backed in api mode.
- **The backend spec:** a link to this one.

## Out of scope

- Payments, refunds and cancellation fees.
- Changing a booking's dates.
- Host-side cancellation.
- Blocking dates manually.
- Minimum stays.
- Notifications.
- Events.
- Moving host listings or wishlists to the backend (roadmap phase 4).
