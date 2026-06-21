# Phase 5 — Experiences + Services Verticals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Experiences and Services product verticals — `/experiences` + `/experiences/[id]` and `/services` + `/services/[id]` — each with interactive category filtering, mirroring the Homes vertical's data seam end to end.

**Architecture:** Each vertical reuses the proven bottom-up seam from Homes: typed entity → mock data → repository (interface + mock + tests) → `/api/*` route handler (envelope) → api-client + Zod schema → TanStack Query hook → a client "listings" island (category strip + grid). Detail pages are server components reading the mock repositories directly and composing existing design-system atoms (`ListingGallery`, `ReviewsGrid`, `HostCard`, `RatingDisplay`). The `TopNav` already links to `/experiences` and `/services` (currently 404); this phase makes those routes real.

**Tech Stack:** Next.js 16 (App Router, React 19), TypeScript strict, Tailwind v4 token theme, TanStack Query v5, Zod v4, Vitest + RTL, Playwright. Reuses `ExperienceCard` (refactored), `CategoryStrip`, `TopNav`, `Footer`, `ListingGallery`, `ReviewsGrid`, `HostCard`, `RatingDisplay`, and the Phase 2 data seam.

## Global Constraints

- **Design tokens only** — Tailwind v4 token utilities from `app/globals.css` (colors `ink`/`body`/`muted`/`muted-soft`/`hairline`/`border-strong`/`canvas`/`surface-soft`/`surface-strong`/`rausch`/`rausch-active`/`on-primary`/`error`/`scrim`; radii `rounded-xs/sm/md/lg/full`; type classes `text-display-*`/`text-title-*`/`text-body-*`/`text-button-*`/`text-caption*`/`text-micro`; `shadow-airbnb`). NEVER raw hex or arbitrary Tailwind color values. Layout arbitrary values (`max-w-[1080px]`, `aspect-[4/5]`) are allowed.
- **Repository is the only importer of `lib/data`.** Routes/api-client/hooks/pages never import `lib/data` directly.
- **API envelope** `{ success, data?, error?, meta? }` via `ok`/`fail` from `lib/api/envelope`; route handlers use Web `Request`/`Response`, never `next/server`. `Response.json(ok(data, { total, page: 1, limit }))`.
- **Client islands** use `"use client"` + a `useQuery` hook; server detail pages call mock repositories directly and `notFound()` on a miss.
- **TypeScript strict**, no `any` (use `unknown` + narrowing), explicit types on exports/props, immutable updates, no `console.log`.
- **TDD:** failing test first → watch it fail → minimal implementation → watch it pass → commit. AAA structure, behavioral test names.
- **Test imports:** import `render`, `screen`, `userEvent` from `@/lib/test-utils` (not directly from RTL), per existing component tests.

---

## File Structure

**Types**
- Modify `lib/types.ts` — add `Experience`, `Service`, `EXPERIENCE_CATEGORIES`, `SERVICE_CATEGORIES`.

**Data**
- Create `lib/data/experiences.ts`, `lib/data/services.ts`.
- Modify `lib/data/reviews.ts` — seed a few reviews keyed to experience ids.
- Modify `lib/data/data.test.ts` — assert the new arrays.

**Repositories**
- Create `lib/repositories/experience-repository.ts`, `lib/repositories/mock/mock-experience-repository.ts` (+ test).
- Create `lib/repositories/service-repository.ts`, `lib/repositories/mock/mock-service-repository.ts` (+ test).

**API + client + hooks**
- Modify `lib/api-client/schemas.ts` — add experience/service schemas + envelopes.
- Create `app/api/experiences/route.ts` (+ test), `app/api/services/route.ts` (+ test).
- Create `lib/api-client/experiences.ts`, `lib/api-client/services.ts`.
- Create `lib/hooks/use-experiences.ts` (+ test), `lib/hooks/use-services.ts` (+ test).

**Components**
- Modify `components/design-system/experience-card.tsx` + test — accept `Experience`.
- Create `components/design-system/service-card.tsx` + test.
- Modify `components/design-system/index.ts` — export `ServiceCard`.
- Create `components/features/experience-listings.tsx` (+ test), `components/features/experience-grid.tsx`.
- Create `components/features/service-listings.tsx` (+ test), `components/features/service-grid.tsx`.

**Pages**
- Create `app/experiences/page.tsx` (+ test), `app/experiences/[id]/page.tsx` (+ test).
- Create `app/services/page.tsx` (+ test), `app/services/[id]/page.tsx` (+ test).

**E2E**
- Create `e2e/verticals.spec.ts`.

---

### Task 1: Experience + Service types

**Files:**
- Modify: `lib/types.ts`

**Interfaces:**
- Produces: `Experience { id; title; location {city,country,lat,lng}; photos: string[]; pricePerPerson: number; durationHours: number; rating: number; reviewCount: number; isNew: boolean; hostId: string; category: string; description: string }`; `Service { id; title; provider: string; serviceCategory: string; photos: string[]; price: number; rating: number; reviewCount: number; city: string; description: string }`; `EXPERIENCE_CATEGORIES`, `SERVICE_CATEGORIES` readonly tuples whose `[0]` is `"All"`.

- [ ] **Step 1: Add the types**

Append to `lib/types.ts` (keep existing `Listing`/`Host`/`Review`/`City`/`CATEGORIES`):

```ts
export interface Experience {
  id: string;
  title: string;
  location: { city: string; country: string; lat: number; lng: number };
  photos: string[];
  pricePerPerson: number;
  durationHours: number;
  rating: number;
  reviewCount: number;
  isNew: boolean;
  hostId: string;
  category: string;
  description: string;
}

export interface Service {
  id: string;
  title: string;
  provider: string;
  serviceCategory: string;
  photos: string[];
  price: number;
  rating: number;
  reviewCount: number;
  city: string;
  description: string;
}

export const EXPERIENCE_CATEGORIES = [
  "All",
  "Food & drink",
  "Art & culture",
  "Nature",
  "Sports",
  "Wellness",
] as const;

export type ExperienceCategory = (typeof EXPERIENCE_CATEGORIES)[number];

export const SERVICE_CATEGORIES = [
  "All",
  "Photography",
  "Chefs",
  "Massage",
  "Training",
  "Hair & makeup",
] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no usages yet; types compile).

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add Experience and Service domain types"
```

---

### Task 2: Experience + Service mock data (+ seeded reviews)

**Files:**
- Create: `lib/data/experiences.ts`
- Create: `lib/data/services.ts`
- Modify: `lib/data/reviews.ts`
- Modify: `lib/data/data.test.ts`

**Interfaces:**
- Consumes: `Experience`, `Service` (Task 1); existing `hostId` values `"h1".."h16"`.
- Produces: `experiences: Experience[]` (≥12), `services: Service[]` (≥12). Each non-"All" `EXPERIENCE_CATEGORIES`/`SERVICE_CATEGORIES` value appears on at least one record. Reviews array gains entries with `listingId` `"e1"` and `"e2"`.

- [ ] **Step 1: Read the existing reviews data shape**

Read `lib/data/reviews.ts` to match the `Review` object shape and the existing export name (`reviews`).

- [ ] **Step 2: Write the failing data test**

Append to `lib/data/data.test.ts`:

```ts
import { experiences } from "./experiences";
import { services } from "./services";
import { EXPERIENCE_CATEGORIES, SERVICE_CATEGORIES } from "@/lib/types";

describe("experiences data", () => {
  test("has at least 12 records with unique ids", () => {
    expect(experiences.length).toBeGreaterThanOrEqual(12);
    expect(new Set(experiences.map((e) => e.id)).size).toBe(experiences.length);
  });

  test("covers every non-All experience category", () => {
    for (const category of EXPERIENCE_CATEGORIES.filter((c) => c !== "All")) {
      expect(experiences.some((e) => e.category === category)).toBe(true);
    }
  });
});

describe("services data", () => {
  test("has at least 12 records with unique ids", () => {
    expect(services.length).toBeGreaterThanOrEqual(12);
    expect(new Set(services.map((s) => s.id)).size).toBe(services.length);
  });

  test("covers every non-All service category", () => {
    for (const category of SERVICE_CATEGORIES.filter((c) => c !== "All")) {
      expect(services.some((s) => s.serviceCategory === category)).toBe(true);
    }
  });
});
```

