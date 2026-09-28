# Frontend Phase 7 — Host Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Logged-in users can become hosts. They create a listing through a 4-step flow, manage it (edit, unlist, relist), and see guests' bookings on it. Host listings appear in the catalog, so guests can book them.

**Architecture:**
- Host listings and host profiles live in new in-memory repositories (mocks in both `DATA_SOURCE` modes, as in phase 6).
- `getRepositories()` wraps the catalog's `listings` and `hosts` repositories with combining versions: host listings are appended to `findAll` through a shared `matchesFilters`, and `hl-` ids / `u-` host ids are routed to the host stores.
- New session-guarded `/api/host/*` handlers take the writes. Server pages under `/host` read the repositories directly.
- One client `HostListingForm` handles both create and edit.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Zod v4, TanStack Query v5 (existing), Tailwind v4 tokens, Vitest + RTL, Playwright. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-28-frontend-phase7-host-pages-design.md`

## Global Constraints

- **No new npm dependencies.** Native elements only (`<select>`, `<textarea>`, checkboxes); no UI library.
- **Storage:** host listings and host profiles are in-memory mocks on `globalThis`, the same in both `DATA_SOURCE` modes. Only `lib/repositories/**` imports mock repositories (the ESLint guard).
- **Ids:** host listing ids start with `hl-` (`HOST_LISTING_ID_PREFIX`); host ids of users are the session user id (`u-<email>`).
- **Listings:** `Listing.status` is optional: `"listed" | "unlisted"`, and missing means listed. Seed data is not edited (`npm run seed:check` must stay green).
- **Validation messages (exact):**
  - `Titles need 5–80 characters`
  - `Descriptions need 20–1000 characters`
  - `Pick a property type`, `Pick a category`, `Pick a city`
  - `Pick 1 to 5 photos`
  - `Price must be between $10 and $10,000`
  - `Unknown amenity`
- **Limits:**
  - title 5–80 (trimmed), description 20–1000 (trimmed);
  - maxGuests 1–16, bedrooms 0–20, beds 1–30;
  - baths 0.5–20 in steps of 0.5;
  - photos 1–5, unique, from `PHOTO_OPTIONS`;
  - pricePerNight an integer 10–10000.
- **API errors (exact):**
  - `Log in to continue` (401)
  - `Listing not found` (404, host endpoints)
  - `You can't book your own listing` (400)
  - `This place isn't taking bookings right now` (400)
- **Gating:** `/host/listings`, `/host/listings/new`, `/host/listings/[id]/edit` and `/host/reservations` call `requireSession(<path>)`. `/host` is public.
- **"New" rating:** listings with `reviewCount === 0` show "New" where a rating is displayed (`PropertyCard`, `ListingOverview`, the reviews band on `/rooms/[id]`).
- **Style:** design tokens only (`bg-rausch`, `text-ink`, `border-hairline`, `shadow-airbnb`, `text-error`, `bg-surface-soft`, `.text-*` type classes); no arbitrary colors.
- **Existing tests that may change, and only as each task states:**
  - `lib/repositories/index.test.ts`: its "uses the mock repositories" assertion on `listings` identity;
  - `app/rooms/[id]/page.test.tsx`: add a `get-session` mock; existing assertions stay.

  Adding new test cases to existing test files is fine. Every other existing test passes unchanged.
- **Toolchain quirks:**
  - `vi.fn().mockRejectedValue` can trip Vitest's unhandled-rejection check; use `mockRejectedValueOnce`.
  - `notFound()` throws `NEXT_HTTP_ERROR_FALLBACK;404`, and `redirect()` throws an error whose message is `NEXT_REDIRECT`.
  - Route handler tests start with `// @vitest-environment node`.
- **E2E:** before filling a form after navigation, `await page.waitForLoadState("networkidle")`. Use unique emails and titles per run.
- **Commands:** run from `frontend/`: `npm test`, `npx tsc --noEmit`, `npm run lint`.
- **Commits** use conventional format and end with exactly:
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
  Never substitute another model name.
- **Branch:** `feat/frontend-phase7-host-pages` (it already exists and holds the spec). The user pre-approved the plan; finish with a pull request.

## Review Focus

1. **Another user editing or unlisting my listing** (API with my id, or `/host/listings/<my-id>/edit`). Expected: 404, and nothing changes. → Task 3 tests `another host's listing is 404 for update and status`; Task 4 test `another host's listing is not found on the edit page`.
2. **A guest booking an unlisted listing, or a host booking their own.** Expected: a 400 with the exact message; `/book` redirects back to the listing; `/rooms` shows a notice or the owner card instead of Reserve. → Task 3 tests `refuses to book your own listing` and `refuses to book an unlisted listing`; Task 6 tests `the owner sees manage links instead of the reservation card`, `an unlisted listing shows a notice to guests` and `booking your own listing redirects back to it`.
3. **A crafted create body** (photo URL not in the gallery, unknown amenity or city, 6 photos, fractional price, `baths: 1.3`). Expected: 400 with a clear message; nothing saved (a stray photo host would also crash `next/image`). → Task 2 schema tests; Task 3 test `rejects photos outside the gallery`.
4. **Unlisting.** Expected: gone from `findAll` (home and search), but `findById` still resolves it (existing bookings, the host's views) and it still appears under the host's reservations. → Task 2 test `unlisted host listings leave findAll but still resolve by id`; Task 5 test `lists reservations on the host's listings, including unlisted ones`.
5. **Search filters on host listings** (an Aspen listing for 2 guests searched with `guests=4`, another city, another category, a price range). Expected: filtered exactly like seed listings. → Task 1 tests on `matchesFilters`; Task 2 test `host listings are filtered like catalog listings`.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/search/match-listing.ts` | `matchesFilters` (shared by the mock catalog and the host listings) |
| `lib/types.ts` (modify) | `Listing.status?` |
| `lib/api-client/schemas.ts` (modify) | `listingSchema` accepts an optional `status` |
| `lib/host/options.ts` | `PROPERTY_TYPES`, `HOST_CATEGORIES`, `AMENITY_OPTIONS`, `PHOTO_OPTIONS`, `HOST_CITIES`, `DEFAULT_HOST_AVATAR`, `MAX_PHOTOS`, `HOST_LISTING_ID_PREFIX` |
| `lib/host/schemas.ts` | `hostListingInputSchema`, `HostListingInput`, `listingStatusSchema` |
| `lib/host/listing-input.ts` | `buildHostListing`, `toHostListingInput` |
| `lib/repositories/host-listing-repository.ts`, `host-profile-repository.ts` | interfaces |
| `lib/repositories/mock/mock-host-listing-repository.ts`, `mock-host-profile-repository.ts` | in-memory implementations |
| `lib/repositories/combined.ts` | `combineListings`, `combineHosts` |
| `lib/repositories/booking-repository.ts` + mock (modify) | `listForListings` |
| `lib/repositories/index.ts` (modify) | wires everything in both modes |
| `app/api/host/listings/route.ts`, `[id]/route.ts`, `[id]/status/route.ts` | host writes |
| `app/api/bookings/route.ts` (modify) | own-listing and unlisted rules |
| `lib/api-client/host.ts` | `createHostListing`, `updateHostListing`, `setHostListingStatus` |
| `components/features/host/host-listing-form.tsx` | the 4-step create/edit form |
| `components/features/host/earnings-estimate.tsx`, `host-nav.tsx`, `listing-status-button.tsx` | host UI pieces |
| `app/host/page.tsx`, `app/host/listings/page.tsx`, `app/host/listings/new/page.tsx`, `app/host/listings/[id]/edit/page.tsx`, `app/host/reservations/page.tsx` | pages |
| `lib/bookings/trips.ts` (modify) | `splitTrips` made generic over `Booking` subtypes |
| `components/features/auth/account-menu.tsx` (modify) | "Host dashboard" link |
| `app/rooms/[id]/page.tsx`, `app/book/[listingId]/page.tsx` (modify) | owner and unlisted variants |
| `components/design-system/property-card.tsx`, `components/features/listing-overview.tsx` (modify) | "New" rating |
| `e2e/host.spec.ts` | end-to-end host flows |

All paths are relative to `frontend/` except the docs in Task 7.

---

### Task 1: Shared filters and the listing status field

**Files:**
- Create: `lib/search/match-listing.ts`
- Modify: `lib/repositories/mock/mock-listing-repository.ts`, `lib/types.ts`, `lib/api-client/schemas.ts`
- Test: `lib/search/match-listing.test.ts`, `lib/api-client/schemas.test.ts` (append)

**Interfaces:**
- Produces: `matchesFilters(listing: Listing, filters?: ListingFilters): boolean`; `Listing.status?: "listed" | "unlisted"`; `listingSchema` with `status` optional.

- [ ] **Step 1: Write the failing tests**

`lib/search/match-listing.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { listings } from "@/lib/data/listings";
import type { Listing } from "@/lib/types";
import { matchesFilters } from "./match-listing";

const cabin: Listing = { ...listings[0], location: { ...listings[0].location, city: "Aspen" }, category: "Cabins", pricePerNight: 200, maxGuests: 2, bedrooms: 1, beds: 1, baths: 1 };

describe("matchesFilters", () => {
  test("no filters (or 'anywhere' and 'All') match everything", () => {
    expect(matchesFilters(cabin)).toBe(true);
    expect(matchesFilters(cabin, { location: "anywhere", category: "All" })).toBe(true);
  });

  test("city is matched case-insensitively", () => {
    expect(matchesFilters(cabin, { location: "aSPEN" })).toBe(true);
    expect(matchesFilters(cabin, { location: "Malibu" })).toBe(false);
  });

  test("category, price range and minimums", () => {
    expect(matchesFilters(cabin, { category: "Beachfront" })).toBe(false);
    expect(matchesFilters(cabin, { minPrice: 200, maxPrice: 200 })).toBe(true);
    expect(matchesFilters(cabin, { minPrice: 201 })).toBe(false);
    expect(matchesFilters(cabin, { maxPrice: 199 })).toBe(false);
    expect(matchesFilters(cabin, { guests: 2, bedrooms: 1, beds: 1, baths: 1 })).toBe(true);
    expect(matchesFilters(cabin, { guests: 4 })).toBe(false);
    expect(matchesFilters(cabin, { bedrooms: 2 })).toBe(false);
    expect(matchesFilters(cabin, { beds: 2 })).toBe(false);
    expect(matchesFilters(cabin, { baths: 1.5 })).toBe(false);
  });
});
```

Append to `lib/repositories/mock/mock-listing-repository.test.ts`. It sits under `lib/repositories/`, where the mock-import guard allows it. Add the imports `listings` from `@/lib/data/listings`, `matchesFilters` from `@/lib/search/match-listing` and `type ListingFilters` from `../listing-repository`.

```ts
describe("mockListingRepository filter parity", () => {
  test.each<ListingFilters>([
    {},
    { location: "Aspen" },
    { location: "aspen", category: "Cabins" },
    { minPrice: 200, maxPrice: 400 },
    { guests: 4, bedrooms: 2 },
    { beds: 3, baths: 2 },
  ])("returns exactly the seed listings matchesFilters accepts for %o", async (filters) => {
    const expected = listings.filter((l) => matchesFilters(l, filters)).map((l) => l.id);
    expect((await mockListingRepository.findAll(filters)).map((l) => l.id)).toEqual(expected);
  });
});
```

Append to `lib/api-client/schemas.test.ts` (inside a new `describe`, reusing the file's imports; add `listingSchema` to the import if needed):

```ts
describe("listingSchema status", () => {
  const base = listingSchema.parse({
    id: "l1", title: "Cozy cabin", location: { city: "Aspen", country: "USA", lat: 39.19, lng: -106.82 },
    photos: ["https://example.com/a.jpg"], pricePerNight: 220, rating: 4.92, reviewCount: 88, isGuestFavorite: true,
    hostId: "h1", category: "Cabins", description: "A warm cabin in the pines.", propertyType: "Entire cabin",
    maxGuests: 4, bedrooms: 2, beds: 3, baths: 1, amenities: ["Wifi"],
  });

  test("accepts listings with no status, listed or unlisted", () => {
    expect(listingSchema.parse({ ...base, status: "unlisted" }).status).toBe("unlisted");
    expect(listingSchema.parse({ ...base, status: "listed" }).status).toBe("listed");
    expect(base.status).toBeUndefined();
  });

  test("rejects other statuses", () => {
    expect(() => listingSchema.parse({ ...base, status: "draft" })).toThrow();
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd frontend && npx vitest run lib/search/match-listing.test.ts lib/repositories/mock/mock-listing-repository.test.ts lib/api-client/schemas.test.ts`
Expected: FAIL. `./match-listing` can't be resolved, and `status: "draft"` does not throw yet.

- [ ] **Step 3: Implement**

`lib/search/match-listing.ts`:

```ts
import type { ListingFilters } from "@/lib/repositories/listing-repository";
import type { Listing } from "@/lib/types";

/**
 * Whether a listing passes the search filters. The one set of rules for seed and host listings:
 * city case-insensitive ("anywhere" = any), category ("All" = any), price range, and minimum guests/rooms/beds/baths.
 */
