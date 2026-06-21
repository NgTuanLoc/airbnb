# Phase 4 — Search Results, Map & Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/s/[location]` search-results page — a filterable results grid beside an interactive MapLibre map with Rausch price markers, all driven by URL query params behind the existing repository seam.

**Architecture:** Search is interactive, so it follows the homepage's CLIENT path: a `SearchResults` client island reads filters from the URL (`useSearchParams`), runs `useSearchListings` (TanStack Query → `/api/listings` route handler → `mockListingRepository`), and renders a results list + a dynamically-imported (`ssr: false`) MapLibre map. Filter state lives in the URL (shareable, no Zustand this phase). The map library (`maplibre-gl` + `react-map-gl/maplibre`, no access token, free demo tiles) is isolated to ONE component (`ListingMap`) that is mocked in every unit test — jsdom has no WebGL.

**Tech Stack:** Next.js 16 (App Router, React 19), TypeScript strict, Tailwind v4 token theme, TanStack Query v5, **MapLibre GL + react-map-gl/maplibre** (new), Vitest + RTL, Playwright. Reuses `PropertyCard`, `CategoryStrip`, `Button`, `TopNav` and the Phase 2 data seam.

## Global Constraints

- **Design tokens only** — use the Tailwind v4 token utilities in `app/globals.css` (colors `ink`/`body`/`muted`/`muted-soft`/`hairline`/`border-strong`/`canvas`/`surface-soft`/`surface-strong`/`rausch`/`rausch-active`/`on-primary`/`error`/`scrim`; radii `rounded-xs/sm/md/lg/full`; type classes `text-display-*`/`text-title-*`/`text-body-*`/`text-button-*`/`text-caption*`/`text-micro`; `shadow-airbnb`). NEVER raw hex or arbitrary Tailwind color values. Layout arbitrary values (`w-[62%]`, `max-w-[480px]`, `h-[calc(100vh-80px)]`) are allowed.
- **Map provider:** MapLibre GL via `react-map-gl/maplibre`. NO access token. Map style `https://demotiles.maplibre.org/style.json`. Markers are Rausch price pills per DESIGN.md §5/§11.
- **Repository is the only importer of `lib/data`.** New query params extend `ListingFilters` + `mockListingRepository.findAll`; the route handler, api-client, and hook carry them. The `Listing` type and `listingSchema` are unchanged this phase.
- **API envelope** `{ success, data?, error?, meta? }` via `ok`/`fail`; route handlers use Web `Request`/`Response`, never `next/server`.
- **Filter state is the URL.** `useSearchParams` is the source of truth; `router.push` writes it. Components below the island are presentational (props + callbacks); only `SearchResults` touches the router.
- **MapLibre is mocked in unit tests** (no WebGL in jsdom). `ListingMap` is dynamically imported `ssr: false` and `vi.mock`-ed wherever a unit test would otherwise load it.
- **TypeScript strict**, no `any` (use `unknown` + narrowing), explicit types on exports/props, immutable updates, no `console.log`.
- **TDD:** failing test first → watch it fail → minimal implementation → watch it pass → commit. AAA structure, behavioral names.

---

## File Structure

**Data layer**
- Modify `lib/repositories/listing-repository.ts` — extend `ListingFilters`.
- Modify `lib/repositories/mock/mock-listing-repository.ts` — apply all filters.
- Modify `lib/repositories/mock/mock-listing-repository.test.ts` — cover new filters.
- Create `lib/search/filters.ts` — `filtersFromSearch`, `listingQueryString`, `countActiveFilters`.
- Modify `app/api/listings/route.ts` — parse new query params.
- Modify `lib/api-client/listings.ts` — add `fetchSearchListings`.
- Create `lib/hooks/use-search-listings.ts` — `useSearchListings`.

**Components (`components/features/search/`)**
- Create `price-marker.tsx` — Rausch price pill.
- Create `listing-map.tsx` — MapLibre map (the only file importing the map lib).
- Create `search-results-list.tsx` — left-column results + count + loading/empty.
- Create `filter-panel.tsx` — modal: price range + room steppers.
- Create `filter-bar.tsx` — category strip + Filters button.
- Create `search-results.tsx` — the client island wiring URL ↔ data ↔ list+map+filters.

**Page & navigation**
- Create `app/s/[location]/page.tsx` — server shell (imports maplibre CSS, Suspense-wraps the island).
- Create `components/features/home-search-bar.tsx` — client wrapper routing the homepage search orb to `/s/anywhere`.
- Modify `app/page.tsx` — use `HomeSearchBar`.
- Modify `components/features/city-link-grid.tsx` — link each city to `/s/{name}`.

**E2E**
- Create `e2e/search.spec.ts`.

---

### Task 1: Extend ListingFilters + mock filtering

**Files:**
- Modify: `lib/repositories/listing-repository.ts`
- Modify: `lib/repositories/mock/mock-listing-repository.ts`
- Modify: `lib/repositories/mock/mock-listing-repository.test.ts`

**Interfaces:**
- Produces: extended `ListingFilters { location?: string; category?: string; minPrice?: number; maxPrice?: number; guests?: number; bedrooms?: number; beds?: number; baths?: number }`. `findAll` applies each filter when defined; `location` is a case-insensitive city match, skipped when empty or `"anywhere"`; `minPrice`/`maxPrice` bound `pricePerNight`; `guests`/`bedrooms`/`beds`/`baths` are `>=` thresholds on the listing's fields.

- [ ] **Step 1: Write the failing tests**

Append to `lib/repositories/mock/mock-listing-repository.test.ts` (keep existing tests; ensure `mockListingRepository` is imported at the top — it already is):

```ts
describe("mockListingRepository.findAll filters", () => {
  test("filters by city (case-insensitive), skipping 'anywhere'", async () => {
    const aspen = await mockListingRepository.findAll({ location: "aspen" });
    expect(aspen.length).toBeGreaterThan(0);
    expect(aspen.every((l) => l.location.city === "Aspen")).toBe(true);
    const all = await mockListingRepository.findAll({ location: "anywhere" });
    expect(all.length).toBe((await mockListingRepository.findAll()).length);
  });

  test("filters by price range", async () => {
    const result = await mockListingRepository.findAll({ minPrice: 200, maxPrice: 300 });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((l) => l.pricePerNight >= 200 && l.pricePerNight <= 300)).toBe(true);
  });

  test("filters by minimum guests and bedrooms", async () => {
    const result = await mockListingRepository.findAll({ guests: 4, bedrooms: 2 });
    expect(result.every((l) => l.maxGuests >= 4 && l.bedrooms >= 2)).toBe(true);
  });

  test("combines filters (city + category)", async () => {
    const result = await mockListingRepository.findAll({ location: "Aspen", category: "Cabins" });
    expect(result.every((l) => l.location.city === "Aspen" && l.category === "Cabins")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- mock-listing-repository`
