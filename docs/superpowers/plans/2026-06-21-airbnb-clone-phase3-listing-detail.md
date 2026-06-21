# Phase 3 — Listing Detail & Reservation Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/rooms/[id]` listing-detail page — photo gallery, the 64px rating-display moment, amenities, reviews, host card, and a sticky reservation card with a month calendar, guest stepper, and live price breakdown.

**Architecture:** The detail page is a **React Server Component** that reads the mock repositories directly (`mockListingRepository`, `mockHostRepository`, `mockReviewRepository`). The repository interface is the documented backend-swap seam, so reading it server-side is swap-safe and matches the spec's "RSC for SEO-critical pages." No new HTTP route handlers, api-client functions, or TanStack Query hooks are added this phase because nothing fetches client-side — this respects YAGNI and is consistent with `app/page.tsx` already importing seed `cities` server-side. The **only** client island is `ReservationCard`, which operates purely on the already-loaded listing data (local state for dates/guests computing a price).

**Tech Stack:** Next.js 16 (App Router, React 19 Server Components), TypeScript strict, Tailwind v4 token theme, Vitest + React Testing Library, Playwright. Existing atoms reused from `components/design-system` (`RatingDisplay`, `DatePickerDay`, `Button`, `TopNav`, `Footer`).

## Global Constraints

- **Design tokens only** — use the Tailwind v4 token utilities defined in `app/globals.css` (colors `ink`/`body`/`muted`/`muted-soft`/`hairline`/`hairline-soft`/`surface-soft`/`surface-strong`/`rausch`/`on-primary`/`error`; radii `rounded-xs/sm/md/lg/xl/full`; type classes `text-display-*`/`text-title-*`/`text-body-*`/`text-rating`/`text-caption*`; `shadow-airbnb`). NEVER use raw hex values or Tailwind arbitrary color values.
- **Repository is the only importer of `lib/data`** — components and pages never import seed files directly. Exception already sanctioned: static seed imports inside `app/` route files for server rendering (as `app/page.tsx` does with `cities`). New entities get a repository interface + mock implementation.
- **API envelope** `{ success, data?, error?, meta? }` via `ok`/`fail` in `lib/api/envelope.ts`; route handlers (where present) use Web `Request`/`Response`, never `next/server`.
- **Listing detail page caps at 1080px** wide and is 2-column on desktop (~64% body / ~32% sticky reservation rail) per DESIGN.md §Layout.
- **Reservation card** (DESIGN.md): white surface, `rounded-md`, 1px hairline border, `shadow-airbnb`, 24px padding; nightly price in `text-display-md` ink; full-width "Reserve" primary CTA; fee breakdown in `text-body-sm`.
- **Touch targets:** date cells 40×40px (existing `DatePickerDay`), primary CTAs 48px tall (existing `Button` primary).
- **TypeScript strict**, no `any` (use `unknown` + narrowing), explicit types on exported functions and component props, immutable updates (spread, never mutate), no `console.log`.
- **TDD:** write the failing test first, watch it fail, implement minimally, watch it pass, commit. AAA test structure, behavioral test names.

---

## File Structure

**Types & schema**
- Modify `lib/types.ts` — extend `Listing` with detail fields; add `Host`, `Review` interfaces.
- Modify `lib/api-client/schemas.ts` — extend `listingSchema` to keep schema ⊇ type (the list endpoint validates against it).

**Seed data**
- Modify `lib/data/listings.ts` — add detail fields + 5 photos per listing.
- Create `lib/data/hosts.ts` — hosts `h1`–`h16`.
- Create `lib/data/reviews.ts` — reviews per listing.
- Modify `lib/data/data.test.ts` — assert the new seed shape.

**Repositories**
- Create `lib/repositories/host-repository.ts` (+ `lib/repositories/mock/mock-host-repository.ts`).
- Create `lib/repositories/review-repository.ts` (+ `lib/repositories/mock/mock-review-repository.ts`).

**Reservation logic**
- Create `lib/reservation/pricing.ts` — `nightsBetween`, `calculatePriceBreakdown`.

**Components**
- Create `components/features/listing-gallery.tsx` — 5-photo mosaic.
- Create `components/features/amenity-list.tsx` — amenity rows with hairline dividers.
- Create `components/features/reviews-grid.tsx` — 2-column review excerpts.
- Create `components/design-system/host-card.tsx` — host card atom (+ barrel export).
- Create `components/features/guest-stepper.tsx` — client +/- guest counter.
- Create `components/features/booking-calendar.tsx` — month calendar composing `DatePickerDay`.
- Create `components/features/reservation-card.tsx` — client island (calendar + stepper + pricing + Reserve).
- Create `components/features/listing-overview.tsx` — title / property-type / specs / inline rating header.

**Page**
- Create `app/rooms/[id]/page.tsx` — Server Component.
- Create `app/rooms/[id]/not-found.tsx` — minimal not-found.
- Modify `components/design-system/property-card.tsx` — wrap card in a `/rooms/[id]` link (keep heart button valid, outside the anchor).

**E2E**
- Create `e2e/listing-detail.spec.ts`.

---

### Task 1: Extend types & listing schema for detail

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/api-client/schemas.ts`
- Test: `lib/api-client/schemas.test.ts` (create)

**Interfaces:**
- Produces: extended `Listing` (adds `description: string`, `propertyType: string`, `maxGuests: number`, `bedrooms: number`, `beds: number`, `baths: number`, `amenities: string[]`); `Host { id, name, avatar, isSuperhost, responseRate, joinedYear }`; `Review { id, listingId, authorName, authorAvatar, date, rating, body }`.

- [ ] **Step 1: Write the failing test**

Create `lib/api-client/schemas.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { listingSchema } from "./schemas";

