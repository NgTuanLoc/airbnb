# Frontend Phase 7 — Host Pages — Design

**Date:** 2026-09-28
**Status:** Approved. The user pre-approved phase 7 end to end: the design, this spec and the plan; review happens on the pull request.
**Builds on:**
- `2026-06-21-airbnb-frontend-clone-design.md` §10 phase 7;
- `2026-09-27-frontend-phase6-auth-wishlists-trips-design.md`: mock session, in-memory repositories, bookings.

## Goal

Any logged-in user can become a host:
- create a listing through a short multi-step flow;
- manage it (edit, unlist, relist) from a host dashboard;
- see the bookings guests make on it.

Host-created listings appear in the home grid, in search and at `/rooms/[id]` like any other listing, so guests can book them with the phase 6 flow.

## Success criteria

1. `/host` is a "Become a host" landing page (the nav link no longer 404s).
2. A logged-in user creates a listing at `/host/listings/new`. It shows up in `/host/listings`, on the home grid (its category) and in search (`/s/<city>` and filters).
3. A second user books it through Reserve → Confirm and pay. The host sees the booking at `/host/reservations`.
4. Unlisting hides it from home and search. Existing bookings and the host's own views still resolve it, and new bookings are refused. Relisting brings it back.
5. A host can't book their own listing.
6. Everything works with `DATA_SOURCE=mock` and `api`. Existing unit and e2e tests pass, except where a test's component changes on purpose (listed in the plan).

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Storage | In-memory frontend mocks (`globalThis`) in both data modes, like phase 6 | The backend has no auth or host concepts; the repository seam keeps a later backend swap possible |
| Catalog merge | `getRepositories().listings` wraps the catalog repository (mock or HTTP) and adds listed host listings | Guests see host listings everywhere, with no page changes |
| Filters | The mock's filter logic moves to a shared `matchesFilters(listing, filters)` | Host and catalog listings are filtered identically |
| Location | The host picks one of the 6 known cities (coordinates from a fixed table) | The map works without a geocoder |
| Photos | Pick 1–5 from a preset gallery of allowed Unsplash URLs; the server rejects anything else | `next/image` only allows configured hosts, and uploads are out of scope |
| Unlisting | `status: "listed" \| "unlisted"`; no delete | Keeps bookings valid; fewer edge cases |
| Host profile | Built from the session user the first time they create a listing | The listing page gets a real host card |
| Ratings | Listings with `reviewCount === 0` show "New" instead of "0.00" | Honest for brand-new listings |

## 1. Data model and repositories

- **`Listing`** gains an optional `status?: "listed" | "unlisted"`.
  - Missing means listed.
  - Seed data and the backend DTO stay unchanged; the listing Zod schema accepts the optional field.
- **Host listings** use the existing `Listing` shape:
  - `id` = `"hl-" + crypto.randomUUID()`;
  - `hostId` = the user id (`u-<email>`);
  - `rating` 0, `reviewCount` 0, `isGuestFavorite` false;
  - `location` from the chosen city: city name, country and coordinates from `lib/host/options.ts`;
  - `photos` = the chosen preset URLs, in pick order;
  - `status` "listed".
- **`HostListingRepository`** (`lib/repositories/host-listing-repository.ts`), with an in-memory mock:
  - `listForHost(hostId): Promise<Listing[]>`, newest first;
  - `findById(id): Promise<Listing | null>`, any status;
  - `create(hostId, input: HostListingInput): Promise<Listing>`;
  - `update(hostId, id, input): Promise<Listing | null>`, where null means not found or not the owner;
  - `setStatus(hostId, id, status): Promise<Listing | null>`;
  - `listPublic(): Promise<Listing[]>`, the listed host listings only.
- **`HostProfileRepository`** (in-memory):
  - `upsertFromUser(user: User): Promise<void>`, called on the first create;
  - `findById(id): Promise<Host | null>`, which returns `{ id, name, avatar: DEFAULT_HOST_AVATAR, isSuperhost: false, responseRate: 100, joinedYear: <year of first listing> }`.