export function matchesFilters(listing: Listing, filters: ListingFilters = {}): boolean {
  const { location, category, minPrice, maxPrice, guests, bedrooms, beds, baths } = filters;
  if (location && location.toLowerCase() !== "anywhere" && listing.location.city.toLowerCase() !== location.toLowerCase()) {
    return false;
  }
  if (category && category !== "All" && listing.category !== category) return false;
  if (minPrice !== undefined && listing.pricePerNight < minPrice) return false;
  if (maxPrice !== undefined && listing.pricePerNight > maxPrice) return false;
  if (guests !== undefined && listing.maxGuests < guests) return false;
  if (bedrooms !== undefined && listing.bedrooms < bedrooms) return false;
  if (beds !== undefined && listing.beds < beds) return false;
  if (baths !== undefined && listing.baths < baths) return false;
  return true;
}
```

`lib/repositories/mock/mock-listing-repository.ts`: replace the body of `findAll` with

```ts
  async findAll(filters?: ListingFilters): Promise<Listing[]> {
    return listings.filter((listing) => matchesFilters(listing, filters));
  },
```

and add `import { matchesFilters } from "@/lib/search/match-listing";`. `findById` is unchanged.

`lib/types.ts`: add to `Listing`, after `amenities`:

```ts
  /** Host-created listings can be unlisted; seed and backend listings leave it out, meaning listed. */
  status?: "listed" | "unlisted";
```

`lib/api-client/schemas.ts`: add `status: z.enum(["listed", "unlisted"]).optional(),` as the last field of `listingSchema`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run lib/search lib/repositories lib/api-client && npm test && npx tsc --noEmit && npm run lint`
Expected: all pass, including every existing `mockListingRepository` and listings route test unchanged; tsc and lint are clean.

- [ ] **Step 5: Commit**

```bash
git add lib/search/match-listing.ts lib/search/match-listing.test.ts lib/repositories/mock/mock-listing-repository.ts lib/repositories/mock/mock-listing-repository.test.ts lib/types.ts lib/api-client/schemas.ts lib/api-client/schemas.test.ts
git commit -m "refactor: share the listing search filters and add an optional listing status

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Host options, input schema, host repositories and the combined catalog

**Files:**
- Create: `lib/host/options.ts`, `lib/host/schemas.ts`, `lib/host/listing-input.ts`
- Create: `lib/repositories/host-listing-repository.ts`, `lib/repositories/host-profile-repository.ts`, `lib/repositories/combined.ts`
- Create: `lib/repositories/mock/mock-host-listing-repository.ts`, `lib/repositories/mock/mock-host-profile-repository.ts`
- Modify: `lib/repositories/booking-repository.ts`, `lib/repositories/mock/mock-booking-repository.ts`, `lib/repositories/index.ts`, `lib/repositories/index.test.ts`
- Test: `lib/host/schemas.test.ts`, `lib/repositories/mock/mock-host-listing-repository.test.ts`, `lib/repositories/mock/mock-host-profile-repository.test.ts`, `lib/repositories/combined.test.ts`, `lib/repositories/mock/mock-booking-repository.test.ts` (append)

**Interfaces:**
- Consumes: `matchesFilters` (Task 1); `User`, `Host`, `Listing`, `Booking`, `CATEGORIES`.
- Produces:
  - `HOST_LISTING_ID_PREFIX = "hl-"`, `PROPERTY_TYPES`, `HOST_CATEGORIES: string[]`, `AMENITY_OPTIONS`, `PHOTO_OPTIONS: readonly string[]` (12), `HOST_CITIES: readonly HostCity[]` (`{ id, name, country, lat, lng }`), `DEFAULT_HOST_AVATAR`, `MAX_PHOTOS = 5`;
  - `hostListingInputSchema`, `HostListingInput`, `listingStatusSchema`;
  - `buildHostListing(id, hostId, input, status): Listing` and `toHostListingInput(listing): HostListingInput`;
  - `HostListingRepository { listForHost; findById; create; update; setStatus; listPublic }`;
  - `HostProfileRepository { upsertFromUser(user: User): Promise<void>; findById(id): Promise<Host | null> }`;
  - `BookingRepository.listForListings(listingIds: string[]): Promise<Array<Booking & { guestId: string }>>`;
  - `combineListings(catalog, hostListings)`, `combineHosts(catalog, profiles)`;
  - `AppRepositories` gains `hostListings`, `hostProfiles`.

- [ ] **Step 1: Write the failing tests**

`lib/host/schemas.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { hostListingInputSchema, listingStatusSchema } from "./schemas";
import { AMENITY_OPTIONS, HOST_CITIES, PHOTO_OPTIONS } from "./options";
import { validInput } from "./test-fixtures";

function firstError(override: Record<string, unknown>): string | undefined {
  const parsed = hostListingInputSchema.safeParse({ ...validInput, ...override });
  return parsed.success ? undefined : parsed.error.issues[0]?.message;
}

describe("hostListingInputSchema", () => {
  test("accepts a valid listing and trims the text", () => {
    const parsed = hostListingInputSchema.parse(validInput);
    expect(parsed.title).toBe("Sunny cabin by the lake");
  });

  test("offers six cities and twelve gallery photos", () => {
    expect(HOST_CITIES.map((c) => c.id)).toEqual(["wilmington", "athens", "aspen", "malibu", "kyoto", "lisbon"]);
    expect(PHOTO_OPTIONS).toHaveLength(12);
    expect(PHOTO_OPTIONS.every((url) => url.startsWith("https://images.unsplash.com/"))).toBe(true);
    expect(AMENITY_OPTIONS).toContain("Pool");
  });

  test.each([
    [{ title: "Hut" }, "Titles need 5–80 characters"],
    [{ title: "x".repeat(81) }, "Titles need 5–80 characters"],
    [{ description: "Too short" }, "Descriptions need 20–1000 characters"],
    [{ propertyType: "Castle" }, "Pick a property type"],
    [{ category: "All" }, "Pick a category"],
    [{ cityId: "paris" }, "Pick a city"],
    [{ photos: [] }, "Pick 1 to 5 photos"],
    [{ photos: ["https://evil.example.com/x.jpg"] }, "Pick 1 to 5 photos"],
    [{ photos: PHOTO_OPTIONS.slice(0, 6) }, "Pick 1 to 5 photos"],
    [{ photos: [PHOTO_OPTIONS[0], PHOTO_OPTIONS[0]] }, "Pick 1 to 5 photos"],
    [{ amenities: ["Helipad"] }, "Unknown amenity"],
    [{ pricePerNight: 9 }, "Price must be between $10 and $10,000"],
    [{ pricePerNight: 10001 }, "Price must be between $10 and $10,000"],
    [{ pricePerNight: 99.5 }, "Price must be between $10 and $10,000"],
  ])("rejects %o", (override, message) => {
    expect(firstError(override)).toBe(message);
  });

  test.each([{ maxGuests: 0 }, { maxGuests: 17 }, { bedrooms: -1 }, { beds: 0 }, { baths: 0 }, { baths: 1.3 }])(
    "rejects out-of-range size %o",
    (override) => {
      expect(firstError(override)).toBeDefined();
    },
  );

  test("the status body is listed or unlisted", () => {
    expect(listingStatusSchema.parse({ status: "unlisted" }).status).toBe("unlisted");
    expect(listingStatusSchema.safeParse({ status: "deleted" }).success).toBe(false);
  });
});
```

`lib/repositories/mock/mock-host-listing-repository.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { hostListingInputSchema } from "@/lib/host/schemas";
import { validInput } from "@/lib/host/test-fixtures";
import { toHostListingInput } from "@/lib/host/listing-input";
import { mockHostListingRepository as repo } from "./mock-host-listing-repository";

const input = hostListingInputSchema.parse(validInput);
const newHost = () => `u-${crypto.randomUUID()}@example.com`;

describe("mockHostListingRepository", () => {
  test("creates a listed listing in the chosen city with no reviews yet", async () => {
    const host = newHost();
    const listing = await repo.create(host, input);

    expect(listing.id).toMatch(/^hl-/);
    expect(listing).toMatchObject({
      hostId: host, status: "listed", rating: 0, reviewCount: 0, isGuestFavorite: false,
      location: { city: "Aspen", country: "USA" }, title: "Sunny cabin by the lake", pricePerNight: 180,
    });
    expect(await repo.findById(listing.id)).toEqual(listing);
    expect(toHostListingInput(listing)).toEqual(input);
  });

  test("lists a host's own listings, newest first", async () => {
    const host = newHost();
    const first = await repo.create(host, input);
    const second = await repo.create(host, { ...input, title: "Second place" });
    await repo.create(newHost(), input);

    expect((await repo.listForHost(host)).map((l) => l.id)).toEqual([second.id, first.id]);
  });

  test("only the owner can update or change the status", async () => {
    const host = newHost();
    const listing = await repo.create(host, input);

    expect(await repo.update(newHost(), listing.id, { ...input, title: "Hijacked" })).toBeNull();
    expect(await repo.setStatus(newHost(), listing.id, "unlisted")).toBeNull();
    expect((await repo.findById(listing.id))?.title).toBe("Sunny cabin by the lake");

    const updated = await repo.update(host, listing.id, { ...input, title: "Renamed", cityId: "kyoto" });
    expect(updated).toMatchObject({ title: "Renamed", location: { city: "Kyoto" }, status: "listed" });
  });

  test("listPublic leaves out unlisted listings and keeps the status across edits", async () => {
    const host = newHost();
    const listing = await repo.create(host, input);

    await repo.setStatus(host, listing.id, "unlisted");
    await repo.update(host, listing.id, { ...input, title: "Still hidden" });

    expect((await repo.listPublic()).some((l) => l.id === listing.id)).toBe(false);
    expect((await repo.findById(listing.id))?.status).toBe("unlisted");
  });
});
```

`lib/repositories/mock/mock-host-profile-repository.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { DEFAULT_HOST_AVATAR } from "@/lib/host/options";
import { mockHostProfileRepository as repo } from "./mock-host-profile-repository";

describe("mockHostProfileRepository", () => {
  test("creates a profile from the user once and keeps it", async () => {
    const id = `u-${crypto.randomUUID()}@example.com`;
    await repo.upsertFromUser({ id, name: "Ana", email: "ana@example.com" });
    await repo.upsertFromUser({ id, name: "Renamed", email: "ana@example.com" });

    expect(await repo.findById(id)).toEqual({
      id, name: "Ana", avatar: DEFAULT_HOST_AVATAR, isSuperhost: false, responseRate: 100, joinedYear: new Date().getFullYear(),
    });
    expect(await repo.findById("u-nobody@example.com")).toBeNull();
  });
});
```

`lib/repositories/combined.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { hostListingInputSchema } from "@/lib/host/schemas";
import { validInput } from "@/lib/host/test-fixtures";
import { mockHostListingRepository } from "./mock/mock-host-listing-repository";
import { mockHostProfileRepository } from "./mock/mock-host-profile-repository";
import { mockHostRepository } from "./mock/mock-host-repository";
import { mockListingRepository } from "./mock/mock-listing-repository";
import { combineHosts, combineListings } from "./combined";

const listings = combineListings(mockListingRepository, mockHostListingRepository);
const hosts = combineHosts(mockHostRepository, mockHostProfileRepository);
const input = hostListingInputSchema.parse(validInput);
const newHost = () => `u-${crypto.randomUUID()}@example.com`;

describe("combineListings", () => {
  test("appends listed host listings after the catalog", async () => {
    const listing = await mockHostListingRepository.create(newHost(), { ...input, title: `Combined ${crypto.randomUUID()}` });

    const all = await listings.findAll();

    expect(all.slice(0, 16).map((l) => l.id)).toEqual((await mockListingRepository.findAll()).map((l) => l.id));
    expect(all.some((l) => l.id === listing.id)).toBe(true);
  });

  test("host listings are filtered like catalog listings", async () => {
    const listing = await mockHostListingRepository.create(newHost(), { ...input, cityId: "aspen", maxGuests: 2, category: "Cabins", pricePerNight: 180 });
    const ids = async (filters: Parameters<typeof listings.findAll>[0]) => (await listings.findAll(filters)).map((l) => l.id);

    expect(await ids({ location: "aspen" })).toContain(listing.id);
    expect(await ids({ location: "Aspen", guests: 4 })).not.toContain(listing.id);
    expect(await ids({ location: "Malibu" })).not.toContain(listing.id);
    expect(await ids({ category: "Beachfront" })).not.toContain(listing.id);
    expect(await ids({ minPrice: 200 })).not.toContain(listing.id);
  });

  test("unlisted host listings leave findAll but still resolve by id", async () => {
    const host = newHost();
    const listing = await mockHostListingRepository.create(host, input);
    await mockHostListingRepository.setStatus(host, listing.id, "unlisted");

    expect((await listings.findAll()).some((l) => l.id === listing.id)).toBe(false);
    expect((await listings.findById(listing.id))?.status).toBe("unlisted");
    expect((await listings.findById("l1"))?.id).toBe("l1");
    expect(await listings.findById("hl-missing")).toBeNull();
  });
});

describe("combineHosts", () => {
  test("user ids go to host profiles, others to the catalog", async () => {
    const id = newHost();
    await mockHostProfileRepository.upsertFromUser({ id, name: "Ana", email: "ana@example.com" });

    expect((await hosts.findById(id))?.name).toBe("Ana");
    expect((await hosts.findById("h1"))?.id).toBe("h1");
    expect(await hosts.findById("u-nobody@example.com")).toBeNull();
  });
});
```

Append to `lib/repositories/mock/mock-booking-repository.test.ts` (inside its `describe`; the file already has `stay`, `newUser` and `newListing` helpers):

```ts
  test("listForListings returns every guest's bookings on those listings, soonest first, with the guest id", async () => {
    const listing = newListing();
    const early = newUser();
    const late = newUser();
    await repo.create(late, stay(listing, "2031-05-10", "2031-05-12"));
    await repo.create(early, stay(listing, "2031-04-01", "2031-04-03"));
    await repo.create(newUser(), stay(newListing(), "2031-04-01", "2031-04-03"));

    const result = await repo.listForListings([listing]);

    expect(result.map((b) => [b.guestId, b.checkIn])).toEqual([[early, "2031-04-01"], [late, "2031-05-10"]]);
  });