(If `data.test.ts` does not already `import { describe, expect, test } from "vitest"`, add it. Keep its existing tests.)

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- data.test`
Expected: FAIL — `./experiences` and `./services` do not exist.

- [ ] **Step 4: Create the experiences data**

Create `lib/data/experiences.ts` (12 records; all 5 non-"All" categories covered; `isNew` true on a few; reuse host ids):

```ts
import type { Experience } from "@/lib/types";

const photo = (id: string) => `https://images.unsplash.com/${id}?w=800&q=80`;

export const experiences: Experience[] = [
  { id: "e1", title: "Pasta-making with a Roman nonna", location: { city: "Rome", country: "Italy", lat: 41.9, lng: 12.5 }, photos: [photo("photo-1556761223-4c4282c73f77")], pricePerPerson: 65, durationHours: 3, rating: 4.95, reviewCount: 210, isNew: false, hostId: "h1", category: "Food & drink", description: "Roll fresh pasta by hand in a centuries-old kitchen, then feast on what you make." },
  { id: "e2", title: "Sunrise kayak through sea caves", location: { city: "Algarve", country: "Portugal", lat: 37.1, lng: -8.3 }, photos: [photo("photo-1502680390469-be75c86b636f")], pricePerPerson: 80, durationHours: 2, rating: 4.9, reviewCount: 134, isNew: false, hostId: "h2", category: "Nature", description: "Paddle into golden grottoes before the crowds with a certified guide." },
  { id: "e3", title: "Street-art walk in the old town", location: { city: "Lisbon", country: "Portugal", lat: 38.72, lng: -9.14 }, photos: [photo("photo-1499781350541-7783f6c6a0c8")], pricePerPerson: 35, durationHours: 2, rating: 4.82, reviewCount: 78, isNew: true, hostId: "h7", category: "Art & culture", description: "Decode the city's murals with a local artist and visit a working studio." },
  { id: "e4", title: "Tidal-pool foraging & tasting", location: { city: "Wilmington", country: "USA", lat: 34.22, lng: -77.94 }, photos: [photo("photo-1559827260-dc66d52bef19")], pricePerPerson: 55, durationHours: 3, rating: 4.78, reviewCount: 41, isNew: false, hostId: "h3", category: "Food & drink", description: "Gather coastal greens and shellfish, then cook a shoreline lunch." },
  { id: "e5", title: "Mountain trail run & cold plunge", location: { city: "Aspen", country: "USA", lat: 39.19, lng: -106.82 }, photos: [photo("photo-1551632811-561732d1e306")], pricePerPerson: 45, durationHours: 2, rating: 4.88, reviewCount: 96, isNew: false, hostId: "h6", category: "Sports", description: "A guided alpine run finishing with a glacial cold plunge and breathwork." },
  { id: "e6", title: "Forest bathing & tea ceremony", location: { city: "Kyoto", country: "Japan", lat: 35.01, lng: 135.77 }, photos: [photo("photo-1528360983277-13d401cdc186")], pricePerPerson: 70, durationHours: 3, rating: 4.97, reviewCount: 188, isNew: false, hostId: "h5", category: "Wellness", description: "Slow walk among cedars followed by a traditional matcha ceremony." },
  { id: "e7", title: "Rooftop watercolor at golden hour", location: { city: "Athens", country: "Greece", lat: 37.98, lng: 23.72 }, photos: [photo("photo-1513364776144-60967b0f800f")], pricePerPerson: 40, durationHours: 2, rating: 4.85, reviewCount: 63, isNew: true, hostId: "h4", category: "Art & culture", description: "Paint the Acropolis skyline with provided materials and wine." },
  { id: "e8", title: "Tapas crawl with a chef", location: { city: "Lisbon", country: "Portugal", lat: 38.71, lng: -9.13 }, photos: [photo("photo-1414235077428-338989a2e8c0")], pricePerPerson: 75, durationHours: 3, rating: 4.91, reviewCount: 152, isNew: false, hostId: "h14", category: "Food & drink", description: "Five hidden counters, small plates, and the stories behind each." },
  { id: "e9", title: "Coastal cliff yoga", location: { city: "Malibu", country: "USA", lat: 34.03, lng: -118.69 }, photos: [photo("photo-1506126613408-eca07ce68773")], pricePerPerson: 50, durationHours: 2, rating: 4.86, reviewCount: 110, isNew: false, hostId: "h9", category: "Wellness", description: "An oceanfront vinyasa flow timed to the waves." },
  { id: "e10", title: "Backcountry snowshoe & wildlife", location: { city: "Aspen", country: "USA", lat: 39.21, lng: -106.79 }, photos: [photo("photo-1551524559-8af4e6624178")], pricePerPerson: 60, durationHours: 4, rating: 4.84, reviewCount: 57, isNew: false, hostId: "h15", category: "Nature", description: "Track elk and fox across fresh powder with a naturalist." },
  { id: "e11", title: "Indoor climbing for beginners", location: { city: "Athens", country: "Greece", lat: 37.95, lng: 23.7 }, photos: [photo("photo-1522163182402-834f871fd851")], pricePerPerson: 38, durationHours: 2, rating: 4.7, reviewCount: 29, isNew: true, hostId: "h10", category: "Sports", description: "Learn knots, belaying, and your first routes with gear included." },
  { id: "e12", title: "Sake brewery tour & pairing", location: { city: "Kyoto", country: "Japan", lat: 35.05, lng: 135.8 }, photos: [photo("photo-1536935338788-846bb9981813")], pricePerPerson: 85, durationHours: 3, rating: 4.93, reviewCount: 171, isNew: false, hostId: "h11", category: "Food & drink", description: "Behind the scenes at a family brewery with a guided tasting flight." },
];
```

- [ ] **Step 5: Create the services data**

Create `lib/data/services.ts` (12 records; all 5 non-"All" categories covered):

```ts
import type { Service } from "@/lib/types";

const photo = (id: string) => `https://images.unsplash.com/${id}?w=800&q=80`;

