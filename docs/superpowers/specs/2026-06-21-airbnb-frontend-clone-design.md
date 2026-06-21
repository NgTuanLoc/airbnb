# Airbnb Frontend Clone — Design Spec

**Date:** 2026-06-21
**Status:** Approved for planning
**Phase:** Frontend with mock data (backend swap-in to follow later)

## 1. Overview & Goals

A pixel-faithful Airbnb clone front end built on **Next.js (latest, React 19) +
TypeScript + Tailwind v4**, styled strictly from the `DESIGN.md` design system.
All data is mocked but served over **real HTTP route handlers** behind a
**repository abstraction**, so a later backend is a drop-in swap — the UI and the
API contract never change.

**Goals**

- Reproduce the Airbnb experience across three product verticals (Homes,
  Experiences, Services) plus auth (mock), wishlists, booking confirmation, and
  host pages.
- Encode `DESIGN.md` tokens precisely (colors, type scale, radii, spacing, single
  shadow tier) so the UI reads as a real Airbnb screenshot.
- Keep a clean network seam so swapping mock data for a real backend requires no
  changes in `components/`.

**Non-Goals (this phase)**

- No real authentication, payments, or persistence beyond in-memory/seed JSON.
- No real backend, database, or third-party booking integrations.
- Sub-brand systems (Luxe, Plus) beyond the documented tokens.

## 2. Tech Stack

- **Framework:** Next.js (latest stable, App Router, React 19)
- **Language:** TypeScript (strict)
- **Styling:** Tailwind CSS v4 (`@theme` mapping of `DESIGN.md` tokens)
- **UI primitives:** shadcn/ui (Radix-based) — dialogs, popovers, etc.
- **Server data:** TanStack Query
- **Client state:** Zustand
- **Validation:** Zod (boundary validation in the api-client)
- **Maps:** Mapbox GL (free token) with custom Rausch price markers
- **Fonts:** Inter via `next/font` (the substitute `DESIGN.md` recommends for
  Airbnb Cereal VF)
- **Images:** Unsplash photography
- **Testing:** Vitest + React Testing Library (unit/component), Playwright (E2E)

Versions are pinned to the newest stable releases at scaffold time.

## 3. Architecture

```
app/                      # Next.js App Router (RSC by default)
  (marketing)/            # homepage, category browse
  s/[location]/           # search results
  rooms/[id]/             # listing detail
  experiences/, services/ # vertical browse + detail
  wishlists/, trips/      # account-gated mock pages
  host/                   # host dashboard pages
  api/                    # route handlers (the backend seam)
    listings/, experiences/, services/
    wishlists/, bookings/, auth/
lib/
  repositories/           # ListingRepository, BookingRepository … (interfaces)
    mock/                 # in-memory JSON-backed implementations
  data/                   # seed JSON (listings, hosts, reviews, cities)
  api-client/             # typed fetch wrappers used by TanStack Query
components/
  ui/                     # shadcn primitives
  design-system/          # tokenized Airbnb atoms (SearchBar, PropertyCard…)
  features/               # composed sections (Header, ListingGallery…)
stores/                   # Zustand (search filters, auth-mock, wishlist UI)
styles/                   # Tailwind v4 theme mapping DESIGN.md tokens
```

**Key seam:** `components` → `api-client` → `/api/*` route handler →
`Repository` interface → mock JSON implementation. Swapping to a real backend
means replacing the mock repository (or re-pointing route handlers) — nothing in
`components/` changes.

## 4. Design System Foundation (built first)

Encode `DESIGN.md` into the Tailwind v4 theme before any page:

- **Colors:** `rausch (#ff385c)`, `rausch-active (#e00b41)`, `rausch-disabled
  (#ffd1da)`, `ink (#222222)`, `body (#3f3f3f)`, `muted (#6a6a6a)`,
  `muted-soft (#929292)`, hairlines (`#dddddd`, `#ebebeb`), borders, surfaces
  (`#ffffff`, `#f7f7f7`, `#f2f2f2`), error (`#c13515`), legal-link (`#428bff`).
  Exact hex values.
- **Typography:** Inter via `next/font`, mapped to the named scale —
  `display-xl` 28/700 … `display-lg` 22/500 … `title-md` 16/600 … `body-md`
  16/400 … `rating-display` 64/700 … `uppercase-tag` 8/700. Reduce display
  line-heights ~2% per the spec note to match Cereal's cap height.
- **Radii:** `none 0 / xs 4 / sm 8 / md 14 / lg 20 / xl 32 / full 9999`.
- **Spacing:** `2 / 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64`.
- **Elevation:** the single shadow tier as one utility
  (`rgba(0,0,0,0.02) 0 0 0 1px, rgba(0,0,0,0.04) 0 2px 6px, rgba(0,0,0,0.1) 0 4px 8px`);
  `scrim` at 50% opacity for modal backdrops.

