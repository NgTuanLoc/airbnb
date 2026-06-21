# Airbnb Clone — Phase 2: Homepage & Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the real Airbnb homepage — category strip, data-driven property grid, and city-link grid — fed by mock data served over real HTTP route handlers behind a repository abstraction, validated with Zod, and fetched with TanStack Query.

**Architecture:** This phase establishes the data seam used by every later phase: `seed JSON → Repository interface → /api route handler → api-client (Zod-validated) → TanStack Query hook → UI`. The homepage is a Server Component shell (`TopNav`, hero, city grid, `Footer`) wrapping one Client island (`HomeListings`) that owns category-filter state and drives the property grid. Swapping to a real backend later means replacing the mock repository only — the API contract, api-client, hooks, and UI never change.

**Tech Stack:** Next.js 16 App Router (route handlers), TypeScript strict, Tailwind v4 tokens, TanStack Query v5, Zod, Vitest + RTL, Playwright. Reuses Phase 1 design-system atoms via `@/components/design-system`.

## Global Constraints

- **Reuse Phase 1 atoms** from `@/components/design-system`: `TopNav`, `SearchBar`, `Footer`, `PropertyCard`. Do not duplicate them.
- **`PropertyCard` interface (unchanged, from Phase 1):** `PropertyCard({ listing }: { listing: Listing })`. `Listing` is `{ id, title, location:{city,country,lat,lng}, photos[], pricePerNight, rating, reviewCount, isGuestFavorite, hostId, category }` in `@/lib/types`.
- **API envelope (verbatim shape):** `interface ApiResponse<T> { success: boolean; data?: T; error?: string; meta?: { total: number; page: number; limit: number } }`.
- **Repository pattern:** UI/hooks never import seed data directly — they go through the api-client → `/api/*` → repository. Only the mock repository imports `lib/data`.
- **Validation at the boundary:** the api-client validates every response with Zod before returning typed data; never trust the network shape.
- **Design tokens only** — no raw hex or arbitrary Tailwind values; use the token classes (`text-ink`, `text-muted`, `bg-canvas`, `rounded-md`, `text-title-md`, `text-body-sm`, etc.). City-link block: city name in `text-title-md` ink, sub-label in `text-body-sm` muted.
- **Grids reduce columns, never reflow rows:** property grid 1-up (<744px) / 2-up (744–1128) / 4-up (≥1128), 16px gutters (`gap-4`); city grid 1 / 2–3 / 6 columns. Content max-width ~1280px (`max-w-[1280px]`).
- **No `console.log`, no `any`** (use `unknown` + narrowing). TypeScript strict. Explicit types on exported functions and component props.
- **TDD:** test first, watch it fail, minimal implementation, watch it pass, commit. Commit format `<type>: <description>`.
- **Test commands:** single file `npx vitest run <path>`; full suite `npm test`; e2e `npm run e2e`.

---

### Task 1: Extend types (City, categories) and seed mock data

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/data/listings.ts`
- Create: `lib/data/cities.ts`
- Test: `lib/data/data.test.ts`

**Interfaces:**
- Consumes: existing `Listing` interface in `lib/types.ts`.
- Produces: `City` interface and `CATEGORIES`/`Category` exports in `@/lib/types`; `listings: Listing[]` from `@/lib/data/listings`; `cities: City[]` from `@/lib/data/cities`. Later tasks (repository, city grid) rely on these.

- [ ] **Step 1: Add the City type and category list to `lib/types.ts`**

Append to `lib/types.ts` (keep the existing `Listing` interface above it):
```ts
export interface City {
  id: string;
  name: string;
  subLabel: string;
  image: string;
  listingCount: number;
}

export const CATEGORIES = [
  "All",
  "Cabins",
  "Beachfront",
  "Countryside",
  "Amazing views",
  "Tiny homes",
  "Lakefront",
  "Trending",
] as const;

export type Category = (typeof CATEGORIES)[number];
```

- [ ] **Step 2: Write the failing data-invariant test**

Create `lib/data/data.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { listings } from "./listings";
import { cities } from "./cities";
import { CATEGORIES } from "@/lib/types";

const allowedCategories = CATEGORIES.filter((c) => c !== "All");

describe("seed listings", () => {
  test("has at least 16 listings", () => {
    expect(listings.length).toBeGreaterThanOrEqual(16);
  });

  test("every listing has a unique id", () => {
    const ids = new Set(listings.map((l) => l.id));
    expect(ids.size).toBe(listings.length);
  });

  test("every listing has a photo, positive price, and a known category", () => {
    for (const l of listings) {
      expect(l.photos.length).toBeGreaterThan(0);
      expect(l.pricePerNight).toBeGreaterThan(0);
      expect(allowedCategories).toContain(l.category);
    }
  });

  test("every category (except All) has at least one listing", () => {
    for (const c of allowedCategories) {
      expect(listings.some((l) => l.category === c)).toBe(true);
    }
  });
});