Expected: FAIL — `findAll` ignores the new filter keys.

- [ ] **Step 3: Extend `ListingFilters`**

Replace `lib/repositories/listing-repository.ts`:

```ts
import type { Listing } from "@/lib/types";

export interface ListingFilters {
  location?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  guests?: number;
  bedrooms?: number;
  beds?: number;
  baths?: number;
}

export interface ListingRepository {
  findAll(filters?: ListingFilters): Promise<Listing[]>;
  findById(id: string): Promise<Listing | null>;
}
```

- [ ] **Step 4: Apply the filters in the mock**

Replace `lib/repositories/mock/mock-listing-repository.ts`:

```ts
import type { Listing } from "@/lib/types";
import { listings } from "@/lib/data/listings";
import type { ListingFilters, ListingRepository } from "../listing-repository";

export const mockListingRepository: ListingRepository = {
  async findAll(filters?: ListingFilters): Promise<Listing[]> {
    const f = filters ?? {};
    let result = listings;

    const { location, category, minPrice, maxPrice, guests, bedrooms, beds, baths } = f;

    if (location && location.toLowerCase() !== "anywhere") {
      const city = location.toLowerCase();
      result = result.filter((l) => l.location.city.toLowerCase() === city);
    }
    if (category && category !== "All") {
      result = result.filter((l) => l.category === category);
    }
    if (minPrice !== undefined) result = result.filter((l) => l.pricePerNight >= minPrice);
    if (maxPrice !== undefined) result = result.filter((l) => l.pricePerNight <= maxPrice);
    if (guests !== undefined) result = result.filter((l) => l.maxGuests >= guests);
    if (bedrooms !== undefined) result = result.filter((l) => l.bedrooms >= bedrooms);
    if (beds !== undefined) result = result.filter((l) => l.beds >= beds);
    if (baths !== undefined) result = result.filter((l) => l.baths >= baths);

    return result;
  },

  async findById(id: string): Promise<Listing | null> {
    return listings.find((l) => l.id === id) ?? null;
  },
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- mock-listing-repository`
Expected: PASS (existing category test + 4 new filter tests).

- [ ] **Step 6: Commit**

```bash
git add lib/repositories/listing-repository.ts lib/repositories/mock/mock-listing-repository.ts lib/repositories/mock/mock-listing-repository.test.ts
git commit -m "feat: extend listing filters with location, price, guests, and room specs"
```

---

### Task 2: Search filter URL helpers

**Files:**
- Create: `lib/search/filters.ts`
- Test: `lib/search/filters.test.ts`

**Interfaces:**
- Consumes: `ListingFilters` (Task 1).
- Produces: `filtersFromSearch(location: string, params: URLSearchParams): ListingFilters`; `listingQueryString(filters: ListingFilters): string` (leading `?`, omits empty / `"anywhere"` / `"All"`); `countActiveFilters(filters: ListingFilters): number` (counts the modal filters: minPrice, maxPrice, guests, bedrooms, beds, baths — NOT location or category).

- [ ] **Step 1: Write the failing test**

Create `lib/search/filters.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { filtersFromSearch, listingQueryString, countActiveFilters } from "./filters";

describe("filtersFromSearch", () => {
  test("reads the location and numeric params", () => {
    const params = new URLSearchParams("category=Cabins&minPrice=100&maxPrice=300&guests=4");
    const filters = filtersFromSearch("Aspen", params);
    expect(filters).toMatchObject({ location: "Aspen", category: "Cabins", minPrice: 100, maxPrice: 300, guests: 4 });
    expect(filters.bedrooms).toBeUndefined();
  });

  test("ignores non-numeric values", () => {
    const filters = filtersFromSearch("Aspen", new URLSearchParams("minPrice=abc"));
    expect(filters.minPrice).toBeUndefined();
  });
});

describe("listingQueryString", () => {
  test("builds a query string, omitting location 'anywhere' and category 'All'", () => {
    expect(listingQueryString({ location: "anywhere", category: "All", minPrice: 150 })).toBe("?minPrice=150");
  });

  test("includes location and category when meaningful", () => {
    const qs = listingQueryString({ location: "Aspen", category: "Cabins" });
    expect(qs).toContain("location=Aspen");
    expect(qs).toContain("category=Cabins");
  });

  test("returns an empty string when there are no filters", () => {
    expect(listingQueryString({})).toBe("");
  });
});

describe("countActiveFilters", () => {
  test("counts modal filters but not location or category", () => {
    expect(countActiveFilters({ location: "Aspen", category: "Cabins", minPrice: 100, guests: 2 })).toBe(2);
    expect(countActiveFilters({ location: "Aspen", category: "Cabins" })).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- search/filters`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the helpers**

Create `lib/search/filters.ts`:

```ts
import type { ListingFilters } from "@/lib/repositories/listing-repository";

function num(value: string | null): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function filtersFromSearch(location: string, params: URLSearchParams): ListingFilters {
  return {
    location,
    category: params.get("category") ?? undefined,
    minPrice: num(params.get("minPrice")),
    maxPrice: num(params.get("maxPrice")),
    guests: num(params.get("guests")),
    bedrooms: num(params.get("bedrooms")),
    beds: num(params.get("beds")),
    baths: num(params.get("baths")),
  };
}

export function listingQueryString(filters: ListingFilters): string {
  const params = new URLSearchParams();
  const { location, category, minPrice, maxPrice, guests, bedrooms, beds, baths } = filters;

  if (location && location.toLowerCase() !== "anywhere") params.set("location", location);
  if (category && category !== "All") params.set("category", category);
  if (minPrice !== undefined) params.set("minPrice", String(minPrice));
  if (maxPrice !== undefined) params.set("maxPrice", String(maxPrice));
  if (guests !== undefined) params.set("guests", String(guests));
  if (bedrooms !== undefined) params.set("bedrooms", String(bedrooms));
  if (beds !== undefined) params.set("beds", String(beds));
  if (baths !== undefined) params.set("baths", String(baths));

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function countActiveFilters(filters: ListingFilters): number {
  const { minPrice, maxPrice, guests, bedrooms, beds, baths } = filters;
  return [minPrice, maxPrice, guests, bedrooms, beds, baths].filter((v) => v !== undefined).length;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- search/filters`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/search/filters.ts lib/search/filters.test.ts