export const services: Service[] = [
  { id: "s1", title: "Portrait photography session", provider: "Mara Lensworth", serviceCategory: "Photography", photos: [photo("photo-1554048612-b6a482bc67e5")], price: 180, rating: 4.94, reviewCount: 88, city: "Lisbon", description: "A 90-minute golden-hour shoot with 30 edited photos delivered." },
  { id: "s2", title: "Private dinner by a local chef", provider: "Chef Tomas Reis", serviceCategory: "Chefs", photos: [photo("photo-1577219491135-ce391730fb2c")], price: 320, rating: 4.97, reviewCount: 142, city: "Rome", description: "A four-course tasting menu cooked in your rental, ingredients included." },
  { id: "s3", title: "In-home deep tissue massage", provider: "Calm Hands Studio", serviceCategory: "Massage", photos: [photo("photo-1600334129128-685c5582fd35")], price: 130, rating: 4.9, reviewCount: 76, city: "Aspen", description: "A 60-minute therapeutic massage with table and oils provided." },
  { id: "s4", title: "Personal training & mobility", provider: "Drive Fitness", serviceCategory: "Training", photos: [photo("photo-1571019613454-1cb2f99b2d8b")], price: 90, rating: 4.85, reviewCount: 64, city: "Malibu", description: "One-on-one strength and mobility coaching at your location." },
  { id: "s5", title: "Event hair & makeup", provider: "Glow Atelier", serviceCategory: "Hair & makeup", photos: [photo("photo-1487412947147-5cebf100ffc2")], price: 150, rating: 4.92, reviewCount: 103, city: "Athens", description: "Full glam for a night out or shoot, travel kit included." },
  { id: "s6", title: "Family lifestyle photo walk", provider: "Mara Lensworth", serviceCategory: "Photography", photos: [photo("photo-1452587925148-ce544e77e70d")], price: 210, rating: 4.89, reviewCount: 51, city: "Kyoto", description: "A relaxed walking session capturing candid family moments." },
  { id: "s7", title: "Plant-based meal prep", provider: "Chef Nadia Ven", serviceCategory: "Chefs", photos: [photo("photo-1505935428862-770b6f24f629")], price: 160, rating: 4.8, reviewCount: 47, city: "Lisbon", description: "A week of prepped plant-based meals tailored to your tastes." },
  { id: "s8", title: "Prenatal massage", provider: "Calm Hands Studio", serviceCategory: "Massage", photos: [photo("photo-1519823551278-64ac92734fb1")], price: 140, rating: 4.95, reviewCount: 39, city: "Wilmington", description: "A gentle 60-minute massage designed for expecting guests." },
  { id: "s9", title: "Boxing fundamentals", provider: "Drive Fitness", serviceCategory: "Training", photos: [photo("photo-1517836357463-d25dfeac3438")], price: 85, rating: 4.78, reviewCount: 33, city: "Athens", description: "Learn stance, footwork, and combinations with all gear supplied." },
  { id: "s10", title: "Bridal hair trial", provider: "Glow Atelier", serviceCategory: "Hair & makeup", photos: [photo("photo-1560066984-138dadb4c035")], price: 175, rating: 4.91, reviewCount: 58, city: "Rome", description: "A relaxed trial run to design your wedding-day look." },
  { id: "s11", title: "Real-estate photography", provider: "Brightframe Media", serviceCategory: "Photography", photos: [photo("photo-1600585154340-be6161a56a0c")], price: 240, rating: 4.87, reviewCount: 44, city: "Malibu", description: "HDR interior and drone exterior shots for listings." },
  { id: "s12", title: "Sports recovery massage", provider: "Calm Hands Studio", serviceCategory: "Massage", photos: [photo("photo-1540555700478-4be289fbecef")], price: 120, rating: 4.83, reviewCount: 27, city: "Aspen", description: "Post-activity recovery work focused on legs and back." },
];
```

- [ ] **Step 6: Seed a few experience reviews**

In `lib/data/reviews.ts`, append entries to the exported `reviews` array (match the existing `Review` shape — `id`, `listingId`, `authorName`, `authorAvatar`, `date`, `rating`, `body`; read the file to copy the exact field names and an existing avatar URL host):

```ts
  { id: "re1", listingId: "e1", authorName: "Priya", authorAvatar: "https://i.pravatar.cc/120?img=21", date: "March 2026", rating: 5, body: "The nonna was wonderful and the pasta was unreal. A highlight of the trip." },
  { id: "re2", listingId: "e1", authorName: "Marcus", authorAvatar: "https://i.pravatar.cc/120?img=22", date: "February 2026", rating: 5, body: "Hands-on, warm, and delicious. Booking again next time." },
  { id: "re3", listingId: "e2", authorName: "Sofia", authorAvatar: "https://i.pravatar.cc/120?img=23", date: "January 2026", rating: 5, body: "The caves at sunrise were magic and our guide was so calm and safe." },
```

(If `reviews.ts` uses a different avatar host or date format, match it exactly; the keys above must match the `Review` interface in `lib/types.ts`.)

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test -- data.test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/data/experiences.ts lib/data/services.ts lib/data/reviews.ts lib/data/data.test.ts
git commit -m "feat: add experiences and services mock data with seeded reviews"
```

---

### Task 3: ExperienceRepository (interface + mock)

**Files:**
- Create: `lib/repositories/experience-repository.ts`
- Create: `lib/repositories/mock/mock-experience-repository.ts`
- Test: `lib/repositories/mock/mock-experience-repository.test.ts`

**Interfaces:**
- Consumes: `experiences` data (Task 2), `Experience` type.
- Produces: `ExperienceFilters { category?: string }`; `ExperienceRepository { findAll(filters?): Promise<Experience[]>; findById(id): Promise<Experience | null> }`; `mockExperienceRepository` implementing it. `findAll` returns all when category is empty/`"All"`, else filters by `category`.

- [ ] **Step 1: Write the failing test**

Create `lib/repositories/mock/mock-experience-repository.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { mockExperienceRepository } from "./mock-experience-repository";

describe("mockExperienceRepository", () => {
  test("findAll with no filter returns all experiences", async () => {
    const all = await mockExperienceRepository.findAll();
    expect(all.length).toBeGreaterThanOrEqual(12);
  });

  test("findAll filters by category", async () => {
    const food = await mockExperienceRepository.findAll({ category: "Food & drink" });
    expect(food.length).toBeGreaterThan(0);
    expect(food.every((e) => e.category === "Food & drink")).toBe(true);
  });

  test('findAll with category "All" returns everything', async () => {
    const all = await mockExperienceRepository.findAll({ category: "All" });
    const unfiltered = await mockExperienceRepository.findAll();
    expect(all.length).toBe(unfiltered.length);
  });

  test("findById returns the matching experience or null", async () => {
    const first = await mockExperienceRepository.findById("e1");
    expect(first?.id).toBe("e1");
    expect(await mockExperienceRepository.findById("nope")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- mock-experience-repository`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the interface**

Create `lib/repositories/experience-repository.ts`:

```ts
import type { Experience } from "@/lib/types";

export interface ExperienceFilters {
  category?: string;
}

export interface ExperienceRepository {
  findAll(filters?: ExperienceFilters): Promise<Experience[]>;
  findById(id: string): Promise<Experience | null>;
}
```

- [ ] **Step 4: Create the mock**

Create `lib/repositories/mock/mock-experience-repository.ts`:

```ts
import type { Experience } from "@/lib/types";
import { experiences } from "@/lib/data/experiences";
import type { ExperienceFilters, ExperienceRepository } from "../experience-repository";

export const mockExperienceRepository: ExperienceRepository = {
  async findAll(filters?: ExperienceFilters): Promise<Experience[]> {
    const category = filters?.category;
    if (!category || category === "All") return experiences;
    return experiences.filter((e) => e.category === category);
  },

  async findById(id: string): Promise<Experience | null> {
    return experiences.find((e) => e.id === id) ?? null;
  },
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- mock-experience-repository`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/repositories/experience-repository.ts lib/repositories/mock/mock-experience-repository.ts lib/repositories/mock/mock-experience-repository.test.ts
git commit -m "feat: add ExperienceRepository with mock implementation"
```

---

### Task 4: ServiceRepository (interface + mock)

**Files:**
- Create: `lib/repositories/service-repository.ts`
- Create: `lib/repositories/mock/mock-service-repository.ts`
- Test: `lib/repositories/mock/mock-service-repository.test.ts`

**Interfaces:**
- Consumes: `services` data (Task 2), `Service` type.
- Produces: `ServiceFilters { category?: string }`; `ServiceRepository { findAll(filters?): Promise<Service[]>; findById(id): Promise<Service | null> }`; `mockServiceRepository`. `findAll` filters on `serviceCategory`; empty/`"All"` returns all.

- [ ] **Step 1: Write the failing test**

Create `lib/repositories/mock/mock-service-repository.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { mockServiceRepository } from "./mock-service-repository";

