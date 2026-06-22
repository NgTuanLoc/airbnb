# Design: Navigation Loading, Auth Pages & Sticky Search

**Date:** 2026-06-22
**Status:** Approved (design); pending implementation plan

## Overview

Three independent UX-polish features for the Airbnb clone:

1. **Loading states** — eliminate the visual glitch when navigating or filtering by showing instant, content-shaped loading UI.
2. **Login & Register pages** — UI-only mock auth forms consistent with the project's mock-data approach.
3. **Sticky shrink-to-pill search** — the homepage search bar sticks on scroll and morphs into a compact pill (the signature Airbnb interaction).

These ship and verify independently; the implementation plan phases them in the order above.

### Decisions locked during brainstorming

- **Auth scope:** UI only (mock). No backend, no persisted session, no localStorage.
- **Search effect:** Airbnb shrink-to-pill (full bar → compact pill on scroll, click to expand).
- **Loading style:** Skeleton screens (route-level `loading.tsx`), no top progress bar.
- **Search morph approach:** in-place morph below a normal `TopNav` (NOT merging the pill into the nav row).
- **E2E:** include a single Playwright happy-path test for the login flow.

---

## Feature 1 — Loading states (fix the glitch)

### Problem

- No `loading.tsx` exists anywhere under `app/`. Navigating to `/rooms/[id]`, `/s/[location]`, `/experiences`, `/services` leaves the old page frozen while server components fetch, then snaps to new content.
- On filtering inside `SearchResults` (and category change in `HomeListings`), the TanStack Query key changes with no `placeholderData`, so the grid blanks out and re-skeletons instead of transitioning smoothly.

### A. Route-level skeletons

Add `loading.tsx` segments:

- `app/s/[location]/loading.tsx` — filter-bar placeholder + property-grid skeleton + map-panel placeholder.
- `app/rooms/[id]/loading.tsx` — gallery block + overview/sidebar blocks.
- `app/experiences/loading.tsx` + `app/experiences/[id]/loading.tsx`.
- `app/services/loading.tsx` + `app/services/[id]/loading.tsx`.

To avoid duplicated markup:

- Extract a **`Skeleton` atom** into `components/design-system/skeleton.tsx`: an `animate-pulse` block with radius variants (`sm`/`md`/`full`/`xs`) and width/height via className. Export from the barrel `components/design-system/index.ts`.
- Refactor the inline `Skeleton` in `components/features/property-grid.tsx` to use the new atom (DRY). The existing `data-testid="property-skeleton"` contract is preserved.
- Each `loading.tsx` composes the atom (and a `PropertyGridSkeleton`-style cluster where a grid is shown).

### B. Filter-transition flicker

- Add `placeholderData: keepPreviousData` (from `@tanstack/react-query`) to `lib/hooks/use-listings.ts` and `lib/hooks/use-search-listings.ts`.
- In `HomeListings` and `SearchResults`, while a refetch is in flight with previous data present, apply a subtle dim to the grid: `opacity-60 transition-opacity` driven by `isPlaceholderData` (or `isFetching && !isLoading`). The previous results stay visible and just dim, instead of blanking.
- First-ever load (no cached/previous data) still renders the full skeleton via `isLoading`.

### Tests

- `Skeleton` atom: renders, applies radius/size variants, token class names.
- `property-grid` regression: still renders `property-skeleton` when `isLoading`.
- `use-listings` / `use-search-listings`: `keepPreviousData` keeps prior data during refetch (`isPlaceholderData` true).
- `HomeListings` / `SearchResults`: dim class applied while `isPlaceholderData`, skeleton on first load.

---

## Feature 2 — Login & Register pages (UI-only mock)

### Routes & components

- `app/login/page.tsx`, `app/register/page.tsx`.
- New DS component **`AuthCard`** (`components/design-system/auth-card.tsx`): centered card shell with logo, title, subtitle, and children slot. Reused by both pages. Exported from the barrel.
- Forms assembled from existing `TextInput` + `Button` atoms.

### Validation

- `lib/auth/schemas.ts` using **Zod v4**:
  - `loginSchema`: `email` (valid email), `password` (min 8 chars).
  - `registerSchema`: `name` (min 2 chars), `email` (valid email), `password` (min 8 chars), `confirmPassword` with a `.refine` ensuring `password === confirmPassword`.
  - Export inferred types (`LoginInput`, `RegisterInput`).
- Forms (`components/features/auth/login-form.tsx`, `register-form.tsx`):
  - Controlled inputs, validate on submit, per-field inline error messages.
  - Submit disabled while "submitting"; simulated async delay (mock), then `router.push("/")`.
  - Cross-links: login ↔ register ("Don't have an account? Sign up" / "Already have an account? Log in").

### TopNav entry point

- The `TopNav` account button (`components/design-system/top-nav.tsx`) becomes a link to `/login`. No dropdown (scope kept tight).

### Non-goals

- No real authentication, no session/token, no localStorage, no protected routes.

### Tests

- `AuthCard`: renders title/subtitle/children, token class names.
- `login-form`: invalid email shows error; valid submit triggers router push (mock).
- `register-form`: mismatched passwords show error; valid submit triggers push.
- `top-nav`: account control links to `/login`.
- Playwright E2E (`e2e/`): visit `/login`, fill valid credentials, submit, land on `/`.

---

## Feature 3 — Sticky shrink-to-pill search (homepage)

### Behavior

- The homepage search region becomes `sticky top-0 z-40`.
- A zero-height **sentinel `div`** above the search + an **IntersectionObserver** detect when the user has scrolled past the top (avoids scroll-event jank). State lives in a `useStickySearch` hook (`lib/hooks/use-sticky-search.ts`) returning `isCollapsed`.
- Two states with a CSS transition:
  - **Expanded** (at top): the current full `SearchBar`.
  - **Compact pill** (scrolled): a centered pill showing a summary string (`Anywhere · Any week · Add guests`) + search icon. Clicking the pill expands back / scrolls to top and re-opens the full bar.

### Implementation notes

- Add a `searchCollapse` keyframe/transition in `app/globals.css`, next to the existing `searchPopIn`. Use height/opacity/scale transitions for the morph.
- The morph happens **in place** below a normal `TopNav`. The pill is NOT merged into the nav row (heavier alternative explicitly out of scope).
- Homepage only (`app/page.tsx` search region / `HomeSearchBar`). The `/s/[location]` results page keeps its own `FilterBar` — out of scope.
- Preserve existing `HomeSearchBar` behavior (segment panels, outside-click/Escape close, `buildSearchUrl`).

### Tests

- `use-sticky-search`: toggles `isCollapsed` on observer intersection change.
- `HomeSearchBar` (or a new `StickySearch` wrapper): renders pill summary when collapsed, full bar when expanded; clicking pill restores the full bar.

---

## Cross-cutting conventions

- Match `DESIGN.md` tokens via `app/globals.css` (e.g. `bg-rausch`, `text-ink`, `rounded-md`, `shadow-airbnb`); tests assert token class names.
- Import `render`, `screen`, `userEvent` from `@/lib/test-utils`.
- Many small, focused files; immutable patterns; explicit prop types.
- 80% coverage target on new code.

## Implementation phasing

1. **Phase 1 — Loading:** `Skeleton` atom + `loading.tsx` segments + `keepPreviousData` dim.
2. **Phase 2 — Auth:** schemas → `AuthCard` → forms → pages → TopNav link → E2E.
3. **Phase 3 — Sticky search:** `useStickySearch` hook → pill UI → CSS morph → wire into homepage.