describe("listingSchema", () => {
  test("parses a full listing including detail fields", () => {
    const listing = {
      id: "l1",
      title: "Cozy cabin",
      location: { city: "Aspen", country: "USA", lat: 39.19, lng: -106.82 },
      photos: ["https://example.com/a.jpg"],
      pricePerNight: 220,
      rating: 4.92,
      reviewCount: 88,
      isGuestFavorite: true,
      hostId: "h1",
      category: "Cabins",
      description: "A warm cabin in the pines.",
      propertyType: "Entire cabin",
      maxGuests: 4,
      bedrooms: 2,
      beds: 3,
      baths: 1,
      amenities: ["Wifi", "Kitchen"],
    };
    expect(listingSchema.parse(listing)).toMatchObject({ propertyType: "Entire cabin", maxGuests: 4 });
  });

  test("rejects a listing missing detail fields", () => {
    expect(() => listingSchema.parse({ id: "x" })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- schemas`
Expected: FAIL — `description`/`propertyType` etc. are unknown / stripped so `toMatchObject` fails (or parse fails).

- [ ] **Step 3: Extend the `Listing` interface and add new entities**

In `lib/types.ts`, replace the `Listing` interface and add the two new interfaces (keep `City`, `CATEGORIES`, `Category` unchanged):

```ts
export interface Listing {
  id: string;
  title: string;
  location: { city: string; country: string; lat: number; lng: number };
  photos: string[];
  pricePerNight: number;
  rating: number;
  reviewCount: number;
  isGuestFavorite: boolean;
  hostId: string;
  category: string;
  description: string;
  propertyType: string;
  maxGuests: number;
  bedrooms: number;
  beds: number;
  baths: number;
  amenities: string[];
}

export interface Host {
  id: string;
  name: string;
  avatar: string;
  isSuperhost: boolean;
  responseRate: number;
  joinedYear: number;
}

export interface Review {
  id: string;
  listingId: string;
  authorName: string;
  authorAvatar: string;
  date: string;
  rating: number;
  body: string;
}
```

- [ ] **Step 4: Extend `listingSchema`**

In `lib/api-client/schemas.ts`, add the detail fields to `listingSchema` (leave `listingsEnvelopeSchema` as-is):

```ts
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
  description: z.string(),
  propertyType: z.string(),
  maxGuests: z.number().int().positive(),
  bedrooms: z.number().int().nonnegative(),
  beds: z.number().int().nonnegative(),
  baths: z.number().nonnegative(),
  amenities: z.array(z.string()),
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- schemas`
Expected: PASS (2 tests). Note: the existing `lib/data/data.test.ts` and other suites will now FAIL because the seed lacks detail fields — that is expected and fixed in Task 2. Do not "fix" it here.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/api-client/schemas.ts lib/api-client/schemas.test.ts
git commit -m "feat: extend Listing with detail fields, add Host and Review types"
```

---

### Task 2: Seed listing detail fields, hosts, and reviews

**Files:**
- Modify: `lib/data/listings.ts`
- Create: `lib/data/hosts.ts`
- Create: `lib/data/reviews.ts`
- Modify: `lib/data/data.test.ts`

**Interfaces:**
- Consumes: `Listing`, `Host`, `Review` from Task 1.
- Produces: `listings` (now with detail fields + 5 photos each), `hosts: Host[]` (`h1`–`h16`), `reviews: Review[]` (≥2 per listing for `l1`).

- [ ] **Step 1: Write the failing test**

Replace `lib/data/data.test.ts` with:

```ts
import { describe, expect, test } from "vitest";
import { listings } from "./listings";
import { cities } from "./cities";
import { hosts } from "./hosts";
import { reviews } from "./reviews";
import { listingSchema } from "@/lib/api-client/schemas";
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

  test("every listing satisfies the listing schema", () => {
    for (const l of listings) {
      expect(() => listingSchema.parse(l)).not.toThrow();
    }
  });

  test("every listing has 5 photos, amenities, and a known category", () => {
    for (const l of listings) {
      expect(l.photos.length).toBe(5);
      expect(l.amenities.length).toBeGreaterThan(0);
      expect(allowedCategories).toContain(l.category);
    }
  });

  test("every listing references an existing host", () => {
    const hostIds = new Set(hosts.map((h) => h.id));
    for (const l of listings) {
      expect(hostIds.has(l.hostId)).toBe(true);
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

describe("seed reviews", () => {
  test("every review references an existing listing", () => {
    const listingIds = new Set(listings.map((l) => l.id));
    for (const r of reviews) {
      expect(listingIds.has(r.listingId)).toBe(true);
    }
  });

  test("listing l1 has at least two reviews", () => {
    expect(reviews.filter((r) => r.listingId === "l1").length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- data.test`
Expected: FAIL — `./hosts` and `./reviews` do not exist; listings lack detail fields.

- [ ] **Step 3: Add detail fields + 5 photos to every listing**

In `lib/data/listings.ts`, add a shared interior-photo set and append it to each listing's `photos`, and add the seven detail fields. Replace the file's top and every entry. Add near the top, below the existing `photo` helper:

```ts
const INTERIOR_PHOTOS = [
  photo("photo-1556912172-45b7abe8b7e1"),
  photo("photo-1560448204-e02f11c3d0e2"),
  photo("photo-1505691938895-1758d7feb511"),
  photo("photo-1522771739844-6a9f6d5f14af"),
];

const AMENITIES = ["Wifi", "Kitchen", "Free parking", "Self check-in", "Air conditioning", "Washer"];
```

Then for **each** of the 16 listings, change `photos: [photo("...")]` to `photos: [photo("..."), ...INTERIOR_PHOTOS]` and add the detail fields. Use these per-listing values (apply the same pattern to all 16; vary the prose/specs as shown):

```ts
// l1
{ id: "l1", title: "Cozy cabin in the pines", location: { city: "Aspen", country: "USA", lat: 39.19, lng: -106.82 }, photos: [photo("photo-1449158743715-0a90ebb6d2d8"), ...INTERIOR_PHOTOS], pricePerNight: 220, rating: 4.92, reviewCount: 88, isGuestFavorite: true, hostId: "h1", category: "Cabins",
  description: "A warm timber cabin tucked among tall pines, with a wood-burning stove, reading nook, and a deck overlooking the valley. Minutes from the trailhead.",
  propertyType: "Entire cabin", maxGuests: 4, bedrooms: 2, beds: 3, baths: 1, amenities: AMENITIES },
```

Apply the same structure to `l2`–`l16`. Give each a one- to two-sentence `description` fitting its title, a `propertyType` matching the title (e.g. `"Entire villa"`, `"Entire cottage"`, `"Tiny home"`, `"Entire loft"`, `"Entire home"`, `"Entire apartment"`), and plausible specs (`maxGuests` 2–8, `bedrooms` 1–4, `beds` 1–5, `baths` 1–3). Set `amenities: AMENITIES` for all (a shared list is acceptable for a mock). Keep every existing field (id, title, location, pricePerNight, rating, reviewCount, isGuestFavorite, hostId, category) exactly as it is today.

- [ ] **Step 4: Create the hosts seed**

Create `lib/data/hosts.ts`:

```ts
import type { Host } from "@/lib/types";

const avatar = (id: string) => `https://images.unsplash.com/${id}?w=200&q=80`;

export const hosts: Host[] = [
  { id: "h1", name: "Maya", avatar: avatar("photo-1494790108377-be9c29b29330"), isSuperhost: true, responseRate: 100, joinedYear: 2016 },
  { id: "h2", name: "Liam", avatar: avatar("photo-1500648767791-00dcc994a43e"), isSuperhost: true, responseRate: 98, joinedYear: 2017 },
  { id: "h3", name: "Sofia", avatar: avatar("photo-1438761681033-6461ffad8d80"), isSuperhost: false, responseRate: 92, joinedYear: 2019 },
  { id: "h4", name: "Noah", avatar: avatar("photo-1507003211169-0a1dd7228f2d"), isSuperhost: true, responseRate: 99, joinedYear: 2015 },
  { id: "h5", name: "Emma", avatar: avatar("photo-1544005313-94ddf0286df2"), isSuperhost: false, responseRate: 88, joinedYear: 2020 },
  { id: "h6", name: "Oliver", avatar: avatar("photo-1506794778202-cad84cf45f1d"), isSuperhost: true, responseRate: 97, joinedYear: 2016 },
  { id: "h7", name: "Ava", avatar: avatar("photo-1534528741775-53994a69daeb"), isSuperhost: false, responseRate: 90, joinedYear: 2021 },
  { id: "h8", name: "Ethan", avatar: avatar("photo-1492562080023-ab3db95bfbce"), isSuperhost: true, responseRate: 100, joinedYear: 2014 },
  { id: "h9", name: "Isabella", avatar: avatar("photo-1517841905240-472988babdf9"), isSuperhost: true, responseRate: 96, joinedYear: 2018 },
  { id: "h10", name: "Lucas", avatar: avatar("photo-1463453091185-61582044d556"), isSuperhost: false, responseRate: 85, joinedYear: 2022 },
  { id: "h11", name: "Mia", avatar: avatar("photo-1502823403499-6ccfcf4fb453"), isSuperhost: true, responseRate: 99, joinedYear: 2015 },
  { id: "h12", name: "Mason", avatar: avatar("photo-1519085360753-af0119f7cbe7"), isSuperhost: false, responseRate: 91, joinedYear: 2020 },
  { id: "h13", name: "Charlotte", avatar: avatar("photo-1531123897727-8f129e1688ce"), isSuperhost: true, responseRate: 98, joinedYear: 2017 },
  { id: "h14", name: "James", avatar: avatar("photo-1500648767791-00dcc994a43e"), isSuperhost: false, responseRate: 89, joinedYear: 2021 },
  { id: "h15", name: "Amelia", avatar: avatar("photo-1487412720507-e7ab37603c6f"), isSuperhost: true, responseRate: 100, joinedYear: 2016 },
  { id: "h16", name: "Benjamin", avatar: avatar("photo-1463453091185-61582044d556"), isSuperhost: true, responseRate: 95, joinedYear: 2018 },
];
```

- [ ] **Step 5: Create the reviews seed**

Create `lib/data/reviews.ts`. Provide at least 4 reviews for `l1` and 2 each for `l2`–`l16` (a small helper keeps it DRY):

```ts
import type { Review } from "@/lib/types";

const avatar = (id: string) => `https://images.unsplash.com/${id}?w=120&q=80`;

const BODIES = [
  "Absolutely stunning place. Spotless, well-stocked, and exactly as pictured. The host was responsive and thoughtful.",
  "A wonderful stay from start to finish. Great location, comfortable beds, and beautiful views every morning.",
  "We didn't want to leave. Cozy, quiet, and full of charming touches. Would book again in a heartbeat.",
  "Perfect getaway. Check-in was seamless and the space felt even better in person. Highly recommend.",
];

const NAMES = ["Sarah", "David", "Priya", "Marco", "Yuki", "Hannah"];

function reviewsFor(listingId: string, count: number, startIndex: number): Review[] {
  return Array.from({ length: count }, (_, i) => {
    const n = startIndex + i;
    return {
      id: `${listingId}-r${i + 1}`,
      listingId,
      authorName: NAMES[n % NAMES.length],
      authorAvatar: avatar(["photo-1438761681033-6461ffad8d80", "photo-1500648767791-00dcc994a43e", "photo-1534528741775-53994a69daeb"][n % 3]),
      date: ["March 2026", "February 2026", "January 2026", "December 2025"][i % 4],
      rating: 5,
      body: BODIES[n % BODIES.length],
    };
  });
}

export const reviews: Review[] = [
  ...reviewsFor("l1", 4, 0),
  ...Array.from({ length: 15 }, (_, i) => reviewsFor(`l${i + 2}`, 2, i)).flat(),
];
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- data.test`
Expected: PASS (all `seed listings`, `seed cities`, `seed reviews` tests green).

- [ ] **Step 7: Run the full suite to confirm no regressions**

Run: `npm test`
Expected: PASS — all prior suites green again now that the seed has detail fields.

- [ ] **Step 8: Commit**

```bash
git add lib/data/listings.ts lib/data/hosts.ts lib/data/reviews.ts lib/data/data.test.ts
git commit -m "feat: seed listing detail fields, hosts, and reviews"
```

---

### Task 3: Host & Review repositories

**Files:**
- Create: `lib/repositories/host-repository.ts`
- Create: `lib/repositories/mock/mock-host-repository.ts`
- Create: `lib/repositories/review-repository.ts`
- Create: `lib/repositories/mock/mock-review-repository.ts`
- Test: `lib/repositories/mock/mock-host-repository.test.ts`, `lib/repositories/mock/mock-review-repository.test.ts`

**Interfaces:**
- Consumes: `Host`, `Review`, seed `hosts`, `reviews`.
- Produces: `HostRepository { findById(id): Promise<Host | null> }` + `mockHostRepository`; `ReviewRepository { findByListingId(listingId): Promise<Review[]> }` + `mockReviewRepository`.

- [ ] **Step 1: Write the failing tests**

Create `lib/repositories/mock/mock-host-repository.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { mockHostRepository } from "./mock-host-repository";

describe("mockHostRepository", () => {
  test("findById returns the host when it exists", async () => {
    const host = await mockHostRepository.findById("h1");
    expect(host?.id).toBe("h1");
  });

  test("findById returns null when the host is missing", async () => {
    expect(await mockHostRepository.findById("nope")).toBeNull();
  });
});
```

Create `lib/repositories/mock/mock-review-repository.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { mockReviewRepository } from "./mock-review-repository";

describe("mockReviewRepository", () => {
  test("findByListingId returns only that listing's reviews", async () => {
    const result = await mockReviewRepository.findByListingId("l1");
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((r) => r.listingId === "l1")).toBe(true);
  });

  test("findByListingId returns an empty array for an unknown listing", async () => {
    expect(await mockReviewRepository.findByListingId("nope")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- mock-host-repository mock-review-repository`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Implement the interfaces**

Create `lib/repositories/host-repository.ts`:

```ts
import type { Host } from "@/lib/types";

export interface HostRepository {
  findById(id: string): Promise<Host | null>;
}
```

Create `lib/repositories/review-repository.ts`:

```ts
import type { Review } from "@/lib/types";

export interface ReviewRepository {
  findByListingId(listingId: string): Promise<Review[]>;
}
```

- [ ] **Step 4: Implement the mocks**

Create `lib/repositories/mock/mock-host-repository.ts`:

```ts
import type { Host } from "@/lib/types";
import { hosts } from "@/lib/data/hosts";
import type { HostRepository } from "../host-repository";

export const mockHostRepository: HostRepository = {
  async findById(id: string): Promise<Host | null> {
    return hosts.find((h) => h.id === id) ?? null;
  },
};
```

Create `lib/repositories/mock/mock-review-repository.ts`:

```ts
import type { Review } from "@/lib/types";
import { reviews } from "@/lib/data/reviews";
import type { ReviewRepository } from "../review-repository";

export const mockReviewRepository: ReviewRepository = {
  async findByListingId(listingId: string): Promise<Review[]> {
    return reviews.filter((r) => r.listingId === listingId);
  },
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- mock-host-repository mock-review-repository`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/repositories/host-repository.ts lib/repositories/review-repository.ts lib/repositories/mock/mock-host-repository.ts lib/repositories/mock/mock-review-repository.ts lib/repositories/mock/mock-host-repository.test.ts lib/repositories/mock/mock-review-repository.test.ts
git commit -m "feat: add host and review repositories with mock implementations"
```

---

### Task 4: Reservation pricing utility

**Files:**
- Create: `lib/reservation/pricing.ts`
- Test: `lib/reservation/pricing.test.ts`

**Interfaces:**
- Produces: `nightsBetween(checkIn: Date, checkOut: Date): number`; `calculatePriceBreakdown(pricePerNight: number, nights: number): PriceBreakdown` where `PriceBreakdown = { lineItems: PriceLineItem[]; total: number }` and `PriceLineItem = { label: string; amount: number }`; constants `CLEANING_FEE`, `SERVICE_FEE_RATE`.

- [ ] **Step 1: Write the failing test**

Create `lib/reservation/pricing.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { nightsBetween, calculatePriceBreakdown } from "./pricing";

describe("nightsBetween", () => {
  test("counts whole nights between two dates", () => {
    expect(nightsBetween(new Date(2026, 5, 1), new Date(2026, 5, 6))).toBe(5);
  });

  test("returns 0 when check-out is not after check-in", () => {
    expect(nightsBetween(new Date(2026, 5, 6), new Date(2026, 5, 6))).toBe(0);
  });
});

describe("calculatePriceBreakdown", () => {
  test("builds line items and a total for a multi-night stay", () => {
    const breakdown = calculatePriceBreakdown(220, 5);
    // 220*5 = 1100 nightly, 75 cleaning, round(0.14*1100)=154 service => 1329 total
    expect(breakdown.total).toBe(1329);
    expect(breakdown.lineItems[0]).toEqual({ label: "$220 x 5 nights", amount: 1100 });
    expect(breakdown.lineItems.map((i) => i.label)).toContain("Cleaning fee");
    expect(breakdown.lineItems.map((i) => i.label)).toContain("Airbnb service fee");
  });

  test("uses singular night label for a one-night stay", () => {
    expect(calculatePriceBreakdown(100, 1).lineItems[0].label).toBe("$100 x 1 night");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- pricing`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement pricing**

Create `lib/reservation/pricing.ts`:

```ts
export interface PriceLineItem {
  label: string;
  amount: number;
}

export interface PriceBreakdown {
  lineItems: PriceLineItem[];
  total: number;
}

export const CLEANING_FEE = 75;
export const SERVICE_FEE_RATE = 0.14;

const MS_PER_NIGHT = 86_400_000;

export function nightsBetween(checkIn: Date, checkOut: Date): number {
  const diff = checkOut.getTime() - checkIn.getTime();
  return Math.max(0, Math.round(diff / MS_PER_NIGHT));
}

export function calculatePriceBreakdown(pricePerNight: number, nights: number): PriceBreakdown {
  const nightlySubtotal = pricePerNight * nights;
  const serviceFee = Math.round(nightlySubtotal * SERVICE_FEE_RATE);
  const lineItems: PriceLineItem[] = [
    { label: `$${pricePerNight} x ${nights} night${nights === 1 ? "" : "s"}`, amount: nightlySubtotal },
    { label: "Cleaning fee", amount: CLEANING_FEE },
    { label: "Airbnb service fee", amount: serviceFee },
  ];
  return { lineItems, total: nightlySubtotal + CLEANING_FEE + serviceFee };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- pricing`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/reservation/pricing.ts lib/reservation/pricing.test.ts
git commit -m "feat: add reservation pricing utility"
```

---

### Task 5: ListingGallery component

**Files:**
- Create: `components/features/listing-gallery.tsx`
- Test: `components/features/listing-gallery.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks beyond `Listing.photos`.
- Produces: `ListingGallery({ photos, title }: { photos: string[]; title: string })`.

- [ ] **Step 1: Write the failing test**

Create `components/features/listing-gallery.test.tsx`:

```tsx
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { ListingGallery } from "./listing-gallery";

const photos = ["/a.jpg", "/b.jpg", "/c.jpg", "/d.jpg", "/e.jpg"];

describe("ListingGallery", () => {
  test("renders an image for each photo with the listing title as alt", () => {
    render(<ListingGallery photos={photos} title="Cozy cabin" />);
    const images = screen.getAllByRole("img");
    expect(images.length).toBe(5);
    expect(images[0]).toHaveAttribute("alt", expect.stringContaining("Cozy cabin"));
  });

  test("renders gracefully when only one photo is provided", () => {
    render(<ListingGallery photos={["/only.jpg"]} title="Solo" />);
    expect(screen.getAllByRole("img").length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- listing-gallery`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the gallery**

Create `components/features/listing-gallery.tsx`:

```tsx
import Image from "next/image";

export interface ListingGalleryProps {
  photos: string[];
  title: string;
}

export function ListingGallery({ photos, title }: ListingGalleryProps) {
  const mosaic = photos.slice(0, 5);
  return (
    <section
      aria-label="Photo gallery"
      className="grid h-[320px] grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-xl md:h-[480px]"
    >
      {mosaic.map((src, i) => (
        <div
          key={src + i}
          className={
            i === 0
              ? "relative col-span-2 row-span-2"
              : "relative hidden md:block"
          }
        >
          <Image
            src={src}
            alt={`${title} — photo ${i + 1}`}
            fill
            sizes="(max-width: 744px) 100vw, 50vw"
            className="object-cover"
          />
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- listing-gallery`
Expected: PASS. (jsdom renders all mapped images; `hidden md:block` is CSS-only, so the element count is 5.)

- [ ] **Step 5: Commit**

```bash
git add components/features/listing-gallery.tsx components/features/listing-gallery.test.tsx
git commit -m "feat: add ListingGallery photo mosaic"
```

---

### Task 6: AmenityList component

**Files:**
- Create: `components/features/amenity-list.tsx`
- Test: `components/features/amenity-list.test.tsx`

**Interfaces:**
- Produces: `AmenityList({ amenities }: { amenities: string[] })`.

- [ ] **Step 1: Write the failing test**

Create `components/features/amenity-list.test.tsx`:

```tsx
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { AmenityList } from "./amenity-list";

describe("AmenityList", () => {
  test("renders a heading and one row per amenity", () => {
    render(<AmenityList amenities={["Wifi", "Kitchen", "Washer"]} />);
    expect(screen.getByRole("heading", { name: /what this place offers/i })).toBeInTheDocument();
    expect(screen.getByText("Wifi")).toBeInTheDocument();
    expect(screen.getByText("Kitchen")).toBeInTheDocument();
    expect(screen.getByText("Washer")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- amenity-list`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the amenity list**

Create `components/features/amenity-list.tsx`:

```tsx
export interface AmenityListProps {
  amenities: string[];
}

export function AmenityList({ amenities }: AmenityListProps) {
  return (
    <section className="border-y border-hairline py-8">
      <h2 className="mb-4 text-display-sm text-ink">What this place offers</h2>
      <ul className="grid grid-cols-1 sm:grid-cols-2">
        {amenities.map((amenity) => (
          <li key={amenity} className="py-3 text-body-md text-ink">
            {amenity}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- amenity-list`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/features/amenity-list.tsx components/features/amenity-list.test.tsx
git commit -m "feat: add AmenityList section"
```

---

### Task 7: ReviewsGrid component

**Files:**
- Create: `components/features/reviews-grid.tsx`
- Test: `components/features/reviews-grid.test.tsx`

**Interfaces:**
- Consumes: `Review` type from Task 1.
- Produces: `ReviewsGrid({ reviews }: { reviews: Review[] })`.

- [ ] **Step 1: Write the failing test**

Create `components/features/reviews-grid.test.tsx`:

```tsx
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReviewsGrid } from "./reviews-grid";
import type { Review } from "@/lib/types";

const reviews: Review[] = [
  { id: "r1", listingId: "l1", authorName: "Sarah", authorAvatar: "/s.jpg", date: "March 2026", rating: 5, body: "Lovely stay." },
  { id: "r2", listingId: "l1", authorName: "David", authorAvatar: "/d.jpg", date: "Feb 2026", rating: 5, body: "Great place." },
];

describe("ReviewsGrid", () => {
  test("renders an excerpt card per review with author and body", () => {
    render(<ReviewsGrid reviews={reviews} />);
    expect(screen.getByText("Sarah")).toBeInTheDocument();
    expect(screen.getByText("Lovely stay.")).toBeInTheDocument();
    expect(screen.getByText("David")).toBeInTheDocument();
  });

  test("renders an empty-state message when there are no reviews", () => {
    render(<ReviewsGrid reviews={[]} />);
    expect(screen.getByText(/no reviews yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- reviews-grid`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the reviews grid**

Create `components/features/reviews-grid.tsx`:

```tsx
import Image from "next/image";
import type { Review } from "@/lib/types";

export interface ReviewsGridProps {
  reviews: Review[];
}

export function ReviewsGrid({ reviews }: ReviewsGridProps) {
  if (reviews.length === 0) {
    return <p className="text-body-md text-muted">No reviews yet.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-x-12 gap-y-8 md:grid-cols-2">
      {reviews.map((review) => (
        <article key={review.id} className="flex flex-col gap-2">
          <header className="flex items-center gap-3">
            <span className="relative h-10 w-10 overflow-hidden rounded-full bg-surface-strong">
              <Image src={review.authorAvatar} alt={review.authorName} fill sizes="40px" className="object-cover" />
            </span>
            <span className="flex flex-col">
              <span className="text-title-sm text-ink">{review.authorName}</span>
              <span className="text-body-sm text-muted">{review.date}</span>
            </span>
          </header>
          <p className="line-clamp-3 text-body-md text-body">{review.body}</p>
        </article>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- reviews-grid`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/features/reviews-grid.tsx components/features/reviews-grid.test.tsx
git commit -m "feat: add ReviewsGrid"
```

---

### Task 8: HostCard component (design-system atom)

**Files:**
- Create: `components/design-system/host-card.tsx`
- Modify: `components/design-system/index.ts`
- Test: `components/design-system/host-card.test.tsx`

**Interfaces:**
- Consumes: `Host` type from Task 1; existing `Button` from this barrel.
- Produces: `HostCard({ host }: { host: Host })`, exported from `@/components/design-system`.

- [ ] **Step 1: Write the failing test**

Create `components/design-system/host-card.test.tsx`:

```tsx
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { HostCard } from "./host-card";
import type { Host } from "@/lib/types";

const host: Host = { id: "h1", name: "Maya", avatar: "/m.jpg", isSuperhost: true, responseRate: 100, joinedYear: 2016 };

describe("HostCard", () => {
  test("shows the host name, superhost badge, response rate, and contact CTA", () => {
    render(<HostCard host={host} />);
    expect(screen.getByText(/hosted by maya/i)).toBeInTheDocument();
    expect(screen.getByText(/superhost/i)).toBeInTheDocument();
    expect(screen.getByText(/100%/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /contact host/i })).toBeInTheDocument();
  });

  test("omits the superhost badge for a non-superhost", () => {
    render(<HostCard host={{ ...host, isSuperhost: false }} />);
    expect(screen.queryByText(/superhost/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- host-card`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement HostCard**

Create `components/design-system/host-card.tsx`:

```tsx
import Image from "next/image";
import type { Host } from "@/lib/types";
import { Button } from "./button";

export interface HostCardProps {
  host: Host;
}

export function HostCard({ host }: HostCardProps) {
  return (
    <section className="rounded-md border border-hairline bg-canvas p-6 shadow-airbnb">
      <div className="flex items-center gap-4">
        <span className="relative h-14 w-14 overflow-hidden rounded-full bg-surface-strong">
          <Image src={host.avatar} alt={host.name} fill sizes="56px" className="object-cover" />
        </span>
        <div className="flex flex-col">
          <span className="text-title-md text-ink">Hosted by {host.name}</span>
          {host.isSuperhost && <span className="text-body-sm text-muted">Superhost · Joined {host.joinedYear}</span>}
          {!host.isSuperhost && <span className="text-body-sm text-muted">Joined {host.joinedYear}</span>}
        </div>
      </div>
      <p className="mt-4 text-body-sm text-body">Response rate: {host.responseRate}%</p>
      <div className="mt-4">
        <Button variant="secondary" className="w-full">Contact host</Button>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Export from the barrel**

In `components/design-system/index.ts`, add:

```ts
export { HostCard } from "./host-card";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- host-card`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/design-system/host-card.tsx components/design-system/host-card.test.tsx components/design-system/index.ts
git commit -m "feat: add HostCard design-system atom"
```

---

### Task 9: GuestStepper component

**Files:**
- Create: `components/features/guest-stepper.tsx`
- Test: `components/features/guest-stepper.test.tsx`

**Interfaces:**
- Produces: `GuestCounts = { adults: number; children: number }`; `GuestStepper({ value, onChange, maxGuests }: { value: GuestCounts; onChange: (next: GuestCounts) => void; maxGuests: number })`. Total guests = `adults + children`; cannot decrement adults below 1, cannot exceed `maxGuests` in total.

- [ ] **Step 1: Write the failing test**

Create `components/features/guest-stepper.test.tsx`:

```tsx
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GuestStepper, type GuestCounts } from "./guest-stepper";

const value: GuestCounts = { adults: 1, children: 0 };

describe("GuestStepper", () => {
  test("increments adults when the add button is pressed", async () => {
    const onChange = vi.fn();
    render(<GuestStepper value={value} onChange={onChange} maxGuests={4} />);
    await userEvent.click(screen.getByRole("button", { name: /increase adults/i }));
    expect(onChange).toHaveBeenCalledWith({ adults: 2, children: 0 });
  });

  test("disables decreasing adults below one", () => {
    render(<GuestStepper value={value} onChange={vi.fn()} maxGuests={4} />);
    expect(screen.getByRole("button", { name: /decrease adults/i })).toBeDisabled();
  });

  test("disables increasing when the total reaches maxGuests", () => {
    render(<GuestStepper value={{ adults: 2, children: 2 }} onChange={vi.fn()} maxGuests={4} />);
    expect(screen.getByRole("button", { name: /increase adults/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /increase children/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- guest-stepper`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the stepper**

Create `components/features/guest-stepper.tsx`:

```tsx
"use client";

import { cn } from "@/lib/utils";

export interface GuestCounts {
  adults: number;
  children: number;
}

export interface GuestStepperProps {
  value: GuestCounts;
  onChange: (next: GuestCounts) => void;
  maxGuests: number;
}

const circleButton =
  "flex h-8 w-8 items-center justify-center rounded-full border border-border-strong text-ink disabled:cursor-not-allowed disabled:opacity-40";

function Row({
  label,
  count,
  onDecrease,
  onIncrease,
  canDecrease,
  canIncrease,
}: {
  label: string;
  count: number;
  onDecrease: () => void;
  onIncrease: () => void;
  canDecrease: boolean;
  canIncrease: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-body-md text-ink">{label}</span>
      <span className="flex items-center gap-4">
        <button type="button" aria-label={`Decrease ${label.toLowerCase()}`} disabled={!canDecrease} onClick={onDecrease} className={circleButton}>
          −
        </button>
        <span className="w-6 text-center text-body-md text-ink">{count}</span>
        <button type="button" aria-label={`Increase ${label.toLowerCase()}`} disabled={!canIncrease} onClick={onIncrease} className={cn(circleButton)}>
          +
        </button>
      </span>
    </div>
  );
}

export function GuestStepper({ value, onChange, maxGuests }: GuestStepperProps) {
  const total = value.adults + value.children;
  const canAddMore = total < maxGuests;
  return (
    <div className="flex flex-col">
      <Row
        label="Adults"
        count={value.adults}
        canDecrease={value.adults > 1}
        canIncrease={canAddMore}
        onDecrease={() => onChange({ ...value, adults: value.adults - 1 })}
        onIncrease={() => onChange({ ...value, adults: value.adults + 1 })}
      />
      <Row
        label="Children"
        count={value.children}
        canDecrease={value.children > 0}
        canIncrease={canAddMore}
        onDecrease={() => onChange({ ...value, children: value.children - 1 })}
        onIncrease={() => onChange({ ...value, children: value.children + 1 })}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- guest-stepper`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/features/guest-stepper.tsx components/features/guest-stepper.test.tsx
git commit -m "feat: add GuestStepper"
```

---

### Task 10: BookingCalendar component

**Files:**
- Create: `components/features/booking-calendar.tsx`
- Test: `components/features/booking-calendar.test.tsx`

**Interfaces:**
- Consumes: `DatePickerDay` from `@/components/design-system`.
- Produces: `BookingCalendar({ month, checkIn, checkOut, minDate, onSelect, onMonthChange }: { month: Date; checkIn: Date | null; checkOut: Date | null; minDate?: Date; onSelect: (date: Date) => void; onMonthChange: (next: Date) => void })`. Renders the weekday header + a grid of `DatePickerDay` for the displayed month; days before `minDate` (default: start of today) are disabled; clicking a day calls `onSelect` with a `Date` at midnight.

- [ ] **Step 1: Write the failing test**

Create `components/features/booking-calendar.test.tsx`:

```tsx
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BookingCalendar } from "./booking-calendar";

// June 2026 has 30 days; min date well in the past so all days are enabled.
const month = new Date(2026, 5, 1);
const minDate = new Date(2026, 0, 1);

describe("BookingCalendar", () => {
  test("renders every day of the displayed month", () => {
    render(<BookingCalendar month={month} checkIn={null} checkOut={null} minDate={minDate} onSelect={vi.fn()} onMonthChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "31" })).not.toBeInTheDocument();
  });

  test("calls onSelect with the clicked date", async () => {
    const onSelect = vi.fn();
    render(<BookingCalendar month={month} checkIn={null} checkOut={null} minDate={minDate} onSelect={onSelect} onMonthChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "10" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    const arg = onSelect.mock.calls[0][0] as Date;
    expect(arg.getFullYear()).toBe(2026);
    expect(arg.getMonth()).toBe(5);
    expect(arg.getDate()).toBe(10);
  });

  test("advances the month when the next control is pressed", async () => {
    const onMonthChange = vi.fn();
    render(<BookingCalendar month={month} checkIn={null} checkOut={null} minDate={minDate} onSelect={vi.fn()} onMonthChange={onMonthChange} />);
    await userEvent.click(screen.getByRole("button", { name: /next month/i }));
    const arg = onMonthChange.mock.calls[0][0] as Date;
    expect(arg.getMonth()).toBe(6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- booking-calendar`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the calendar**

Create `components/features/booking-calendar.tsx`:

```tsx
"use client";

import { DatePickerDay } from "@/components/design-system";

export interface BookingCalendarProps {
  month: Date;
  checkIn: Date | null;
  checkOut: Date | null;
  minDate?: Date;
  onSelect: (date: Date) => void;
  onMonthChange: (next: Date) => void;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function sameDay(a: Date | null, b: Date): boolean {
  return a !== null && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function BookingCalendar({ month, checkIn, checkOut, minDate, onSelect, onMonthChange }: BookingCalendarProps) {
  const floor = startOfDay(minDate ?? new Date());
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const monthLabel = month.toLocaleString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="w-full">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" aria-label="Previous month" onClick={() => onMonthChange(new Date(year, monthIndex - 1, 1))} className="px-2 text-ink">
          ‹
        </button>
        <span className="text-title-sm text-ink">{monthLabel}</span>
        <button type="button" aria-label="Next month" onClick={() => onMonthChange(new Date(year, monthIndex + 1, 1))} className="px-2 text-ink">
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <span key={w} className="flex h-8 items-center justify-center text-caption-sm text-muted">
            {w}
          </span>
        ))}
        {Array.from({ length: firstWeekday }).map((_, i) => (
          <span key={`pad-${i}`} aria-hidden className="h-10 w-10" />
        ))}
        {days.map((day) => {
          const date = new Date(year, monthIndex, day);
          const disabled = startOfDay(date).getTime() < floor.getTime();
          const selected = sameDay(checkIn, date) || sameDay(checkOut, date);
          const inRange =
            checkIn !== null &&
            checkOut !== null &&
            startOfDay(date).getTime() > startOfDay(checkIn).getTime() &&
            startOfDay(date).getTime() < startOfDay(checkOut).getTime();
          return (
            <DatePickerDay
              key={day}
              day={day}
              disabled={disabled}
              selected={selected}
              inRange={inRange}
              onSelect={() => onSelect(date)}
            />
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- booking-calendar`
Expected: PASS. (Note: `DatePickerDay` renders `disabled` cells as `<button disabled>`; `getByRole("button", { name: "30" })` still finds disabled buttons.)

- [ ] **Step 5: Commit**

```bash
git add components/features/booking-calendar.tsx components/features/booking-calendar.test.tsx
git commit -m "feat: add BookingCalendar month grid"
```

---

### Task 11: ReservationCard client island

**Files:**
- Create: `components/features/reservation-card.tsx`
- Test: `components/features/reservation-card.test.tsx`

**Interfaces:**
- Consumes: `BookingCalendar`, `GuestStepper` + `GuestCounts` (Tasks 9–10); `nightsBetween`, `calculatePriceBreakdown` (Task 4); `Button` from `@/components/design-system`.
- Produces: `ReservationCard({ pricePerNight, maxGuests }: { pricePerNight: number; maxGuests: number })`. Range selection: first click sets check-in; second click after it sets check-out; a click before the current check-in (or when both are set) restarts the range. Reserve is disabled until both dates are chosen; when both are set it shows the price breakdown and total.

- [ ] **Step 1: Write the failing test**

Create `components/features/reservation-card.test.tsx`:

```tsx
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReservationCard } from "./reservation-card";

describe("ReservationCard", () => {
  test("shows the nightly price and a disabled Reserve button before dates are chosen", () => {
    render(<ReservationCard pricePerNight={220} maxGuests={4} />);
    expect(screen.getByText(/\$220/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^reserve$/i })).toBeDisabled();
  });

  test("enables Reserve and shows a total once a date range is selected", async () => {
    render(<ReservationCard pricePerNight={220} maxGuests={4} />);
    // Pick two days in the currently displayed month (1 and 6 are safe future-or-disabled?
    // Use buttons that are enabled: choose the two largest day numbers present.
    const dayButtons = screen
      .getAllByRole("button")
      .filter((b) => /^\d+$/.test(b.textContent ?? "") && !(b as HTMLButtonElement).disabled);
    expect(dayButtons.length).toBeGreaterThanOrEqual(2);
    await userEvent.click(dayButtons[dayButtons.length - 2]);
    await userEvent.click(dayButtons[dayButtons.length - 1]);
    expect(screen.getByRole("button", { name: /^reserve$/i })).toBeEnabled();
    expect(screen.getByText(/total/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- reservation-card`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the reservation card**

Create `components/features/reservation-card.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/design-system";
import { BookingCalendar } from "./booking-calendar";
import { GuestStepper, type GuestCounts } from "./guest-stepper";
import { nightsBetween, calculatePriceBreakdown } from "@/lib/reservation/pricing";

export interface ReservationCardProps {
  pricePerNight: number;
  maxGuests: number;
}

function startOfThisMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export function ReservationCard({ pricePerNight, maxGuests }: ReservationCardProps) {
  const [month, setMonth] = useState<Date>(startOfThisMonth);
  const [checkIn, setCheckIn] = useState<Date | null>(null);
  const [checkOut, setCheckOut] = useState<Date | null>(null);
  const [guests, setGuests] = useState<GuestCounts>({ adults: 1, children: 0 });

  function handleSelect(date: Date) {
    if (checkIn === null || checkOut !== null || date.getTime() <= checkIn.getTime()) {
      setCheckIn(date);
      setCheckOut(null);
      return;
    }
    setCheckOut(date);
  }

  const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;
  const breakdown = nights > 0 ? calculatePriceBreakdown(pricePerNight, nights) : null;

  return (
    <aside className="rounded-md border border-hairline bg-canvas p-6 shadow-airbnb">
      <p className="mb-4 text-display-md text-ink">
        ${pricePerNight} <span className="text-body-md text-muted">night</span>
      </p>

      <BookingCalendar
        month={month}
        checkIn={checkIn}
        checkOut={checkOut}
        onSelect={handleSelect}
        onMonthChange={setMonth}
      />

      <div className="mt-4 border-t border-hairline pt-2">
        <GuestStepper value={guests} onChange={setGuests} maxGuests={maxGuests} />
      </div>

      <Button className="mt-4 w-full" disabled={breakdown === null}>
        Reserve
      </Button>
      <p className="mt-2 text-center text-body-sm text-muted">You won&apos;t be charged yet</p>

      {breakdown && (
        <dl className="mt-4 flex flex-col gap-2">
          {breakdown.lineItems.map((item) => (
            <div key={item.label} className="flex items-center justify-between text-body-sm text-body">
              <dt>{item.label}</dt>
              <dd>${item.amount}</dd>
            </div>
          ))}
          <div className="mt-2 flex items-center justify-between border-t border-hairline pt-2 text-title-sm text-ink">
            <dt>Total</dt>
            <dd>${breakdown.total}</dd>
          </div>
        </dl>
      )}
    </aside>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- reservation-card`
Expected: PASS. (If the current month has fewer than two enabled future days near month-end, the test selects the last two enabled day buttons, which always exist for the displayed month.)

- [ ] **Step 5: Commit**

```bash
git add components/features/reservation-card.tsx components/features/reservation-card.test.tsx
git commit -m "feat: add ReservationCard island with calendar, stepper, and pricing"
```

---

### Task 12: ListingOverview header section

**Files:**
- Create: `components/features/listing-overview.tsx`
- Test: `components/features/listing-overview.test.tsx`

**Interfaces:**
- Consumes: `Listing` type.
- Produces: `ListingOverview({ listing }: { listing: Listing })` — renders the H1 title, a location line, a specs line (propertyType · guests · bedrooms · beds · baths), and an inline rating summary (`rating · reviewCount reviews`).

- [ ] **Step 1: Write the failing test**

Create `components/features/listing-overview.test.tsx`:

```tsx
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { ListingOverview } from "./listing-overview";
import type { Listing } from "@/lib/types";

const listing: Listing = {
  id: "l1", title: "Cozy cabin in the pines",
  location: { city: "Aspen", country: "USA", lat: 39.19, lng: -106.82 },
  photos: ["/a.jpg"], pricePerNight: 220, rating: 4.92, reviewCount: 88,
  isGuestFavorite: true, hostId: "h1", category: "Cabins",
  description: "Warm cabin.", propertyType: "Entire cabin",
  maxGuests: 4, bedrooms: 2, beds: 3, baths: 1, amenities: ["Wifi"],
};

describe("ListingOverview", () => {
  test("renders the title as a heading", () => {
    render(<ListingOverview listing={listing} />);
    expect(screen.getByRole("heading", { level: 1, name: /cozy cabin in the pines/i })).toBeInTheDocument();
  });

  test("shows the specs line and rating summary", () => {
    render(<ListingOverview listing={listing} />);
    expect(screen.getByText(/entire cabin/i)).toBeInTheDocument();
    expect(screen.getByText(/4 guests/i)).toBeInTheDocument();
    expect(screen.getByText(/88 reviews/i)).toBeInTheDocument();
    expect(screen.getByText(/aspen, usa/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- listing-overview`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the overview**

Create `components/features/listing-overview.tsx`:

```tsx
import type { Listing } from "@/lib/types";

export interface ListingOverviewProps {
  listing: Listing;
}

export function ListingOverview({ listing }: ListingOverviewProps) {
  const specs = [
    listing.propertyType,
    `${listing.maxGuests} guests`,
    `${listing.bedrooms} bedroom${listing.bedrooms === 1 ? "" : "s"}`,
    `${listing.beds} bed${listing.beds === 1 ? "" : "s"}`,
    `${listing.baths} bath${listing.baths === 1 ? "" : "s"}`,
  ].join(" · ");

  return (
    <header className="flex flex-col gap-1 py-6">
      <h1 className="text-display-xl text-ink">{listing.title}</h1>
      <p className="text-body-md text-ink">{specs}</p>
      <p className="text-body-sm text-ink">
        <span aria-hidden>★ </span>
        {listing.rating.toFixed(2)} · {listing.reviewCount} reviews ·{" "}
        <span className="text-muted">{listing.location.city}, {listing.location.country}</span>
      </p>
    </header>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- listing-overview`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/features/listing-overview.tsx components/features/listing-overview.test.tsx
git commit -m "feat: add ListingOverview header"
```

---

### Task 13: Listing detail page (Server Component)

**Files:**
- Create: `app/rooms/[id]/page.tsx`
- Create: `app/rooms/[id]/not-found.tsx`
- Test: `app/rooms/[id]/page.test.tsx`

**Interfaces:**
- Consumes: `mockListingRepository` (`findById`), `mockHostRepository`, `mockReviewRepository`; `TopNav`, `Footer`, `RatingDisplay`, `HostCard` from `@/components/design-system`; `ListingGallery`, `ListingOverview`, `AmenityList`, `ReviewsGrid`, `ReservationCard` from `components/features`.
- Produces: default-exported async `RoomPage({ params }: { params: Promise<{ id: string }> })`.

- [ ] **Step 1: Write the failing test**

Create `app/rooms/[id]/page.test.tsx`:

```tsx
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import RoomPage from "./page";

describe("RoomPage", () => {
  test("renders the listing title, gallery, amenities, and reservation card for a known id", async () => {
    const ui = await RoomPage({ params: Promise.resolve({ id: "l1" }) });
    render(ui);
    expect(screen.getByRole("heading", { level: 1, name: /cozy cabin in the pines/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /what this place offers/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^reserve$/i })).toBeInTheDocument();
  });

  test("calls notFound for an unknown id", async () => {
    await expect(RoomPage({ params: Promise.resolve({ id: "does-not-exist" }) })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- rooms`
Expected: FAIL — page does not exist.

- [ ] **Step 3: Implement the not-found page**

Create `app/rooms/[id]/not-found.tsx`:

```tsx
import Link from "next/link";
import { Button } from "@/components/design-system";

export default function ListingNotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-[680px] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-display-lg text-ink">We can&apos;t find that place</h1>
      <p className="text-body-md text-muted">The listing you&apos;re looking for may have been removed.</p>
      <Link href="/">
        <Button>Back to home</Button>
      </Link>
    </main>
  );
}
```

- [ ] **Step 4: Implement the page**

Create `app/rooms/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { mockListingRepository } from "@/lib/repositories/mock/mock-listing-repository";
import { mockHostRepository } from "@/lib/repositories/mock/mock-host-repository";
import { mockReviewRepository } from "@/lib/repositories/mock/mock-review-repository";
import { TopNav, Footer, RatingDisplay, HostCard } from "@/components/design-system";
import { ListingGallery } from "@/components/features/listing-gallery";
import { ListingOverview } from "@/components/features/listing-overview";
import { AmenityList } from "@/components/features/amenity-list";
import { ReviewsGrid } from "@/components/features/reviews-grid";
import { ReservationCard } from "@/components/features/reservation-card";

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listing = await mockListingRepository.findById(id);
  if (!listing) notFound();

  const [host, reviews] = await Promise.all([
    mockHostRepository.findById(listing.hostId),
    mockReviewRepository.findByListingId(listing.id),
  ]);

  return (
    <div className="min-h-screen bg-canvas">
      <TopNav active="homes" />
      <main className="mx-auto max-w-[1080px] px-6 pb-16">
        <ListingOverview listing={listing} />
        <ListingGallery photos={listing.photos} title={listing.title} />

        <div className="mt-8 grid grid-cols-1 gap-12 lg:grid-cols-[1.7fr_1fr]">
          <div className="flex flex-col">
            <section className="border-b border-hairline pb-8">
              <h2 className="mb-3 text-display-sm text-ink">About this place</h2>
              <p className="text-body-md text-body">{listing.description}</p>
            </section>

            <AmenityList amenities={listing.amenities} />

            {host && (
              <div className="border-b border-hairline py-8">
                <HostCard host={host} />
              </div>
            )}

            <section className="pt-8">
              <RatingDisplay value={listing.rating} />
              <p className="mb-6 mt-2 text-center text-body-sm text-muted">
                Guest favorite · {listing.reviewCount} reviews
              </p>
              <ReviewsGrid reviews={reviews} />
            </section>
          </div>

          <div className="lg:sticky lg:top-24 lg:self-start">
            <ReservationCard pricePerNight={listing.pricePerNight} maxGuests={listing.maxGuests} />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- rooms`
Expected: PASS (2 tests). `notFound()` throws internally, satisfying the rejects assertion.

- [ ] **Step 6: Run the full unit suite**

Run: `npm test`
Expected: PASS — all suites green.

- [ ] **Step 7: Commit**

```bash
git add app/rooms/[id]/page.tsx app/rooms/[id]/not-found.tsx app/rooms/[id]/page.test.tsx
git commit -m "feat: add /rooms/[id] listing detail page"
```

---

### Task 14: Link property cards to detail + E2E

**Files:**
- Modify: `components/design-system/property-card.tsx`
- Modify: `components/design-system/property-card.test.tsx`
- Create: `e2e/listing-detail.spec.ts`

**Interfaces:**
- Consumes: the `/rooms/[id]` route from Task 13.
- Produces: `PropertyCard` whose title/photo link to `/rooms/${listing.id}` (heart button stays outside the anchor so the HTML is valid).

- [ ] **Step 1: Add a failing link assertion to the property-card test**

Append to `components/design-system/property-card.test.tsx` a test (keep the existing tests). First read the current file to match its imports, then add:

```tsx
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
// (existing imports remain)

test("links to the listing detail page", () => {
  const listing = {
    id: "l1", title: "Cozy cabin", location: { city: "Aspen", country: "USA", lat: 0, lng: 0 },
    photos: ["/a.jpg"], pricePerNight: 220, rating: 4.92, reviewCount: 88,
    isGuestFavorite: false, hostId: "h1", category: "Cabins",
    description: "x", propertyType: "Entire cabin", maxGuests: 2, bedrooms: 1, beds: 1, baths: 1, amenities: ["Wifi"],
  };
  render(<PropertyCard listing={listing} />);
  expect(screen.getByRole("link", { name: /cozy cabin/i })).toHaveAttribute("href", "/rooms/l1");
});
```

If `PropertyCard` is not already imported in the test file, add `import { PropertyCard } from "./property-card";` and `import type { Listing } from "@/lib/types";` (type the object as `Listing`). Match whatever the existing file already imports — do not duplicate imports.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- property-card`
Expected: FAIL — no link role / wrong href.

- [ ] **Step 3: Restructure PropertyCard to wrap content in a link**

Replace `components/design-system/property-card.tsx` with (heart button is a sibling of the link, both inside the `article`'s relative photo box stays — restructure so the `Link` wraps photo + meta and the heart sits as an absolutely-positioned sibling within `article`):

```tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Listing } from "@/lib/types";
import { GuestFavoriteBadge } from "./badges";

export function PropertyCard({ listing }: { listing: Listing }) {
  const [saved, setSaved] = useState(false);
  return (
    <article className="relative flex flex-col gap-2">
      <Link href={`/rooms/${listing.id}`} className="flex flex-col gap-2">
        <div className="relative aspect-square w-full overflow-hidden rounded-md">
          <Image
            src={listing.photos[0]}
            alt={listing.title}
            fill
            sizes="(max-width: 744px) 100vw, 25vw"
            className="object-cover"
          />
          {listing.isGuestFavorite && (
            <div className="absolute left-3 top-3">
              <GuestFavoriteBadge />
            </div>
          )}
        </div>
        <div className="flex items-start justify-between">
          <h3 className="text-title-sm text-ink">{listing.title}</h3>
          <span className="flex items-center gap-1 text-body-sm text-ink">
            <span aria-hidden>★</span>
            {listing.rating.toFixed(2)}
          </span>
        </div>
        <p className="text-body-sm text-muted">{listing.location.city}, {listing.location.country}</p>
        <p className="text-body-sm text-ink">
          <span className="font-semibold">${listing.pricePerNight}</span> night
        </p>
      </Link>
      <button
        type="button"
        aria-label={saved ? "Remove from wishlist" : "Save to wishlist"}
        onClick={() => setSaved((s) => !s)}
        className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden
          fill={saved ? "var(--color-rausch)" : "rgba(0,0,0,0.5)"}
          stroke="white" strokeWidth="2">
          <path d="M12 21s-7-4.35-9.5-8.5C1 9 2.5 5.5 6 5.5c2 0 3.2 1.2 4 2.3.8-1.1 2-2.3 4-2.3 3.5 0 5 3.5 3.5 7-2.5 4.15-9.5 8.5-9.5 8.5z" />
        </svg>
      </button>
    </article>
  );
}
```

- [ ] **Step 4: Run the property-card tests to verify they pass**

Run: `npm test -- property-card`
Expected: PASS — existing save/aria tests still pass and the new link test passes. The accessible name of the link is the title (`getByRole("link", { name: /cozy cabin/i })`).

- [ ] **Step 5: Write the E2E spec**

Create `e2e/listing-detail.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("navigates from the homepage to a listing detail and selects dates", async ({ page }) => {
  await page.goto("/");
  // Click the first property card link (title links carry /rooms/).
  await page.locator('a[href^="/rooms/"]').first().click();
  await expect(page).toHaveURL(/\/rooms\//);

  // Detail content is present.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: /what this place offers/i })).toBeVisible();

  // Reserve starts disabled.
  const reserve = page.getByRole("button", { name: /^reserve$/i });
  await expect(reserve).toBeDisabled();

  // Select two enabled day cells, then Reserve enables and a total appears.
  const enabledDays = page.locator('button', { hasText: /^\d+$/ }).filter({ hasNot: page.locator('[disabled]') });
  const dayButtons = page.getByRole('button').filter({ hasText: /^\d+$/ });
  const count = await dayButtons.count();
  // Click the last two day buttons (always within the displayed month and enabled if in the future).
  await dayButtons.nth(count - 2).click();
  await dayButtons.nth(count - 1).click();
  await expect(page.getByText(/total/i)).toBeVisible();
});

test("shows a not-found page for an unknown listing id", async ({ page }) => {
  await page.goto("/rooms/does-not-exist");
  await expect(page.getByText(/can.?t find that place/i)).toBeVisible();
});
```

- [ ] **Step 6: Run the E2E suite**

Run: `npm run test:e2e -- listing-detail`
Expected: PASS. If the last two day cells of the current month happen to be disabled (past dates near month-end when run late in a month), the date-selection assertion may be flaky — in that case the implementer should adjust the spec to navigate to next month via the "Next month" control before selecting days. Note any such adjustment in the task report.

- [ ] **Step 7: Commit**

```bash
git add components/design-system/property-card.tsx components/design-system/property-card.test.tsx e2e/listing-detail.spec.ts
git commit -m "feat: link property cards to detail page and add listing-detail e2e"
```

---

## Self-Review

**1. Spec coverage** (spec §5 listing-detail row, §4 components, §6 data model):
- `/rooms/[id]` photo gallery → Task 5. `RatingDisplay` moment → reused in Task 13. Amenities → Task 6. Reviews grid → Task 7. Host card → Task 8. Sticky reservation card (date-range selector + guest stepper + Reserve + fee breakdown) → Tasks 9–11. Listing/Host/Review data model → Tasks 1–3. Reservation pricing → Task 4. Navigation into detail → Task 14. ✔ Mapbox/search/experiences/auth are later phases (not in scope). ✔
- Reservation card "sticky right-rail" → Task 13 layout (`lg:sticky`). Mobile sticky-bottom-bar variant is deferred to Phase 8 (responsive polish) per spec §10; noted, not built here.

**2. Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N" — every code step shows full code. ✔

**3. Type consistency:** `Listing` detail fields defined in Task 1 are used identically in Tasks 2, 12, 13, 14. `Host`/`Review` shapes match across Tasks 1–3, 7, 8. `GuestCounts` defined in Task 9, consumed in Task 11. `BookingCalendar` prop names (`month`, `checkIn`, `checkOut`, `minDate`, `onSelect`, `onMonthChange`) match between Tasks 10 and 11. `PriceBreakdown`/`calculatePriceBreakdown` signatures match between Tasks 4 and 11. `mockHostRepository.findById` / `mockReviewRepository.findByListingId` match between Tasks 3 and 13. ✔

**Known deferrals (by spec phasing, not gaps):** mobile reservation sticky-bottom-bar and full responsive pass → Phase 8; real booking persistence/confirmation → Phase 6; "Contact host" and "Show more" are non-functional affordances this phase.