```

`lib/repositories/index.test.ts`: the existing test "uses the mock repositories when DATA_SOURCE is unset or empty" asserts `getRepositories().listings` **is** `mockListingRepository`. Listings are now combined, so replace that one assertion (keep the `cities` one) with:

```ts
    expect((await getRepositories().listings.findById("l1"))?.id).toBe("l1");
```

Make the test `async`. In the "uses the mock repositories when DATA_SOURCE=mock" test, replace `expect(getRepositories().listings).toBe(mockListingRepository);` with `expect(getRepositories().cities).toBe(mockCityRepository);`. Then append, inside the `describe`:

```ts
  test("host listings and profiles are the frontend mocks in both modes, and join the catalog", async () => {
    vi.stubEnv("DATA_SOURCE", "mock");
    const mock = getRepositories();
    vi.stubEnv("DATA_SOURCE", "api");
    vi.stubEnv("API_HTTP", "http://backend.test");
    const api = getRepositories();

    expect(api.hostListings).toBe(mock.hostListings);
    expect(api.hostProfiles).toBe(mock.hostProfiles);
    const created = await mock.hostListings.create(`u-${crypto.randomUUID()}@example.com`, (await import("@/lib/host/schemas")).hostListingInputSchema.parse((await import("@/lib/host/test-fixtures")).validInput));
    expect((await mock.listings.findById(created.id))?.id).toBe(created.id);
  });
```

If `mockListingRepository` is no longer used in `index.test.ts` after these edits, remove its import.

All tests import `validInput` from `lib/host/test-fixtures.ts`, which Step 3 creates.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run lib/host lib/repositories`
Expected: FAIL. The new modules can't be resolved, and `listForListings` is not a function.

- [ ] **Step 3: Implement**

`lib/host/options.ts`:

```ts
import { listings } from "@/lib/data/listings";
import { CATEGORIES } from "@/lib/types";

export const HOST_LISTING_ID_PREFIX = "hl-";
export const MAX_PHOTOS = 5;

export const PROPERTY_TYPES = [
  "Entire home", "Entire cabin", "Entire villa", "Entire apartment", "Entire cottage", "Tiny home", "Private room",
] as const;

export const HOST_CATEGORIES: string[] = CATEGORIES.filter((category) => category !== "All");

export const AMENITY_OPTIONS = [
  "Wifi", "Kitchen", "Free parking", "Self check-in", "Air conditioning", "Washer", "Pool", "Hot tub", "Workspace", "Pets allowed",
] as const;

// The seed listings' cover photos: all on images.unsplash.com, which next.config.ts allows for next/image.
export const PHOTO_OPTIONS: readonly string[] = [...new Set(listings.map((listing) => listing.photos[0]))].slice(0, 12);

export interface HostCity {
  id: string;
  name: string;
  country: string;
  lat: number;
  lng: number;
}

// The six cities the site knows, with coordinates so host listings get a map pin without geocoding.
export const HOST_CITIES: readonly HostCity[] = [
  { id: "wilmington", name: "Wilmington", country: "USA", lat: 34.22, lng: -77.94 },
  { id: "athens", name: "Athens", country: "Greece", lat: 37.98, lng: 23.72 },
  { id: "aspen", name: "Aspen", country: "USA", lat: 39.19, lng: -106.82 },
  { id: "malibu", name: "Malibu", country: "USA", lat: 34.03, lng: -118.69 },
  { id: "kyoto", name: "Kyoto", country: "Japan", lat: 35.01, lng: 135.77 },
  { id: "lisbon", name: "Lisbon", country: "Portugal", lat: 38.72, lng: -9.14 },
];

export const DEFAULT_HOST_AVATAR = "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&q=80";
```

`lib/host/schemas.ts`:

```ts
import { z } from "zod";
import { AMENITY_OPTIONS, HOST_CATEGORIES, HOST_CITIES, MAX_PHOTOS, PHOTO_OPTIONS, PROPERTY_TYPES } from "./options";

const oneOf = (values: readonly string[], message: string) => z.string().refine((value) => values.includes(value), message);
const unique = (values: string[]) => new Set(values).size === values.length;
const TITLE = "Titles need 5–80 characters";
const DESCRIPTION = "Descriptions need 20–1000 characters";
const PHOTOS = "Pick 1 to 5 photos";
const PRICE = "Price must be between $10 and $10,000";

/** A host's listing as the form and the API take it: shared, so both validate the same way. */
export const hostListingInputSchema = z.object({
  title: z.string().trim().min(5, TITLE).max(80, TITLE),
  description: z.string().trim().min(20, DESCRIPTION).max(1000, DESCRIPTION),
  propertyType: oneOf(PROPERTY_TYPES, "Pick a property type"),
  category: oneOf(HOST_CATEGORIES, "Pick a category"),
  cityId: oneOf(HOST_CITIES.map((city) => city.id), "Pick a city"),
  maxGuests: z.number().int().min(1).max(16),
  bedrooms: z.number().int().min(0).max(20),
  beds: z.number().int().min(1).max(30),
  baths: z.number().min(0.5).max(20).refine((value) => Number.isInteger(value * 2), "Baths go in steps of 0.5"),
  amenities: z.array(oneOf(AMENITY_OPTIONS, "Unknown amenity")).refine(unique, "Amenities must be unique"),
  photos: z.array(oneOf(PHOTO_OPTIONS, PHOTOS)).min(1, PHOTOS).max(MAX_PHOTOS, PHOTOS).refine(unique, PHOTOS),
  pricePerNight: z.number().int(PRICE).min(10, PRICE).max(10000, PRICE),
});

export type HostListingInput = z.infer<typeof hostListingInputSchema>;

export const listingStatusSchema = z.object({ status: z.enum(["listed", "unlisted"]) });
```

`lib/host/test-fixtures.ts`:

```ts
import { PHOTO_OPTIONS } from "./options";

/** A valid (untrimmed) host listing body for tests. */
export const validInput = {
  title: "  Sunny cabin by the lake  ",
  description: "A bright cabin with a deck, a fireplace and a view of the water.",
  propertyType: "Entire cabin",
  category: "Cabins",
  cityId: "aspen",
  maxGuests: 4,
  bedrooms: 2,
  beds: 2,
  baths: 1.5,
  amenities: ["Wifi", "Kitchen"],
  photos: [PHOTO_OPTIONS[0], PHOTO_OPTIONS[1]],
  pricePerNight: 180,
};
```

`lib/host/listing-input.ts`:

```ts
import type { Listing } from "@/lib/types";
import { HOST_CITIES } from "./options";
import type { HostListingInput } from "./schemas";

/** The Listing a host's input describes: new host listings have no rating or reviews yet. */
export function buildHostListing(id: string, hostId: string, input: HostListingInput, status: "listed" | "unlisted"): Listing {
  const city = HOST_CITIES.find((c) => c.id === input.cityId);
  if (!city) throw new Error(`Unknown city '${input.cityId}'`);
  return {
    id,
    title: input.title,
    location: { city: city.name, country: city.country, lat: city.lat, lng: city.lng },
    photos: [...input.photos],
    pricePerNight: input.pricePerNight,
    rating: 0,
    reviewCount: 0,
    isGuestFavorite: false,
    hostId,
    category: input.category,
    description: input.description,
    propertyType: input.propertyType,
    maxGuests: input.maxGuests,
    bedrooms: input.bedrooms,
    beds: input.beds,
    baths: input.baths,
    amenities: [...input.amenities],
    status,
  };
}

/** The form values for editing an existing host listing. */
export function toHostListingInput(listing: Listing): HostListingInput {
  return {
    title: listing.title,
    description: listing.description,
    propertyType: listing.propertyType,
    category: listing.category,
    cityId: HOST_CITIES.find((c) => c.name === listing.location.city)?.id ?? "",
    maxGuests: listing.maxGuests,
    bedrooms: listing.bedrooms,
    beds: listing.beds,
    baths: listing.baths,
    amenities: [...listing.amenities],
    photos: [...listing.photos],
    pricePerNight: listing.pricePerNight,
  };
}
```

`lib/repositories/host-listing-repository.ts`:

```ts
import type { HostListingInput } from "@/lib/host/schemas";
import type { Listing } from "@/lib/types";

export interface HostListingRepository {
  /** The host's own listings, any status, newest first. */
  listForHost(hostId: string): Promise<Listing[]>;
  /** Any status: unlisted listings still resolve for bookings and the host's views. */
  findById(id: string): Promise<Listing | null>;
  create(hostId: string, input: HostListingInput): Promise<Listing>;
  /** Null when the listing doesn't exist or isn't the host's. Keeps the current status. */
  update(hostId: string, id: string, input: HostListingInput): Promise<Listing | null>;
  setStatus(hostId: string, id: string, status: "listed" | "unlisted"): Promise<Listing | null>;
  /** Every listed host listing, for the public catalog. */
  listPublic(): Promise<Listing[]>;
}
```

`lib/repositories/host-profile-repository.ts`:

```ts
import type { Host, User } from "@/lib/types";

export interface HostProfileRepository {
  /** Creates the user's host profile the first time; later calls keep the original. */
  upsertFromUser(user: User): Promise<void>;
  findById(id: string): Promise<Host | null>;
}
```

`lib/repositories/mock/mock-host-listing-repository.ts`:

```ts
import { HOST_LISTING_ID_PREFIX } from "@/lib/host/options";
import { buildHostListing } from "@/lib/host/listing-input";
import type { Listing } from "@/lib/types";
import type { HostListingRepository } from "../host-listing-repository";

// In memory, by listing id; on globalThis so dev hot reload keeps it. A server restart clears it.
const store: Map<string, Listing> = ((globalThis as { __mockHostListings?: Map<string, Listing> }).__mockHostListings ??=
  new Map());

function owned(hostId: string, id: string): Listing | null {
  const listing = store.get(id);
  return listing && listing.hostId === hostId ? listing : null;
}

export const mockHostListingRepository: HostListingRepository = {
  async listForHost(hostId) {
    return [...store.values()].filter((l) => l.hostId === hostId).reverse();
  },

  async findById(id) {
    return store.get(id) ?? null;
  },

  async create(hostId, input) {
    const listing = buildHostListing(`${HOST_LISTING_ID_PREFIX}${crypto.randomUUID()}`, hostId, input, "listed");
    store.set(listing.id, listing);
    return listing;
  },

  async update(hostId, id, input) {
    const current = owned(hostId, id);
    if (!current) return null;
    const updated = buildHostListing(id, hostId, input, current.status ?? "listed");
    store.set(id, updated);
    return updated;
  },

  async setStatus(hostId, id, status) {
    const current = owned(hostId, id);
    if (!current) return null;
    const updated: Listing = { ...current, status };
    store.set(id, updated);
    return updated;
  },

  async listPublic() {
    return [...store.values()].filter((l) => l.status !== "unlisted");
  },
};
```

`lib/repositories/mock/mock-host-profile-repository.ts`:

```ts
import { DEFAULT_HOST_AVATAR } from "@/lib/host/options";
import type { Host } from "@/lib/types";
import type { HostProfileRepository } from "../host-profile-repository";

// In memory, by user id; on globalThis so dev hot reload keeps it. A server restart clears it.
const store: Map<string, Host> = ((globalThis as { __mockHostProfiles?: Map<string, Host> }).__mockHostProfiles ??= new Map());

export const mockHostProfileRepository: HostProfileRepository = {
  async upsertFromUser(user) {
    if (store.has(user.id)) return;
    store.set(user.id, {
      id: user.id,
      name: user.name,
      avatar: DEFAULT_HOST_AVATAR,
      isSuperhost: false,
      responseRate: 100,
      joinedYear: new Date().getFullYear(),
    });
  },

  async findById(id) {
    return store.get(id) ?? null;
  },
};
```

`lib/repositories/combined.ts`:

```ts
import { HOST_LISTING_ID_PREFIX } from "@/lib/host/options";
import { matchesFilters } from "@/lib/search/match-listing";
import type { HostListingRepository } from "./host-listing-repository";
import type { HostProfileRepository } from "./host-profile-repository";
import type { HostRepository } from "./host-repository";
import type { ListingRepository } from "./listing-repository";

/** The public catalog: seed/backend listings, then listed host listings that pass the same filters. */
export function combineListings(catalog: ListingRepository, hostListings: HostListingRepository): ListingRepository {
  return {
    async findAll(filters) {
      const [fromCatalog, fromHosts] = await Promise.all([catalog.findAll(filters), hostListings.listPublic()]);
      return [...fromCatalog, ...fromHosts.filter((listing) => matchesFilters(listing, filters))];
    },
    findById: (id) => (id.startsWith(HOST_LISTING_ID_PREFIX) ? hostListings.findById(id) : catalog.findById(id)),
  };
}

/** Hosts: users who host (ids "u-…") come from host profiles, everyone else from the catalog. */
export function combineHosts(catalog: HostRepository, profiles: HostProfileRepository): HostRepository {
  return { findById: (id) => (id.startsWith("u-") ? profiles.findById(id) : catalog.findById(id)) };
}
```

`lib/repositories/booking-repository.ts`: add to the interface

```ts
  /** Bookings by any guest on these listings, soonest check-in first, with the booking guest's user id. */
  listForListings(listingIds: string[]): Promise<Array<Booking & { guestId: string }>>;
```