- **`getRepositories()`**:
  - `listings` becomes `combinedListingRepository(catalog, hostListings)`:
    - `findAll(filters)` returns `[...catalogResults, ...(await hostListings.listPublic()).filter(l => matchesFilters(l, filters))]`;
    - `findById(id)` returns `id.startsWith("hl-") ? hostListings.findById(id) : catalog.findById(id)`.
  - `hosts` becomes `combinedHostRepository`: `u-…` ids go to the host profile store, everything else to the catalog.
  - New members `hostListings` and `hostProfiles`, which are mocks in both modes.
  - In api mode, reviews for `hl-…` ids still go to the backend and come back empty. That's correct.
- **Bookings.** `BookingRepository` gains `listForListings(listingIds: string[]): Promise<Array<Booking & { guestId: string }>>`, which returns bookings by any user on those listings, soonest check-in first.
- **`lib/search/match-listing.ts`** exports `matchesFilters`, with the exact semantics `mockListingRepository` has today:
  - city matched case-insensitively, skipping "anywhere";
  - category skipped for "All";
  - `>=` for min price, guests, bedrooms, beds and baths; `<=` for max price.

  The mock then filters through it.

## 2. Host UI

### `/host`: landing page (public)

- A hero: "Airbnb it." / "You could earn" with an **earnings estimate**:
  - a city select (the 6 cities) and a nights-per-month slider (1–30, default 7);
  - estimate = the average `pricePerNight` of the seed listings in that city × nights, rounded, shown as "$X a month";
  - computed on the client from a table passed in by the server page.
- A three-step "How it works" section (Describe your place / Add photos / Set a price and publish).
- A primary CTA "Get started" → `/host/listings/new`. That page is gated, so logged-out users go through login and come back.
- When the user is logged in and has listings, the CTA reads "Go to your listings" → `/host/listings`.

### `/host/listings/new`: the create flow (gated)

A client `HostListingForm` walks through four steps, with Back and Next and a progress indicator:

1. **Your place:** title, property type (select), category (select, `CATEGORIES` without "All"), description (textarea).
2. **Location and size:** city (select), then steppers for guests, bedrooms, beds and baths.
3. **Amenities and photos:** amenity checkboxes, and a photo grid where the host picks 1–5. Pick order sets the order, and the first pick is the cover.
4. **Price and review:** price per night (number), and a summary card of every choice. The **Publish** button posts to `POST /api/host/listings`.

- Each step validates its own fields with the shared schema before Next.
- After publishing, the host goes to `/host/listings?created=<id>`, which shows a "Your listing is live" banner with a "View listing" link.

### `/host/listings/[id]/edit`

The same form, prefilled, with **Save** (`PUT /api/host/listings/[id]`). It returns 404 unless the user owns the listing.

### `/host/listings` (gated)

- Rows showing cover, title, city, price, status badge ("Listed" / "Unlisted"), and the actions **View** (`/rooms/[id]`), **Edit**, and **Unlist** / **Relist** (`PATCH /api/host/listings/[id]/status`, then `router.refresh()`).
- Empty state: "You don't have any listings yet" with a "Create a listing" button.
- A sub-nav with "Listings" and "Reservations".

### `/host/reservations` (gated)

- Bookings on the host's listings, split into **Upcoming** and **Past** with the phase 6 `splitTrips`.
- Each row shows listing title, guest (the email from the guest id), dates, guests and total.
- Empty state: "No reservations yet".

### Other UI changes

- **Account menu:** adds a "Host dashboard" link (`/host/listings`) for logged-in users.
- **`/rooms/[id]` for the owner:** shows a "This is your listing" card with Edit and Manage links instead of the reservation card.
- **`/rooms/[id]` for an unlisted listing, as seen by others:** shows the listing with a notice "This place isn't taking bookings right now" instead of the reservation card.
- **`/book/[listingId]`:** redirects to `/rooms/[id]` when the user owns the listing or it is unlisted.
- **"New" ratings:** `PropertyCard`, `ListingOverview` and the listing page's reviews band show "New" for `reviewCount === 0`.