Then the atomic components: `Button` (primary/active/disabled/secondary/tertiary/
pill), `SearchBarPill` + `SearchOrb`, `TopNav` + product tabs + `NewBadge`,
`PropertyCard` / `ExperienceCard`, `GuestFavoriteBadge`, `RatingDisplay`,
`AmenityRow`, `ReviewsCard`, `HostCard`, `ReservationCard`, `DatePickerDay`,
`TextInput`, `Footer` + `LegalBand`.

## 5. Pages / Routes

| Route | Page |
|---|---|
| `/` | Homepage: header, pill search, category strip, property grid, city-link grid, footer |
| `/s/[location]` | Search results: filter bar, results grid, Mapbox map with Rausch price markers |
| `/rooms/[id]` | Listing detail: photo gallery, `RatingDisplay`, amenities, reviews grid, host card, sticky reservation card |
| `/experiences`, `/experiences/[id]` | Experiences browse + detail |
| `/services`, `/services/[id]` | Services browse + detail |
| `/wishlists`, `/wishlists/[id]` | Saved listings (mock-auth gated) |
| `/trips` | Booking confirmations |
| `/host` + sub-pages | Host dashboard / "become a host" |
| Modals | Login/signup, date picker, guest stepper, full-screen mobile search |

## 6. Data Model & Mock Data

Typed entities in `lib/data`:

- `Listing` — photos[], title, price/night, location {city, lat, lng}, amenities[],
  category, rating, reviewCount, hostId, `isGuestFavorite`, type.
- `Experience` — like Listing with 4:5 card aspect, `isNew`.
- `Service` — service category, provider, price.
- `Host` — name, avatar, `isSuperhost`, responseRate, joinedDate.
- `Review` — authorId, name, avatar, date, rating, body.
- `City` — name, category sub-label, image, listing count.
- `Wishlist` — name, listingIds[].
- `Booking` — listingId, dateRange, guests, priceBreakdown, status.
- `User` — name, avatar (mock session only).

Seeded with ~60–100 realistic records across categories and cities, Unsplash
photo URLs. **Auth is mocked** — a Zustand store + cookie simulates a logged-in
user; no real credentials are handled.

## 7. Data Flow & State

- **Server data:** TanStack Query → `api-client` → `/api/*` route handlers. React
  Server Components for initial SEO-critical pages where they help; client
  queries for interactive filtering and pagination.
- **Client UI state (Zustand):** search filter draft, wishlist optimistic
  toggles, mock-auth session, modal open/close state.
- **API envelope:** route handlers return `{ success, data, error, meta }` (meta
  carries pagination: total/page/limit). The `api-client` validates responses
  with Zod at the boundary and throws typed errors.
- **Error handling:** explicit at every layer — handlers return structured
  errors, the api-client surfaces them, React Query exposes loading/error states,
  and the UI renders skeleton loaders in the hairline/shadow language plus
  friendly empty/error states.

## 8. Responsive Behavior

Breakpoints per `DESIGN.md`:

- **Mobile (<744):** nav → logo + hamburger sheet; search → single tappable pill
  opening a full-screen overlay; property cards 1-up; city grid 1-col;
  reservation card → sticky bottom bar.
- **Tablet (744–1128):** product tabs visible, narrower search; cards 2-up; city
  grid 2–3 col; reservation card sticky right-rail (narrow).
- **Desktop (1128–1440):** full nav with 3 centered product tabs; full search
  pill; cards 4-up; city grid 6-col; listing detail 2-col with reservation rail.
- **Wide (>1440):** content caps at 1440 (listing/search) / 1280 (editorial).

Grids reduce column counts cleanly at each breakpoint — never reflow rows.
Touch targets: primary CTAs and search orb 48×48, date cells 40×40, heart 32×32
with 12px interior padding.

## 9. Testing

- **Unit/component:** Vitest + React Testing Library, AAA pattern, descriptive
  behavioral names, 80% coverage target. Cover design-system atoms, the
  repository/api-client contract, and Zustand stores.
- **E2E:** Playwright for critical flows — search → listing → select dates →
  reserve → booking confirmation; wishlist save/remove; vertical navigation.
- **Accessibility:** semantic landmarks, focus management in modals, 48px touch
  targets, color-contrast checks.

## 10. Build Phasing (drives the implementation plan)

1. Scaffold + Tailwind v4 token theme + atomic design-system components.
2. Header/nav + homepage + footer.
3. Listing detail + reservation flow (date picker, guest stepper).
4. Search results + Mapbox map + filters.
5. Experiences + Services verticals.
6. Mock auth + wishlists + trips + booking confirmation.
7. Host pages.
8. Responsive polish + Playwright E2E + accessibility pass.

## 11. Known Risks / Open Items

- **Mapbox token:** requires a free public token in env; markers styled in Rausch.
- **Cereal VF substitution:** Inter approximates but is not identical; display
  line-heights tuned ~2% tighter per the spec.
- **Backend transition (future phase):** repository interfaces and the API
  envelope are the contract; a future spec will cover the real backend.