`lib/repositories/mock/mock-booking-repository.ts`: add to the object

```ts
  async listForListings(listingIds) {
    const wanted = new Set(listingIds);
    return [...store.entries()]
      .flatMap(([guestId, bookings]) => bookings.filter((b) => wanted.has(b.listingId)).map((b) => ({ ...b, guestId })))
      .sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  },
```

`lib/repositories/index.ts` in full:

```ts
import { createHttpRepositories, type Repositories } from "./http/http-repositories";
import type { BookingRepository } from "./booking-repository";
import { combineHosts, combineListings } from "./combined";
import type { HostListingRepository } from "./host-listing-repository";
import type { HostProfileRepository } from "./host-profile-repository";
import type { WishlistRepository } from "./wishlist-repository";
import { mockBookingRepository } from "./mock/mock-booking-repository";
import { mockCityRepository } from "./mock/mock-city-repository";
import { mockExperienceRepository } from "./mock/mock-experience-repository";
import { mockHostListingRepository } from "./mock/mock-host-listing-repository";
import { mockHostProfileRepository } from "./mock/mock-host-profile-repository";
import { mockHostRepository } from "./mock/mock-host-repository";
import { mockListingRepository } from "./mock/mock-listing-repository";
import { mockReviewRepository } from "./mock/mock-review-repository";
import { mockServiceRepository } from "./mock/mock-service-repository";
import { mockWishlistRepository } from "./mock/mock-wishlist-repository";

export type { Repositories };

export interface AppRepositories extends Repositories {
  wishlists: WishlistRepository;
  bookings: BookingRepository;
  hostListings: HostListingRepository;
  hostProfiles: HostProfileRepository;
}

// Wishlists, bookings and host data are frontend mocks in both data modes: the backend doesn't serve them yet.
const accountRepositories = {
  wishlists: mockWishlistRepository,
  bookings: mockBookingRepository,
  hostListings: mockHostListingRepository,
  hostProfiles: mockHostProfileRepository,
};

/** The catalog plus host-created listings and host profiles, so guests see and book host listings anywhere. */
function withHostData(catalog: Repositories): AppRepositories {
  return {
    ...catalog,
    listings: combineListings(catalog.listings, mockHostListingRepository),
    hosts: combineHosts(catalog.hosts, mockHostProfileRepository),
    ...accountRepositories,
  };
}

const mockRepositories: AppRepositories = withHostData({
  listings: mockListingRepository,
  experiences: mockExperienceRepository,
  services: mockServiceRepository,
  hosts: mockHostRepository,
  reviews: mockReviewRepository,
  cities: mockCityRepository,
});

/**
 * The one switch between mock data and the backend, driven by the server-only
 * DATA_SOURCE flag (mock by default). Reads the env on every call.
 */
export function getRepositories(): AppRepositories {
  const source = process.env.DATA_SOURCE || "mock";
  if (source === "mock") return mockRepositories;
  if (source !== "api") throw new Error(`DATA_SOURCE must be "mock" or "api", got "${source}"`);

  const baseUrl = process.env.API_HTTP;
  if (!baseUrl) throw new Error("DATA_SOURCE=api needs API_HTTP, the backend base URL (Aspire sets it)");
  return withHostData(createHttpRepositories(baseUrl));
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run lib/host lib/repositories && npm test && npx tsc --noEmit && npm run lint`
Expected: all pass, including every existing test not named above. lint shows 0 errors; the test fixture import must not trip the mock-import guard, because it lives in `lib/host`.

- [ ] **Step 5: Commit**

```bash
git add lib/host lib/repositories
git status --short   # expect only this task's files
git commit -m "feat: add host listing and profile repositories joined to the public catalog

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Host API and the booking rules

**Files:**
- Create: `app/api/host/listings/route.ts`, `app/api/host/listings/[id]/route.ts`, `app/api/host/listings/[id]/status/route.ts`, `lib/api-client/host.ts`
- Modify: `app/api/bookings/route.ts`
- Test: `app/api/host/listings/host-listing-routes.test.ts`, `app/api/bookings/route.test.ts` (append), `lib/api-client/host.test.ts`

**Interfaces:**
- Consumes: `hostListingInputSchema`, `listingStatusSchema`, `validInput` (the `lib/host/test-fixtures` fixture); `getRepositories().hostListings/hostProfiles/listings`; `sessionFromRequest`, `parseBody`, `jsonError`, `unauthorized`, `ok`; `callApi`, `listingSchema`; test helpers `sessionCookieHeader`, `jsonRequest`.
- Produces: `POST /api/host/listings` → 201 `Listing`; `PUT /api/host/listings/[id]` → 200 `Listing`; `PATCH /api/host/listings/[id]/status` → 200 `Listing`; `createHostListing(input)`, `updateHostListing(id, input)`, `setHostListingStatus(id, status)`.

- [ ] **Step 1: Write the failing tests**

`app/api/host/listings/host-listing-routes.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, test } from "vitest";
import { POST } from "./route";
import { PUT } from "./[id]/route";
import { PATCH } from "./[id]/status/route";
import { jsonRequest, sessionCookieHeader } from "@/lib/auth/test-helpers";
import { validInput } from "@/lib/host/test-fixtures";
import { getRepositories } from "@/lib/repositories";

const url = "http://localhost/api/host/listings";
const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function create(cookie: string, body: object = validInput) {
  const res = await POST(jsonRequest(url, "POST", body, cookie));
  return { res, body: await res.json() };
}