describe("mockServiceRepository", () => {
  test("findAll with no filter returns all services", async () => {
    const all = await mockServiceRepository.findAll();
    expect(all.length).toBeGreaterThanOrEqual(12);
  });

  test("findAll filters by service category", async () => {
    const photo = await mockServiceRepository.findAll({ category: "Photography" });
    expect(photo.length).toBeGreaterThan(0);
    expect(photo.every((s) => s.serviceCategory === "Photography")).toBe(true);
  });

  test('findAll with category "All" returns everything', async () => {
    const all = await mockServiceRepository.findAll({ category: "All" });
    const unfiltered = await mockServiceRepository.findAll();
    expect(all.length).toBe(unfiltered.length);
  });

  test("findById returns the matching service or null", async () => {
    const first = await mockServiceRepository.findById("s1");
    expect(first?.id).toBe("s1");
    expect(await mockServiceRepository.findById("nope")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- mock-service-repository`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the interface**

Create `lib/repositories/service-repository.ts`:

```ts
import type { Service } from "@/lib/types";

export interface ServiceFilters {
  category?: string;
}

export interface ServiceRepository {
  findAll(filters?: ServiceFilters): Promise<Service[]>;
  findById(id: string): Promise<Service | null>;
}
```

- [ ] **Step 4: Create the mock**

Create `lib/repositories/mock/mock-service-repository.ts`:

```ts
import type { Service } from "@/lib/types";
import { services } from "@/lib/data/services";
import type { ServiceFilters, ServiceRepository } from "../service-repository";

export const mockServiceRepository: ServiceRepository = {
  async findAll(filters?: ServiceFilters): Promise<Service[]> {
    const category = filters?.category;
    if (!category || category === "All") return services;
    return services.filter((s) => s.serviceCategory === category);
  },

  async findById(id: string): Promise<Service | null> {
    return services.find((s) => s.id === id) ?? null;
  },
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- mock-service-repository`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/repositories/service-repository.ts lib/repositories/mock/mock-service-repository.ts lib/repositories/mock/mock-service-repository.test.ts
git commit -m "feat: add ServiceRepository with mock implementation"
```

---

### Task 5: Zod schemas for both verticals

**Files:**
- Modify: `lib/api-client/schemas.ts`
- Test: `lib/api-client/schemas.test.ts` (create)

**Interfaces:**
- Consumes: existing `listingsEnvelopeSchema` pattern.
- Produces: `experienceSchema`, `experiencesEnvelopeSchema`, `serviceSchema`, `servicesEnvelopeSchema` (each envelope: `{ success: boolean; data?: T[]; error?: string; meta?: {total,page,limit} }`).

- [ ] **Step 1: Write the failing test**

Create `lib/api-client/schemas.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { experiencesEnvelopeSchema, servicesEnvelopeSchema } from "./schemas";

describe("experiencesEnvelopeSchema", () => {
  test("parses a valid experience envelope", () => {
    const parsed = experiencesEnvelopeSchema.parse({
      success: true,
      data: [
        { id: "e1", title: "x", location: { city: "Rome", country: "Italy", lat: 1, lng: 2 }, photos: ["/a.jpg"], pricePerPerson: 65, durationHours: 3, rating: 4.9, reviewCount: 10, isNew: false, hostId: "h1", category: "Food & drink", description: "d" },
      ],
    });
    expect(parsed.data?.[0]?.id).toBe("e1");
  });
});

describe("servicesEnvelopeSchema", () => {
  test("parses a valid service envelope", () => {
    const parsed = servicesEnvelopeSchema.parse({
      success: true,
      data: [
        { id: "s1", title: "x", provider: "P", serviceCategory: "Photography", photos: ["/a.jpg"], price: 180, rating: 4.9, reviewCount: 10, city: "Lisbon", description: "d" },
      ],
    });
    expect(parsed.data?.[0]?.id).toBe("s1");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- schemas.test`
Expected: FAIL — exports do not exist.

- [ ] **Step 3: Add the schemas**

Append to `lib/api-client/schemas.ts` (keep `listingSchema`/`listingsEnvelopeSchema`; the file already imports `z`):

```ts
export const experienceSchema = z.object({
  id: z.string(),
  title: z.string(),
  location: z.object({ city: z.string(), country: z.string(), lat: z.number(), lng: z.number() }),
  photos: z.array(z.string()).min(1),
  pricePerPerson: z.number().positive(),
  durationHours: z.number().positive(),
  rating: z.number(),
  reviewCount: z.number(),
  isNew: z.boolean(),
  hostId: z.string(),
  category: z.string(),
  description: z.string(),
});

export const experiencesEnvelopeSchema = z.object({
  success: z.boolean(),
  data: z.array(experienceSchema).optional(),
  error: z.string().optional(),
  meta: z.object({ total: z.number(), page: z.number(), limit: z.number() }).optional(),
});

export const serviceSchema = z.object({
  id: z.string(),
  title: z.string(),
  provider: z.string(),
  serviceCategory: z.string(),
  photos: z.array(z.string()).min(1),
  price: z.number().positive(),
  rating: z.number(),
  reviewCount: z.number(),
  city: z.string(),
  description: z.string(),
});

export const servicesEnvelopeSchema = z.object({
  success: z.boolean(),
  data: z.array(serviceSchema).optional(),
  error: z.string().optional(),
  meta: z.object({ total: z.number(), page: z.number(), limit: z.number() }).optional(),
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- schemas.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/api-client/schemas.ts lib/api-client/schemas.test.ts
git commit -m "feat: add Zod schemas for experiences and services envelopes"
```

---

### Task 6: Experiences route + api-client + hook

**Files:**
- Create: `app/api/experiences/route.ts`
- Test: `app/api/experiences/route.test.ts`
- Create: `lib/api-client/experiences.ts`
- Create: `lib/hooks/use-experiences.ts`
- Test: `lib/hooks/use-experiences.test.tsx`

**Interfaces:**
- Consumes: `mockExperienceRepository` (Task 3), `experiencesEnvelopeSchema` (Task 5), `ok` envelope helper.
- Produces: `GET /api/experiences?category=X`; `fetchExperiences(category?): Promise<Experience[]>`; `useExperiences(category?): UseQueryResult<Experience[]>` with `queryKey: ["experiences", category ?? "All"]`.

- [ ] **Step 1: Write the failing tests**

Create `app/api/experiences/route.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { GET } from "./route";

describe("GET /api/experiences", () => {
  test("returns a successful envelope with all experiences", async () => {
    const res = await GET(new Request("http://localhost/api/experiences"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta.total).toBe(body.data.length);
  });

  test("filters by the category query param", async () => {
    const res = await GET(new Request("http://localhost/api/experiences?category=Nature"));
    const body = await res.json();
    expect(body.data.every((e: { category: string }) => e.category === "Nature")).toBe(true);
  });
});
```

Create `lib/hooks/use-experiences.test.tsx`:

```tsx
import { describe, expect, test } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useExperiences } from "./use-experiences";
import type { Experience } from "@/lib/types";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function make(id: string): Experience {
  return { id, title: "x", location: { city: "Rome", country: "Italy", lat: 1, lng: 2 }, photos: ["/a.jpg"], pricePerPerson: 65, durationHours: 3, rating: 4.9, reviewCount: 10, isNew: false, hostId: "h1", category: "Food & drink", description: "d" };
}

describe("useExperiences", () => {
  test("fetches experiences for a category", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ success: true, data: [make("e1")] }), { headers: { "content-type": "application/json" } })) as typeof fetch;
    try {
      const { result } = renderHook(() => useExperiences("Food & drink"), { wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.[0]?.id).toBe("e1");
    } finally {
      globalThis.fetch = original;
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- experiences/route use-experiences`
Expected: FAIL — route + hook + api-client do not exist.

- [ ] **Step 3: Create the route**

Create `app/api/experiences/route.ts`:

```ts
import { mockExperienceRepository } from "@/lib/repositories/mock/mock-experience-repository";
import { ok } from "@/lib/api/envelope";

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") ?? undefined;
  const data = await mockExperienceRepository.findAll({ category });
  return Response.json(ok(data, { total: data.length, page: 1, limit: data.length }));
}
```

- [ ] **Step 4: Create the api-client**

Create `lib/api-client/experiences.ts`:

```ts
import type { Experience } from "@/lib/types";
import { experiencesEnvelopeSchema } from "./schemas";

export async function fetchExperiences(category?: string): Promise<Experience[]> {
  const query = category && category !== "All" ? `?category=${encodeURIComponent(category)}` : "";
  const res = await fetch(`/api/experiences${query}`);
  const json: unknown = await res.json();
  const envelope = experiencesEnvelopeSchema.parse(json);
  if (!envelope.success) {
    throw new Error(envelope.error ?? "Failed to load experiences");
  }
  return envelope.data ?? [];
}
```

- [ ] **Step 5: Create the hook**

Create `lib/hooks/use-experiences.ts`:

```ts
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { fetchExperiences } from "@/lib/api-client/experiences";
import type { Experience } from "@/lib/types";

export function useExperiences(category?: string): UseQueryResult<Experience[]> {
  return useQuery({
    queryKey: ["experiences", category ?? "All"],
    queryFn: () => fetchExperiences(category),
  });
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- experiences/route use-experiences`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/api/experiences/route.ts app/api/experiences/route.test.ts lib/api-client/experiences.ts lib/hooks/use-experiences.ts lib/hooks/use-experiences.test.tsx
git commit -m "feat: wire experiences route, api-client, and hook"
```

---

### Task 7: Services route + api-client + hook

**Files:**
- Create: `app/api/services/route.ts`
- Test: `app/api/services/route.test.ts`
- Create: `lib/api-client/services.ts`
- Create: `lib/hooks/use-services.ts`
- Test: `lib/hooks/use-services.test.tsx`

**Interfaces:**
- Consumes: `mockServiceRepository` (Task 4), `servicesEnvelopeSchema` (Task 5), `ok`.
- Produces: `GET /api/services?category=X`; `fetchServices(category?): Promise<Service[]>`; `useServices(category?): UseQueryResult<Service[]>` with `queryKey: ["services", category ?? "All"]`.

- [ ] **Step 1: Write the failing tests**

Create `app/api/services/route.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { GET } from "./route";

describe("GET /api/services", () => {
  test("returns a successful envelope with all services", async () => {
    const res = await GET(new Request("http://localhost/api/services"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta.total).toBe(body.data.length);
  });

  test("filters by the category query param", async () => {
    const res = await GET(new Request("http://localhost/api/services?category=Chefs"));
    const body = await res.json();
    expect(body.data.every((s: { serviceCategory: string }) => s.serviceCategory === "Chefs")).toBe(true);
  });
});
```

Create `lib/hooks/use-services.test.tsx`:

```tsx
import { describe, expect, test } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useServices } from "./use-services";
import type { Service } from "@/lib/types";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function make(id: string): Service {
  return { id, title: "x", provider: "P", serviceCategory: "Chefs", photos: ["/a.jpg"], price: 180, rating: 4.9, reviewCount: 10, city: "Rome", description: "d" };
}

describe("useServices", () => {
  test("fetches services for a category", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ success: true, data: [make("s1")] }), { headers: { "content-type": "application/json" } })) as typeof fetch;
    try {
      const { result } = renderHook(() => useServices("Chefs"), { wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.[0]?.id).toBe("s1");
    } finally {
      globalThis.fetch = original;
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- services/route use-services`
Expected: FAIL — route + hook + api-client do not exist.

- [ ] **Step 3: Create the route**

Create `app/api/services/route.ts`:

```ts
import { mockServiceRepository } from "@/lib/repositories/mock/mock-service-repository";
import { ok } from "@/lib/api/envelope";

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") ?? undefined;
  const data = await mockServiceRepository.findAll({ category });
  return Response.json(ok(data, { total: data.length, page: 1, limit: data.length }));
}
```

- [ ] **Step 4: Create the api-client**

Create `lib/api-client/services.ts`:

```ts
import type { Service } from "@/lib/types";
import { servicesEnvelopeSchema } from "./schemas";

export async function fetchServices(category?: string): Promise<Service[]> {
  const query = category && category !== "All" ? `?category=${encodeURIComponent(category)}` : "";
  const res = await fetch(`/api/services${query}`);
  const json: unknown = await res.json();
  const envelope = servicesEnvelopeSchema.parse(json);
  if (!envelope.success) {
    throw new Error(envelope.error ?? "Failed to load services");
  }
  return envelope.data ?? [];
}
```

- [ ] **Step 5: Create the hook**

Create `lib/hooks/use-services.ts`:

```ts
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { fetchServices } from "@/lib/api-client/services";
import type { Service } from "@/lib/types";

export function useServices(category?: string): UseQueryResult<Service[]> {
  return useQuery({
    queryKey: ["services", category ?? "All"],
    queryFn: () => fetchServices(category),
  });
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- services/route use-services`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/api/services/route.ts app/api/services/route.test.ts lib/api-client/services.ts lib/hooks/use-services.ts lib/hooks/use-services.test.tsx
git commit -m "feat: wire services route, api-client, and hook"
```

---

### Task 8: ExperienceCard (refactor) + ServiceCard

**Files:**
- Modify: `components/design-system/experience-card.tsx`
- Modify: `components/design-system/experience-card.test.tsx`
- Create: `components/design-system/service-card.tsx`
- Test: `components/design-system/service-card.test.tsx`
- Modify: `components/design-system/index.ts`

**Interfaces:**
- Consumes: `Experience`, `Service` types; `NewBadge`.
- Produces: `ExperienceCard({ experience }: { experience: Experience })` (photo 4:5, title, `From $N / person`, `NewBadge` when `experience.isNew`); `ServiceCard({ service }: { service: Service })` (photo 4:5, title, provider, `From $N`). Both exported from the design-system barrel.

> Note: `ExperienceCard` currently takes `{ listing: Listing; isNew? }` and is referenced ONLY by its own test (verified via grep). This task migrates it to the `Experience` type.

- [ ] **Step 1: Rewrite the ExperienceCard test**

Replace `components/design-system/experience-card.test.tsx` with:

```tsx
import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { ExperienceCard } from "./experience-card";
import type { Experience } from "@/lib/types";

const exp: Experience = {
  id: "e1", title: "Pasta with a nonna",
  location: { city: "Rome", country: "Italy", lat: 1, lng: 2 },
  photos: ["https://example.com/e.jpg"], pricePerPerson: 65, durationHours: 3,
  rating: 4.9, reviewCount: 10, isNew: false, hostId: "h1", category: "Food & drink", description: "d",
};

describe("ExperienceCard", () => {
  test("renders the title and per-person price", () => {
    render(<ExperienceCard experience={exp} />);
    expect(screen.getByText("Pasta with a nonna")).toBeInTheDocument();
    expect(screen.getByText(/\$65 \/ person/i)).toBeInTheDocument();
  });

  test("shows the New badge when the experience is new", () => {
    render(<ExperienceCard experience={{ ...exp, isNew: true }} />);
    expect(screen.getByText(/new/i)).toBeInTheDocument();
  });

  test("uses the title-md token for the title", () => {
    render(<ExperienceCard experience={exp} />);
    expect(screen.getByText("Pasta with a nonna").className).toContain("text-title-md");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- experience-card`
Expected: FAIL — current component expects a `listing` prop / has no price line.

- [ ] **Step 3: Rewrite ExperienceCard**

Replace `components/design-system/experience-card.tsx`:

```tsx
import Image from "next/image";
import type { Experience } from "@/lib/types";
import { NewBadge } from "./badges";

export function ExperienceCard({ experience }: { experience: Experience }) {
  return (
    <article className="flex flex-col gap-2">
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-md">
        <Image
          src={experience.photos[0]}
          alt={experience.title}
          fill
          sizes="(max-width: 744px) 100vw, 25vw"
          className="object-cover"
        />
        {experience.isNew && (
          <div className="absolute left-3 top-3">
            <NewBadge />
          </div>
        )}
      </div>
      <h3 className="text-title-md text-ink">{experience.title}</h3>
      <p className="text-body-sm text-muted">From ${experience.pricePerPerson} / person</p>
    </article>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- experience-card`
Expected: PASS.

- [ ] **Step 5: Write the failing ServiceCard test**

Create `components/design-system/service-card.test.tsx`:

```tsx
import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { ServiceCard } from "./service-card";
import type { Service } from "@/lib/types";

const service: Service = {
  id: "s1", title: "Portrait session", provider: "Mara Lensworth", serviceCategory: "Photography",
  photos: ["https://example.com/s.jpg"], price: 180, rating: 4.9, reviewCount: 10, city: "Lisbon", description: "d",
};

describe("ServiceCard", () => {
  test("renders the title, provider, and price", () => {
    render(<ServiceCard service={service} />);
    expect(screen.getByText("Portrait session")).toBeInTheDocument();
    expect(screen.getByText("Mara Lensworth")).toBeInTheDocument();
    expect(screen.getByText(/\$180/)).toBeInTheDocument();
  });

  test("uses the title-md token for the title", () => {
    render(<ServiceCard service={service} />);
    expect(screen.getByText("Portrait session").className).toContain("text-title-md");
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm test -- service-card`
Expected: FAIL — module does not exist.

- [ ] **Step 7: Create ServiceCard**

Create `components/design-system/service-card.tsx`:

```tsx
import Image from "next/image";
import type { Service } from "@/lib/types";

export function ServiceCard({ service }: { service: Service }) {
  return (
    <article className="flex flex-col gap-2">
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-md">
        <Image
          src={service.photos[0]}
          alt={service.title}
          fill
          sizes="(max-width: 744px) 100vw, 25vw"
          className="object-cover"
        />
      </div>
      <h3 className="text-title-md text-ink">{service.title}</h3>
      <p className="text-body-sm text-muted">{service.provider}</p>
      <p className="text-body-sm text-ink">From ${service.price}</p>
    </article>
  );
}
```

- [ ] **Step 8: Export ServiceCard from the barrel**

In `components/design-system/index.ts`, add after the `ExperienceCard` export line:

```ts
export { ServiceCard } from "./service-card";
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npm test -- experience-card service-card`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add components/design-system/experience-card.tsx components/design-system/experience-card.test.tsx components/design-system/service-card.tsx components/design-system/service-card.test.tsx components/design-system/index.ts
git commit -m "feat: migrate ExperienceCard to Experience type and add ServiceCard"
```

---

### Task 9: ExperienceListings + ServiceListings islands

**Files:**
- Create: `components/features/experience-grid.tsx`
- Create: `components/features/experience-listings.tsx`
- Test: `components/features/experience-listings.test.tsx`
- Create: `components/features/service-grid.tsx`
- Create: `components/features/service-listings.tsx`
- Test: `components/features/service-listings.test.tsx`

**Interfaces:**
- Consumes: `useExperiences`/`useServices` (Tasks 6–7), `ExperienceCard`/`ServiceCard` (Task 8), `CategoryStrip`, `EXPERIENCE_CATEGORIES`/`SERVICE_CATEGORIES`.
- Produces: `ExperienceGrid({ experiences, isLoading })`; `ExperienceListings()` (client island, default category `"All"`); `ServiceGrid({ services, isLoading })`; `ServiceListings()` (client island). Grids show 8 skeletons (`data-testid="experience-skeleton"` / `"service-skeleton"`) while loading and an empty state otherwise.

- [ ] **Step 1: Write the failing ExperienceListings test**

Create `components/features/experience-listings.test.tsx` (mocks the hook so no network):

```tsx
import { describe, expect, test, vi } from "vitest";
import { render, screen, userEvent } from "@/lib/test-utils";

const useExperiences = vi.fn();
vi.mock("@/lib/hooks/use-experiences", () => ({
  useExperiences: (category?: string) => useExperiences(category),
}));

import { ExperienceListings } from "./experience-listings";
import type { Experience } from "@/lib/types";

function make(id: string): Experience {
  return { id, title: `Experience ${id}`, location: { city: "Rome", country: "Italy", lat: 1, lng: 2 }, photos: ["/a.jpg"], pricePerPerson: 65, durationHours: 3, rating: 4.9, reviewCount: 10, isNew: false, hostId: "h1", category: "Food & drink", description: "d" };
}

describe("ExperienceListings", () => {
  test("renders a card per experience", () => {
    useExperiences.mockReturnValue({ data: [make("e1"), make("e2")], isLoading: false, isError: false });
    render(<ExperienceListings />);
    expect(screen.getByText("Experience e1")).toBeInTheDocument();
    expect(screen.getByText("Experience e2")).toBeInTheDocument();
  });

  test("selecting a category re-queries with that category", async () => {
    useExperiences.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<ExperienceListings />);
    await userEvent.click(screen.getByRole("button", { name: "Nature" }));
    expect(useExperiences).toHaveBeenLastCalledWith("Nature");
  });

  test("shows an error state when the query fails", () => {
    useExperiences.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<ExperienceListings />);
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- experience-listings`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Create ExperienceGrid**

Create `components/features/experience-grid.tsx`:

```tsx
import { ExperienceCard } from "@/components/design-system";
import type { Experience } from "@/lib/types";

export interface ExperienceGridProps {
  experiences: Experience[];
  isLoading?: boolean;
}

const gridClass = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4";

function Skeleton() {
  return (
    <div data-testid="experience-skeleton" className="flex flex-col gap-2">
      <div className="aspect-[4/5] w-full animate-pulse rounded-md bg-surface-strong" />
      <div className="h-4 w-3/4 animate-pulse rounded-xs bg-surface-strong" />
    </div>
  );
}

export function ExperienceGrid({ experiences, isLoading }: ExperienceGridProps) {
  if (isLoading) {
    return (
      <div className={gridClass}>
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} />
        ))}
      </div>
    );
  }

  if (experiences.length === 0) {
    return <p className="text-body-md text-muted">No experiences match this category yet.</p>;
  }

  return (
    <div className={gridClass}>
      {experiences.map((experience) => (
        <ExperienceCard key={experience.id} experience={experience} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create ExperienceListings**

Create `components/features/experience-listings.tsx`:

```tsx
"use client";

import { useState } from "react";
import { EXPERIENCE_CATEGORIES } from "@/lib/types";
import { useExperiences } from "@/lib/hooks/use-experiences";
import { CategoryStrip } from "./category-strip";
import { ExperienceGrid } from "./experience-grid";

export function ExperienceListings() {
  const [active, setActive] = useState<string>("All");
  const { data, isLoading, isError } = useExperiences(active);

  return (
    <div className="flex flex-col gap-6">
      <CategoryStrip categories={EXPERIENCE_CATEGORIES} active={active} onSelect={setActive} />
      {isError ? (
        <p className="text-body-md text-error">Something went wrong loading experiences. Please try again.</p>
      ) : (
        <ExperienceGrid experiences={data ?? []} isLoading={isLoading} />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- experience-listings`
Expected: PASS.

- [ ] **Step 6: Write the failing ServiceListings test**

Create `components/features/service-listings.test.tsx`:

```tsx
import { describe, expect, test, vi } from "vitest";
import { render, screen, userEvent } from "@/lib/test-utils";

const useServices = vi.fn();
vi.mock("@/lib/hooks/use-services", () => ({
  useServices: (category?: string) => useServices(category),
}));

import { ServiceListings } from "./service-listings";
import type { Service } from "@/lib/types";

function make(id: string): Service {
  return { id, title: `Service ${id}`, provider: "P", serviceCategory: "Chefs", photos: ["/a.jpg"], price: 180, rating: 4.9, reviewCount: 10, city: "Rome", description: "d" };
}

describe("ServiceListings", () => {
  test("renders a card per service", () => {
    useServices.mockReturnValue({ data: [make("s1"), make("s2")], isLoading: false, isError: false });
    render(<ServiceListings />);
    expect(screen.getByText("Service s1")).toBeInTheDocument();
    expect(screen.getByText("Service s2")).toBeInTheDocument();
  });

  test("selecting a category re-queries with that category", async () => {
    useServices.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<ServiceListings />);
    await userEvent.click(screen.getByRole("button", { name: "Chefs" }));
    expect(useServices).toHaveBeenLastCalledWith("Chefs");
  });

  test("shows an error state when the query fails", () => {
    useServices.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<ServiceListings />);
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `npm test -- service-listings`
Expected: FAIL — modules do not exist.

- [ ] **Step 8: Create ServiceGrid**

Create `components/features/service-grid.tsx`:

```tsx
import { ServiceCard } from "@/components/design-system";
import type { Service } from "@/lib/types";

export interface ServiceGridProps {
  services: Service[];
  isLoading?: boolean;
}

const gridClass = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4";

function Skeleton() {
  return (
    <div data-testid="service-skeleton" className="flex flex-col gap-2">
      <div className="aspect-[4/5] w-full animate-pulse rounded-md bg-surface-strong" />
      <div className="h-4 w-3/4 animate-pulse rounded-xs bg-surface-strong" />
    </div>
  );
}

export function ServiceGrid({ services, isLoading }: ServiceGridProps) {
  if (isLoading) {
    return (
      <div className={gridClass}>
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} />
        ))}
      </div>
    );
  }

  if (services.length === 0) {
    return <p className="text-body-md text-muted">No services match this category yet.</p>;
  }

  return (
    <div className={gridClass}>
      {services.map((service) => (
        <ServiceCard key={service.id} service={service} />
      ))}
    </div>
  );
}
```

- [ ] **Step 9: Create ServiceListings**

Create `components/features/service-listings.tsx`:

```tsx
"use client";

import { useState } from "react";
import { SERVICE_CATEGORIES } from "@/lib/types";
import { useServices } from "@/lib/hooks/use-services";
import { CategoryStrip } from "./category-strip";
import { ServiceGrid } from "./service-grid";

export function ServiceListings() {
  const [active, setActive] = useState<string>("All");
  const { data, isLoading, isError } = useServices(active);

  return (
    <div className="flex flex-col gap-6">
      <CategoryStrip categories={SERVICE_CATEGORIES} active={active} onSelect={setActive} />
      {isError ? (
        <p className="text-body-md text-error">Something went wrong loading services. Please try again.</p>
      ) : (
        <ServiceGrid services={data ?? []} isLoading={isLoading} />
      )}
    </div>
  );
}
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `npm test -- experience-listings service-listings`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add components/features/experience-grid.tsx components/features/experience-listings.tsx components/features/experience-listings.test.tsx components/features/service-grid.tsx components/features/service-listings.tsx components/features/service-listings.test.tsx
git commit -m "feat: add ExperienceListings and ServiceListings islands"
```

---

### Task 10: Browse pages (/experiences, /services)

**Files:**
- Create: `app/experiences/page.tsx`
- Test: `app/experiences/page.test.tsx`
- Create: `app/services/page.tsx`
- Test: `app/services/page.test.tsx`

**Interfaces:**
- Consumes: `TopNav`, `Footer`, `ExperienceListings`/`ServiceListings` (Task 9).
- Produces: default-exported `ExperiencesPage`/`ServicesPage` server components rendering `TopNav active="experiences"|"services"` + an `<h1>` heading + the listings island + `Footer`.

> Note: `TopNav` accepts an `active` prop. Read `components/design-system/top-nav.tsx` to confirm the accepted values (the homepage uses `active="homes"`). Use the value matching the experiences/services tabs. If `TopNav`'s `active` type does NOT include `"experiences"`/`"services"`, widen that prop's union in `top-nav.tsx` to include them (and highlight the matching tab) as part of Step 3/4, then re-run.

- [ ] **Step 1: Write the failing tests**

Create `app/experiences/page.test.tsx` (mock the island to keep the test off the query stack):

```tsx
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";

vi.mock("@/components/features/experience-listings", () => ({
  ExperienceListings: () => <div data-testid="experience-listings" />,
}));

import ExperiencesPage from "./page";

describe("ExperiencesPage", () => {
  test("renders the heading and the listings island", () => {
    render(<ExperiencesPage />);
    expect(screen.getByRole("heading", { name: /experiences/i })).toBeInTheDocument();
    expect(screen.getByTestId("experience-listings")).toBeInTheDocument();
  });
});
```

Create `app/services/page.test.tsx`:

```tsx
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";

vi.mock("@/components/features/service-listings", () => ({
  ServiceListings: () => <div data-testid="service-listings" />,
}));

import ServicesPage from "./page";

describe("ServicesPage", () => {
  test("renders the heading and the listings island", () => {
    render(<ServicesPage />);
    expect(screen.getByRole("heading", { name: /services/i })).toBeInTheDocument();
    expect(screen.getByTestId("service-listings")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- "experiences/page" "services/page"`
Expected: FAIL — pages do not exist.

- [ ] **Step 3: Create the experiences page**

Create `app/experiences/page.tsx`:

```tsx
import { TopNav, Footer } from "@/components/design-system";
import { ExperienceListings } from "@/components/features/experience-listings";

export default function ExperiencesPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <TopNav active="experiences" />
      <main className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col gap-8 px-6 py-8">
        <h1 className="text-display-sm text-ink">Experiences</h1>
        <ExperienceListings />
      </main>
      <Footer />
    </div>
  );
}
```

- [ ] **Step 4: Create the services page**

Create `app/services/page.tsx`:

```tsx
import { TopNav, Footer } from "@/components/design-system";
import { ServiceListings } from "@/components/features/service-listings";

export default function ServicesPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <TopNav active="services" />
      <main className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col gap-8 px-6 py-8">
        <h1 className="text-display-sm text-ink">Services</h1>
        <ServiceListings />
      </main>
      <Footer />
    </div>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- "experiences/page" "services/page"`
Expected: PASS. (If `TopNav`'s `active` type rejects `"experiences"`/`"services"`, widen the union per the Step note and re-run.)

- [ ] **Step 6: Commit**

```bash
git add "app/experiences/page.tsx" "app/experiences/page.test.tsx" "app/services/page.tsx" "app/services/page.test.tsx" components/design-system/top-nav.tsx
git commit -m "feat: add /experiences and /services browse pages"
```

---

### Task 11: Detail pages (/experiences/[id], /services/[id])

**Files:**
- Create: `app/experiences/[id]/page.tsx`
- Test: `app/experiences/[id]/page.test.tsx`
- Create: `app/services/[id]/page.tsx`
- Test: `app/services/[id]/page.test.tsx`

**Interfaces:**
- Consumes: `mockExperienceRepository`/`mockServiceRepository` (Tasks 3–4), `mockHostRepository`/`mockReviewRepository` (existing), `TopNav`, `Footer`, `RatingDisplay`, `HostCard`, `ListingGallery`, `ReviewsGrid`.
- Produces: default-exported async `ExperienceDetailPage`/`ServiceDetailPage` server components taking `{ params: Promise<{ id: string }> }`, calling `notFound()` on a miss.

> Note: `ListingGallery` takes `{ photos: string[]; title: string }`, `ReviewsGrid` takes `{ reviews: Review[] }`, `HostCard` takes `{ host: Host }`, and `mockReviewRepository.findByListingId(id)` returns reviews — all confirmed from `app/rooms/[id]/page.tsx`. Experience reviews were seeded under ids `e1`/`e2` in Task 2.

- [ ] **Step 1: Write the failing tests**

Create `app/experiences/[id]/page.test.tsx`:

```tsx
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";

vi.mock("@/components/features/listing-gallery", () => ({
  ListingGallery: () => <div data-testid="gallery" />,
}));

import ExperienceDetailPage from "./page";

describe("ExperienceDetailPage", () => {
  test("renders the experience title and per-person price for a known id", async () => {
    const ui = await ExperienceDetailPage({ params: Promise.resolve({ id: "e1" }) });
    render(ui);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/per person/i)).toBeInTheDocument();
  });
});
```

Create `app/services/[id]/page.test.tsx`:

```tsx
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";

vi.mock("@/components/features/listing-gallery", () => ({
  ListingGallery: () => <div data-testid="gallery" />,
}));

import ServiceDetailPage from "./page";

describe("ServiceDetailPage", () => {
  test("renders the service title and provider for a known id", async () => {
    const ui = await ServiceDetailPage({ params: Promise.resolve({ id: "s1" }) });
    render(ui);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/Mara Lensworth/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- page.test`
Expected: FAIL — the two new `[id]` pages do not exist (existing page tests still pass).

- [ ] **Step 3: Create the experience detail page**

Create `app/experiences/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { mockExperienceRepository } from "@/lib/repositories/mock/mock-experience-repository";
import { mockHostRepository } from "@/lib/repositories/mock/mock-host-repository";
import { mockReviewRepository } from "@/lib/repositories/mock/mock-review-repository";
import { TopNav, Footer, RatingDisplay, HostCard } from "@/components/design-system";
import { ListingGallery } from "@/components/features/listing-gallery";
import { ReviewsGrid } from "@/components/features/reviews-grid";

export default async function ExperienceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const experience = await mockExperienceRepository.findById(id);
  if (!experience) notFound();

  const [host, reviews] = await Promise.all([
    mockHostRepository.findById(experience.hostId),
    mockReviewRepository.findByListingId(experience.id),
  ]);

  return (
    <div className="min-h-screen bg-canvas">
      <TopNav active="experiences" />
      <main className="mx-auto max-w-[1080px] px-6 pb-16">
        <header className="py-6">
          <h1 className="text-display-sm text-ink">{experience.title}</h1>
          <p className="mt-1 text-body-md text-muted">
            {experience.location.city}, {experience.location.country} · {experience.durationHours} hours
          </p>
        </header>

        <ListingGallery photos={experience.photos} title={experience.title} />

        <div className="mt-8 grid grid-cols-1 gap-12 lg:grid-cols-[1.7fr_1fr]">
          <div className="flex flex-col">
            <section className="border-b border-hairline pb-8">
              <h2 className="mb-3 text-display-sm text-ink">About this experience</h2>
              <p className="text-body-md text-body">{experience.description}</p>
            </section>

            {host && (
              <div className="border-b border-hairline py-8">
                <HostCard host={host} />
              </div>
            )}

            <section className="pt-8">
              <RatingDisplay value={experience.rating} />
              <p className="mb-6 mt-2 text-center text-body-sm text-muted">
                {experience.reviewCount} reviews
              </p>
              <ReviewsGrid reviews={reviews} />
            </section>
          </div>

          <div className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-lg border border-hairline p-6 shadow-airbnb">
              <p className="text-title-md text-ink">${experience.pricePerPerson} <span className="text-body-sm text-muted">per person</span></p>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
```

- [ ] **Step 4: Create the service detail page**

Create `app/services/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { mockServiceRepository } from "@/lib/repositories/mock/mock-service-repository";
import { TopNav, Footer, RatingDisplay } from "@/components/design-system";
import { ListingGallery } from "@/components/features/listing-gallery";

export default async function ServiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const service = await mockServiceRepository.findById(id);
  if (!service) notFound();

  return (
    <div className="min-h-screen bg-canvas">
      <TopNav active="services" />
      <main className="mx-auto max-w-[1080px] px-6 pb-16">
        <header className="py-6">
          <h1 className="text-display-sm text-ink">{service.title}</h1>
          <p className="mt-1 text-body-md text-muted">
            {service.provider} · {service.serviceCategory} · {service.city}
          </p>
        </header>

        <ListingGallery photos={service.photos} title={service.title} />

        <div className="mt-8 grid grid-cols-1 gap-12 lg:grid-cols-[1.7fr_1fr]">
          <div className="flex flex-col">
            <section className="border-b border-hairline pb-8">
              <h2 className="mb-3 text-display-sm text-ink">About this service</h2>
              <p className="text-body-md text-body">{service.description}</p>
            </section>
            <section className="pt-8">
              <RatingDisplay value={service.rating} />
              <p className="mt-2 text-center text-body-sm text-muted">{service.reviewCount} reviews</p>
            </section>
          </div>

          <div className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-lg border border-hairline p-6 shadow-airbnb">
              <p className="text-title-md text-ink">From ${service.price}</p>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- page.test`
Expected: PASS (the two new detail-page tests plus existing page tests).

- [ ] **Step 6: Commit**

```bash
git add "app/experiences/[id]/page.tsx" "app/experiences/[id]/page.test.tsx" "app/services/[id]/page.tsx" "app/services/[id]/page.test.tsx"
git commit -m "feat: add experience and service detail pages"
```

---

### Task 12: Link cards + E2E vertical navigation

**Files:**
- Modify: `components/features/experience-grid.tsx`
- Modify: `components/features/service-grid.tsx`
- Create: `e2e/verticals.spec.ts`

**Interfaces:**
- Consumes: `/experiences`, `/services`, `/experiences/[id]`, `/services/[id]` routes (Tasks 10–11) and the `TopNav` links (already present).
- Produces: each grid card wrapped in a `next/link` to its detail page; an E2E spec covering browse → filter → detail for both verticals.

- [ ] **Step 1: Wrap experience grid cards in links**

In `components/features/experience-grid.tsx`, add `import Link from "next/link";` at the top and change the final render map to:

```tsx
      {experiences.map((experience) => (
        <Link key={experience.id} href={`/experiences/${experience.id}`}>
          <ExperienceCard experience={experience} />
        </Link>
      ))}
```

- [ ] **Step 2: Wrap service grid cards in links**

In `components/features/service-grid.tsx`, add `import Link from "next/link";` at the top and change the final render map to:

```tsx
      {services.map((service) => (
        <Link key={service.id} href={`/services/${service.id}`}>
          <ServiceCard service={service} />
        </Link>
      ))}
```

- [ ] **Step 3: Run the island unit suites to confirm no regression**

Run: `npm test -- experience-listings service-listings`
Expected: PASS (the tests assert on card text, unaffected by the link wrapper).

- [ ] **Step 4: Write the E2E spec**

Create `e2e/verticals.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("browses experiences, filters a category, and opens a detail", async ({ page }) => {
  await page.goto("/experiences");
  await expect(page.getByRole("heading", { level: 1, name: /experiences/i })).toBeVisible({ timeout: 30000 });

  await page.getByRole("button", { name: "Nature" }).click();
  await page.locator('a[href^="/experiences/"]').first().click();
  await expect(page).toHaveURL(/\/experiences\/e\d+/, { timeout: 30000 });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30000 });
});

test("browses services and opens a detail", async ({ page }) => {
  await page.goto("/services");
  await expect(page.getByRole("heading", { level: 1, name: /services/i })).toBeVisible({ timeout: 30000 });

  await page.locator('a[href^="/services/"]').first().click();
  await expect(page).toHaveURL(/\/services\/s\d+/, { timeout: 30000 });
  await expect(page.getByText(/about this service/i)).toBeVisible({ timeout: 30000 });
});

test("top-nav tab routes to experiences", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /experiences/i }).first().click();
  await expect(page).toHaveURL(/\/experiences/, { timeout: 30000 });
});
```

- [ ] **Step 5: Run the E2E spec**

Run: `npm run e2e -- verticals`
Expected: PASS (3 tests). The 30s timeouts absorb the dev server's on-demand compile.

- [ ] **Step 6: Commit**

```bash
git add components/features/experience-grid.tsx components/features/service-grid.tsx e2e/verticals.spec.ts
git commit -m "feat: link vertical cards to detail pages and add verticals e2e"
```

---

## Self-Review

**1. Spec coverage** (spec §5 routes; §6 data model; §7 data flow; §10 phase 5):
- `/experiences`, `/experiences/[id]`, `/services`, `/services/[id]` → Tasks 10–11. ✔
- `Experience` (4:5 card, `isNew`) and `Service` (provider, category, price) entities → Task 1; data → Task 2. ✔
- Data flow (TanStack Query → api-client → `/api/*` route → mock repository; Zod at the boundary; loading/error/empty states) → Tasks 3–9. ✔
- Interactive category filtering (user decision) → Tasks 6–9. Dedicated `ServiceCard` (user decision) → Task 8. Browse + detail (user decision) → Tasks 10–11. ✔
- Fixes the dead `TopNav` links to `/experiences` and `/services` → Tasks 10, 12. ✔

**2. Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N" — every code step is complete. Steps that depend on existing code (review field names in Task 2; `TopNav.active` union in Task 10; the detail-atom signatures in Task 11) carry an explicit "read the file / widen the union" instruction with the concrete fallback action inline. ✔

**3. Type consistency:** `Experience`/`Service` (Task 1) are consumed unchanged by data (Task 2), repositories (Tasks 3–4), schemas (Task 5), api-client+hooks (Tasks 6–7), cards (Task 8), grids+islands (Task 9), and pages (Tasks 10–11). `ExperienceFilters`/`ServiceFilters` use `{ category?: string }` consistently. Hook query keys (`["experiences", …]`, `["services", …]`) are unique and distinct from Homes' `["listings", …]`. `ExperienceCard({ experience })` / `ServiceCard({ service })` prop names match between Task 8 and Task 9; the link wrapper in Task 12 preserves them. Detail pages reuse `ListingGallery({photos,title})`, `ReviewsGrid({reviews})`, `HostCard({host})` with the exact signatures confirmed from `app/rooms/[id]/page.tsx`. The `service-grid` skeleton/empty/link changes keep `ServiceGridProps` intact. ✔

**Known deferrals (by spec phasing, not gaps):** wishlists/auth gating → Phase 6; booking/reservation on experiences → not in scope; maps on these verticals → not in scope (Homes-only per spec §5); responsive polish + a11y pass → Phase 8.