git commit -m "feat: add search filter URL helpers"
```

---

### Task 3: Route params + search api-client + hook

**Files:**
- Modify: `app/api/listings/route.ts`
- Modify: `app/api/listings/route.test.ts`
- Modify: `lib/api-client/listings.ts`
- Create: `lib/hooks/use-search-listings.ts`
- Test: `lib/hooks/use-search-listings.test.tsx`

**Interfaces:**
- Consumes: `mockListingRepository.findAll` (Task 1), `listingQueryString` (Task 2), `listingsEnvelopeSchema`.
- Produces: `/api/listings` now honors `location`/`minPrice`/`maxPrice`/`guests`/`bedrooms`/`beds`/`baths`; `fetchSearchListings(filters: ListingFilters): Promise<Listing[]>`; `useSearchListings(filters: ListingFilters): UseQueryResult<Listing[]>` with `queryKey: ["search-listings", filters]`.

- [ ] **Step 1: Write the failing tests**

Append to `app/api/listings/route.test.ts`:

```ts
describe("GET /api/listings search params", () => {
  test("filters by price range", async () => {
    const res = await GET(new Request("http://localhost/api/listings?minPrice=200&maxPrice=300"));
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.every((l: { pricePerNight: number }) => l.pricePerNight >= 200 && l.pricePerNight <= 300)).toBe(true);
  });

  test("filters by location", async () => {
    const res = await GET(new Request("http://localhost/api/listings?location=Aspen"));
    const body = await res.json();
    expect(body.data.every((l: { location: { city: string } }) => l.location.city === "Aspen")).toBe(true);
  });
});
```

Create `lib/hooks/use-search-listings.test.tsx`:

```tsx
import { describe, expect, test } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSearchListings } from "./use-search-listings";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useSearchListings", () => {
  test("fetches listings for the given filters", async () => {
    const listings = [{ id: "l1", pricePerNight: 220 }];
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ success: true, data: listings }), { headers: { "content-type": "application/json" } })) as typeof fetch;
    try {
      const { result } = renderHook(() => useSearchListings({ location: "Aspen", minPrice: 200 }), { wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.[0]?.id).toBe("l1");
    } finally {
      globalThis.fetch = original;
    }
  });
});
```

(Note: the stubbed listing object is intentionally partial; `listingsEnvelopeSchema` strips unknown keys and validates the present ones — `id` and `pricePerNight` satisfy the parsed assertion. If the schema rejects the partial object, expand the stub to a full `Listing`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- route use-search-listings`
Expected: FAIL — route ignores new params; hook + api-client do not exist.

- [ ] **Step 3: Parse the new params in the route**

Replace `app/api/listings/route.ts`:

```ts
import { mockListingRepository } from "@/lib/repositories/mock/mock-listing-repository";
import { ok } from "@/lib/api/envelope";

function num(value: string | null): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const data = await mockListingRepository.findAll({
    location: searchParams.get("location") ?? undefined,
    category: searchParams.get("category") ?? undefined,
    minPrice: num(searchParams.get("minPrice")),
    maxPrice: num(searchParams.get("maxPrice")),
    guests: num(searchParams.get("guests")),
    bedrooms: num(searchParams.get("bedrooms")),
    beds: num(searchParams.get("beds")),
    baths: num(searchParams.get("baths")),
  });
  return Response.json(ok(data, { total: data.length, page: 1, limit: data.length }));
}
```

- [ ] **Step 4: Add `fetchSearchListings`**

Append to `lib/api-client/listings.ts` (keep `fetchListings`):

```ts
import type { ListingFilters } from "@/lib/repositories/listing-repository";
import { listingQueryString } from "@/lib/search/filters";

export async function fetchSearchListings(filters: ListingFilters): Promise<Listing[]> {
  const res = await fetch(`/api/listings${listingQueryString(filters)}`);
  const json: unknown = await res.json();
  const envelope = listingsEnvelopeSchema.parse(json);
  if (!envelope.success) {
    throw new Error(envelope.error ?? "Failed to load listings");
  }
  return envelope.data ?? [];
}
```

(The file already imports `Listing` and `listingsEnvelopeSchema`. Add only the two new imports if not already present.)

- [ ] **Step 5: Add the hook**

Create `lib/hooks/use-search-listings.ts`:

```ts
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { fetchSearchListings } from "@/lib/api-client/listings";
import type { Listing } from "@/lib/types";
import type { ListingFilters } from "@/lib/repositories/listing-repository";

export function useSearchListings(filters: ListingFilters): UseQueryResult<Listing[]> {
  return useQuery({
    queryKey: ["search-listings", filters],
    queryFn: () => fetchSearchListings(filters),
  });
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- route use-search-listings`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/api/listings/route.ts app/api/listings/route.test.ts lib/api-client/listings.ts lib/hooks/use-search-listings.ts lib/hooks/use-search-listings.test.tsx
git commit -m "feat: wire search filters through route, api-client, and hook"
```

---

### Task 4: PriceMarker component

**Files:**
- Create: `components/features/search/price-marker.tsx`
- Test: `components/features/search/price-marker.test.tsx`

**Interfaces:**
- Produces: `PriceMarker({ price, selected, onClick }: { price: number; selected?: boolean; onClick?: () => void })` — a Rausch pill showing `$price`, flipping to ink when `selected`.

- [ ] **Step 1: Write the failing test**

Create `components/features/search/price-marker.test.tsx`:

```tsx
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PriceMarker } from "./price-marker";