describe("host listing API", () => {
  test("every endpoint needs a session", async () => {
    expect((await POST(jsonRequest(url, "POST", validInput))).status).toBe(401);
    expect((await PUT(jsonRequest(`${url}/hl-x`, "PUT", validInput), params("hl-x"))).status).toBe(401);
    const res = await PATCH(jsonRequest(`${url}/hl-x/status`, "PATCH", { status: "unlisted" }), params("hl-x"));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Log in to continue");
  });

  test("creates a listed listing and the host profile", async () => {
    const email = `host-${crypto.randomUUID()}@example.com`;
    const { res, body } = await create(sessionCookieHeader(email));

    expect(res.status).toBe(201);
    expect(body.data).toMatchObject({ title: "Sunny cabin by the lake", status: "listed", hostId: `u-${email}` });
    expect((await getRepositories().hosts.findById(`u-${email}`))?.name).toBe(email.split("@")[0]);
    expect((await getRepositories().listings.findById(body.data.id))?.id).toBe(body.data.id);
  });

  test("rejects photos outside the gallery and says why", async () => {
    const { res, body } = await create(sessionCookieHeader(), { ...validInput, photos: ["https://evil.example.com/x.jpg"] });
    expect(res.status).toBe(400);
    expect(body.error).toBe("Pick 1 to 5 photos");
  });

  test("the owner can update and unlist; the listing keeps its id", async () => {
    const cookie = sessionCookieHeader();
    const { body } = await create(cookie);
    const id = body.data.id;

    const updated = await PUT(jsonRequest(`${url}/${id}`, "PUT", { ...validInput, title: "Renamed cabin" }, cookie), params(id));
    expect(updated.status).toBe(200);
    expect((await updated.json()).data.title).toBe("Renamed cabin");

    const unlisted = await PATCH(jsonRequest(`${url}/${id}/status`, "PATCH", { status: "unlisted" }, cookie), params(id));
    expect((await unlisted.json()).data.status).toBe("unlisted");
  });

  test("another host's listing is 404 for update and status", async () => {
    const { body } = await create(sessionCookieHeader());
    const id = body.data.id;
    const stranger = sessionCookieHeader();

    const put = await PUT(jsonRequest(`${url}/${id}`, "PUT", validInput, stranger), params(id));
    const patch = await PATCH(jsonRequest(`${url}/${id}/status`, "PATCH", { status: "unlisted" }, stranger), params(id));

    expect(put.status).toBe(404);
    expect((await put.json()).error).toBe("Listing not found");
    expect(patch.status).toBe(404);
    expect((await getRepositories().hostListings.findById(id))?.status).toBe("listed");
  });

  test("an invalid status body is 400", async () => {
    const cookie = sessionCookieHeader();
    const { body } = await create(cookie);
    const res = await PATCH(jsonRequest(`${url}/${body.data.id}/status`, "PATCH", { status: "deleted" }, cookie), params(body.data.id));
    expect(res.status).toBe(400);
  });
});
```

Append to `app/api/bookings/route.test.ts`, inside its `describe`. The file already has `book`, `daysFromToday` and imports `sessionCookieHeader`, `jsonRequest`. Add `import { getRepositories } from "@/lib/repositories";` and `import { validInput } from "@/lib/host/test-fixtures";` and `import { hostListingInputSchema } from "@/lib/host/schemas";` at the top.

```ts
  test("refuses to book your own listing", async () => {
    const email = `host-${crypto.randomUUID()}@example.com`;
    const listing = await getRepositories().hostListings.create(`u-${email}`, hostListingInputSchema.parse(validInput));

    const res = await book(
      { listingId: listing.id, checkIn: daysFromToday(300), checkOut: daysFromToday(302), adults: 1 },
      sessionCookieHeader(email),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("You can't book your own listing");
  });

  test("refuses to book an unlisted listing", async () => {
    const host = `u-host-${crypto.randomUUID()}@example.com`;
    const listing = await getRepositories().hostListings.create(host, hostListingInputSchema.parse(validInput));
    await getRepositories().hostListings.setStatus(host, listing.id, "unlisted");

    const res = await book({ listingId: listing.id, checkIn: daysFromToday(310), checkOut: daysFromToday(312), adults: 1 });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("This place isn't taking bookings right now");
  });

  test("guests can book a listed host listing", async () => {
    const listing = await getRepositories().hostListings.create(`u-host-${crypto.randomUUID()}@example.com`, hostListingInputSchema.parse(validInput));
    const res = await book({ listingId: listing.id, checkIn: daysFromToday(320), checkOut: daysFromToday(322), adults: 1 });
    expect(res.status).toBe(201);
  });
```

`lib/api-client/host.test.ts`:

```ts
import { afterEach, describe, expect, test, vi } from "vitest";
import { listings } from "@/lib/data/listings";
import { createHostListing, setHostListingStatus, updateHostListing } from "./host";
import { validInput } from "@/lib/host/test-fixtures";
import { hostListingInputSchema } from "@/lib/host/schemas";

const input = hostListingInputSchema.parse(validInput);
const listing = { ...listings[0], id: "hl-1", status: "listed" as const };

function respond(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("host api-client", () => {
  test("create posts the input and returns the listing", async () => {
    const fetchMock = respond({ success: true, data: listing }, 201);
    await expect(createHostListing(input)).resolves.toMatchObject({ id: "hl-1" });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/host/listings");
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
  });

  test("update puts to the listing's url", async () => {
    const fetchMock = respond({ success: true, data: listing });
    await updateHostListing("hl-1", input);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/host/listings/hl-1");
    expect(fetchMock.mock.calls[0][1].method).toBe("PUT");
  });

  test("status patches and surfaces API errors", async () => {
    respond({ success: false, error: "Listing not found" }, 404);
    await expect(setHostListingStatus("hl-1", "unlisted")).rejects.toThrow("Listing not found");
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run app/api/host app/api/bookings lib/api-client/host.test.ts`
Expected: FAIL. The route and `./host` modules can't be resolved, and the two new booking rules aren't enforced.

- [ ] **Step 3: Implement**

`app/api/host/listings/route.ts`:

```ts
import { ok } from "@/lib/api/envelope";
import { parseBody, unauthorized } from "@/lib/api/request";
import { sessionFromRequest } from "@/lib/auth/session";
import { hostListingInputSchema } from "@/lib/host/schemas";
import { getRepositories } from "@/lib/repositories";

export async function POST(request: Request): Promise<Response> {
  const user = sessionFromRequest(request);
  if (!user) return unauthorized();
  const body = await parseBody(request, hostListingInputSchema);
  if ("error" in body) return body.error;

  const repos = getRepositories();
  await repos.hostProfiles.upsertFromUser(user);
  const listing = await repos.hostListings.create(user.id, body.data);
  return Response.json(ok(listing), { status: 201 });
}
```

`app/api/host/listings/[id]/route.ts`:

```ts
import { ok } from "@/lib/api/envelope";
import { jsonError, parseBody, unauthorized } from "@/lib/api/request";
import { sessionFromRequest } from "@/lib/auth/session";
import { hostListingInputSchema } from "@/lib/host/schemas";
import { getRepositories } from "@/lib/repositories";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = sessionFromRequest(request);
  if (!user) return unauthorized();
  const body = await parseBody(request, hostListingInputSchema);
  if ("error" in body) return body.error;

  const { id } = await params;
  const listing = await getRepositories().hostListings.update(user.id, id, body.data);
  return listing ? Response.json(ok(listing)) : jsonError("Listing not found", 404);
}
```

`app/api/host/listings/[id]/status/route.ts`:

```ts
import { ok } from "@/lib/api/envelope";
import { jsonError, parseBody, unauthorized } from "@/lib/api/request";
import { sessionFromRequest } from "@/lib/auth/session";
import { listingStatusSchema } from "@/lib/host/schemas";
import { getRepositories } from "@/lib/repositories";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = sessionFromRequest(request);
  if (!user) return unauthorized();
  const body = await parseBody(request, listingStatusSchema);
  if ("error" in body) return body.error;

  const { id } = await params;
  const listing = await getRepositories().hostListings.setStatus(user.id, id, body.data.status);
  return listing ? Response.json(ok(listing)) : jsonError("Listing not found", 404);
}
```

`app/api/bookings/route.ts`: right after the `if (!listing) return jsonError(...)` line, insert:

```ts
  if (listing.hostId === user.id) return jsonError("You can't book your own listing", 400);
  if (listing.status === "unlisted") return jsonError("This place isn't taking bookings right now", 400);
```

`lib/api-client/host.ts`:

```ts
import type { HostListingInput } from "@/lib/host/schemas";
import type { Listing } from "@/lib/types";
import { callApi } from "./request";
import { listingSchema } from "./schemas";

export function createHostListing(input: HostListingInput): Promise<Listing> {
  return callApi("/api/host/listings", listingSchema, { method: "POST", body: JSON.stringify(input) });
}

export function updateHostListing(id: string, input: HostListingInput): Promise<Listing> {
  return callApi(`/api/host/listings/${encodeURIComponent(id)}`, listingSchema, { method: "PUT", body: JSON.stringify(input) });
}

export function setHostListingStatus(id: string, status: "listed" | "unlisted"): Promise<Listing> {
  return callApi(`/api/host/listings/${encodeURIComponent(id)}/status`, listingSchema, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run app/api lib/api-client && npm test && npx tsc --noEmit && npm run lint`
Expected: all pass (existing bookings tests unchanged); tsc and lint are clean.

- [ ] **Step 5: Commit**

```bash
git add app/api/host app/api/bookings lib/api-client/host.ts lib/api-client/host.test.ts
git commit -m "feat: add the host listing API and stop bookings of own or unlisted listings

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The host listing form, and the create and edit pages

**Files:**
- Create: `components/features/host/host-listing-form.tsx`, `app/host/listings/new/page.tsx`, `app/host/listings/[id]/edit/page.tsx`
- Test: `components/features/host/host-listing-form.test.tsx`, `app/host/listings/new/page.test.tsx`, `app/host/listings/[id]/edit/page.test.tsx`

**Interfaces:**
- Consumes: `hostListingInputSchema`, `HostListingInput`, the options (Task 2); `createHostListing`, `updateHostListing` (Task 3); `toHostListingInput`; `requireSession`; `getRepositories().hostListings`; `TextInput`, `Button`, `TopNav`, `Footer`.
- Produces: `HostListingForm({ mode: "create" } | { mode: "edit"; listingId: string; initial: HostListingInput })`; the routes `/host/listings/new` and `/host/listings/[id]/edit`.

- [ ] **Step 1: Write the failing tests**

`components/features/host/host-listing-form.test.tsx`:

```tsx
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, userEvent } from "@/lib/test-utils";
import { hostListingInputSchema } from "@/lib/host/schemas";
import { validInput } from "@/lib/host/test-fixtures";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
const api = vi.hoisted(() => ({ createHostListing: vi.fn(), updateHostListing: vi.fn() }));
vi.mock("@/lib/api-client/host", () => api);

import { HostListingForm } from "./host-listing-form";

beforeEach(() => {
  push.mockReset();
  api.createHostListing.mockReset();
  api.updateHostListing.mockReset();
});

async function fillStepOne() {
  await userEvent.type(screen.getByLabelText("Title"), "Sunny cabin by the lake");
  await userEvent.selectOptions(screen.getByLabelText("Property type"), "Entire cabin");
  await userEvent.selectOptions(screen.getByLabelText("Category"), "Cabins");
  await userEvent.type(screen.getByLabelText("Description"), "A bright cabin with a deck and a view of the water.");
}

const next = () => userEvent.click(screen.getByRole("button", { name: "Next" }));

describe("HostListingForm", () => {
  test("won't leave step 1 until its fields are valid", async () => {
    render(<HostListingForm mode="create" />);

    await next();

    expect(screen.getByText("Titles need 5–80 characters")).toBeInTheDocument();
    expect(screen.getByText("Pick a property type")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tell us about your place" })).toBeInTheDocument();
  });

  test("walks through all four steps and publishes", async () => {
    api.createHostListing.mockResolvedValue({ id: "hl-new" });
    render(<HostListingForm mode="create" />);

    await fillStepOne();
    await next();
    await userEvent.selectOptions(screen.getByLabelText("City"), "aspen");
    await next();
    await userEvent.click(screen.getByRole("checkbox", { name: "Wifi" }));
    await userEvent.click(screen.getByRole("button", { name: "Photo 2" }));
    await userEvent.click(screen.getByRole("button", { name: "Photo 1" }));
    await next();
    await userEvent.clear(screen.getByLabelText("Price per night"));
    await userEvent.type(screen.getByLabelText("Price per night"), "150");
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));

    const sent = api.createHostListing.mock.calls[0][0];
    expect(sent).toMatchObject({ title: "Sunny cabin by the lake", cityId: "aspen", amenities: ["Wifi"], pricePerNight: 150 });
    expect(sent.photos).toHaveLength(2);
    expect(push).toHaveBeenCalledWith("/host/listings?created=hl-new");
  });

  test("won't leave the photo step without a photo, and stops at five", async () => {
    render(<HostListingForm mode="create" />);
    await fillStepOne();
    await next();
    await userEvent.selectOptions(screen.getByLabelText("City"), "aspen");
    await next();

    await next();
    expect(screen.getByText("Pick 1 to 5 photos")).toBeInTheDocument();

    for (let n = 1; n <= 6; n++) await userEvent.click(screen.getByRole("button", { name: `Photo ${n}` }));
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(5);
  });

  test("editing starts prefilled and saves to the listing", async () => {
    api.updateHostListing.mockResolvedValue({ id: "hl-1" });
    render(<HostListingForm mode="edit" listingId="hl-1" initial={hostListingInputSchema.parse(validInput)} />);

    expect(screen.getByLabelText("Title")).toHaveValue("Sunny cabin by the lake");
    await next();
    await next();
    await next();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(api.updateHostListing).toHaveBeenCalledWith("hl-1", hostListingInputSchema.parse(validInput));
    expect(push).toHaveBeenCalledWith("/host/listings");
  });

  test("shows an API failure and stays on the review step", async () => {
    api.updateHostListing.mockRejectedValueOnce(new Error("Listing not found"));
    render(<HostListingForm mode="edit" listingId="hl-1" initial={hostListingInputSchema.parse(validInput)} />);
    await next();
    await next();
    await next();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Listing not found");
    expect(push).not.toHaveBeenCalled();
  });
});
```

`app/host/listings/new/page.test.tsx`:

```tsx
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";

const session = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock("@/lib/auth/get-session", () => session);
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import NewListingPage from "./page";

beforeEach(() => session.requireSession.mockReset());

describe("NewListingPage", () => {
  test("is gated and shows the first step", async () => {
    session.requireSession.mockResolvedValue({ id: "u-ana@example.com", name: "ana", email: "ana@example.com" });
    render(await NewListingPage());
    expect(session.requireSession).toHaveBeenCalledWith("/host/listings/new");
    expect(screen.getByRole("heading", { name: "Tell us about your place" })).toBeInTheDocument();
  });
});
```

`app/host/listings/[id]/edit/page.test.tsx`:

```tsx
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { getRepositories } from "@/lib/repositories";
import { hostListingInputSchema } from "@/lib/host/schemas";
import { validInput } from "@/lib/host/test-fixtures";

const session = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock("@/lib/auth/get-session", () => session);
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import EditListingPage from "./page";

const user = () => ({ id: `u-${crypto.randomUUID()}@example.com`, name: "ana", email: "ana@example.com" });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => session.requireSession.mockReset());

describe("EditListingPage", () => {
  test("shows the owner's listing prefilled", async () => {
    const host = user();
    session.requireSession.mockResolvedValue(host);
    const listing = await getRepositories().hostListings.create(host.id, hostListingInputSchema.parse(validInput));

    render(await EditListingPage(params(listing.id)));

    expect(session.requireSession).toHaveBeenCalledWith(`/host/listings/${listing.id}/edit`);
    expect(screen.getByLabelText("Title")).toHaveValue("Sunny cabin by the lake");
  });

  test("another host's listing is not found on the edit page", async () => {
    const listing = await getRepositories().hostListings.create(user().id, hostListingInputSchema.parse(validInput));
    session.requireSession.mockResolvedValue(user());
    await expect(EditListingPage(params(listing.id))).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run components/features/host app/host`
Expected: FAIL, because the modules can't be resolved.

- [ ] **Step 3: Implement**

`components/features/host/host-listing-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button, TextInput } from "@/components/design-system";
import { createHostListing, updateHostListing } from "@/lib/api-client/host";
import { AMENITY_OPTIONS, HOST_CATEGORIES, HOST_CITIES, MAX_PHOTOS, PHOTO_OPTIONS, PROPERTY_TYPES } from "@/lib/host/options";
import { hostListingInputSchema, type HostListingInput } from "@/lib/host/schemas";
import { cn } from "@/lib/utils";

type Field = keyof HostListingInput;
type Errors = Partial<Record<Field, string>>;

const STEPS: { title: string; fields: Field[] }[] = [
  { title: "Tell us about your place", fields: ["title", "propertyType", "category", "description"] },
  { title: "Where is it, and how big?", fields: ["cityId", "maxGuests", "bedrooms", "beds", "baths"] },
  { title: "Amenities and photos", fields: ["amenities", "photos"] },
  { title: "Set your price and review", fields: ["pricePerNight"] },
];

const EMPTY: HostListingInput = {
  title: "", description: "", propertyType: "", category: "", cityId: "",
  maxGuests: 2, bedrooms: 1, beds: 1, baths: 1, amenities: [], photos: [], pricePerNight: 100,
};

const fieldClass = "h-14 rounded-sm border border-hairline bg-canvas px-3 text-body-md text-ink focus:border-2 focus:border-ink focus:outline-none";

export type HostListingFormProps = { mode: "create" } | { mode: "edit"; listingId: string; initial: HostListingInput };

export function HostListingForm(props: HostListingFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<HostListingInput>(props.mode === "edit" ? props.initial : EMPTY);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isLast = step === STEPS.length - 1;

  function set<K extends Field>(field: K, value: HostListingInput[K]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  /** Errors for the given fields only, from the one shared schema. */
  function errorsFor(fields: Field[]): Errors {
    const parsed = hostListingInputSchema.safeParse(values);
    if (parsed.success) return {};
    const found: Errors = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as Field;
      if (fields.includes(field) && !found[field]) found[field] = issue.message;
    }
    return found;
  }

  function goNext() {
    const stepErrors = errorsFor(STEPS[step].fields);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length === 0) setStep((s) => s + 1);
  }

  async function submit() {
    const parsed = hostListingInputSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(errorsFor(STEPS.flatMap((s) => s.fields)));
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      if (props.mode === "create") {
        const listing = await createHostListing(parsed.data);
        router.push(`/host/listings?created=${encodeURIComponent(listing.id)}`);
      } else {
        await updateHostListing(props.listingId, parsed.data);
        router.push("/host/listings");
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  function togglePhoto(url: string) {
    if (values.photos.includes(url)) set("photos", values.photos.filter((p) => p !== url));
    else if (values.photos.length < MAX_PHOTOS) set("photos", [...values.photos, url]);
  }

  function toggleAmenity(amenity: string) {
    set("amenities", values.amenities.includes(amenity) ? values.amenities.filter((a) => a !== amenity) : [...values.amenities, amenity]);
  }

  const numberField = (field: "maxGuests" | "bedrooms" | "beds" | "baths", label: string, min: number, max: number, stepBy = 1) => (
    <TextInput
      label={label}
      type="number"
      min={min}
      max={max}
      step={stepBy}
      value={String(values[field])}
      onChange={(e) => set(field, Number(e.target.value))}
      error={errors[field]}
    />
  );

  const select = (field: "propertyType" | "category" | "cityId", label: string, options: { value: string; label: string }[]) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={field} className="text-caption text-muted">{label}</label>
      <select id={field} value={values[field]} onChange={(e) => set(field, e.target.value)} className={fieldClass} aria-invalid={errors[field] ? true : undefined}>
        <option value="">Select…</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {errors[field] && <span className="text-body-sm text-error">{errors[field]}</span>}
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
      <p className="text-body-sm text-muted">Step {step + 1} of {STEPS.length}</p>
      <h1 className="text-display-md text-ink">{STEPS[step].title}</h1>

      {step === 0 && (
        <div className="flex flex-col gap-4">
          <TextInput label="Title" value={values.title} onChange={(e) => set("title", e.target.value)} error={errors.title} />
          {select("propertyType", "Property type", PROPERTY_TYPES.map((t) => ({ value: t, label: t })))}
          {select("category", "Category", HOST_CATEGORIES.map((c) => ({ value: c, label: c })))}
          <div className="flex flex-col gap-1">
            <label htmlFor="description" className="text-caption text-muted">Description</label>
            <textarea id="description" rows={5} value={values.description} onChange={(e) => set("description", e.target.value)}
              className="rounded-sm border border-hairline bg-canvas p-3 text-body-md text-ink focus:border-2 focus:border-ink focus:outline-none"
              aria-invalid={errors.description ? true : undefined} />
            {errors.description && <span className="text-body-sm text-error">{errors.description}</span>}
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{select("cityId", "City", HOST_CITIES.map((c) => ({ value: c.id, label: `${c.name}, ${c.country}` })))}</div>
          {numberField("maxGuests", "Guests", 1, 16)}
          {numberField("bedrooms", "Bedrooms", 0, 20)}
          {numberField("beds", "Beds", 1, 30)}
          {numberField("baths", "Baths", 0.5, 20, 0.5)}
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-6">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-title-sm text-ink">Amenities</legend>
            <div className="grid grid-cols-2 gap-2">
              {AMENITY_OPTIONS.map((amenity) => (
                <label key={amenity} className="flex items-center gap-2 text-body-md text-ink">
                  <input type="checkbox" checked={values.amenities.includes(amenity)} onChange={() => toggleAmenity(amenity)} />
                  {amenity}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-title-sm text-ink">Photos (pick up to {MAX_PHOTOS}; the first is the cover)</legend>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {PHOTO_OPTIONS.map((url, index) => {
                const position = values.photos.indexOf(url);
                return (
                  <button key={url} type="button" aria-label={`Photo ${index + 1}`} aria-pressed={position >= 0} onClick={() => togglePhoto(url)}
                    className={cn("relative aspect-square overflow-hidden rounded-sm border-2", position >= 0 ? "border-ink" : "border-transparent")}>
                    <Image src={url} alt="" fill sizes="160px" className="object-cover" />
                    {position >= 0 && (
                      <span className="absolute left-1 top-1 flex size-6 items-center justify-center rounded-full bg-ink text-caption text-on-primary">{position + 1}</span>
                    )}
                  </button>
                );
              })}
            </div>
            {errors.photos && <span className="text-body-sm text-error">{errors.photos}</span>}
          </fieldset>
        </div>
      )}

      {isLast && (
        <div className="flex flex-col gap-6">
          <TextInput label="Price per night" type="number" min={10} max={10000} value={String(values.pricePerNight)}
            onChange={(e) => set("pricePerNight", Number(e.target.value))} error={errors.pricePerNight} />
          <dl className="flex flex-col gap-2 rounded-md border border-hairline p-4 text-body-sm text-body">
            <div className="flex justify-between"><dt>Title</dt><dd>{values.title}</dd></div>
            <div className="flex justify-between"><dt>Type</dt><dd>{values.propertyType} · {values.category}</dd></div>
            <div className="flex justify-between"><dt>City</dt><dd>{HOST_CITIES.find((c) => c.id === values.cityId)?.name}</dd></div>
            <div className="flex justify-between"><dt>Size</dt><dd>{values.maxGuests} guests · {values.bedrooms} bedrooms · {values.beds} beds · {values.baths} baths</dd></div>
            <div className="flex justify-between"><dt>Photos</dt><dd>{values.photos.length}</dd></div>
          </dl>
        </div>
      )}

      {formError && <p role="alert" className="text-body-sm text-error">{formError}</p>}

      <div className="flex justify-between border-t border-hairline pt-4">
        <Button type="button" variant="tertiary" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>Back</Button>
        {isLast ? (
          <Button type="button" onClick={submit} disabled={submitting}>{props.mode === "create" ? "Publish" : "Save"}</Button>
        ) : (
          <Button type="button" onClick={goNext}>Next</Button>
        )}
      </div>
    </div>
  );
}
```

`app/host/listings/new/page.tsx`:

```tsx
import type { Metadata } from "next";
import { Footer, TopNav } from "@/components/design-system";
import { HostListingForm } from "@/components/features/host/host-listing-form";
import { requireSession } from "@/lib/auth/get-session";

export const metadata: Metadata = { title: "List your place · Airbnb" };

export default async function NewListingPage() {
  await requireSession("/host/listings/new");
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopNav active="homes" />
      <main className="w-full flex-1 px-6 py-8">
        <HostListingForm mode="create" />
      </main>
      <Footer />
    </div>
  );
}
```

`app/host/listings/[id]/edit/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Footer, TopNav } from "@/components/design-system";
import { HostListingForm } from "@/components/features/host/host-listing-form";
import { requireSession } from "@/lib/auth/get-session";
import { toHostListingInput } from "@/lib/host/listing-input";
import { getRepositories } from "@/lib/repositories";

export const metadata: Metadata = { title: "Edit listing · Airbnb" };

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireSession(`/host/listings/${id}/edit`);
  const listing = await getRepositories().hostListings.findById(id);
  if (!listing || listing.hostId !== user.id) notFound();

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopNav active="homes" />
      <main className="w-full flex-1 px-6 py-8">
        <HostListingForm mode="edit" listingId={listing.id} initial={toHostListingInput(listing)} />
      </main>
      <Footer />
    </div>
  );
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run components/features/host app/host && npm test && npx tsc --noEmit && npm run lint`
Expected: all pass; tsc and lint are clean. The `HostListingInput` type widens `propertyType`, `category` and `cityId` to `string`, so `EMPTY`'s `""` values type-check. If `z.number().int(PRICE)` is rejected by this Zod version, use `.int({ error: PRICE })` and say so in the report.

- [ ] **Step 5: Commit**

```bash
git add components/features/host app/host
git commit -m "feat: add the multi-step host listing form with create and edit pages

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Host landing, the listings dashboard, reservations and the menu link

**Files:**
- Create: `components/features/host/earnings-estimate.tsx`, `components/features/host/host-nav.tsx`, `components/features/host/listing-status-button.tsx`
- Create: `app/host/page.tsx`, `app/host/listings/page.tsx`, `app/host/reservations/page.tsx`
- Modify: `lib/bookings/trips.ts`, `components/features/auth/account-menu.tsx`
- Test: `components/features/host/earnings-estimate.test.tsx`, `components/features/host/listing-status-button.test.tsx`, `app/host/page.test.tsx`, `app/host/listings/page.test.tsx`, `app/host/reservations/page.test.tsx`, `components/features/auth/account-menu.test.tsx` (append)

**Interfaces:**
- Consumes: `getSession`, `requireSession`; `getRepositories()` (`hostListings`, `listings`, `bookings.listForListings`); `setHostListingStatus`; `splitTrips`; `formatDateRange`; `HOST_CITIES`; `buttonClassName`.
- Produces: `EarningsEstimate({ cities: { id: string; name: string; averagePrice: number }[] })`; `HostNav({ active: "listings" | "reservations" })`; `ListingStatusButton({ listingId, status })`; the routes `/host`, `/host/listings` and `/host/reservations`; a generic `splitTrips<T extends Booking>(bookings: T[], today): { upcoming: T[]; past: T[] }`.

- [ ] **Step 1: Write the failing tests**

`components/features/host/earnings-estimate.test.tsx`:

```tsx
import { expect, test } from "vitest";
import { render, screen, userEvent } from "@/lib/test-utils";
import { EarningsEstimate } from "./earnings-estimate";

const cities = [
  { id: "aspen", name: "Aspen", averagePrice: 250 },
  { id: "kyoto", name: "Kyoto", averagePrice: 95 },
];

test("estimates a month from the city's average price and the nights", async () => {
  render(<EarningsEstimate cities={cities} />);
  expect(screen.getByText("$1,750")).toBeInTheDocument(); // Aspen, 7 nights

  await userEvent.selectOptions(screen.getByLabelText("City"), "kyoto");
  expect(screen.getByText("$665")).toBeInTheDocument(); // 95 × 7
});
```

`components/features/host/listing-status-button.test.tsx`:

```tsx
import { beforeEach, expect, test, vi } from "vitest";
import { render, screen, userEvent } from "@/lib/test-utils";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const setHostListingStatus = vi.fn();
vi.mock("@/lib/api-client/host", () => ({ setHostListingStatus: (...args: unknown[]) => setHostListingStatus(...args) }));

import { ListingStatusButton } from "./listing-status-button";

beforeEach(() => {
  refresh.mockReset();
  setHostListingStatus.mockReset();
});

test("unlists a listed listing and refreshes", async () => {
  setHostListingStatus.mockResolvedValue({});
  render(<ListingStatusButton listingId="hl-1" status="listed" />);
  await userEvent.click(screen.getByRole("button", { name: "Unlist" }));
  expect(setHostListingStatus).toHaveBeenCalledWith("hl-1", "unlisted");
  expect(refresh).toHaveBeenCalled();
});

test("relists an unlisted listing and shows failures", async () => {
  setHostListingStatus.mockRejectedValueOnce(new Error("Listing not found"));
  render(<ListingStatusButton listingId="hl-1" status="unlisted" />);
  await userEvent.click(screen.getByRole("button", { name: "Relist" }));
  expect(setHostListingStatus).toHaveBeenCalledWith("hl-1", "listed");
  expect(await screen.findByRole("alert")).toHaveTextContent("Listing not found");
});
```

`app/host/page.test.tsx`:

```tsx
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { getRepositories } from "@/lib/repositories";
import { hostListingInputSchema } from "@/lib/host/schemas";
import { validInput } from "@/lib/host/test-fixtures";

const session = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/auth/get-session", () => session);

import HostPage from "./page";

beforeEach(() => session.getSession.mockReset());

describe("HostPage", () => {
  test("invites visitors to get started", async () => {
    session.getSession.mockResolvedValue(null);
    render(await HostPage());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Airbnb it");
    expect(screen.getByRole("link", { name: "Get started" })).toHaveAttribute("href", "/host/listings/new");
  });

  test("sends existing hosts to their listings", async () => {
    const id = `u-${crypto.randomUUID()}@example.com`;
    await getRepositories().hostListings.create(id, hostListingInputSchema.parse(validInput));
    session.getSession.mockResolvedValue({ id, name: "ana", email: "ana@example.com" });
    render(await HostPage());
    expect(screen.getByRole("link", { name: "Go to your listings" })).toHaveAttribute("href", "/host/listings");
  });
});
```

`app/host/listings/page.test.tsx`:

```tsx
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { getRepositories } from "@/lib/repositories";
import { hostListingInputSchema } from "@/lib/host/schemas";
import { validInput } from "@/lib/host/test-fixtures";

const session = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock("@/lib/auth/get-session", () => session);
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import HostListingsPage from "./page";

const user = () => ({ id: `u-${crypto.randomUUID()}@example.com`, name: "ana", email: "ana@example.com" });
const props = (query: Record<string, string> = {}) => ({ searchParams: Promise.resolve(query) });

beforeEach(() => session.requireSession.mockReset());

describe("HostListingsPage", () => {
  test("is gated and invites a new host to create a listing", async () => {
    session.requireSession.mockResolvedValue(user());
    render(await HostListingsPage(props()));
    expect(session.requireSession).toHaveBeenCalledWith("/host/listings");
    expect(screen.getByText("You don't have any listings yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create a listing" })).toHaveAttribute("href", "/host/listings/new");
  });

  test("lists the host's listings with status and actions, and celebrates a new one", async () => {
    const host = user();
    session.requireSession.mockResolvedValue(host);
    const listing = await getRepositories().hostListings.create(host.id, hostListingInputSchema.parse(validInput));

    render(await HostListingsPage(props({ created: listing.id })));

    expect(screen.getByText("Your listing is live")).toBeInTheDocument();
    expect(screen.getByText("Sunny cabin by the lake")).toBeInTheDocument();
    expect(screen.getByText("Listed")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute("href", `/host/listings/${listing.id}/edit`);
    expect(screen.getByRole("button", { name: "Unlist" })).toBeInTheDocument();
  });
});
```

`app/host/reservations/page.test.tsx`:

```tsx
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { getRepositories } from "@/lib/repositories";
import { hostListingInputSchema } from "@/lib/host/schemas";
import { validInput } from "@/lib/host/test-fixtures";
import { calculatePriceBreakdown } from "@/lib/reservation/pricing";

const session = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock("@/lib/auth/get-session", () => session);

import HostReservationsPage from "./page";

const user = () => ({ id: `u-${crypto.randomUUID()}@example.com`, name: "ana", email: "ana@example.com" });

beforeEach(() => session.requireSession.mockReset());

describe("HostReservationsPage", () => {
  test("says when there are none", async () => {
    session.requireSession.mockResolvedValue(user());
    render(await HostReservationsPage());
    expect(session.requireSession).toHaveBeenCalledWith("/host/reservations");
    expect(screen.getByText("No reservations yet")).toBeInTheDocument();
  });

  test("lists reservations on the host's listings, including unlisted ones", async () => {
    const host = user();
    session.requireSession.mockResolvedValue(host);
    const repos = getRepositories();
    const listing = await repos.hostListings.create(host.id, hostListingInputSchema.parse(validInput));
    const guestEmail = `guest-${crypto.randomUUID()}@example.com`;
    await repos.bookings.create(`u-${guestEmail}`, {
      listingId: listing.id, checkIn: "2033-03-01", checkOut: "2033-03-04", guests: { adults: 2, children: 0 },
      priceBreakdown: calculatePriceBreakdown(180, 3),
    });
    await repos.hostListings.setStatus(host.id, listing.id, "unlisted");

    render(await HostReservationsPage());

    expect(screen.getByRole("heading", { name: "Upcoming" })).toBeInTheDocument();
    expect(screen.getByText("Sunny cabin by the lake")).toBeInTheDocument();
    expect(screen.getByText(guestEmail)).toBeInTheDocument();
    expect(screen.getByText("Mar 1, 2033 – Mar 4, 2033")).toBeInTheDocument();
  });
});
```

Append to `components/features/auth/account-menu.test.tsx`, inside its `describe` (the `loggedIn` helper exists):

```tsx
  test("logged in: links to the host dashboard", async () => {
    renderWith(loggedIn());
    await userEvent.click(screen.getByRole("button", { name: "Account menu" }));
    expect(screen.getByRole("link", { name: "Host dashboard" })).toHaveAttribute("href", "/host/listings");
  });
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run components/features/host app/host components/features/auth/account-menu.test.tsx`
Expected: FAIL. The new modules can't be resolved, and there's no Host dashboard link yet.

- [ ] **Step 3: Implement**

`lib/bookings/trips.ts`: make it generic, keeping the behaviour.

```ts
import type { Booking } from "@/lib/types";

/** Upcoming trips (check-out today or later) soonest first; past trips most recent first. */
export function splitTrips<T extends Booking>(bookings: T[], today: string): { upcoming: T[]; past: T[] } {
  const upcoming = bookings.filter((b) => b.checkOut >= today).sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  const past = bookings.filter((b) => b.checkOut < today).sort((a, b) => b.checkOut.localeCompare(a.checkOut));
  return { upcoming, past };
}
```

`components/features/host/earnings-estimate.tsx`:

```tsx
"use client";

import { useState } from "react";

export interface EarningsCity {
  id: string;
  name: string;
  averagePrice: number;
}

const DEFAULT_NIGHTS = 7;

export function EarningsEstimate({ cities }: { cities: EarningsCity[] }) {
  const [cityId, setCityId] = useState(cities[0]?.id ?? "");
  const [nights, setNights] = useState(DEFAULT_NIGHTS);
  const city = cities.find((c) => c.id === cityId);
  const estimate = Math.round((city?.averagePrice ?? 0) * nights);

  return (
    <div className="flex flex-col gap-4 rounded-md border border-hairline p-6 shadow-airbnb">
      <p className="text-body-md text-body">You could earn</p>
      <p className="text-display-xl text-ink">${estimate.toLocaleString("en-US")}</p>
      <p className="text-body-sm text-muted">
        {nights} {nights === 1 ? "night" : "nights"} a month at an average of ${city?.averagePrice ?? 0} a night
      </p>
      <label htmlFor="earnings-nights" className="text-caption text-muted">Nights a month</label>
      <input id="earnings-nights" type="range" min={1} max={30} value={nights} onChange={(e) => setNights(Number(e.target.value))} />
      <label htmlFor="earnings-city" className="text-caption text-muted">City</label>
      <select id="earnings-city" value={cityId} onChange={(e) => setCityId(e.target.value)}
        className="h-12 rounded-sm border border-hairline bg-canvas px-3 text-body-md text-ink">
        {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </div>
  );
}
```

The `getByLabelText("City")` test relies on the label reading exactly "City".

`components/features/host/host-nav.tsx`:

```tsx
import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "listings", label: "Listings", href: "/host/listings" },
  { id: "reservations", label: "Reservations", href: "/host/reservations" },
] as const;

export function HostNav({ active }: { active: "listings" | "reservations" }) {
  return (
    <nav aria-label="Host" className="flex gap-6 border-b border-hairline">
      {TABS.map((tab) => (
        <Link key={tab.id} href={tab.href} aria-current={tab.id === active ? "page" : undefined}
          className={cn("border-b-2 pb-3 text-title-sm", tab.id === active ? "border-ink text-ink" : "border-transparent text-muted")}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
```

`components/features/host/listing-status-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/design-system";
import { setHostListingStatus } from "@/lib/api-client/host";

export function ListingStatusButton({ listingId, status }: { listingId: string; status: "listed" | "unlisted" }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = status === "listed" ? "unlisted" : "listed";

  async function toggle() {
    setPending(true);
    setError(null);
    try {
      await setHostListingStatus(listingId, next);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="secondary" onClick={toggle} disabled={pending} className="h-10 px-4">
        {status === "listed" ? "Unlist" : "Relist"}
      </Button>
      {error && <p role="alert" className="text-body-sm text-error">{error}</p>}
    </div>
  );
}
```

`app/host/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { Footer, TopNav, buttonClassName } from "@/components/design-system";
import { EarningsEstimate } from "@/components/features/host/earnings-estimate";
import { getSession } from "@/lib/auth/get-session";
import { HOST_CITIES } from "@/lib/host/options";
import { getRepositories } from "@/lib/repositories";

export const metadata: Metadata = { title: "Airbnb it · Become a host" };

const STEPS = [
  { title: "Describe your place", body: "Tell guests what makes it special: the type of place, its size and what it offers." },
  { title: "Add photos", body: "Pick up to five photos. The first one is the cover guests see in search." },
  { title: "Set a price and publish", body: "Choose your nightly price. Your listing goes live right away." },
];

export default async function HostPage() {
  const repos = getRepositories();
  const user = await getSession();
  const [catalog, ownListings] = await Promise.all([
    repos.listings.findAll(),
    user ? repos.hostListings.listForHost(user.id) : Promise.resolve([]),
  ]);
  const cities = HOST_CITIES.map((city) => {
    const prices = catalog.filter((l) => l.location.city === city.name).map((l) => l.pricePerNight);
    const averagePrice = prices.length ? Math.round(prices.reduce((sum, p) => sum + p, 0) / prices.length) : 0;
    return { id: city.id, name: city.name, averagePrice };
  });
  const cta = ownListings.length > 0
    ? { href: "/host/listings", label: "Go to your listings" }
    : { href: "/host/listings/new", label: "Get started" };

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopNav active="homes" />
      <main className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col gap-16 px-6 py-12">
        <section className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <h1 className="text-display-xl text-ink">
              Airbnb it. <span className="text-rausch">You could earn.</span>
            </h1>
            <p className="text-body-md text-body">Share your place with guests and earn money on your terms.</p>
            <Link href={cta.href} className={`${buttonClassName()} self-start`}>{cta.label}</Link>
          </div>
          <EarningsEstimate cities={cities} />
        </section>
        <section className="flex flex-col gap-6">
          <h2 className="text-display-md text-ink">How it works</h2>
          <ol className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex flex-col gap-2 rounded-md border border-hairline p-6">
                <span className="text-title-sm text-muted">{index + 1}</span>
                <h3 className="text-title-md text-ink">{step.title}</h3>
                <p className="text-body-sm text-body">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>
      <Footer />
    </div>
  );
}
```

`app/host/listings/page.tsx`:

```tsx
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Footer, TopNav, buttonClassName } from "@/components/design-system";
import { HostNav } from "@/components/features/host/host-nav";
import { ListingStatusButton } from "@/components/features/host/listing-status-button";
import { requireSession } from "@/lib/auth/get-session";
import { getRepositories } from "@/lib/repositories";

export const metadata: Metadata = { title: "Your listings · Airbnb" };

export default async function HostListingsPage({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const { created } = await searchParams;
  const user = await requireSession("/host/listings");
  const listings = await getRepositories().hostListings.listForHost(user.id);
  const createdListing = listings.find((l) => l.id === created);

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopNav active="homes" />
      <main className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col gap-8 px-6 py-8">
        <h1 className="text-display-md text-ink">Your listings</h1>
        <HostNav active="listings" />
        {createdListing && (
          <div className="flex items-center justify-between rounded-md bg-surface-soft px-6 py-4">
            <p className="text-title-md text-ink">Your listing is live</p>
            <Link href={`/rooms/${createdListing.id}`} className="text-title-sm text-ink underline">View listing</Link>
          </div>
        )}
        {listings.length === 0 ? (
          <div className="flex flex-col items-start gap-4">
            <p className="text-title-md text-ink">You don&apos;t have any listings yet</p>
            <Link href="/host/listings/new" className={buttonClassName()}>Create a listing</Link>
          </div>
        ) : (
          <>
            <Link href="/host/listings/new" className={`${buttonClassName("secondary")} self-start`}>Create a listing</Link>
            <ul className="flex flex-col divide-y divide-hairline">
              {listings.map((listing) => (
                <li key={listing.id} className="flex items-center gap-4 py-4">
                  <div className="relative size-20 shrink-0 overflow-hidden rounded-sm">
                    <Image src={listing.photos[0]} alt="" fill sizes="80px" className="object-cover" />
                  </div>
                  <div className="flex flex-1 flex-col gap-1">
                    <span className="text-title-sm text-ink">{listing.title}</span>
                    <span className="text-body-sm text-muted">{listing.location.city} · ${listing.pricePerNight} night</span>
                  </div>
                  <span className="rounded-full border border-hairline px-3 py-1 text-caption text-ink">
                    {listing.status === "unlisted" ? "Unlisted" : "Listed"}
                  </span>
                  <Link href={`/rooms/${listing.id}`} className="text-title-sm text-ink underline">View</Link>
                  <Link href={`/host/listings/${listing.id}/edit`} className="text-title-sm text-ink underline">Edit</Link>
                  <ListingStatusButton listingId={listing.id} status={listing.status === "unlisted" ? "unlisted" : "listed"} />
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
```

With a single listing, the "Create a listing" link also exists in the non-empty state. The listings test only queries it in the empty case, so there's no duplicate-name clash there.

`app/host/reservations/page.tsx`:

```tsx
import type { Metadata } from "next";
import { Footer, TopNav } from "@/components/design-system";
import { HostNav } from "@/components/features/host/host-nav";
import { requireSession } from "@/lib/auth/get-session";
import { splitTrips } from "@/lib/bookings/trips";
import { getRepositories } from "@/lib/repositories";
import { formatDateRange } from "@/lib/reservation/dates";
import type { Booking } from "@/lib/types";

export const metadata: Metadata = { title: "Reservations · Airbnb" };

type Reservation = Booking & { guestId: string };

function ReservationList({ title, reservations, titles }: { title: string; reservations: Reservation[]; titles: Map<string, string> }) {
  if (reservations.length === 0) return null;
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-title-md text-ink">{title}</h2>
      <ul className="flex flex-col divide-y divide-hairline">
        {reservations.map((r) => {
          const guests = r.guests.adults + r.guests.children;
          return (
            <li key={r.id} className="grid grid-cols-1 gap-1 py-4 md:grid-cols-4">
              <span className="text-title-sm text-ink">{titles.get(r.listingId) ?? "Your listing"}</span>
              <span className="text-body-sm text-body">{r.guestId.replace(/^u-/, "")}</span>
              <span className="text-body-sm text-body">{formatDateRange(r.checkIn, r.checkOut)} · {guests} {guests === 1 ? "guest" : "guests"}</span>
              <span className="text-body-sm text-ink">${r.priceBreakdown.total}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default async function HostReservationsPage() {
  const user = await requireSession("/host/reservations");
  const repos = getRepositories();
  const listings = await repos.hostListings.listForHost(user.id);
  const reservations = await repos.bookings.listForListings(listings.map((l) => l.id));
  const titles = new Map(listings.map((l) => [l.id, l.title]));
  const { upcoming, past } = splitTrips(reservations, new Date().toISOString().slice(0, 10));

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopNav active="homes" />
      <main className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col gap-8 px-6 py-8">
        <h1 className="text-display-md text-ink">Reservations</h1>
        <HostNav active="reservations" />
        {reservations.length === 0 ? (
          <p className="text-body-md text-muted">No reservations yet</p>
        ) : (
          <>
            <ReservationList title="Upcoming" reservations={upcoming} titles={titles} />
            <ReservationList title="Past" reservations={past} titles={titles} />
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
```

`components/features/auth/account-menu.tsx`: add after the Trips link:

```tsx
              <Link href="/host/listings" className={itemClass}>Host dashboard</Link>
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run components/features/host app/host components/features/auth lib/bookings && npm test && npx tsc --noEmit && npm run lint`
Expected: all pass, including the existing trips page tests on the generic `splitTrips`; tsc and lint are clean.

- [ ] **Step 5: Commit**

```bash
git add components/features/host app/host lib/bookings/trips.ts components/features/auth/account-menu.tsx components/features/auth/account-menu.test.tsx
git status --short   # expect only this task's files
git commit -m "feat: add the host landing page, listings dashboard and reservations

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Listing page variants, booking redirects and "New" ratings

**Files:**
- Modify: `app/rooms/[id]/page.tsx`, `app/book/[listingId]/page.tsx`, `components/design-system/property-card.tsx`, `components/features/listing-overview.tsx`
- Test:
  - Modify: `app/rooms/[id]/page.test.tsx` (add the `get-session` mock plus new tests; existing assertions unchanged)
  - Append: `app/book/[listingId]/page.test.tsx`, `components/design-system/property-card.test.tsx`, `components/features/listing-overview.test.tsx`

**Interfaces:**
- Consumes: `getSession`, `requireSession`; `getRepositories().hostListings/hostProfiles/listings`; `hostListingInputSchema`, `validInput`.
- Produces: `/rooms/[id]` renders `ReservationCard` (guest), an owner card (owner: links "Edit listing" → `/host/listings/[id]/edit` and "Manage listings" → `/host/listings`), or the notice "This place isn't taking bookings right now" (others, unlisted). `/book/[listingId]` redirects to `/rooms/[id]` for the owner or an unlisted listing.

- [ ] **Step 1: Write the failing tests**

`app/rooms/[id]/page.test.tsx`:
- Add, after the imports:

```tsx
const session = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/auth/get-session", () => session);
```

  (add `vi` and `beforeEach` to the vitest import), plus `beforeEach(() => session.getSession.mockResolvedValue(null));`. Keep both existing tests exactly as they are.
- Then append, inside the `describe` (add imports: `getRepositories` from `@/lib/repositories`, `hostListingInputSchema` from `@/lib/host/schemas`, `validInput` from `@/lib/host/test-fixtures`):

```tsx
  test("a host listing shows its host and 'New' instead of a rating", async () => {
    const host = { id: `u-${crypto.randomUUID()}@example.com`, name: "Ana", email: "ana@example.com" };
    const repos = getRepositories();
    await repos.hostProfiles.upsertFromUser(host);
    const listing = await repos.hostListings.create(host.id, hostListingInputSchema.parse(validInput));

    render(await RoomPage({ params: Promise.resolve({ id: listing.id }) }));

    expect(screen.getByRole("heading", { level: 1, name: "Sunny cabin by the lake" })).toBeInTheDocument();
    expect(screen.getAllByText(/New/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Ana/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^reserve$/i })).toBeInTheDocument();
  });

  test("the owner sees manage links instead of the reservation card", async () => {
    const host = { id: `u-${crypto.randomUUID()}@example.com`, name: "Ana", email: "ana@example.com" };
    const listing = await getRepositories().hostListings.create(host.id, hostListingInputSchema.parse(validInput));
    session.getSession.mockResolvedValue(host);

    render(await RoomPage({ params: Promise.resolve({ id: listing.id }) }));

    expect(screen.getByText("This is your listing")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit listing" })).toHaveAttribute("href", `/host/listings/${listing.id}/edit`);
    expect(screen.queryByRole("button", { name: /^reserve$/i })).not.toBeInTheDocument();
  });

  test("an unlisted listing shows a notice to guests", async () => {
    const hostId = `u-${crypto.randomUUID()}@example.com`;
    const repos = getRepositories();
    const listing = await repos.hostListings.create(hostId, hostListingInputSchema.parse(validInput));
    await repos.hostListings.setStatus(hostId, listing.id, "unlisted");

    render(await RoomPage({ params: Promise.resolve({ id: listing.id }) }));

    expect(screen.getByText("This place isn't taking bookings right now")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^reserve$/i })).not.toBeInTheDocument();
  });
```

Append to `app/book/[listingId]/page.test.tsx`, inside its `describe`. It has `props`, `daysFromToday`, and the `session.requireSession` mock returning `u-ana@example.com`. Add imports for `getRepositories`, `hostListingInputSchema` and `validInput`.

```tsx
  test("booking your own listing redirects back to it", async () => {
    const listing = await getRepositories().hostListings.create("u-ana@example.com", hostListingInputSchema.parse(validInput));
    await expect(
      BookPage(props(listing.id, { checkIn: daysFromToday(40), checkOut: daysFromToday(42), adults: "1" })),
    ).rejects.toThrow("NEXT_REDIRECT");
  });

  test("an unlisted listing redirects back to it", async () => {
    const hostId = `u-${crypto.randomUUID()}@example.com`;
    const repos = getRepositories();
    const listing = await repos.hostListings.create(hostId, hostListingInputSchema.parse(validInput));
    await repos.hostListings.setStatus(hostId, listing.id, "unlisted");
    await expect(
      BookPage(props(listing.id, { checkIn: daysFromToday(40), checkOut: daysFromToday(42), adults: "1" })),
    ).rejects.toThrow("NEXT_REDIRECT");
  });
```

Append to `components/design-system/property-card.test.tsx`, inside its `describe` (it has a `listing` fixture):

```tsx
  test("a listing without reviews shows New instead of a rating", () => {
    render(<PropertyCard listing={{ ...listing, rating: 0, reviewCount: 0 }} />);
    expect(screen.getByText("New")).toBeInTheDocument();
    expect(screen.queryByText("0.00")).not.toBeInTheDocument();
  });
```

Append to `components/features/listing-overview.test.tsx`. Read the file first; reuse its listing fixture (spread it with `rating: 0, reviewCount: 0`) and its render import:

```tsx
test("a listing without reviews says New instead of a rating and review count", () => {
  render(<ListingOverview listing={{ ...LISTING_FIXTURE_FROM_THIS_FILE, rating: 0, reviewCount: 0 }} />);
  expect(screen.getByText(/New/)).toBeInTheDocument();
  expect(screen.queryByText(/0 reviews/)).not.toBeInTheDocument();
});
```

Replace `LISTING_FIXTURE_FROM_THIS_FILE` with the name of the listing fixture already defined in that test file.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run "app/rooms" "app/book" components/design-system/property-card.test.tsx components/features/listing-overview.test.tsx`
Expected: the new tests FAIL ("This is your listing" missing, no redirect, "New" missing); the existing ones still pass.

- [ ] **Step 3: Implement**

`components/design-system/property-card.tsx`: replace `{listing.rating.toFixed(2)}` with `{listing.reviewCount === 0 ? "New" : listing.rating.toFixed(2)}`.

`components/features/listing-overview.tsx`: replace the line `{listing.rating.toFixed(2)} · {listing.reviewCount} reviews ·{" "}` with

```tsx
        {listing.reviewCount === 0 ? "New" : `${listing.rating.toFixed(2)} · ${listing.reviewCount} reviews`} ·{" "}
```

`app/rooms/[id]/page.tsx`:
- import `Link` from `next/link` and `getSession` from `@/lib/auth/get-session`;
- load the viewer alongside host and reviews;
- choose the right rail;
- make the reviews band say "New" for listings without reviews.

The data-loading block becomes:

```tsx
  const [host, reviews, viewer] = await Promise.all([
    repos.hosts.findById(listing.hostId),
    repos.reviews.findByListingId(listing.id),
    getSession(),
  ]);
  const isOwner = viewer?.id === listing.hostId;
  const isUnlisted = listing.status === "unlisted";
```

Replace the reviews `<section className="pt-8">…</section>` with:

```tsx
            <section className="pt-8">
              {listing.reviewCount === 0 ? (
                <p className="text-center text-title-md text-ink">New · No reviews yet</p>
              ) : (
                <>
                  <RatingDisplay value={listing.rating} />
                  <p className="mb-6 mt-2 text-center text-body-sm text-muted">
                    Guest favorite · {listing.reviewCount} reviews
                  </p>
                </>
              )}
              <ReviewsGrid reviews={reviews} />
            </section>
```

Replace the right-rail `<ReservationCard … />` with:

```tsx
            {isOwner ? (
              <aside className="flex flex-col gap-3 rounded-md border border-hairline p-6 shadow-airbnb">
                <p className="text-title-md text-ink">This is your listing</p>
                <Link href={`/host/listings/${listing.id}/edit`} className="text-title-sm text-ink underline">Edit listing</Link>
                <Link href="/host/listings" className="text-title-sm text-ink underline">Manage listings</Link>
              </aside>
            ) : isUnlisted ? (
              <aside className="rounded-md border border-hairline p-6 shadow-airbnb">
                <p className="text-title-md text-ink">This place isn&apos;t taking bookings right now</p>
              </aside>
            ) : (
              <ReservationCard pricePerNight={listing.pricePerNight} maxGuests={listing.maxGuests} listingId={listing.id} />
            )}
```

`app/book/[listingId]/page.tsx`: change `await requireSession(…)` to `const user = await requireSession(…)`. After `if (!listing) notFound();`, add:

```tsx
  if (listing.hostId === user.id || listing.status === "unlisted") redirect(`/rooms/${listingId}`);
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: the whole suite passes, including every existing rooms, book, property-card and listing-overview test; tsc and lint are clean.

- [ ] **Step 5: Commit**

```bash
git add "app/rooms" "app/book" components/design-system/property-card.tsx components/design-system/property-card.test.tsx components/features/listing-overview.tsx components/features/listing-overview.test.tsx
git commit -m "feat: show owner and unlisted variants of a listing and New for unreviewed places

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: End-to-end host flows, docs and verification

**Files:**
- Create: `e2e/host.spec.ts`
- Modify (repo root): `CLAUDE.md`, `docs/superpowers/specs/2026-06-21-airbnb-frontend-clone-design.md`

- [ ] **Step 1: Write the e2e tests**

`e2e/host.spec.ts`:

```ts
import { test, expect, type Browser, type Page } from "@playwright/test";

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function logIn(page: Page, email: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(next, { timeout: 30000 });
}

async function createListing(page: Page, title: string) {
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Property type").selectOption("Entire cabin");
  await page.getByLabel("Category").selectOption("Cabins");
  await page.getByLabel("Description").fill("A bright cabin with a deck, a fireplace and a lake view.");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("City").selectOption("aspen");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("checkbox", { name: "Wifi" }).check();
  await page.getByRole("button", { name: "Photo 1" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("Price per night").fill("150");
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Your listing is live")).toBeVisible({ timeout: 30000 });
}

async function newPage(browser: Browser) {
  return (await browser.newContext()).newPage();
}

test("a host lists a place, a guest books it, and the host sees the reservation", async ({ browser }) => {
  const host = await newPage(browser);
  const hostEmail = `host-${unique()}@example.com`;
  const title = `E2E cabin ${unique()}`;
  await logIn(host, hostEmail, "/host/listings/new");
  await createListing(host, title);

  const guest = await newPage(browser);
  const guestEmail = `guest-${unique()}@example.com`;
  await logIn(guest, guestEmail, "/s/Aspen");
  await guest.getByRole("link", { name: new RegExp(title) }).first().click();
  await expect(guest.getByRole("heading", { level: 1, name: title })).toBeVisible({ timeout: 30000 });

  const monthsAhead = 1 + Math.floor(Math.random() * 10);
  for (let i = 0; i < monthsAhead; i++) await guest.getByRole("button", { name: "Next month" }).click();
  const days = guest.getByRole("button").filter({ hasText: /^\d+$/ });
  const start = Math.floor(Math.random() * ((await days.count()) - 1));
  await days.nth(start).click();
  await days.nth(start + 1).click();
  await guest.getByRole("link", { name: /^reserve$/i }).click();
  await expect(guest.getByRole("heading", { level: 1, name: "Confirm and pay" })).toBeVisible({ timeout: 30000 });
  await guest.getByRole("button", { name: "Confirm and pay" }).click();
  await expect(guest.getByText("You're going to Aspen!")).toBeVisible({ timeout: 30000 });

  await host.goto("/host/reservations");
  await expect(host.getByText(title)).toBeVisible({ timeout: 30000 });
  await expect(host.getByText(guestEmail)).toBeVisible();
});

test("unlisting hides a listing from search and relisting brings it back", async ({ browser }) => {
  const host = await newPage(browser);
  const title = `E2E hideaway ${unique()}`;
  await logIn(host, `host-${unique()}@example.com`, "/host/listings/new");
  await createListing(host, title);

  await host.getByRole("button", { name: "Unlist" }).click();
  await expect(host.getByText("Unlisted")).toBeVisible({ timeout: 30000 });
  await host.goto("/s/Aspen");
  await expect(host.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30000 });
  await expect(host.getByRole("link", { name: new RegExp(title) })).toHaveCount(0);

  await host.goto("/host/listings");
  await host.getByRole("button", { name: "Relist" }).click();
  await expect(host.getByText("Listed", { exact: true })).toBeVisible({ timeout: 30000 });
  await host.goto("/s/Aspen");
  await expect(host.getByRole("link", { name: new RegExp(title) }).first()).toBeVisible({ timeout: 30000 });
});
```

- [ ] **Step 2: Run the e2e suite**

Run (port 3000 free): `npm run e2e`
Expected: every spec passes, the 17 existing plus 2 new.

If a new spec fails:
- a selector that doesn't match correct UI → fix the test;
- UI that contradicts the spec → fix the component;
- a hydration race → add `waitForLoadState("networkidle")` before the interaction.

Explain which in the report. Then run the full suite twice more; it must stay green.

- [ ] **Step 3: Docs**

`CLAUDE.md`:
- In **Data Layer**, replace the `lib/repositories/` entry with:

```
lib/repositories/      Repository interfaces + getRepositories() (index.ts) — the DATA_SOURCE switch for catalog data;
                       listings/hosts are combined with host-created listings and host profiles (combined.ts);
                       wishlists, bookings, host listings and host profiles are in-memory mocks in both data modes
```

- Add a line to the block:

```
lib/host/              host listing options (cities, photo gallery, amenities), hostListingInputSchema, listing-input helpers
lib/search/match-listing.ts   matchesFilters — the one set of search filter rules (seed and host listings)
```

- Add a bullet under the block:

```markdown
- Hosting is a mock too: any logged-in user can create listings (`/host/listings/new`); host listings (`hl-` ids, `hostId` = the user id) join `findAll` (only when listed) and `findById` through `combineListings`. Photos must come from `PHOTO_OPTIONS` (next/image only allows configured hosts). Hosts can't book their own or unlisted listings.
```

- In **Pages**, add:

```markdown
- `/host` — "Become a host" landing (public); `/host/listings`, `/host/listings/new`, `/host/listings/[id]/edit`, `/host/reservations` — gated host dashboard
```

- In **Component Layers**, append `HostListingForm`, `EarningsEstimate`, `HostNav`, `ListingStatusButton` to the `components/features/` list.

`docs/superpowers/specs/2026-06-21-airbnb-frontend-clone-design.md` §10: append to item 7 ` — see 2026-09-28-frontend-phase7-host-pages-design.md`.

- [ ] **Step 4: Full verification**

From `frontend/`: `npm test && npx tsc --noEmit && npm run lint && npm run build && npm run seed:check && npm run test:coverage`
Expected:
- all pass;
- coverage has at least 80% lines for each new file under `lib/host`, `lib/search/match-listing.ts`, `lib/repositories/{combined,host-*,mock/mock-host-*}.ts`, `app/api/host`, `lib/api-client/host.ts` and `components/features/host`.

Report the numbers. If a file is under 80%, add focused tests and say which.

- [ ] **Step 5: Commit**

```bash
cd D:/PersonalProjects/airbnb
git add frontend/e2e/host.spec.ts CLAUDE.md docs/superpowers/specs/2026-06-21-airbnb-frontend-clone-design.md
git status --short   # plus any coverage tests added in Step 4
git commit -m "test: cover the host flows end to end and document phase 7

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