## 3. API (session required → otherwise 401 `Log in to continue`)

- **`POST /api/host/listings`** creates the listing, validated with `hostListingInputSchema`. It returns 201 with the listing and upserts the host profile.
- **`PUT /api/host/listings/[id]`** updates it; the same schema applies, and it returns 404 `Listing not found` unless the user owns it.
- **`PATCH /api/host/listings/[id]/status`** takes `{ status: "listed" | "unlisted" }` and returns 404 as above.
- **`POST /api/bookings`** (phase 6) gains two rules:
  - booking your own listing → 400 `You can't book your own listing`;
  - an unlisted listing → 400 `This place isn't taking bookings right now`.

## 4. Validation (`lib/host/schemas.ts`, `hostListingInputSchema`, shared by the form and the API)

| Field | Rule and message |
|---|---|
| `title` | trimmed, 5–80 chars ("Titles need 5–80 characters") |
| `description` | trimmed, 20–1000 chars ("Descriptions need 20–1000 characters") |
| `propertyType` | one of `PROPERTY_TYPES` ("Pick a property type") |
| `category` | one of `CATEGORIES` except "All" ("Pick a category") |
| `cityId` | one of the 6 city ids in `HOST_CITIES` ("Pick a city") |
| `maxGuests` | integer 1–16 |
| `bedrooms` | integer 0–20 |
| `beds` | integer 1–30 |
| `baths` | 0.5–20, in steps of 0.5 |
| `amenities` | a unique subset of `AMENITY_OPTIONS` |
| `photos` | 1–5 unique entries from `PHOTO_OPTIONS` ("Pick 1 to 5 photos") |
| `pricePerNight` | integer 10–10000 ("Price must be between $10 and $10,000") |

`lib/host/options.ts` holds:
- `PROPERTY_TYPES`: Entire home, Entire cabin, Entire villa, Entire apartment, Entire cottage, Tiny home, Private room;
- `AMENITY_OPTIONS`: the seed amenity list plus Pool, Hot tub, Workspace, Pets allowed;
- `PHOTO_OPTIONS`: 12 Unsplash URLs taken from the seed listings;
- `HOST_CITIES`: id, name, country, lat and lng for the 6 cities;
- `DEFAULT_HOST_AVATAR`.

## 5. Testing and docs

- **Vitest:**
  - `matchesFilters`, with parity with the old mock behaviour;
  - the host listing and host profile mocks (ownership, `listPublic` excludes unlisted);
  - the combined listing and host repositories in both modes (merge, filters, `hl-` routing);
  - `listForListings`;
  - `hostListingInputSchema` edge cases;
  - the host API handlers (401, validation 400s, 404 for another user's listing, create/update/status), and the booking rules (own listing, unlisted);
  - the form: step validation, publish payload, prefilled edit;
  - the pages (gating, lists, empty states, owner and unlisted variants of `/rooms/[id]`);
  - the "New" rating display and the account menu's host link.
- **Playwright:**
  1. Host A creates a listing in Aspen. It appears at `/s/Aspen`. Guest B (a second browser context) books it. A sees it at `/host/reservations`.
  2. A unlists it; it's gone from `/s/Aspen`. A relists it; it's back.
- **Coverage:** at least 80% lines on new files.
- **Docs:**
  - CLAUDE.md: the host repositories, the combined listing and host repositories, `matchesFilters`, and the host pages;
  - the frontend spec §10, phase 7 row: a link to this spec.

## Out of scope

- Deleting listings, calendar and availability management, custom pricing rules.
- Photo uploads.
- Reviews on host listings.
- Messaging guests.
- Payouts.
- Backend persistence for host data.
- Hosting experiences or services.
- Responsive polish (phase 8).