describe("seed cities", () => {
  test("has at least 6 cities with unique ids", () => {
    expect(cities.length).toBeGreaterThanOrEqual(6);
    const ids = new Set(cities.map((c) => c.id));
    expect(ids.size).toBe(cities.length);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run lib/data/data.test.ts`
Expected: FAIL — cannot find module `./listings`.

- [ ] **Step 4: Create the seed cities**

Create `lib/data/cities.ts`:
```ts
import type { City } from "@/lib/types";

export const cities: City[] = [
  { id: "wilmington", name: "Wilmington", subLabel: "Cottage rentals", image: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=600&q=80", listingCount: 124 },
  { id: "athens", name: "Athens", subLabel: "Villa rentals", image: "https://images.unsplash.com/photo-1555993539-1732b0258235?w=600&q=80", listingCount: 211 },
  { id: "aspen", name: "Aspen", subLabel: "Cabin rentals", image: "https://images.unsplash.com/photo-1486890534535-86c4a1d0c0e2?w=600&q=80", listingCount: 87 },
  { id: "malibu", name: "Malibu", subLabel: "Beach house rentals", image: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=600&q=80", listingCount: 156 },
  { id: "kyoto", name: "Kyoto", subLabel: "Ryokan rentals", image: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=600&q=80", listingCount: 98 },
  { id: "lisbon", name: "Lisbon", subLabel: "Apartment rentals", image: "https://images.unsplash.com/photo-1588535684837-3f57c9a08c3b?w=600&q=80", listingCount: 178 },
];
```

- [ ] **Step 5: Create the seed listings**

Create `lib/data/listings.ts`. Provide at least 16 listings covering every category (Cabins, Beachfront, Countryside, Amazing views, Tiny homes, Lakefront, Trending). Use this exact helper + array (extend to ≥16 by repeating the pattern with distinct ids/titles/cities; every category must appear at least once):
```ts
import type { Listing } from "@/lib/types";

const photo = (id: string) => `https://images.unsplash.com/${id}?w=800&q=80`;

export const listings: Listing[] = [
  { id: "l1", title: "Cozy cabin in the pines", location: { city: "Aspen", country: "USA", lat: 39.19, lng: -106.82 }, photos: [photo("photo-1449158743715-0a90ebb6d2d8")], pricePerNight: 220, rating: 4.92, reviewCount: 88, isGuestFavorite: true, hostId: "h1", category: "Cabins" },
  { id: "l2", title: "Beachfront villa with infinity pool", location: { city: "Malibu", country: "USA", lat: 34.03, lng: -118.69 }, photos: [photo("photo-1502005229762-cf1b2da7c5d6")], pricePerNight: 540, rating: 4.88, reviewCount: 142, isGuestFavorite: true, hostId: "h2", category: "Beachfront" },
  { id: "l3", title: "Stone cottage in the countryside", location: { city: "Wilmington", country: "USA", lat: 34.22, lng: -77.94 }, photos: [photo("photo-1505693416388-ac5ce068fe85")], pricePerNight: 180, rating: 4.79, reviewCount: 64, isGuestFavorite: false, hostId: "h3", category: "Countryside" },
  { id: "l4", title: "Cliffside home with amazing views", location: { city: "Athens", country: "Greece", lat: 37.98, lng: 23.72 }, photos: [photo("photo-1512917774080-9991f1c4c750")], pricePerNight: 310, rating: 4.95, reviewCount: 201, isGuestFavorite: true, hostId: "h4", category: "Amazing views" },
  { id: "l5", title: "Tiny home in the woods", location: { city: "Kyoto", country: "Japan", lat: 35.01, lng: 135.77 }, photos: [photo("photo-1518780664697-55e3ad937233")], pricePerNight: 95, rating: 4.81, reviewCount: 39, isGuestFavorite: false, hostId: "h5", category: "Tiny homes" },
  { id: "l6", title: "Lakefront retreat with dock", location: { city: "Aspen", country: "USA", lat: 39.20, lng: -106.80 }, photos: [photo("photo-1475087542963-13ab5e611954")], pricePerNight: 260, rating: 4.9, reviewCount: 110, isGuestFavorite: true, hostId: "h6", category: "Lakefront" },
  { id: "l7", title: "Trending loft in the city", location: { city: "Lisbon", country: "Portugal", lat: 38.72, lng: -9.14 }, photos: [photo("photo-1493809842364-78817add7ffb")], pricePerNight: 145, rating: 4.74, reviewCount: 53, isGuestFavorite: false, hostId: "h7", category: "Trending" },
  { id: "l8", title: "A-frame cabin escape", location: { city: "Aspen", country: "USA", lat: 39.18, lng: -106.83 }, photos: [photo("photo-1502086223501-7ea6ecd79368")], pricePerNight: 175, rating: 4.85, reviewCount: 72, isGuestFavorite: false, hostId: "h8", category: "Cabins" },
  { id: "l9", title: "Ocean-view beach bungalow", location: { city: "Malibu", country: "USA", lat: 34.01, lng: -118.80 }, photos: [photo("photo-1499793983690-e29da59ef1c2")], pricePerNight: 420, rating: 4.83, reviewCount: 96, isGuestFavorite: true, hostId: "h9", category: "Beachfront" },
  { id: "l10", title: "Rolling-hills farmhouse", location: { city: "Athens", country: "Greece", lat: 37.95, lng: 23.70 }, photos: [photo("photo-1510798831971-661eb04b3739")], pricePerNight: 160, rating: 4.77, reviewCount: 45, isGuestFavorite: false, hostId: "h10", category: "Countryside" },
  { id: "l11", title: "Panoramic mountain lookout", location: { city: "Kyoto", country: "Japan", lat: 35.05, lng: 135.80 }, photos: [photo("photo-1521401830884-6c03c1c87ebb")], pricePerNight: 285, rating: 4.97, reviewCount: 188, isGuestFavorite: true, hostId: "h11", category: "Amazing views" },
  { id: "l12", title: "Compact tiny cabin", location: { city: "Wilmington", country: "USA", lat: 34.24, lng: -77.90 }, photos: [photo("photo-1416331108676-a22ccb276e35")], pricePerNight: 88, rating: 4.7, reviewCount: 28, isGuestFavorite: false, hostId: "h12", category: "Tiny homes" },
  { id: "l13", title: "Lakeside glass house", location: { city: "Lisbon", country: "Portugal", lat: 38.70, lng: -9.20 }, photos: [photo("photo-1500375592092-40eb2168fd21")], pricePerNight: 330, rating: 4.91, reviewCount: 134, isGuestFavorite: true, hostId: "h13", category: "Lakefront" },
  { id: "l14", title: "Designer city apartment", location: { city: "Lisbon", country: "Portugal", lat: 38.71, lng: -9.13 }, photos: [photo("photo-1522708323590-d24dbb6b0267")], pricePerNight: 199, rating: 4.82, reviewCount: 77, isGuestFavorite: false, hostId: "h14", category: "Trending" },
  { id: "l15", title: "Forest cabin with hot tub", location: { city: "Aspen", country: "USA", lat: 39.21, lng: -106.79 }, photos: [photo("photo-1518732714860-b62714ce0c59")], pricePerNight: 240, rating: 4.89, reviewCount: 119, isGuestFavorite: true, hostId: "h15", category: "Cabins" },
  { id: "l16", title: "Sunset beach cottage", location: { city: "Malibu", country: "USA", lat: 34.02, lng: -118.75 }, photos: [photo("photo-1564013799919-ab600027ffc6")], pricePerNight: 365, rating: 4.86, reviewCount: 103, isGuestFavorite: false, hostId: "h16", category: "Beachfront" },
];
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run lib/data/data.test.ts`
Expected: PASS (all data-invariant tests green).

- [ ] **Step 7: Commit**

```bash
git add lib/types.ts lib/data/listings.ts lib/data/cities.ts lib/data/data.test.ts
git commit -m "feat: add City type, category list, and seed listing/city data"
```

---

### Task 2: API envelope + ListingRepository (interface + mock impl)

**Files:**
- Create: `lib/api/envelope.ts`
- Create: `lib/repositories/listing-repository.ts`
- Create: `lib/repositories/mock/mock-listing-repository.ts`
- Test: `lib/repositories/mock/mock-listing-repository.test.ts`

**Interfaces:**
- Consumes: `listings` from `@/lib/data/listings`; `Listing` from `@/lib/types`.
- Produces: `ApiResponse<T>` type + `ok`/`fail` helpers from `@/lib/api/envelope`; `ListingRepository` and `ListingFilters` from `@/lib/repositories/listing-repository`; `mockListingRepository` (a `ListingRepository`) from `@/lib/repositories/mock/mock-listing-repository`. The route handler (Task 3) consumes these.

- [ ] **Step 1: Create the API envelope**

Create `lib/api/envelope.ts`:
```ts
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: { total: number; page: number; limit: number };
}

export function ok<T>(data: T, meta?: ApiResponse<T>["meta"]): ApiResponse<T> {
  return { success: true, data, meta };
}

export function fail<T = never>(error: string): ApiResponse<T> {
  return { success: false, error };
}
```

- [ ] **Step 2: Create the repository interface**

Create `lib/repositories/listing-repository.ts`:
```ts
import type { Listing } from "@/lib/types";

export interface ListingFilters {
  category?: string;
}

export interface ListingRepository {
  findAll(filters?: ListingFilters): Promise<Listing[]>;
  findById(id: string): Promise<Listing | null>;
}
```

- [ ] **Step 3: Write the failing mock-repository test**

Create `lib/repositories/mock/mock-listing-repository.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { mockListingRepository } from "./mock-listing-repository";

describe("mockListingRepository", () => {
  test("findAll with no filter returns all listings", async () => {
    const all = await mockListingRepository.findAll();
    expect(all.length).toBeGreaterThanOrEqual(16);
  });

  test("findAll filters by category", async () => {
    const cabins = await mockListingRepository.findAll({ category: "Cabins" });
    expect(cabins.length).toBeGreaterThan(0);
    expect(cabins.every((l) => l.category === "Cabins")).toBe(true);
  });

  test('findAll with category "All" returns everything', async () => {
    const all = await mockListingRepository.findAll({ category: "All" });
    const unfiltered = await mockListingRepository.findAll();
    expect(all.length).toBe(unfiltered.length);
  });

  test("findById returns the matching listing or null", async () => {
    const all = await mockListingRepository.findAll();
    const first = await mockListingRepository.findById(all[0].id);
    expect(first?.id).toBe(all[0].id);
    expect(await mockListingRepository.findById("does-not-exist")).toBeNull();
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run lib/repositories/mock/mock-listing-repository.test.ts`
Expected: FAIL — cannot find module `./mock-listing-repository`.

- [ ] **Step 5: Implement the mock repository**

Create `lib/repositories/mock/mock-listing-repository.ts`:
```ts
import type { Listing } from "@/lib/types";
import { listings } from "@/lib/data/listings";
import type { ListingFilters, ListingRepository } from "../listing-repository";

export const mockListingRepository: ListingRepository = {
  async findAll(filters?: ListingFilters): Promise<Listing[]> {
    const category = filters?.category;
    if (!category || category === "All") return listings;
    return listings.filter((l) => l.category === category);
  },

  async findById(id: string): Promise<Listing | null> {
    return listings.find((l) => l.id === id) ?? null;
  },
};
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run lib/repositories/mock/mock-listing-repository.test.ts`
Expected: 4 passing tests.

- [ ] **Step 7: Commit**

```bash
git add lib/api/envelope.ts lib/repositories/
git commit -m "feat: add API envelope and ListingRepository with mock implementation"
```

---

### Task 3: `/api/listings` route handler

**Files:**
- Create: `app/api/listings/route.ts`
- Test: `app/api/listings/route.test.ts`

**Interfaces:**
- Consumes: `mockListingRepository` from `@/lib/repositories/mock/mock-listing-repository`; `ok` from `@/lib/api/envelope`.
- Produces: `GET(request: Request): Promise<Response>` at `/api/listings`, returning `ApiResponse<Listing[]>` JSON with `meta.total`. Supports `?category=`. The api-client (Task 4) calls this endpoint.

- [ ] **Step 1: Write the failing route test**

Create `app/api/listings/route.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { GET } from "./route";

describe("GET /api/listings", () => {
  test("returns a successful envelope with all listings", async () => {
    const res = await GET(new Request("http://localhost/api/listings"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta.total).toBe(body.data.length);
  });

  test("filters by the category query param", async () => {
    const res = await GET(new Request("http://localhost/api/listings?category=Cabins"));
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.every((l: { category: string }) => l.category === "Cabins")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/api/listings/route.test.ts`
Expected: FAIL — cannot find module `./route`.

- [ ] **Step 3: Implement the route handler**

Create `app/api/listings/route.ts`:
```ts
import { mockListingRepository } from "@/lib/repositories/mock/mock-listing-repository";
import { ok } from "@/lib/api/envelope";

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") ?? undefined;
  const data = await mockListingRepository.findAll({ category });
  return Response.json(ok(data, { total: data.length, page: 1, limit: data.length }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/api/listings/route.test.ts`
Expected: 2 passing tests.

- [ ] **Step 5: Commit**

```bash
git add app/api/listings/route.ts app/api/listings/route.test.ts
git commit -m "feat: add /api/listings route handler"
```

---

### Task 4: Zod schemas + api-client (`fetchListings`)

**Files:**
- Create: `lib/api-client/schemas.ts`
- Create: `lib/api-client/listings.ts`
- Test: `lib/api-client/listings.test.ts`
- Modify: `package.json` (adds `zod`)

**Interfaces:**
- Consumes: the `/api/listings` contract from Task 3; `Listing` from `@/lib/types`.
- Produces: `fetchListings(category?: string): Promise<Listing[]>` from `@/lib/api-client/listings`. The `useListings` hook (Task 6) consumes it. Throws on a non-`success` envelope or a schema mismatch.

- [ ] **Step 1: Install Zod**

Run:
```bash
cd "D:/PersonalProjects/airbnb"
npm install zod
```
Expected: `zod` added to dependencies.

- [ ] **Step 2: Create the Zod schemas**

Create `lib/api-client/schemas.ts`:
```ts
import { z } from "zod";

export const listingSchema = z.object({
  id: z.string(),
  title: z.string(),
  location: z.object({
    city: z.string(),
    country: z.string(),
    lat: z.number(),
    lng: z.number(),
  }),
  photos: z.array(z.string()).min(1),
  pricePerNight: z.number().positive(),
  rating: z.number(),
  reviewCount: z.number(),
  isGuestFavorite: z.boolean(),
  hostId: z.string(),
  category: z.string(),
});

export const listingsEnvelopeSchema = z.object({
  success: z.boolean(),
  data: z.array(listingSchema).optional(),
  error: z.string().optional(),
  meta: z
    .object({ total: z.number(), page: z.number(), limit: z.number() })
    .optional(),
});
```

- [ ] **Step 3: Write the failing api-client test**

Create `lib/api-client/listings.test.ts`:
```ts
import { afterEach, describe, expect, test, vi } from "vitest";
import { fetchListings } from "./listings";
import type { Listing } from "@/lib/types";

const sample: Listing = {
  id: "l1",
  title: "Cabin",
  location: { city: "Aspen", country: "USA", lat: 39, lng: -106 },
  photos: ["https://example.com/p.jpg"],
  pricePerNight: 220,
  rating: 4.9,
  reviewCount: 10,
  isGuestFavorite: true,
  hostId: "h1",
  category: "Cabins",
};

function mockFetch(body: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    json: async () => body,
  } as Response);
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchListings", () => {
  test("returns validated listings on a successful envelope", async () => {
    vi.stubGlobal("fetch", mockFetch({ success: true, data: [sample], meta: { total: 1, page: 1, limit: 1 } }));
    const result = await fetchListings();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("l1");
  });

  test("passes the category as a query param", async () => {
    const f = mockFetch({ success: true, data: [], meta: { total: 0, page: 1, limit: 0 } });
    vi.stubGlobal("fetch", f);
    await fetchListings("Beachfront");
    expect(f).toHaveBeenCalledWith(expect.stringContaining("category=Beachfront"));
  });

  test("throws when the envelope reports failure", async () => {
    vi.stubGlobal("fetch", mockFetch({ success: false, error: "boom" }));
    await expect(fetchListings()).rejects.toThrow("boom");
  });

  test("throws when a listing fails schema validation", async () => {
    vi.stubGlobal("fetch", mockFetch({ success: true, data: [{ id: "x" }] }));
    await expect(fetchListings()).rejects.toThrow();
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run lib/api-client/listings.test.ts`
Expected: FAIL — cannot find module `./listings`.

- [ ] **Step 5: Implement the api-client**

Create `lib/api-client/listings.ts`:
```ts
import type { Listing } from "@/lib/types";
import { listingsEnvelopeSchema } from "./schemas";

export async function fetchListings(category?: string): Promise<Listing[]> {
  const query = category && category !== "All" ? `?category=${encodeURIComponent(category)}` : "";
  const res = await fetch(`/api/listings${query}`);
  const json: unknown = await res.json();
  const envelope = listingsEnvelopeSchema.parse(json);
  if (!envelope.success) {
    throw new Error(envelope.error ?? "Failed to load listings");
  }
  return envelope.data ?? [];
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run lib/api-client/listings.test.ts`
Expected: 4 passing tests.

- [ ] **Step 7: Commit**

```bash
git add lib/api-client/ package.json package-lock.json
git commit -m "feat: add Zod schemas and listings api-client"
```

---

### Task 5: TanStack Query provider

**Files:**
- Create: `app/providers.tsx`
- Modify: `app/layout.tsx`
- Test: `app/providers.test.tsx`
- Modify: `package.json` (adds `@tanstack/react-query`)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `Providers({ children }: { children: React.ReactNode })` from `@/app/providers`, a Client Component supplying a `QueryClientProvider`. Wired into the root layout so every page can use TanStack Query hooks. Task 6's hook tests reuse a `QueryClient` wrapper pattern.

- [ ] **Step 1: Install TanStack Query**

Run:
```bash
cd "D:/PersonalProjects/airbnb"
npm install @tanstack/react-query
```
Expected: `@tanstack/react-query` added to dependencies.

- [ ] **Step 2: Write the failing provider test**

Create `app/providers.test.tsx`:
```tsx
import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { useQuery } from "@tanstack/react-query";
import { Providers } from "./providers";

function Probe() {
  const { data } = useQuery({ queryKey: ["probe"], queryFn: async () => "ready" });
  return <span>{data ?? "loading"}</span>;
}

describe("Providers", () => {
  test("supplies a QueryClient so useQuery works", async () => {
    render(
      <Providers>
        <Probe />
      </Providers>,
    );
    expect(await screen.findByText("ready")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run app/providers.test.tsx`
Expected: FAIL — cannot find module `./providers`.

- [ ] **Step 4: Implement the Providers component**

Create `app/providers.tsx`:
```tsx
"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false } },
      }),
  );
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

- [ ] **Step 5: Wire Providers into the layout**

In `app/layout.tsx`, import and wrap children. Replace the `<body>...</body>` line so it reads:
```tsx
import type { Metadata } from "next";
import { inter } from "./fonts";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Airbnb",
  description: "Find places to stay, things to do, and services.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-canvas text-ink antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 6: Run the test and the full suite**

Run: `npx vitest run app/providers.test.tsx`
Expected: 1 passing test.
Run: `npm run build`
Expected: "Compiled successfully" (layout still valid).

- [ ] **Step 7: Commit**

```bash
git add app/providers.tsx app/layout.tsx app/providers.test.tsx package.json package-lock.json
git commit -m "feat: add TanStack Query provider"
```

---

### Task 6: `useListings` hook

**Files:**
- Create: `lib/hooks/use-listings.ts`
- Test: `lib/hooks/use-listings.test.tsx`

**Interfaces:**
- Consumes: `fetchListings` from `@/lib/api-client/listings`.
- Produces: `useListings(category?: string)` from `@/lib/hooks/use-listings`, returning TanStack Query's `UseQueryResult<Listing[]>`. `HomeListings` (Task 10) consumes it.

- [ ] **Step 1: Write the failing hook test**

Create `lib/hooks/use-listings.test.tsx`:
```tsx
import { describe, expect, test, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useListings } from "./use-listings";
import * as api from "@/lib/api-client/listings";
import type { Listing } from "@/lib/types";

const sample: Listing = {
  id: "l1", title: "Cabin", location: { city: "Aspen", country: "USA", lat: 39, lng: -106 },
  photos: ["x"], pricePerNight: 220, rating: 4.9, reviewCount: 10, isGuestFavorite: true, hostId: "h1", category: "Cabins",
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => vi.restoreAllMocks());

describe("useListings", () => {
  test("returns listings from the api-client", async () => {
    vi.spyOn(api, "fetchListings").mockResolvedValue([sample]);
    const { result } = renderHook(() => useListings(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([sample]);
  });

  test("passes the category through to fetchListings", async () => {
    const spy = vi.spyOn(api, "fetchListings").mockResolvedValue([]);
    const { result } = renderHook(() => useListings("Beachfront"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy).toHaveBeenCalledWith("Beachfront");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/hooks/use-listings.test.tsx`
Expected: FAIL — cannot find module `./use-listings`.

- [ ] **Step 3: Implement the hook**

Create `lib/hooks/use-listings.ts`:
```ts
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { fetchListings } from "@/lib/api-client/listings";
import type { Listing } from "@/lib/types";

export function useListings(category?: string): UseQueryResult<Listing[]> {
  return useQuery({
    queryKey: ["listings", category ?? "All"],
    queryFn: () => fetchListings(category),
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/hooks/use-listings.test.tsx`
Expected: 2 passing tests.

- [ ] **Step 5: Commit**

```bash
git add lib/hooks/use-listings.ts lib/hooks/use-listings.test.tsx
git commit -m "feat: add useListings query hook"
```

---

### Task 7: CategoryStrip component

**Files:**
- Create: `components/features/category-strip.tsx`
- Test: `components/features/category-strip.test.tsx`

**Interfaces:**
- Consumes: `cn` from `@/lib/utils`.
- Produces: `CategoryStrip(props: CategoryStripProps)` from `@/components/features/category-strip`, `CategoryStripProps = { categories: readonly string[]; active: string; onSelect: (category: string) => void }`. Each category is a button; the active one carries a 2px ink underline (`border-ink`), others muted. `HomeListings` (Task 10) consumes it.

- [ ] **Step 1: Write the failing test**

Create `components/features/category-strip.test.tsx`:
```tsx
import { describe, expect, test, vi } from "vitest";
import { render, screen, userEvent } from "@/lib/test-utils";
import { CategoryStrip } from "./category-strip";

const categories = ["All", "Cabins", "Beachfront"] as const;

describe("CategoryStrip", () => {
  test("renders a button per category", () => {
    render(<CategoryStrip categories={categories} active="All" onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: "Cabins" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Beachfront" })).toBeInTheDocument();
  });

  test("the active category gets the ink underline", () => {
    render(<CategoryStrip categories={categories} active="Cabins" onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: "Cabins" }).className).toContain("border-ink");
  });

  test("clicking a category calls onSelect with its name", async () => {
    const onSelect = vi.fn();
    render(<CategoryStrip categories={categories} active="All" onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: "Beachfront" }));
    expect(onSelect).toHaveBeenCalledWith("Beachfront");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/features/category-strip.test.tsx`
Expected: FAIL — cannot find module `./category-strip`.

- [ ] **Step 3: Implement the CategoryStrip**

Create `components/features/category-strip.tsx`:
```tsx
"use client";

import { cn } from "@/lib/utils";

export interface CategoryStripProps {
  categories: readonly string[];
  active: string;
  onSelect: (category: string) => void;
}

export function CategoryStrip({ categories, active, onSelect }: CategoryStripProps) {
  return (
    <div className="flex gap-8 overflow-x-auto border-b border-hairline py-4">
      {categories.map((category) => (
        <button
          key={category}
          type="button"
          onClick={() => onSelect(category)}
          className={cn(
            "whitespace-nowrap border-b-2 border-transparent pb-3 text-button-sm",
            category === active ? "border-ink text-ink" : "text-muted hover:text-ink",
          )}
        >
          {category}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/features/category-strip.test.tsx`
Expected: 3 passing tests.

- [ ] **Step 5: Commit**

```bash
git add components/features/category-strip.tsx components/features/category-strip.test.tsx
git commit -m "feat: add CategoryStrip component"
```

---

### Task 8: CityLinkGrid component

**Files:**
- Create: `components/features/city-link-grid.tsx`
- Test: `components/features/city-link-grid.test.tsx`

**Interfaces:**
- Consumes: `City` from `@/lib/types`; `Image` from `next/image`.
- Produces: `CityLinkGrid({ cities }: { cities: City[] })` from `@/components/features/city-link-grid`. A responsive grid (1 / 2–3 / 6 columns) of city-link blocks — each an image, a city name in `text-title-md` ink, and a sub-label in `text-body-sm` muted. The homepage (Task 10) consumes it.

- [ ] **Step 1: Write the failing test**

Create `components/features/city-link-grid.test.tsx`:
```tsx
import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { CityLinkGrid } from "./city-link-grid";
import type { City } from "@/lib/types";

const cities: City[] = [
  { id: "aspen", name: "Aspen", subLabel: "Cabin rentals", image: "https://example.com/a.jpg", listingCount: 10 },
  { id: "malibu", name: "Malibu", subLabel: "Beach house rentals", image: "https://example.com/m.jpg", listingCount: 12 },
];

describe("CityLinkGrid", () => {
  test("renders each city name and sub-label", () => {
    render(<CityLinkGrid cities={cities} />);
    expect(screen.getByText("Aspen")).toBeInTheDocument();
    expect(screen.getByText("Cabin rentals")).toBeInTheDocument();
    expect(screen.getByText("Malibu")).toBeInTheDocument();
  });

  test("city name uses the title-md token and sub-label uses muted body-sm", () => {
    render(<CityLinkGrid cities={cities} />);
    expect(screen.getByText("Aspen").className).toContain("text-title-md");
    expect(screen.getByText("Cabin rentals").className).toContain("text-muted");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/features/city-link-grid.test.tsx`
Expected: FAIL — cannot find module `./city-link-grid`.

- [ ] **Step 3: Implement the CityLinkGrid**

Create `components/features/city-link-grid.tsx`:
```tsx
import Image from "next/image";
import type { City } from "@/lib/types";

export function CityLinkGrid({ cities }: { cities: City[] }) {
  return (
    <section className="flex flex-col gap-6">
      <h2 className="text-display-sm text-ink">Inspiration for future getaways</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {cities.map((city) => (
          <article key={city.id} className="flex flex-col gap-2">
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
          </article>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/features/city-link-grid.test.tsx`
Expected: 2 passing tests.

- [ ] **Step 5: Commit**

```bash
git add components/features/city-link-grid.tsx components/features/city-link-grid.test.tsx
git commit -m "feat: add CityLinkGrid component"
```

---

### Task 9: PropertyGrid component (with loading and empty states)

**Files:**
- Create: `components/features/property-grid.tsx`
- Test: `components/features/property-grid.test.tsx`

**Interfaces:**
- Consumes: `PropertyCard` from `@/components/design-system`; `Listing` from `@/lib/types`.
- Produces: `PropertyGrid(props: PropertyGridProps)` from `@/components/features/property-grid`, `PropertyGridProps = { listings: Listing[]; isLoading?: boolean }`. Renders a responsive 1/2/4-column grid of `PropertyCard`s (16px gutters). When `isLoading`, renders 8 skeleton placeholders. When not loading and `listings` is empty, renders an empty-state message. `HomeListings` (Task 10) consumes it.

- [ ] **Step 1: Write the failing test**

Create `components/features/property-grid.test.tsx`:
```tsx
import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { PropertyGrid } from "./property-grid";
import type { Listing } from "@/lib/types";

const listing: Listing = {
  id: "l1", title: "Cozy cabin", location: { city: "Aspen", country: "USA", lat: 39, lng: -106 },
  photos: ["https://example.com/p.jpg"], pricePerNight: 220, rating: 4.92, reviewCount: 88,
  isGuestFavorite: true, hostId: "h1", category: "Cabins",
};

describe("PropertyGrid", () => {
  test("renders a card per listing", () => {
    render(<PropertyGrid listings={[listing]} />);
    expect(screen.getByText("Cozy cabin")).toBeInTheDocument();
  });

  test("shows skeletons while loading", () => {
    const { container } = render(<PropertyGrid listings={[]} isLoading />);
    expect(container.querySelectorAll('[data-testid="property-skeleton"]').length).toBe(8);
  });

  test("shows an empty state when there are no listings and not loading", () => {
    render(<PropertyGrid listings={[]} />);
    expect(screen.getByText(/no places/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/features/property-grid.test.tsx`
Expected: FAIL — cannot find module `./property-grid`.

- [ ] **Step 3: Implement the PropertyGrid**

Create `components/features/property-grid.tsx`:
```tsx
import { PropertyCard } from "@/components/design-system";
import type { Listing } from "@/lib/types";

export interface PropertyGridProps {
  listings: Listing[];
  isLoading?: boolean;
}

const gridClass = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4";

function Skeleton() {
  return (
    <div data-testid="property-skeleton" className="flex flex-col gap-2">
      <div className="aspect-square w-full animate-pulse rounded-md bg-surface-strong" />
      <div className="h-4 w-3/4 animate-pulse rounded-xs bg-surface-strong" />
      <div className="h-4 w-1/2 animate-pulse rounded-xs bg-surface-strong" />
    </div>
  );
}

export function PropertyGrid({ listings, isLoading }: PropertyGridProps) {
  if (isLoading) {
    return (
      <div className={gridClass}>
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} />
        ))}
      </div>
    );
  }

  if (listings.length === 0) {
    return <p className="text-body-md text-muted">No places match this category yet.</p>;
  }

  return (
    <div className={gridClass}>
      {listings.map((listing) => (
        <PropertyCard key={listing.id} listing={listing} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/features/property-grid.test.tsx`
Expected: 3 passing tests.

- [ ] **Step 5: Commit**

```bash
git add components/features/property-grid.tsx components/features/property-grid.test.tsx
git commit -m "feat: add PropertyGrid with loading and empty states"
```

---

### Task 10: HomeListings island + homepage assembly

**Files:**
- Create: `components/features/home-listings.tsx`
- Test: `components/features/home-listings.test.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `useListings` (`@/lib/hooks/use-listings`), `CategoryStrip`, `PropertyGrid` (`@/components/features/*`), `CATEGORIES` (`@/lib/types`); for the page: `TopNav`, `SearchBar`, `Footer` (`@/components/design-system`), `CityLinkGrid` (`@/components/features/city-link-grid`), `cities` (`@/lib/data/cities`).
- Produces: `HomeListings()` from `@/components/features/home-listings` — a Client island that owns the selected-category state, renders `CategoryStrip` over a `PropertyGrid` fed by `useListings(selected)`, and shows an error message on query failure. `app/page.tsx` becomes the Server shell composing the homepage.

- [ ] **Step 1: Write the failing HomeListings test**

Create `components/features/home-listings.test.tsx`:
```tsx
import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, userEvent, waitFor } from "@/lib/test-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { HomeListings } from "./home-listings";
import * as api from "@/lib/api-client/listings";
import type { Listing } from "@/lib/types";

const make = (id: string, category: string, title: string): Listing => ({
  id, title, location: { city: "Aspen", country: "USA", lat: 39, lng: -106 },
  photos: ["https://example.com/p.jpg"], pricePerNight: 200, rating: 4.9, reviewCount: 10,
  isGuestFavorite: false, hostId: "h1", category,
});

function renderWithClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => vi.restoreAllMocks());

describe("HomeListings", () => {
  test("renders listings from the default (All) query", async () => {
    vi.spyOn(api, "fetchListings").mockResolvedValue([make("l1", "Cabins", "Cozy cabin")]);
    renderWithClient(<HomeListings />);
    expect(await screen.findByText("Cozy cabin")).toBeInTheDocument();
  });

  test("selecting a category refetches with that category", async () => {
    const spy = vi.spyOn(api, "fetchListings").mockResolvedValue([make("l1", "Cabins", "Cozy cabin")]);
    renderWithClient(<HomeListings />);
    await screen.findByText("Cozy cabin");
    await userEvent.click(screen.getByRole("button", { name: "Beachfront" }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith("Beachfront"));
  });

  test("shows an error message when the query fails", async () => {
    vi.spyOn(api, "fetchListings").mockRejectedValue(new Error("boom"));
    renderWithClient(<HomeListings />);
    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/features/home-listings.test.tsx`
Expected: FAIL — cannot find module `./home-listings`.

- [ ] **Step 3: Implement the HomeListings island**

Create `components/features/home-listings.tsx`:
```tsx
"use client";

import { useState } from "react";
import { CATEGORIES } from "@/lib/types";
import { useListings } from "@/lib/hooks/use-listings";
import { CategoryStrip } from "./category-strip";
import { PropertyGrid } from "./property-grid";

export function HomeListings() {
  const [active, setActive] = useState<string>("All");
  const { data, isLoading, isError } = useListings(active);

  return (
    <div className="flex flex-col gap-6">
      <CategoryStrip categories={CATEGORIES} active={active} onSelect={setActive} />
      {isError ? (
        <p className="text-body-md text-error">Something went wrong loading places. Please try again.</p>
      ) : (
        <PropertyGrid listings={data ?? []} isLoading={isLoading} />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/features/home-listings.test.tsx`
Expected: 3 passing tests.

- [ ] **Step 5: Assemble the homepage**

Replace the entire contents of `app/page.tsx`:
```tsx
import { TopNav, SearchBar, Footer } from "@/components/design-system";
import { HomeListings } from "@/components/features/home-listings";
import { CityLinkGrid } from "@/components/features/city-link-grid";
import { cities } from "@/lib/data/cities";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <TopNav active="homes" />
      <div className="flex justify-center border-b border-hairline px-6 pb-6">
        <SearchBar />
      </div>
      <main className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col gap-12 px-6 py-8">
        <HomeListings />
        <CityLinkGrid cities={cities} />
      </main>
      <Footer />
    </div>
  );
}
```

- [ ] **Step 6: Verify build and full unit suite**

Run: `npm run build`
Expected: "Compiled successfully"; `/` and `/api/listings` appear in the route list.
Run: `npm test`
Expected: all unit/component tests pass (Phase 1 + Phase 2).

- [ ] **Step 7: Commit**

```bash
git add components/features/home-listings.tsx components/features/home-listings.test.tsx app/page.tsx
git commit -m "feat: assemble data-driven homepage with category filter"
```

---

### Task 11: Homepage E2E smoke test

**Files:**
- Create: `e2e/homepage.spec.ts`

**Interfaces:**
- Consumes: the running app (homepage at `/`, `/api/listings`).
- Produces: a Playwright spec proving the homepage renders property cards from the API, the category filter works, and the city grid is present.

- [ ] **Step 1: Write the e2e spec**

Create `e2e/homepage.spec.ts`:
```ts
import { test, expect } from "@playwright/test";

test("homepage shows the search bar, property cards, and city grid", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Search" })).toBeVisible();
  // at least one property card heading is rendered from /api/listings
  await expect(page.getByRole("heading", { level: 3 }).first()).toBeVisible();
  await expect(page.getByText("Inspiration for future getaways")).toBeVisible();
});

test("category filter updates the grid", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Cabins" })).toBeVisible();
  await page.getByRole("button", { name: "Cabins" }).click();
  // grid still renders cards after filtering
  await expect(page.getByRole("heading", { level: 3 }).first()).toBeVisible();
});
```

- [ ] **Step 2: Run the e2e suite**

Run: `npm run e2e`
Expected: both new homepage specs pass (Playwright boots the dev server itself; the existing design-system spec also still passes).

- [ ] **Step 3: Commit**

```bash
git add e2e/homepage.spec.ts
git commit -m "test: add homepage e2e smoke test"
```

---

## Self-Review

**Spec coverage (Phase 2 — spec §3 data layer, §4 homepage row, §6 data model, §7 data flow):**
- Homepage: header + search + category strip + property grid + city grid + footer → Tasks 7–10 (atoms from Phase 1 reused) ✅
- Repository abstraction over in-memory JSON → Task 2 ✅
- Route handlers (`/api/listings`) → Task 3 ✅
- api-client + Zod boundary validation → Task 4 ✅
- TanStack Query + hook → Tasks 5–6 ✅
- API envelope `{ success, data, error, meta }` → Task 2 (`ApiResponse<T>`), used in Task 3 ✅
- Loading/skeleton + error + empty states → Task 9 (skeleton/empty), Task 10 (error) ✅
- City data model (name, sub-label, image, count) → Task 1 ✅
- Column-reducing grids, 1280px max width, token-only styling → Tasks 8–10 constraints ✅
- Experiences/Services verticals, wishlists, auth, host pages → **out of scope** (Phases 5–7), intentionally not here.

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every command lists expected output. Seed data Step 5 gives 16 complete records (the "extend the pattern" note is satisfied by the array as written — ≥16 with every category present). ✅

**Type consistency:** `ApiResponse<T>` defined in Task 2 and returned in Task 3. `ListingRepository.findAll(filters?)` signature consistent across Tasks 2–3. `fetchListings(category?)` defined in Task 4, consumed in Task 6, mocked identically in Tasks 4/6/10 tests. `CategoryStripProps`/`PropertyGridProps` names match their consumers in Task 10. `City` shape consistent across Tasks 1/8. `useListings` returns `UseQueryResult<Listing[]>` consumed in Task 10. ✅

**Note for executor:** Route-handler and api-client tests rely on global `Request`/`Response`/`fetch` (present in Node 24 under Vitest). No `next/server` import is needed — the handler uses the Web `Request`/`Response` and `Response.json`. The `shadcn/ui` init deferred from Phase 1 is still deferred; this phase introduces no shadcn primitives.