describe("PriceMarker", () => {
  test("renders the price and fires onClick", async () => {
    const onClick = vi.fn();
    render(<PriceMarker price={220} onClick={onClick} />);
    const button = screen.getByRole("button", { name: /\$220/ });
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("applies the selected style class when selected", () => {
    render(<PriceMarker price={220} selected />);
    expect(screen.getByRole("button", { name: /\$220/ }).className).toContain("bg-ink");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- price-marker`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the marker**

Create `components/features/search/price-marker.tsx`:

```tsx
import { cn } from "@/lib/utils";

export interface PriceMarkerProps {
  price: number;
  selected?: boolean;
  onClick?: () => void;
}

export function PriceMarker({ price, selected, onClick }: PriceMarkerProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-1 text-micro shadow-airbnb transition-colors",
        selected
          ? "bg-ink text-on-primary"
          : "bg-rausch text-on-primary hover:bg-rausch-active",
      )}
    >
      ${price}
    </button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- price-marker`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/features/search/price-marker.tsx components/features/search/price-marker.test.tsx
git commit -m "feat: add PriceMarker map pill"
```

---

### Task 5: ListingMap (MapLibre)

**Files:**
- Modify: `package.json` (install deps)
- Create: `components/features/search/listing-map.tsx`
- Test: `components/features/search/listing-map.test.tsx`

**Interfaces:**
- Consumes: `PriceMarker` (Task 4), `Listing`.
- Produces: `ListingMap({ listings, selectedId, onSelect }: { listings: Listing[]; selectedId?: string | null; onSelect?: (id: string) => void })` — a MapLibre map rendering one `Marker` + `PriceMarker` per listing.

- [ ] **Step 1: Install the map libraries**

Run: `npm install maplibre-gl react-map-gl`
Expected: both added to `dependencies`. (No access token, no env var.)

- [ ] **Step 2: Write the failing test**

Create `components/features/search/listing-map.test.tsx` (the test mocks the map library so no WebGL is needed):

```tsx
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("react-map-gl/maplibre", () => ({
  default: ({ children }: { children?: ReactNode }) => <div data-testid="map">{children}</div>,
  Marker: ({ children }: { children?: ReactNode }) => <div data-testid="marker">{children}</div>,
}));

import { ListingMap } from "./listing-map";
import type { Listing } from "@/lib/types";

function make(id: string, price: number, lng: number, lat: number): Listing {
  return {
    id, title: `Listing ${id}`,
    location: { city: "Aspen", country: "USA", lat, lng },
    photos: ["/a.jpg"], pricePerNight: price, rating: 4.9, reviewCount: 10,
    isGuestFavorite: false, hostId: "h1", category: "Cabins",
    description: "x", propertyType: "Entire cabin", maxGuests: 4, bedrooms: 2, beds: 2, baths: 1, amenities: ["Wifi"],
  };
}

describe("ListingMap", () => {
  test("renders a price marker for each listing", () => {
    render(<ListingMap listings={[make("l1", 220, -106.8, 39.1), make("l2", 540, -118.6, 34.0)]} />);
    expect(screen.getAllByTestId("marker")).toHaveLength(2);
    expect(screen.getByText("$220")).toBeInTheDocument();
    expect(screen.getByText("$540")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- listing-map`
Expected: FAIL — module does not exist.

- [ ] **Step 4: Implement the map**

Create `components/features/search/listing-map.tsx` (do NOT import the maplibre CSS here — it is imported once in the page, Task 10):

```tsx
"use client";

import Map, { Marker } from "react-map-gl/maplibre";
import type { Listing } from "@/lib/types";
import { PriceMarker } from "./price-marker";

const MAP_STYLE = "https://demotiles.maplibre.org/style.json";

export interface ListingMapProps {
  listings: Listing[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}

function initialView(listings: Listing[]) {
  const first = listings[0];
  return {
    longitude: first ? first.location.lng : -98.5,
    latitude: first ? first.location.lat : 39.8,
    zoom: first ? 9 : 3,
  };
}

export function ListingMap({ listings, selectedId, onSelect }: ListingMapProps) {
  return (
    <Map initialViewState={initialView(listings)} mapStyle={MAP_STYLE} style={{ width: "100%", height: "100%" }}>
      {listings.map((listing) => (
        <Marker key={listing.id} longitude={listing.location.lng} latitude={listing.location.lat} anchor="bottom">
          <PriceMarker
            price={listing.pricePerNight}
            selected={listing.id === selectedId}
            onClick={() => onSelect?.(listing.id)}
          />
        </Marker>
      ))}
    </Map>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- listing-map`
Expected: PASS. (If the import `react-map-gl/maplibre` cannot be resolved, confirm `react-map-gl` installed in Step 1 and that the version exposes the `/maplibre` entrypoint — both v7.1+ and v8 do. The `vi.mock` intercepts it in tests regardless.)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json components/features/search/listing-map.tsx components/features/search/listing-map.test.tsx
git commit -m "feat: add MapLibre ListingMap with Rausch price markers"
```

---

### Task 6: SearchResultsList

**Files:**
- Create: `components/features/search/search-results-list.tsx`
- Test: `components/features/search/search-results-list.test.tsx`

**Interfaces:**
- Consumes: `PropertyCard` from `@/components/design-system`, `Listing`.
- Produces: `SearchResultsList({ listings, isLoading, location }: { listings: Listing[]; isLoading?: boolean; location: string })` — a count heading + a 1–2 col card grid, with skeletons while loading and an empty state.

- [ ] **Step 1: Write the failing test**

Create `components/features/search/search-results-list.test.tsx`:

```tsx
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { SearchResultsList } from "./search-results-list";
import type { Listing } from "@/lib/types";

function make(id: string): Listing {
  return {
    id, title: `Listing ${id}`,
    location: { city: "Aspen", country: "USA", lat: 39.1, lng: -106.8 },
    photos: ["/a.jpg"], pricePerNight: 220, rating: 4.9, reviewCount: 10,
    isGuestFavorite: false, hostId: "h1", category: "Cabins",
    description: "x", propertyType: "Entire cabin", maxGuests: 4, bedrooms: 2, beds: 2, baths: 1, amenities: ["Wifi"],
  };
}

describe("SearchResultsList", () => {
  test("shows a count heading and one card per listing", () => {
    render(<SearchResultsList listings={[make("l1"), make("l2")]} location="Aspen" />);
    expect(screen.getByRole("heading", { name: /2 stays in aspen/i })).toBeInTheDocument();
    expect(screen.getByText("Listing l1")).toBeInTheDocument();
  });

  test("renders skeletons while loading", () => {
    render(<SearchResultsList listings={[]} isLoading location="Aspen" />);
    expect(screen.getAllByTestId("result-skeleton").length).toBeGreaterThan(0);
  });

  test("renders an empty state when there are no results", () => {
    render(<SearchResultsList listings={[]} location="Aspen" />);
    expect(screen.getByText(/no stays found/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- search-results-list`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the list**

Create `components/features/search/search-results-list.tsx`:

```tsx
import { PropertyCard } from "@/components/design-system";
import type { Listing } from "@/lib/types";

export interface SearchResultsListProps {
  listings: Listing[];
  isLoading?: boolean;
  location: string;
}

const gridClass = "grid grid-cols-1 gap-6 sm:grid-cols-2";

function placeLabel(location: string): string {
  return location && location.toLowerCase() !== "anywhere" ? location : "your search";
}

function Skeleton() {
  return (
    <div data-testid="result-skeleton" className="flex flex-col gap-2">
      <div className="aspect-square w-full animate-pulse rounded-md bg-surface-strong" />
      <div className="h-4 w-3/4 animate-pulse rounded-xs bg-surface-strong" />
    </div>
  );
}

export function SearchResultsList({ listings, isLoading, location }: SearchResultsListProps) {
  const place = placeLabel(location);

  if (isLoading) {
    return (
      <div className={gridClass}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} />
        ))}
      </div>
    );
  }

  if (listings.length === 0) {
    return <p className="text-body-md text-muted">No stays found for {place}. Try adjusting your filters.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-title-md text-ink">
        {listings.length} stays in {place}
      </h1>
      <div className={gridClass}>
        {listings.map((listing) => (
          <PropertyCard key={listing.id} listing={listing} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- search-results-list`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/features/search/search-results-list.tsx components/features/search/search-results-list.test.tsx
git commit -m "feat: add SearchResultsList"
```

---

### Task 7: FilterPanel modal

**Files:**
- Create: `components/features/search/filter-panel.tsx`
- Test: `components/features/search/filter-panel.test.tsx`

**Interfaces:**
- Consumes: `Button` from `@/components/design-system`.
- Produces: `FilterValues = { minPrice?: number; maxPrice?: number; guests?: number; bedrooms?: number; beds?: number; baths?: number }`; `FilterPanel({ initial, onApply, onClose }: { initial: FilterValues; onApply: (values: FilterValues) => void; onClose: () => void })`. The panel is rendered ONLY when open (the parent conditionally mounts it, so the draft initialises fresh each open). Price min/max number inputs; guests/bedrooms/beds/baths steppers showing "Any" at 0 and `n+` above; "Clear all" resets the draft to `{}`; "Show results" calls `onApply(draft)`.

- [ ] **Step 1: Write the failing test**

Create `components/features/search/filter-panel.test.tsx`:

```tsx
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilterPanel } from "./filter-panel";

describe("FilterPanel", () => {
  test("applies the entered price and stepped guests", async () => {
    const onApply = vi.fn();
    render(<FilterPanel initial={{}} onApply={onApply} onClose={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/minimum price/i), "150");
    await userEvent.click(screen.getByRole("button", { name: /increase guests/i }));
    await userEvent.click(screen.getByRole("button", { name: /show results/i }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ minPrice: 150, guests: 1 }));
  });

  test("clear all resets the draft", async () => {
    const onApply = vi.fn();
    render(<FilterPanel initial={{ minPrice: 200, guests: 3 }} onApply={onApply} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /clear all/i }));
    await userEvent.click(screen.getByRole("button", { name: /show results/i }));
    expect(onApply).toHaveBeenCalledWith({});
  });

  test("closes when the backdrop is clicked", async () => {
    const onClose = vi.fn();
    render(<FilterPanel initial={{}} onApply={vi.fn()} onClose={onClose} />);
    await userEvent.click(screen.getByTestId("filter-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- filter-panel`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the panel**

Create `components/features/search/filter-panel.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/design-system";

export interface FilterValues {
  minPrice?: number;
  maxPrice?: number;
  guests?: number;
  bedrooms?: number;
  beds?: number;
  baths?: number;
}

export interface FilterPanelProps {
  initial: FilterValues;
  onApply: (values: FilterValues) => void;
  onClose: () => void;
}

const ROOM_FIELDS: { key: "guests" | "bedrooms" | "beds" | "baths"; label: string }[] = [
  { key: "guests", label: "Guests" },
  { key: "bedrooms", label: "Bedrooms" },
  { key: "beds", label: "Beds" },
  { key: "baths", label: "Bathrooms" },
];

function toNumberOrUndefined(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

const stepButton =
  "flex h-8 w-8 items-center justify-center rounded-full border border-border-strong text-ink disabled:cursor-not-allowed disabled:opacity-40";

export function FilterPanel({ initial, onApply, onClose }: FilterPanelProps) {
  const [draft, setDraft] = useState<FilterValues>(initial);

  function setField(key: keyof FilterValues, value: number | undefined) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div data-testid="filter-backdrop" className="absolute inset-0 bg-scrim/50" aria-hidden onClick={onClose} />
      <div role="dialog" aria-label="Filters" className="relative z-10 w-full max-w-[480px] rounded-lg bg-canvas p-6 shadow-airbnb">
        <h2 className="mb-4 text-display-sm text-ink">Filters</h2>

        <section className="border-b border-hairline pb-4">
          <h3 className="mb-2 text-title-sm text-ink">Price range</h3>
          <div className="flex items-center gap-3">
            <label className="flex flex-1 flex-col text-caption text-muted">
              Min
              <input
                type="number"
                inputMode="numeric"
                aria-label="Minimum price"
                value={draft.minPrice ?? ""}
                onChange={(e) => setField("minPrice", toNumberOrUndefined(e.target.value))}
                className="h-12 rounded-sm border border-hairline px-3 text-body-md text-ink"
              />
            </label>
            <label className="flex flex-1 flex-col text-caption text-muted">
              Max
              <input
                type="number"
                inputMode="numeric"
                aria-label="Maximum price"
                value={draft.maxPrice ?? ""}
                onChange={(e) => setField("maxPrice", toNumberOrUndefined(e.target.value))}
                className="h-12 rounded-sm border border-hairline px-3 text-body-md text-ink"
              />
            </label>
          </div>
        </section>

        {ROOM_FIELDS.map(({ key, label }) => {
          const value = draft[key] ?? 0;
          return (
            <div key={key} className="flex items-center justify-between border-b border-hairline py-3">
              <span className="text-body-md text-ink">{label}</span>
              <span className="flex items-center gap-4">
                <button
                  type="button"
                  aria-label={`Decrease ${label.toLowerCase()}`}
                  disabled={value <= 0}
                  onClick={() => setField(key, value <= 1 ? undefined : value - 1)}
                  className={stepButton}
                >
                  −
                </button>
                <span className="w-12 text-center text-body-md text-ink">{value === 0 ? "Any" : `${value}+`}</span>
                <button
                  type="button"
                  aria-label={`Increase ${label.toLowerCase()}`}
                  onClick={() => setField(key, value + 1)}
                  className={stepButton}
                >
                  +
                </button>
              </span>
            </div>
          );
        })}

        <div className="mt-6 flex items-center justify-between">
          <button type="button" onClick={() => setDraft({})} className="text-button-md text-ink underline">
            Clear all
          </button>
          <Button onClick={() => onApply(draft)}>Show results</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- filter-panel`
Expected: PASS. (Typing "150" into the min-price input sets `minPrice: 150`; one increase on Guests sets `guests: 1`.)

- [ ] **Step 5: Commit**

```bash
git add components/features/search/filter-panel.tsx components/features/search/filter-panel.test.tsx
git commit -m "feat: add FilterPanel modal"
```

---

### Task 8: FilterBar

**Files:**
- Create: `components/features/search/filter-bar.tsx`
- Test: `components/features/search/filter-bar.test.tsx`

**Interfaces:**
- Consumes: `CategoryStrip` from `../category-strip`.
- Produces: `FilterBar({ categories, activeCategory, onCategoryChange, activeFilterCount, onOpenFilters }: { categories: readonly string[]; activeCategory: string; onCategoryChange: (c: string) => void; activeFilterCount: number; onOpenFilters: () => void })` — the category strip + a "Filters" button (showing `· N` when `activeFilterCount > 0`).

- [ ] **Step 1: Write the failing test**

Create `components/features/search/filter-bar.test.tsx`:

```tsx
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilterBar } from "./filter-bar";

const categories = ["All", "Cabins", "Beachfront"] as const;

describe("FilterBar", () => {
  test("selecting a category calls onCategoryChange", async () => {
    const onCategoryChange = vi.fn();
    render(<FilterBar categories={categories} activeCategory="All" onCategoryChange={onCategoryChange} activeFilterCount={0} onOpenFilters={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Cabins" }));
    expect(onCategoryChange).toHaveBeenCalledWith("Cabins");
  });

  test("the filters button shows the active count and opens the panel", async () => {
    const onOpenFilters = vi.fn();
    render(<FilterBar categories={categories} activeCategory="All" onCategoryChange={vi.fn()} activeFilterCount={2} onOpenFilters={onOpenFilters} />);
    const button = screen.getByRole("button", { name: /filters/i });
    expect(button).toHaveTextContent("2");
    await userEvent.click(button);
    expect(onOpenFilters).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- filter-bar`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the bar**

Create `components/features/search/filter-bar.tsx`:

```tsx
"use client";

import { CategoryStrip } from "../category-strip";

export interface FilterBarProps {
  categories: readonly string[];
  activeCategory: string;
  onCategoryChange: (category: string) => void;
  activeFilterCount: number;
  onOpenFilters: () => void;
}

export function FilterBar({
  categories,
  activeCategory,
  onCategoryChange,
  activeFilterCount,
  onOpenFilters,
}: FilterBarProps) {
  return (
    <div className="flex items-center gap-4 border-b border-hairline px-6">
      <div className="min-w-0 flex-1">
        <CategoryStrip categories={categories} active={activeCategory} onSelect={onCategoryChange} />
      </div>
      <button
        type="button"
        onClick={onOpenFilters}
        className="flex shrink-0 items-center gap-2 rounded-sm border border-hairline px-4 py-2 text-button-sm text-ink hover:border-ink"
      >
        Filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- filter-bar`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/features/search/filter-bar.tsx components/features/search/filter-bar.test.tsx
git commit -m "feat: add search FilterBar"
```

---

### Task 9: SearchResults island

**Files:**
- Create: `components/features/search/search-results.tsx`
- Test: `components/features/search/search-results.test.tsx`

**Interfaces:**
- Consumes: `useSearchListings` (Task 3), `filtersFromSearch`/`countActiveFilters` (Task 2), `FilterBar` (Task 8), `FilterPanel` + `FilterValues` (Task 7), `SearchResultsList` (Task 6), `ListingMap` (Task 5, dynamically imported `ssr: false`), `CATEGORIES`, `next/navigation`.
- Produces: `SearchResults({ location }: { location: string })` — the client island. Derives `ListingFilters` from `location` + `useSearchParams`, runs `useSearchListings`, writes the URL on category change and filter apply, manages map selection + panel open state.

- [ ] **Step 1: Write the failing test**

Create `components/features/search/search-results.test.tsx`:

```tsx
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/s/Aspen",
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("./listing-map", () => ({
  ListingMap: () => <div data-testid="listing-map" />,
}));

const useSearchListings = vi.fn();
vi.mock("@/lib/hooks/use-search-listings", () => ({
  useSearchListings: (filters: unknown) => useSearchListings(filters),
}));

import { SearchResults } from "./search-results";
import type { Listing } from "@/lib/types";

function make(id: string): Listing {
  return {
    id, title: `Listing ${id}`,
    location: { city: "Aspen", country: "USA", lat: 39.1, lng: -106.8 },
    photos: ["/a.jpg"], pricePerNight: 220, rating: 4.9, reviewCount: 10,
    isGuestFavorite: false, hostId: "h1", category: "Cabins",
    description: "x", propertyType: "Entire cabin", maxGuests: 4, bedrooms: 2, beds: 2, baths: 1, amenities: ["Wifi"],
  };
}

describe("SearchResults", () => {
  test("renders the results list and map for the location", () => {
    useSearchListings.mockReturnValue({ data: [make("l1")], isLoading: false, isError: false });
    render(<SearchResults location="Aspen" />);
    expect(screen.getByRole("heading", { name: /1 stays in aspen/i })).toBeInTheDocument();
    expect(screen.getByTestId("listing-map")).toBeInTheDocument();
  });

  test("selecting a category pushes the category to the URL", async () => {
    useSearchListings.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<SearchResults location="Aspen" />);
    await userEvent.click(screen.getByRole("button", { name: "Cabins" }));
    expect(push).toHaveBeenCalledWith(expect.stringContaining("category=Cabins"));
  });

  test("shows an error state when the query fails", () => {
    useSearchListings.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<SearchResults location="Aspen" />);
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- search-results.test`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the island**

Create `components/features/search/search-results.tsx`:

```tsx
"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { CATEGORIES } from "@/lib/types";
import { useSearchListings } from "@/lib/hooks/use-search-listings";
import { filtersFromSearch, countActiveFilters } from "@/lib/search/filters";
import { FilterBar } from "./filter-bar";
import { FilterPanel, type FilterValues } from "./filter-panel";
import { SearchResultsList } from "./search-results-list";

const ListingMap = dynamic(() => import("./listing-map").then((m) => m.ListingMap), { ssr: false });

const MODAL_KEYS = ["minPrice", "maxPrice", "guests", "bedrooms", "beds", "baths"] as const;

export interface SearchResultsProps {
  location: string;
}

export function SearchResults({ location }: SearchResultsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filters = filtersFromSearch(location, new URLSearchParams(searchParams.toString()));
  const { data, isLoading, isError } = useSearchListings(filters);
  const listings = data ?? [];

  function pushParams(mutate: (params: URLSearchParams) => void) {
    const next = new URLSearchParams(searchParams.toString());
    mutate(next);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function handleCategory(category: string) {
    pushParams((params) => {
      if (!category || category === "All") params.delete("category");
      else params.set("category", category);
    });
  }

  function handleApply(values: FilterValues) {
    pushParams((params) => {
      for (const key of MODAL_KEYS) {
        const value = values[key];
        if (value === undefined) params.delete(key);
        else params.set(key, String(value));
      }
    });
    setPanelOpen(false);
  }

  return (
    <div className="flex flex-1 flex-col">
      <FilterBar
        categories={CATEGORIES}
        activeCategory={filters.category ?? "All"}
        onCategoryChange={handleCategory}
        activeFilterCount={countActiveFilters(filters)}
        onOpenFilters={() => setPanelOpen(true)}
      />

      <div className="flex flex-1">
        <div className="w-full px-6 py-6 lg:w-[62%]">
          {isError ? (
            <p className="text-body-md text-error">Something went wrong loading stays. Please try again.</p>
          ) : (
            <SearchResultsList listings={listings} isLoading={isLoading} location={location} />
          )}
        </div>
        <div
          data-testid="map-panel"
          className="hidden lg:sticky lg:top-20 lg:block lg:h-[calc(100vh-5rem)] lg:w-[38%]"
        >
          <ListingMap listings={listings} selectedId={selectedId} onSelect={setSelectedId} />
        </div>
      </div>

      {panelOpen && (
        <FilterPanel
          initial={{
            minPrice: filters.minPrice,
            maxPrice: filters.maxPrice,
            guests: filters.guests,
            bedrooms: filters.bedrooms,
            beds: filters.beds,
            baths: filters.baths,
          }}
          onApply={handleApply}
          onClose={() => setPanelOpen(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- search-results.test`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add components/features/search/search-results.tsx components/features/search/search-results.test.tsx
git commit -m "feat: add SearchResults island wiring URL, data, list, and map"
```

---

### Task 10: Search page

**Files:**
- Create: `app/s/[location]/page.tsx`
- Test: `app/s/[location]/page.test.tsx`

**Interfaces:**
- Consumes: `TopNav` from `@/components/design-system`, `SearchResults` (Task 9). Imports the maplibre CSS once here.
- Produces: default-exported async `SearchPage({ params }: { params: Promise<{ location: string }> })` — server shell that decodes `location`, renders `TopNav` + a Suspense-wrapped `SearchResults`.

- [ ] **Step 1: Write the failing test**

Create `app/s/[location]/page.test.tsx` (mock `SearchResults` so the test does not pull in the map/query stack):

```tsx
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/features/search/search-results", () => ({
  SearchResults: ({ location }: { location: string }) => <div data-testid="search-results">{location}</div>,
}));

import SearchPage from "./page";

describe("SearchPage", () => {
  test("decodes the location param and renders the results island", async () => {
    const ui = await SearchPage({ params: Promise.resolve({ location: "San%20Diego" }) });
    render(ui);
    expect(screen.getByTestId("search-results")).toHaveTextContent("San Diego");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- "s/\[location\]/page"`
Expected: FAIL — page does not exist. (If the glob is awkward on your shell, run `npm test -- page.test` and read the `app/s/[location]` result.)

- [ ] **Step 3: Implement the page**

Create `app/s/[location]/page.tsx`:

```tsx
import "maplibre-gl/dist/maplibre-gl.css";
import { Suspense } from "react";
import { TopNav } from "@/components/design-system";
import { SearchResults } from "@/components/features/search/search-results";

export default async function SearchPage({ params }: { params: Promise<{ location: string }> }) {
  const { location } = await params;
  const decoded = decodeURIComponent(location);

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav active="homes" />
      <Suspense fallback={<div className="px-6 py-8 text-body-md text-muted">Loading stays…</div>}>
        <SearchResults location={decoded} />
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- page.test`
Expected: PASS (the new search page test plus the existing `app/rooms/[id]` page test both pass).

- [ ] **Step 5: Commit**

```bash
git add "app/s/[location]/page.tsx" "app/s/[location]/page.test.tsx"
git commit -m "feat: add /s/[location] search page"
```

---

### Task 11: Navigation wiring + E2E

**Files:**
- Create: `components/features/home-search-bar.tsx`
- Modify: `app/page.tsx`
- Modify: `components/features/city-link-grid.tsx`
- Modify: `components/features/city-link-grid.test.tsx`
- Create: `e2e/search.spec.ts`

**Interfaces:**
- Consumes: the `/s/[location]` route (Task 10), the existing `SearchBar` design-system atom, `City`.
- Produces: `HomeSearchBar` (client) routing the search orb to `/s/anywhere`; each city card in `CityLinkGrid` linking to `/s/{name}`.

- [ ] **Step 1: Add a failing link assertion to the city-link-grid test**

Append to `components/features/city-link-grid.test.tsx` (read the file first to reuse its imports and the existing `cities` fixture shape):

```tsx
test("links each city to its search page", () => {
  const cities = [
    { id: "aspen", name: "Aspen", subLabel: "Cabin rentals", image: "/a.jpg", listingCount: 87 },
  ];
  render(<CityLinkGrid cities={cities} />);
  expect(screen.getByRole("link", { name: /aspen/i })).toHaveAttribute("href", "/s/Aspen");
});
```

(If `CityLinkGrid`/`render`/`screen` are not yet imported in the file, add the imports to match the existing test style.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- city-link-grid`
Expected: FAIL — cards are not links.

- [ ] **Step 3: Link the city cards**

Replace `components/features/city-link-grid.tsx`:

```tsx
import Image from "next/image";
import Link from "next/link";
import type { City } from "@/lib/types";

export function CityLinkGrid({ cities }: { cities: City[] }) {
  return (
    <section className="flex flex-col gap-6">
      <h2 className="text-display-sm text-ink">Inspiration for future getaways</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {cities.map((city) => (
          <Link key={city.id} href={`/s/${encodeURIComponent(city.name)}`} className="flex flex-col gap-2">
            <div className="relative aspect-[3/2] w-full overflow-hidden rounded-md">
              <Image
                src={city.image}
                alt={city.name}
                fill
                sizes="(max-width: 744px) 100vw, 16vw"
                className="object-cover"
              />
            </div>
            <h3 className="text-title-md text-ink">{city.name}</h3>
            <p className="text-body-sm text-muted">{city.subLabel}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- city-link-grid`
Expected: PASS — the link href is `/s/Aspen`.

- [ ] **Step 5: Add the home search bar wrapper**

Create `components/features/home-search-bar.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { SearchBar } from "@/components/design-system";

export function HomeSearchBar() {
  const router = useRouter();
  return <SearchBar onSearch={() => router.push("/s/anywhere")} />;
}
```

- [ ] **Step 6: Use the wrapper on the homepage**

In `app/page.tsx`, replace the `SearchBar` import and usage. Change the import line:

```tsx
import { TopNav, Footer } from "@/components/design-system";
import { HomeSearchBar } from "@/components/features/home-search-bar";
```

and replace `<SearchBar />` with `<HomeSearchBar />`. Leave the rest of the file unchanged.

- [ ] **Step 7: Write the E2E spec**

Create `e2e/search.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("navigates from a city card to its search results with map", async ({ page }) => {
  await page.goto("/");
  await page.locator('a[href^="/s/"]').first().click();
  await expect(page).toHaveURL(/\/s\//);

  // Results heading + the map panel container are present.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByTestId("map-panel")).toBeAttached();
});

test("applies a price filter and updates the URL", async ({ page }) => {
  await page.goto("/s/Aspen");
  await expect(page.getByRole("heading", { level: 1, name: /stays in aspen/i })).toBeVisible();

  await page.getByRole("button", { name: /filters/i }).click();
  await page.getByLabel(/minimum price/i).fill("250");
  await page.getByRole("button", { name: /show results/i }).click();

  await expect(page).toHaveURL(/minPrice=250/);
});

test("search orb routes to the search page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/\/s\/anywhere/);
});
```

- [ ] **Step 8: Run the unit + E2E suites**

Run: `npm test -- city-link-grid` then `npm run e2e -- search`
Expected: unit PASS; e2e PASS (3 tests). If the map panel never attaches because the WebGL context fails in the Playwright environment, the `map-panel` wrapper `div` still attaches (it is plain markup; the map mounts inside it) — assert on the wrapper, not on maplibre internals, which this spec already does.

- [ ] **Step 9: Commit**

```bash
git add components/features/home-search-bar.tsx app/page.tsx components/features/city-link-grid.tsx components/features/city-link-grid.test.tsx e2e/search.spec.ts
git commit -m "feat: wire homepage search and city cards to /s/[location] and add search e2e"
```

---

## Self-Review

**1. Spec coverage** (spec §5 `/s/[location]` row; §7 data flow; §8 responsive; §11 Mapbox risk):
- Filter bar → Tasks 7–8. Results grid → Task 6. Map with Rausch price markers → Tasks 4–5 (MapLibre substituted for Mapbox per the user's decision — same deliverable, no token; recorded in Global Constraints). Filtering by location/price/category/guests/rooms → Tasks 1–3. URL-driven state → Task 9. Entry navigation (homepage search + city cards) → Task 11. ✔
- §8 responsive: the map panel is `hidden lg:block` (list-only on mobile/tablet, list+map on desktop) — matches "cards 2-up, map on desktop." A mobile map toggle is deferred to Phase 8 (responsive polish), consistent with spec §10 phasing.

**2. Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N" — every code step is complete. ✔

**3. Type consistency:** `ListingFilters` (Task 1) is consumed unchanged by `filtersFromSearch`/`listingQueryString` (Task 2), `fetchSearchListings`/`useSearchListings` (Task 3), and `SearchResults` (Task 9). `FilterValues` defined in Task 7, consumed in Task 9. `ListingMap` prop names (`listings`/`selectedId`/`onSelect`) match between Tasks 5 and 9. `SearchResultsList` props (`listings`/`isLoading`/`location`) match between Tasks 6 and 9. `countActiveFilters` excludes location+category in both its definition (Task 2) and its use for the badge (Task 9). The route param keys (Task 3) match the keys `listingQueryString` emits (Task 2). ✔

**Known deferrals (by spec phasing, not gaps):** mobile map toggle + full responsive pass → Phase 8; map↔card hover sync and marker clustering → not in scope (YAGNI; selection state exists but only marker-click drives it); Zustand search-draft store → not needed (URL is the source of truth this phase).
