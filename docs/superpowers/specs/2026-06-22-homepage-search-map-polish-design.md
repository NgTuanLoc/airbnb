# Homepage Search, Map & Interaction Polish — Design

**Date:** 2026-06-22
**Status:** Approved (design)

## Problem

Three gaps on the live site:

1. **Search bar is non-functional.** The homepage search bar (`components/features/home-search-bar.tsx` → `components/design-system/search-bar.tsx`) renders Where/When/Who as static display text with no inputs, and always routes to `/s/anywhere` regardless of user intent.
2. **Map shows no real geography.** `components/features/search/listing-map.tsx` uses MapLibre's `demotiles.maplibre.org` style, which only renders country outlines — no streets or labels.
3. **Interaction polish missing.** `<button>` elements don't show a pointer cursor (modern CSS reset leaves them at `cursor: default`), and card images have no hover affordance.

## Decisions

- **Search bar:** full popover — Where + When + Who all interactive.
- **Map tiles:** CARTO free, no-key GL basemap (Voyager).
- **Polish scope:** site-wide (shared design-system components), so effects propagate to every page.

## Scope

### 1. Interactive search bar (full popover)

**Layering** keeps data/routing out of the tokenized atom:

- **`components/design-system/search-bar.tsx`** — refactored to a *controlled, presentational* atom. Renders the three segments as `<button>`s. New props:
  - `values: { where: string; when: string; who: string }` — display strings per segment.
  - `activeSegment: SearchSegment | null` where `type SearchSegment = "where" | "when" | "who"`.
  - `onSegmentClick: (segment: SearchSegment) => void`.
  - `onSearch: () => void`.
  - No state, no data, no routing. Active segment gets a token-based highlight (e.g. `bg-canvas` pill + `shadow-airbnb`).

- **`components/features/search-bar/home-search-bar.tsx`** — orchestrator, `"use client"`. Owns all state:
  - `activeSegment: SearchSegment | null`
  - `destination: string`
  - `checkIn: Date | null`, `checkOut: Date | null`
  - `guests: GuestCounts` (reuses `GuestStepper`'s `GuestCounts`)

  Renders the collapsed `SearchBar` atom plus, when a segment is active, a popover panel positioned below the bar. Handles outside-click and `Escape` to close (container ref + effect) behind a transparent full-screen backdrop. Builds the search URL and routes via `useRouter`.

- **Panel components** under `components/features/search-bar/` (each focused, independently testable):
  - **`destination-panel.tsx`** — controlled text input + a list of city suggestions filtered live by the typed text. Receives the suggestion list as a prop (`suggestions: City[]`) so the panel stays data-agnostic; `home-search-bar` supplies `cities` from `lib/data/cities`. Selecting a suggestion sets `destination` and advances focus to the next segment ("when").
  - **`date-panel.tsx`** — wraps the existing `BookingCalendar` (which uses `DatePickerDay`) for range selection. Manages the displayed month locally; check-in/out come from props.
  - **`guest-panel.tsx`** — wraps the existing `GuestStepper`. `maxGuests` is a sensible constant (16).

**Search action** — `home-search-bar` builds:

```
/s/<encodeURIComponent(destination) || "anywhere">?guests=<adults+children>&checkIn=<iso>&checkOut=<iso>
```

- `guests` is only appended when total > 0; it already filters on the results page.
- `checkIn`/`checkOut` are appended (ISO `yyyy-mm-dd`) only when set. They are forward-compatible params; the results page ignores dates today. The popover still captures and displays them in the "When" segment.

**Display strings** in the collapsed bar:
- Where → `destination || "Search destinations"`
- When → formatted range (e.g. `Jun 24 – Jun 28`) or `"Add dates"`
- Who → `"{n} guests"` or `"Add guests"`

**Effect:** popover animates in with a subtle fade + slight upward translate. Add a small `@keyframes` (e.g. `searchPopIn`) to `app/globals.css` and a utility class applied to the popover container. Use existing tokens for color/shadow/radius.

### 2. Map fix (CARTO basemap)

Single focused change in `components/features/search/listing-map.tsx`:

```ts
const MAP_STYLE = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";
```

CARTO's hosted GL style needs no API key. The `maplibre-gl.css` import (in `app/s/[location]/page.tsx`), markers, and `PriceMarker` code are unchanged. Update `listing-map.test.tsx`, which currently asserts the demotiles URL, to expect the new constant.

### 3. Pointer cursor (site-wide)

Add one base rule to `app/globals.css` rather than editing every component:

```css
button:not(:disabled),
[role="button"] {
  cursor: pointer;
}
```

`<a>` / `<Link>` already show a pointer. Disabled buttons retain existing `disabled:cursor-not-allowed` behavior.

### 4. Hover image-zoom (site-wide, no layout shift)

Each card's image already sits in an `overflow-hidden` fixed-size container. Make the link/container a `group` and add to the `<Image>`:

```
transition-transform duration-300 ease-out group-hover:scale-105
```

The image scales *inside* the clipped container; card dimensions never change. Applied to:

- `components/design-system/property-card.tsx`
- `components/design-system/experience-card.tsx`
- `components/design-system/service-card.tsx`
- `components/features/city-link-grid.tsx` (card image)

For each, ensure the element that receives `group-hover` ancestry is marked `group` and the image's wrapper has `overflow-hidden` (add where missing).

## Architecture / data flow

```
home-search-bar (state + routing)
├── SearchBar (atom, controlled: values/activeSegment/onSegmentClick/onSearch)
└── popover (when activeSegment)
    ├── destination-panel  ← cities (lib/data via prop)
    ├── date-panel         → BookingCalendar → DatePickerDay
    └── guest-panel        → GuestStepper

→ on search: router.push(/s/<dest>?guests&checkIn&checkOut)
```

No new data layer, repository, API, or hook is introduced. The map change is config-only. The polish changes are CSS/className-only.

## Error handling / edge cases

- Empty destination → route to `/s/anywhere`.
- Guests total 0 → omit `guests` param.
- Dates unset → omit date params; partial range (check-in only) → omit `checkOut`.
- Outside-click / `Escape` closes the popover without searching.
- Selecting a check-out before check-in resets the range start (delegated to existing `BookingCalendar` selection semantics).

## Testing (TDD)

**Unit / component (Vitest + RTL, imports from `@/lib/test-utils`):**
- `search-bar` atom: renders segment values; clicking a segment fires `onSegmentClick` with the right key; active segment carries highlight class; search button fires `onSearch`.
- `home-search-bar`: opening each panel; typing in destination filters suggestions; selecting a suggestion updates the Where display; guest stepper increments update the Who display; `Escape` and outside-click close the popover; clicking search routes to the correct URL (assert via mocked `useRouter().push`) for combinations: dest only, dest+guests, dest+guests+dates, empty→`/s/anywhere`.
- `destination-panel`, `date-panel`, `guest-panel`: focused behavior tests.
- Card components: assert the new `group-hover:scale-105` and `transition-transform` classes on the image and `overflow-hidden` on the container (class-assertion convention used across the project).

**Map:**
- `listing-map.test.tsx`: assert the new CARTO style URL.

**E2E (Playwright, `e2e/`):**
- Extend the search spec: open the bar, type a destination, increase guests, click search → URL is `/s/<dest>?guests=…`; assert the results page renders the map canvas.

## Non-goals

- No date-based filtering on the results page (params carried only).
- No backend / real data changes.
- No redesign of the search results page beyond the map style.
- No unrelated refactoring outside the components named above.
