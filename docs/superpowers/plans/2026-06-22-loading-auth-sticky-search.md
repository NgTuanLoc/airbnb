# Loading States, Auth Pages & Sticky Search — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add instant route-level loading skeletons, eliminate filter-transition flicker, build UI-only login/register pages, and make the homepage search bar stick and morph into a compact pill on scroll.

**Architecture:** Next.js 16 App Router with `loading.tsx` segments for instant navigation feedback; TanStack Query `keepPreviousData` for smooth filter transitions; tokenized design-system atoms composed into feature components; an IntersectionObserver-driven hook for the sticky-search collapse state.

**Tech Stack:** Next.js 16, React 19, TypeScript (strict), Tailwind CSS v4 (`@theme` tokens in `app/globals.css`), TanStack Query v5, Zod v4, Vitest + React Testing Library, Playwright.

## Global Constraints

- Use named design tokens only (`bg-rausch`, `text-ink`, `bg-canvas`, `border-hairline`, `rounded-sm`/`rounded-md`/`rounded-full`/`rounded-xs`, `shadow-airbnb`, `text-body-md`, etc.) — never arbitrary Tailwind values. Source of truth: `DESIGN.md` / `app/globals.css`.
- Import `render`, `screen`, `userEvent` from `@/lib/test-utils` — never directly from RTL.
- Tests assert class names to verify token usage (e.g. `expect(el.className).toContain("bg-rausch")`).
- Path alias `@/*` maps to repo root.
- Immutable patterns; explicit prop types via `interface`/`type`; no `React.FC`; no `console.log`.
- Files focused and small (<800 lines); functions <50 lines.
- TDD: failing test → minimal implementation → passing test → commit. Target 80% coverage on new code.
- Auth is **UI only** — no backend, no session, no localStorage, no protected routes.
- Search morph is **in place** below a normal `TopNav` — do NOT merge the pill into the nav row.

---

## File Structure

**Phase 1 — Loading**
- Create `components/design-system/skeleton.tsx` — `Skeleton` atom (pulse block, radius variants).
- Create `components/design-system/skeleton.test.tsx`.
- Modify `components/design-system/index.ts` — export `Skeleton`.
- Modify `components/features/property-grid.tsx` — use `Skeleton` atom.
- Modify `components/features/search/search-results-list.tsx` — use `Skeleton` atom.
- Modify `lib/hooks/use-listings.ts` + `lib/hooks/use-search-listings.ts` — `keepPreviousData`.
- Modify `components/features/home-listings.tsx` + `components/features/search/search-results.tsx` — dim while `isPlaceholderData`.
- Create `components/features/skeletons/card-grid-skeleton.tsx` — `CardGridSkeleton`.
- Create `components/features/skeletons/detail-skeleton.tsx` — `DetailSkeleton`.
- Create `components/features/skeletons/*.test.tsx`.
- Create `app/s/[location]/loading.tsx`, `app/rooms/[id]/loading.tsx`, `app/experiences/loading.tsx`, `app/experiences/[id]/loading.tsx`, `app/services/loading.tsx`, `app/services/[id]/loading.tsx`.

**Phase 2 — Auth**
- Create `lib/auth/schemas.ts` + `lib/auth/schemas.test.ts`.
- Create `components/design-system/auth-card.tsx` + test; export from barrel.
- Create `components/features/auth/login-form.tsx` + test.
- Create `components/features/auth/register-form.tsx` + test.
- Create `app/login/page.tsx`, `app/register/page.tsx`.
- Modify `components/design-system/top-nav.tsx` + its test — account control links to `/login`.
- Create `e2e/login.spec.ts`.

**Phase 3 — Sticky search**
- Create `lib/hooks/use-sticky-search.ts` + test.
- Create `components/features/search-bar/sticky-home-search.tsx` + test.
- Modify `app/globals.css` — add `searchMorphIn` keyframe + class.
- Modify `app/page.tsx` — render `StickyHomeSearch` in a sticky container with a sentinel.

---

# Phase 1 — Loading States

## Task 1: `Skeleton` atom + refactor existing inline skeletons

**Files:**
- Create: `components/design-system/skeleton.tsx`
- Test: `components/design-system/skeleton.test.tsx`
- Modify: `components/design-system/index.ts`
- Modify: `components/features/property-grid.tsx`
- Modify: `components/features/search/search-results-list.tsx`

**Interfaces:**
- Produces: `Skeleton({ className?: string; radius?: "xs" | "sm" | "md" | "full" })` — renders `<div data-testid="skeleton" className="animate-pulse bg-surface-strong ...">`.

- [ ] **Step 1: Write the failing test**

`components/design-system/skeleton.test.tsx`:
```tsx
import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { Skeleton } from "./skeleton";

describe("Skeleton", () => {
  test("renders a pulsing surface block", () => {
    render(<Skeleton />);
    const el = screen.getByTestId("skeleton");
    expect(el.className).toContain("animate-pulse");
    expect(el.className).toContain("bg-surface-strong");
  });

  test("defaults to rounded-sm radius", () => {
    render(<Skeleton />);
    expect(screen.getByTestId("skeleton").className).toContain("rounded-sm");
  });

  test("applies the requested radius variant", () => {
    render(<Skeleton radius="full" />);
    expect(screen.getByTestId("skeleton").className).toContain("rounded-full");
  });

  test("merges a custom className for sizing", () => {
    render(<Skeleton className="h-4 w-1/2" />);
    const el = screen.getByTestId("skeleton");
    expect(el.className).toContain("h-4");
    expect(el.className).toContain("w-1/2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/design-system/skeleton.test.tsx`
Expected: FAIL — cannot resolve `./skeleton`.

- [ ] **Step 3: Write minimal implementation**

`components/design-system/skeleton.tsx`:
```tsx
import { cn } from "@/lib/utils";

type SkeletonRadius = "xs" | "sm" | "md" | "full";

const radii: Record<SkeletonRadius, string> = {
  xs: "rounded-xs",
  sm: "rounded-sm",
  md: "rounded-md",
  full: "rounded-full",
};

export interface SkeletonProps {
  className?: string;
  radius?: SkeletonRadius;
}

export function Skeleton({ className, radius = "sm" }: SkeletonProps) {
  return (
    <div
      data-testid="skeleton"
      className={cn("animate-pulse bg-surface-strong", radii[radius], className)}
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/design-system/skeleton.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Export from the barrel**

Add to `components/design-system/index.ts` (after the `Button` line):
```ts
export { Skeleton } from "./skeleton";
```

- [ ] **Step 6: Refactor `property-grid.tsx` to use the atom**

In `components/features/property-grid.tsx`, replace the import line and the `Skeleton` function.

Change the import block at the top to:
```tsx
import { PropertyCard, Skeleton } from "@/components/design-system";
import type { Listing } from "@/lib/types";
```

Replace the existing `function Skeleton() { ... }` with:
```tsx
function PropertySkeleton() {
  return (
    <div data-testid="property-skeleton" className="flex flex-col gap-2">
      <Skeleton radius="md" className="aspect-square w-full" />
      <Skeleton radius="xs" className="h-4 w-3/4" />
      <Skeleton radius="xs" className="h-4 w-1/2" />
    </div>
  );
}
```

In the `isLoading` branch, change `<Skeleton key={i} />` to `<PropertySkeleton key={i} />`.

- [ ] **Step 7: Refactor `search-results-list.tsx` to use the atom**

In `components/features/search/search-results-list.tsx`, change the import line to:
```tsx
import { PropertyCard, Skeleton } from "@/components/design-system";
```

Replace the existing `function Skeleton() { ... }` with:
```tsx
function ResultSkeleton() {
  return (
    <div data-testid="result-skeleton" className="flex flex-col gap-2">
      <Skeleton radius="md" className="aspect-square w-full" />
      <Skeleton radius="xs" className="h-4 w-3/4" />
    </div>
  );
}
```

In the `isLoading` branch, change `<Skeleton key={i} />` to `<ResultSkeleton key={i} />`.

- [ ] **Step 8: Run the affected suites to confirm no regression**

Run: `npx vitest run components/design-system/skeleton.test.tsx components/features/property-grid.test.tsx components/features/search/search-results-list.test.tsx`
Expected: PASS. (The existing tests assert `property-skeleton` / `result-skeleton` testids, which are preserved.)

- [ ] **Step 9: Commit**

```bash
git add components/design-system/skeleton.tsx components/design-system/skeleton.test.tsx components/design-system/index.ts components/features/property-grid.tsx components/features/search/search-results-list.tsx
git commit -m "feat: add Skeleton atom and reuse it in grid skeletons"
```

---

## Task 2: `keepPreviousData` + dim on filter transitions

**Files:**
- Modify: `lib/hooks/use-listings.ts`
- Modify: `lib/hooks/use-search-listings.ts`
- Modify: `components/features/home-listings.tsx`
- Modify: `components/features/search/search-results.tsx`
- Test: `lib/hooks/use-listings.test.tsx` (add a case)

**Interfaces:**
- Consumes: `useListings`, `useSearchListings` now expose `isPlaceholderData` from the returned `UseQueryResult`.

- [ ] **Step 1: Write the failing test**

Add to `lib/hooks/use-listings.test.tsx` inside the `describe("useListings", ...)` block:
```tsx
  test("keeps previous data while a new category query is fetching", async () => {
    const first: Listing = { ...sample, id: "a" };
    const second: Listing = { ...sample, id: "b" };
    const spy = vi
      .spyOn(api, "fetchListings")
      .mockResolvedValueOnce([first])
      .mockResolvedValueOnce([second]);

    const { result, rerender } = renderHook(({ c }) => useListings(c), {
      wrapper,
      initialProps: { c: "All" },
    });
    await waitFor(() => expect(result.current.data).toEqual([first]));

    rerender({ c: "Cabins" });
    // Immediately after switching keys, previous data is retained as placeholder.
    expect(result.current.data).toEqual([first]);
    expect(result.current.isPlaceholderData).toBe(true);

    await waitFor(() => expect(result.current.data).toEqual([second]));
    expect(result.current.isPlaceholderData).toBe(false);
    expect(spy).toHaveBeenCalledTimes(2);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/hooks/use-listings.test.tsx`
Expected: FAIL — `isPlaceholderData` is `false` after rerender (no `keepPreviousData` yet).

- [ ] **Step 3: Add `keepPreviousData` to both hooks**

`lib/hooks/use-listings.ts`:
```ts
import { useQuery, keepPreviousData, type UseQueryResult } from "@tanstack/react-query";
import { fetchListings } from "@/lib/api-client/listings";
import type { Listing } from "@/lib/types";

export function useListings(category?: string): UseQueryResult<Listing[]> {
  return useQuery({
    queryKey: ["listings", category ?? "All"],
    queryFn: () => fetchListings(category),
    placeholderData: keepPreviousData,
  });
}
```

`lib/hooks/use-search-listings.ts`:
```ts
import { useQuery, keepPreviousData, type UseQueryResult } from "@tanstack/react-query";
import { fetchSearchListings } from "@/lib/api-client/listings";
import type { Listing } from "@/lib/types";
import type { ListingFilters } from "@/lib/repositories/listing-repository";

export function useSearchListings(filters: ListingFilters): UseQueryResult<Listing[]> {
  return useQuery({
    queryKey: ["search-listings", filters],
    queryFn: () => fetchSearchListings(filters),
    placeholderData: keepPreviousData,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/hooks/use-listings.test.tsx`
Expected: PASS.

- [ ] **Step 5: Dim the grid while showing placeholder data in `HomeListings`**

Replace `components/features/home-listings.tsx` body with:
```tsx
"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { CATEGORIES } from "@/lib/types";
import { useListings } from "@/lib/hooks/use-listings";
import { CategoryStrip } from "./category-strip";
import { PropertyGrid } from "./property-grid";

export function HomeListings() {
  const [active, setActive] = useState<string>("All");
  const { data, isLoading, isError, isPlaceholderData } = useListings(active);

  return (
    <div className="flex flex-col gap-6">
      <CategoryStrip categories={CATEGORIES} active={active} onSelect={setActive} />
      {isError ? (
        <p className="text-body-md text-error">Something went wrong loading places. Please try again.</p>
      ) : (
        <div className={cn("transition-opacity duration-200", isPlaceholderData && "opacity-60")}>
          <PropertyGrid listings={data ?? []} isLoading={isLoading} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Dim the results list while showing placeholder data in `SearchResults`**

In `components/features/search/search-results.tsx`:

Add the `cn` import near the top imports:
```tsx
import { cn } from "@/lib/utils";
```

Destructure `isPlaceholderData`:
```tsx
  const { data, isLoading, isError, isPlaceholderData } = useSearchListings(filters);
```

Wrap the `SearchResultsList` render (the `else` branch of the `isError` ternary) in a dimming div:
```tsx
          {isError ? (
            <p className="text-body-md text-error">Something went wrong loading stays. Please try again.</p>
          ) : (
            <div className={cn("transition-opacity duration-200", isPlaceholderData && "opacity-60")}>
              <SearchResultsList listings={listings} isLoading={isLoading} location={location} />
            </div>
          )}
```

- [ ] **Step 7: Run the affected suites**

Run: `npx vitest run lib/hooks components/features/home-listings.test.tsx components/features/search/search-results.test.tsx`
Expected: PASS (existing component tests still pass; the dim wrapper does not change queried text/roles).

- [ ] **Step 8: Commit**

```bash
git add lib/hooks/use-listings.ts lib/hooks/use-search-listings.ts lib/hooks/use-listings.test.tsx components/features/home-listings.tsx components/features/search/search-results.tsx
git commit -m "feat: keep previous results and dim grid during filter transitions"
```

---

## Task 3: Skeleton composition components

**Files:**
- Create: `components/features/skeletons/card-grid-skeleton.tsx`
- Create: `components/features/skeletons/detail-skeleton.tsx`
- Test: `components/features/skeletons/card-grid-skeleton.test.tsx`
- Test: `components/features/skeletons/detail-skeleton.test.tsx`

**Interfaces:**
- Produces:
  - `CardGridSkeleton({ count?: number })` — renders `count` (default 8) card skeletons inside a responsive grid; each card root has `data-testid="grid-card-skeleton"`.
  - `DetailSkeleton()` — renders a detail-page skeleton (hero block + content lines + sidebar block); root has `data-testid="detail-skeleton"`.

- [ ] **Step 1: Write the failing tests**

`components/features/skeletons/card-grid-skeleton.test.tsx`:
```tsx
import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { CardGridSkeleton } from "./card-grid-skeleton";

describe("CardGridSkeleton", () => {
  test("renders the default number of card skeletons", () => {
    render(<CardGridSkeleton />);
    expect(screen.getAllByTestId("grid-card-skeleton")).toHaveLength(8);
  });

  test("renders a custom count", () => {
    render(<CardGridSkeleton count={3} />);
    expect(screen.getAllByTestId("grid-card-skeleton")).toHaveLength(3);
  });
});
```

`components/features/skeletons/detail-skeleton.test.tsx`:
```tsx
import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { DetailSkeleton } from "./detail-skeleton";

describe("DetailSkeleton", () => {
  test("renders the detail skeleton container", () => {
    render(<DetailSkeleton />);
    expect(screen.getByTestId("detail-skeleton")).toBeInTheDocument();
  });

  test("renders at least one pulsing block", () => {
    render(<DetailSkeleton />);
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/features/skeletons`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `CardGridSkeleton`**

`components/features/skeletons/card-grid-skeleton.tsx`:
```tsx
import { Skeleton } from "@/components/design-system";

export interface CardGridSkeletonProps {
  count?: number;
}

export function CardGridSkeleton({ count = 8 }: CardGridSkeletonProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} data-testid="grid-card-skeleton" className="flex flex-col gap-2">
          <Skeleton radius="md" className="aspect-square w-full" />
          <Skeleton radius="xs" className="h-4 w-3/4" />
          <Skeleton radius="xs" className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Implement `DetailSkeleton`**

`components/features/skeletons/detail-skeleton.tsx`:
```tsx
import { Skeleton } from "@/components/design-system";

export function DetailSkeleton() {
  return (
    <div data-testid="detail-skeleton" className="mx-auto flex w-full max-w-[1080px] flex-col gap-6 px-6 py-8">
      <Skeleton radius="sm" className="h-8 w-1/2" />
      <Skeleton radius="md" className="aspect-[2/1] w-full" />
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1.7fr_1fr]">
        <div className="flex flex-col gap-3">
          <Skeleton radius="xs" className="h-4 w-3/4" />
          <Skeleton radius="xs" className="h-4 w-2/3" />
          <Skeleton radius="xs" className="h-4 w-1/2" />
          <Skeleton radius="xs" className="h-4 w-5/6" />
        </div>
        <Skeleton radius="md" className="h-64 w-full" />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run components/features/skeletons`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add components/features/skeletons
git commit -m "feat: add CardGridSkeleton and DetailSkeleton compositions"
```

---

## Task 4: Route-level `loading.tsx` segments

**Files:**
- Create: `app/s/[location]/loading.tsx`
- Create: `app/rooms/[id]/loading.tsx`
- Create: `app/experiences/loading.tsx`
- Create: `app/experiences/[id]/loading.tsx`
- Create: `app/services/loading.tsx`
- Create: `app/services/[id]/loading.tsx`

**Interfaces:**
- Consumes: `TopNav`, `Footer`, `Skeleton` from `@/components/design-system`; `CardGridSkeleton`, `DetailSkeleton` from `@/components/features/skeletons/*`.

> Note: there is no shared layout rendering `TopNav` — each page renders its own. So each `loading.tsx` must render `TopNav` + skeleton + `Footer` to avoid the chrome disappearing during navigation.

- [ ] **Step 1: Search results loading**

`app/s/[location]/loading.tsx`:
```tsx
import { TopNav, Footer, Skeleton } from "@/components/design-system";
import { CardGridSkeleton } from "@/components/features/skeletons/card-grid-skeleton";

export default function SearchLoading() {
  return (
    <div className="flex min-h-screen flex-col">
      <TopNav active="homes" />
      <div className="flex items-center gap-3 border-b border-hairline px-6 py-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} radius="full" className="h-8 w-20" />
        ))}
      </div>
      <div className="flex flex-1">
        <div className="w-full px-6 py-6 lg:w-[62%]">
          <CardGridSkeleton count={6} />
        </div>
        <div className="hidden lg:block lg:w-[38%]">
          <Skeleton radius="sm" className="h-full min-h-[60vh] w-full" />
        </div>
      </div>
      <Footer />
    </div>
  );
}
```

- [ ] **Step 2: Room detail loading**

`app/rooms/[id]/loading.tsx`:
```tsx
import { TopNav, Footer } from "@/components/design-system";
import { DetailSkeleton } from "@/components/features/skeletons/detail-skeleton";

export default function RoomLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopNav active="homes" />
      <main className="flex-1">
        <DetailSkeleton />
      </main>
      <Footer />
    </div>
  );
}
```

- [ ] **Step 3: Experiences list loading**

`app/experiences/loading.tsx`:
```tsx
import { TopNav, Footer, Skeleton } from "@/components/design-system";
import { CardGridSkeleton } from "@/components/features/skeletons/card-grid-skeleton";

export default function ExperiencesLoading() {
  return (
    <div className="flex min-h-screen flex-col">
      <TopNav active="experiences" />
      <main className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col gap-8 px-6 py-8">
        <Skeleton radius="sm" className="h-8 w-64" />
        <CardGridSkeleton />
      </main>
      <Footer />
    </div>
  );
}
```

- [ ] **Step 4: Services list loading**

`app/services/loading.tsx`:
```tsx
import { TopNav, Footer, Skeleton } from "@/components/design-system";
import { CardGridSkeleton } from "@/components/features/skeletons/card-grid-skeleton";

export default function ServicesLoading() {
  return (
    <div className="flex min-h-screen flex-col">
      <TopNav active="services" />
      <main className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col gap-8 px-6 py-8">
        <Skeleton radius="sm" className="h-8 w-64" />
        <CardGridSkeleton />
      </main>
      <Footer />
    </div>
  );
}
```

- [ ] **Step 5: Experience & service detail loading**

`app/experiences/[id]/loading.tsx`:
```tsx
import { TopNav, Footer } from "@/components/design-system";
import { DetailSkeleton } from "@/components/features/skeletons/detail-skeleton";

export default function ExperienceDetailLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopNav active="experiences" />
      <main className="flex-1">
        <DetailSkeleton />
      </main>
      <Footer />
    </div>
  );
}
```

`app/services/[id]/loading.tsx`:
```tsx
import { TopNav, Footer } from "@/components/design-system";
import { DetailSkeleton } from "@/components/features/skeletons/detail-skeleton";

export default function ServiceDetailLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopNav active="services" />
      <main className="flex-1">
        <DetailSkeleton />
      </main>
      <Footer />
    </div>
  );
}
```

- [ ] **Step 6: Verify build/typecheck and manual smoke**

Run: `npm run lint`
Expected: no errors for the new files.

Manual check (optional): `npm run dev`, navigate Home → a listing, Home → search, and between Experiences/Services. A skeleton flashes instead of a frozen page.

- [ ] **Step 7: Commit**

```bash
git add app/s/[location]/loading.tsx app/rooms/[id]/loading.tsx app/experiences/loading.tsx app/experiences/[id]/loading.tsx app/services/loading.tsx app/services/[id]/loading.tsx
git commit -m "feat: add route-level loading skeletons for navigation"
```

---

# Phase 2 — Login & Register (UI-only mock)

## Task 5: Zod auth schemas

**Files:**
- Create: `lib/auth/schemas.ts`
- Test: `lib/auth/schemas.test.ts`

**Interfaces:**
- Produces:
  - `loginSchema` (Zod) → `{ email: string; password: string }`; `LoginInput` type.
  - `registerSchema` (Zod) → `{ name: string; email: string; password: string; confirmPassword: string }`; `RegisterInput` type.
  - Rules: `email` valid; `password` min 8; `name` min 2; `confirmPassword` must equal `password`.

- [ ] **Step 1: Write the failing test**

`lib/auth/schemas.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { loginSchema, registerSchema } from "./schemas";

describe("loginSchema", () => {
  test("accepts a valid email and password", () => {
    const result = loginSchema.safeParse({ email: "a@b.com", password: "supersecret" });
    expect(result.success).toBe(true);
  });

  test("rejects an invalid email", () => {
    const result = loginSchema.safeParse({ email: "nope", password: "supersecret" });
    expect(result.success).toBe(false);
  });

  test("rejects a short password", () => {
    const result = loginSchema.safeParse({ email: "a@b.com", password: "short" });
    expect(result.success).toBe(false);
  });
});

describe("registerSchema", () => {
  const valid = { name: "Ada", email: "a@b.com", password: "supersecret", confirmPassword: "supersecret" };

  test("accepts matching passwords", () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  test("rejects mismatched passwords on the confirmPassword field", () => {
    const result = registerSchema.safeParse({ ...valid, confirmPassword: "different1" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("confirmPassword"))).toBe(true);
    }
  });

  test("rejects a one-character name", () => {
    expect(registerSchema.safeParse({ ...valid, name: "A" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/auth/schemas.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement schemas**

`lib/auth/schemas.ts`:
```ts
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Enter a valid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/auth/schemas.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/auth/schemas.ts lib/auth/schemas.test.ts
git commit -m "feat: add Zod login and register schemas"
```

---

## Task 6: `AuthCard` design-system component

**Files:**
- Create: `components/design-system/auth-card.tsx`
- Test: `components/design-system/auth-card.test.tsx`
- Modify: `components/design-system/index.ts`

**Interfaces:**
- Produces: `AuthCard({ title: string; subtitle?: string; children: React.ReactNode })` — centered card shell with the `airbnb` wordmark, a `text-display-sm` title, optional subtitle, and the children slot.

- [ ] **Step 1: Write the failing test**

`components/design-system/auth-card.test.tsx`:
```tsx
import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { AuthCard } from "./auth-card";

describe("AuthCard", () => {
  test("renders the title and children", () => {
    render(
      <AuthCard title="Log in">
        <button type="button">Continue</button>
      </AuthCard>,
    );
    expect(screen.getByText("Log in")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  test("renders an optional subtitle", () => {
    render(
      <AuthCard title="Welcome back" subtitle="Sign in to continue">
        <span>x</span>
      </AuthCard>,
    );
    expect(screen.getByText("Sign in to continue")).toBeInTheDocument();
  });

  test("uses the canvas surface and rounded card tokens", () => {
    render(<AuthCard title="Log in"><span>x</span></AuthCard>);
    const card = screen.getByTestId("auth-card");
    expect(card.className).toContain("bg-canvas");
    expect(card.className).toContain("rounded-md");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/design-system/auth-card.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `AuthCard`**

`components/design-system/auth-card.tsx`:
```tsx
import Link from "next/link";

export interface AuthCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export function AuthCard({ title, subtitle, children }: AuthCardProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-soft px-6 py-12">
      <div
        data-testid="auth-card"
        className="w-full max-w-md rounded-md border border-hairline bg-canvas p-8 shadow-airbnb"
      >
        <Link href="/" className="mb-6 block text-display-sm font-bold text-rausch" aria-label="Airbnb home">
          airbnb
        </Link>
        <h1 className="text-display-sm text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-body-md text-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/design-system/auth-card.test.tsx`
Expected: PASS (3 tests).

> If `bg-surface-soft` is not a defined token, fall back to `bg-canvas` on the outer wrapper. Confirm token names in `app/globals.css` before implementing.

- [ ] **Step 5: Export from the barrel**

Add to `components/design-system/index.ts`:
```ts
export { AuthCard } from "./auth-card";
```

- [ ] **Step 6: Commit**

```bash
git add components/design-system/auth-card.tsx components/design-system/auth-card.test.tsx components/design-system/index.ts
git commit -m "feat: add AuthCard shell component"
```

---

## Task 7: `LoginForm`

**Files:**
- Create: `components/features/auth/login-form.tsx`
- Test: `components/features/auth/login-form.test.tsx`

**Interfaces:**
- Consumes: `loginSchema` from `@/lib/auth/schemas`; `TextInput`, `Button` from `@/components/design-system`; `useRouter` from `next/navigation`.
- Produces: `LoginForm()` — controlled email/password form; validates on submit; shows per-field errors; on success calls `router.push("/")`.

- [ ] **Step 1: Write the failing test**

`components/features/auth/login-form.test.tsx`:
```tsx
import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, userEvent, waitFor } from "@/lib/test-utils";
import { LoginForm } from "./login-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeEach(() => push.mockReset());

describe("LoginForm", () => {
  test("shows a validation error for an invalid email and does not navigate", async () => {
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText("Email"), "nope");
    await userEvent.type(screen.getByLabelText("Password"), "supersecret");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(screen.getByText("Enter a valid email address")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  test("navigates home on valid submit", async () => {
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText("Email"), "a@b.com");
    await userEvent.type(screen.getByLabelText("Password"), "supersecret");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/features/auth/login-form.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `LoginForm`**

`components/features/auth/login-form.tsx`:
```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, TextInput } from "@/components/design-system";
import { loginSchema } from "@/lib/auth/schemas";

type FieldErrors = Partial<Record<"email" | "password", string>>;

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "email" || key === "password") next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setSubmitting(true);
    // Mock auth: simulate a request, then route home.
    await new Promise((resolve) => setTimeout(resolve, 400));
    router.push("/");
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      <TextInput
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
      />
      <TextInput
        label="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
      />
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Logging in…" : "Log in"}
      </Button>
      <p className="text-body-sm text-muted">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="text-ink underline">
          Sign up
        </Link>
      </p>
    </form>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/features/auth/login-form.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add components/features/auth/login-form.tsx components/features/auth/login-form.test.tsx
git commit -m "feat: add mock LoginForm with Zod validation"
```

---

## Task 8: `RegisterForm`

**Files:**
- Create: `components/features/auth/register-form.tsx`
- Test: `components/features/auth/register-form.test.tsx`

**Interfaces:**
- Consumes: `registerSchema` from `@/lib/auth/schemas`; `TextInput`, `Button`; `useRouter`.
- Produces: `RegisterForm()` — name/email/password/confirmPassword form; validates on submit; per-field errors; navigates to `/` on success.

- [ ] **Step 1: Write the failing test**

`components/features/auth/register-form.test.tsx`:
```tsx
import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, userEvent, waitFor } from "@/lib/test-utils";
import { RegisterForm } from "./register-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeEach(() => push.mockReset());

describe("RegisterForm", () => {
  test("shows an error when passwords do not match", async () => {
    render(<RegisterForm />);
    await userEvent.type(screen.getByLabelText("Name"), "Ada");
    await userEvent.type(screen.getByLabelText("Email"), "a@b.com");
    await userEvent.type(screen.getByLabelText("Password"), "supersecret");
    await userEvent.type(screen.getByLabelText("Confirm password"), "different1");
    await userEvent.click(screen.getByRole("button", { name: "Sign up" }));
    expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  test("navigates home on valid submit", async () => {
    render(<RegisterForm />);
    await userEvent.type(screen.getByLabelText("Name"), "Ada");
    await userEvent.type(screen.getByLabelText("Email"), "a@b.com");
    await userEvent.type(screen.getByLabelText("Password"), "supersecret");
    await userEvent.type(screen.getByLabelText("Confirm password"), "supersecret");
    await userEvent.click(screen.getByRole("button", { name: "Sign up" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/features/auth/register-form.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `RegisterForm`**

`components/features/auth/register-form.tsx`:
```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, TextInput } from "@/components/design-system";
import { registerSchema } from "@/lib/auth/schemas";

type RegisterField = "name" | "email" | "password" | "confirmPassword";
type FieldErrors = Partial<Record<RegisterField, string>>;

export function RegisterForm() {
  const router = useRouter();
  const [values, setValues] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  function update(field: RegisterField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = registerSchema.safeParse(values);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as RegisterField;
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 400));
    router.push("/");
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      <TextInput label="Name" value={values.name} onChange={(e) => update("name", e.target.value)} error={errors.name} />
      <TextInput label="Email" type="email" value={values.email} onChange={(e) => update("email", e.target.value)} error={errors.email} />
      <TextInput label="Password" type="password" value={values.password} onChange={(e) => update("password", e.target.value)} error={errors.password} />
      <TextInput label="Confirm password" type="password" value={values.confirmPassword} onChange={(e) => update("confirmPassword", e.target.value)} error={errors.confirmPassword} />
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Creating account…" : "Sign up"}
      </Button>
      <p className="text-body-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-ink underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/features/auth/register-form.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add components/features/auth/register-form.tsx components/features/auth/register-form.test.tsx
git commit -m "feat: add mock RegisterForm with Zod validation"
```

---

## Task 9: Login & Register pages

**Files:**
- Create: `app/login/page.tsx`
- Create: `app/register/page.tsx`

**Interfaces:**
- Consumes: `AuthCard` from `@/components/design-system`; `LoginForm`, `RegisterForm` from `@/components/features/auth/*`.

- [ ] **Step 1: Create the login page**

`app/login/page.tsx`:
```tsx
import type { Metadata } from "next";
import { AuthCard } from "@/components/design-system";
import { LoginForm } from "@/components/features/auth/login-form";

export const metadata: Metadata = { title: "Log in · Airbnb" };

export default function LoginPage() {
  return (
    <AuthCard title="Welcome back" subtitle="Log in to your account">
      <LoginForm />
    </AuthCard>
  );
}
```

- [ ] **Step 2: Create the register page**

`app/register/page.tsx`:
```tsx
import type { Metadata } from "next";
import { AuthCard } from "@/components/design-system";
import { RegisterForm } from "@/components/features/auth/register-form";

export const metadata: Metadata = { title: "Sign up · Airbnb" };

export default function RegisterPage() {
  return (
    <AuthCard title="Create your account" subtitle="Sign up to get started">
      <RegisterForm />
    </AuthCard>
  );
}
```

- [ ] **Step 3: Verify lint + manual smoke**

Run: `npm run lint`
Expected: no errors.

Manual (optional): `npm run dev`, visit `/login` and `/register`, confirm forms render and cross-link.

- [ ] **Step 4: Commit**

```bash
git add app/login/page.tsx app/register/page.tsx
git commit -m "feat: add login and register pages"
```

---

## Task 10: TopNav account control links to `/login`

**Files:**
- Modify: `components/design-system/top-nav.tsx`
- Modify: `components/design-system/top-nav.test.tsx` (add a case)

**Interfaces:**
- The account control becomes a `next/link` to `/login` with an accessible name `Account menu`.

- [ ] **Step 1: Write the failing test**

Add to `components/design-system/top-nav.test.tsx` (inside the existing `describe`):
```tsx
  test("the account control links to the login page", () => {
    render(<TopNav active="homes" />);
    const account = screen.getByRole("link", { name: "Account menu" });
    expect(account).toHaveAttribute("href", "/login");
  });
```

> If the test file lacks the standard imports, this is the existing pattern:
> `import { render, screen } from "@/lib/test-utils";` and `import { TopNav } from "./top-nav";`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/design-system/top-nav.test.tsx`
Expected: FAIL — the account element is currently a `<button>`, not a link.

- [ ] **Step 3: Convert the account button to a Link**

In `components/design-system/top-nav.tsx`, replace the account `<button>` block with:
```tsx
        <Link
          href="/login"
          aria-label="Account menu"
          className="flex h-10 items-center gap-2 rounded-full border border-hairline px-3"
        >
          <Menu aria-hidden className="size-4 text-ink" />
          <UserCircle aria-hidden className="size-7 text-muted" />
        </Link>
```

(`Link`, `Menu`, `UserCircle` are already imported in this file.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/design-system/top-nav.test.tsx`
Expected: PASS (existing tests + the new one).

- [ ] **Step 5: Commit**

```bash
git add components/design-system/top-nav.tsx components/design-system/top-nav.test.tsx
git commit -m "feat: link TopNav account control to login page"
```

---

## Task 11: Playwright E2E — login happy path

**Files:**
- Create: `e2e/login.spec.ts`

**Interfaces:**
- Consumes: the running dev server (Playwright config auto-starts it).

- [ ] **Step 1: Write the E2E test**

`e2e/login.spec.ts`:
```ts
import { test, expect } from "@playwright/test";

test("user can log in via the mock form and lands on the homepage", async ({ page }) => {
  await page.goto("/login");

  await page.getByLabel("Email").fill("a@b.com");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page).toHaveURL("/");
});

test("login page links to register", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Sign up" }).click();
  await expect(page).toHaveURL("/register");
});
```

> Check an existing file in `e2e/` first to confirm the import path (`@playwright/test`) and any `baseURL` convention. Match the established pattern if it differs.

- [ ] **Step 2: Run the E2E test**

Run: `npx playwright test e2e/login.spec.ts`
Expected: PASS (2 tests). If the browser isn't installed, run `npx playwright install` first.

- [ ] **Step 3: Commit**

```bash
git add e2e/login.spec.ts
git commit -m "test: add e2e coverage for the login flow"
```

---

# Phase 3 — Sticky shrink-to-pill search

## Task 12: `useStickySearch` hook

**Files:**
- Create: `lib/hooks/use-sticky-search.ts`
- Test: `lib/hooks/use-sticky-search.test.tsx`

**Interfaces:**
- Produces: `useStickySearch(sentinelRef: RefObject<HTMLElement | null>): boolean` — returns `true` (collapsed) when the sentinel has scrolled out of view (not intersecting), `false` otherwise. Uses an `IntersectionObserver`.

- [ ] **Step 1: Write the failing test**

`lib/hooks/use-sticky-search.test.tsx`:
```tsx
import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRef } from "react";
import { useStickySearch } from "./use-sticky-search";

type ObserverCallback = (entries: { isIntersecting: boolean }[]) => void;
let lastCallback: ObserverCallback | null = null;

class MockIntersectionObserver {
  constructor(cb: ObserverCallback) {
    lastCallback = cb;
  }
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}

beforeEach(() => {
  lastCallback = null;
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function useHarness() {
  const ref = useRef<HTMLDivElement>(null);
  // Attach a node so the effect runs its observe path.
  if (!ref.current) ref.current = document.createElement("div");
  return useStickySearch(ref);
}

describe("useStickySearch", () => {
  test("starts not collapsed", () => {
    const { result } = renderHook(() => useHarness());
    expect(result.current).toBe(false);
  });

  test("collapses when the sentinel leaves the viewport", () => {
    const { result } = renderHook(() => useHarness());
    act(() => lastCallback?.([{ isIntersecting: false }]));
    expect(result.current).toBe(true);
  });

  test("expands again when the sentinel returns", () => {
    const { result } = renderHook(() => useHarness());
    act(() => lastCallback?.([{ isIntersecting: false }]));
    act(() => lastCallback?.([{ isIntersecting: true }]));
    expect(result.current).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/hooks/use-sticky-search.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

`lib/hooks/use-sticky-search.ts`:
```ts
import { useEffect, useState, type RefObject } from "react";

export function useStickySearch(sentinelRef: RefObject<HTMLElement | null>): boolean {
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsCollapsed(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinelRef]);

  return isCollapsed;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/hooks/use-sticky-search.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/hooks/use-sticky-search.ts lib/hooks/use-sticky-search.test.tsx
git commit -m "feat: add useStickySearch IntersectionObserver hook"
```

---

## Task 13: `StickyHomeSearch` wrapper + CSS morph + homepage wiring

**Files:**
- Modify: `app/globals.css` (add `searchMorphIn` keyframe + class)
- Create: `components/features/search-bar/sticky-home-search.tsx`
- Test: `components/features/search-bar/sticky-home-search.test.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `useStickySearch` from `@/lib/hooks/use-sticky-search`; `HomeSearchBar` from `./home-search-bar`.
- Produces: `StickyHomeSearch()` — renders a sentinel + sticky container; shows a compact pill button (`data-testid="search-pill"`) when collapsed and not expanded; shows the full `HomeSearchBar` otherwise. Clicking the pill expands the full bar and scrolls to top.

- [ ] **Step 1: Add the morph animation to globals.css**

Append to `app/globals.css` (after the existing `.search-pop-in` block):
```css
@keyframes searchMorphIn {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.search-morph-in {
  animation: searchMorphIn 200ms ease-out;
}
```

- [ ] **Step 2: Write the failing test**

`components/features/search-bar/sticky-home-search.test.tsx`:
```tsx
import { describe, expect, test, vi } from "vitest";
import { render, screen, userEvent } from "@/lib/test-utils";
import { StickyHomeSearch } from "./sticky-home-search";

// Control the collapse state directly.
const collapsed = { value: false };
vi.mock("@/lib/hooks/use-sticky-search", () => ({
  useStickySearch: () => collapsed.value,
}));

// HomeSearchBar (rendered in the expanded branch) calls useRouter; stub it.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("StickyHomeSearch", () => {
  test("shows the full search bar when not collapsed", () => {
    collapsed.value = false;
    render(<StickyHomeSearch />);
    expect(screen.queryByTestId("search-pill")).not.toBeInTheDocument();
    // Full bar exposes the segment buttons.
    expect(screen.getByRole("button", { name: "Where" })).toBeInTheDocument();
  });

  test("shows the compact pill when collapsed", () => {
    collapsed.value = true;
    render(<StickyHomeSearch />);
    expect(screen.getByTestId("search-pill")).toBeInTheDocument();
  });

  test("clicking the pill expands the full bar", async () => {
    collapsed.value = true;
    window.scrollTo = vi.fn();
    render(<StickyHomeSearch />);
    await userEvent.click(screen.getByTestId("search-pill"));
    expect(screen.getByRole("button", { name: "Where" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run components/features/search-bar/sticky-home-search.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `StickyHomeSearch`**

`components/features/search-bar/sticky-home-search.tsx`:
```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useStickySearch } from "@/lib/hooks/use-sticky-search";
import { HomeSearchBar } from "./home-search-bar";

export function StickyHomeSearch() {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const collapsed = useStickySearch(sentinelRef);
  const [expanded, setExpanded] = useState(false);

  // When the user scrolls back to the top, return to the resting (non-expanded) state.
  useEffect(() => {
    if (!collapsed) setExpanded(false);
  }, [collapsed]);

  const showPill = collapsed && !expanded;

  function expandFromPill() {
    setExpanded(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <>
      <div ref={sentinelRef} aria-hidden className="h-px w-full" />
      <div className="sticky top-0 z-40 flex justify-center border-b border-hairline bg-canvas px-6 py-4 transition-shadow">
        {showPill ? (
          <button
            type="button"
            data-testid="search-pill"
            onClick={expandFromPill}
            className="search-morph-in flex h-12 items-center gap-3 rounded-full border border-hairline bg-canvas px-5 shadow-airbnb"
          >
            <span className="text-body-sm font-semibold text-ink">Anywhere</span>
            <span className="h-5 w-px bg-hairline" aria-hidden />
            <span className="text-body-sm text-muted">Any week</span>
            <span className="h-5 w-px bg-hairline" aria-hidden />
            <span className="text-body-sm text-muted">Add guests</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-rausch text-on-primary">
              <Search aria-hidden className="size-4" />
            </span>
          </button>
        ) : (
          <div className="search-morph-in">
            <HomeSearchBar />
          </div>
        )}
      </div>
    </>
  );
}
```

> `lucide-react` is already a dependency (used in `top-nav.tsx`). If `Search` is not exported, use the existing inline SVG icon pattern from `search-bar.tsx` instead.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run components/features/search-bar/sticky-home-search.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Wire it into the homepage**

In `app/page.tsx`, replace the import of `HomeSearchBar` and the static search row.

Change the import:
```tsx
import { StickyHomeSearch } from "@/components/features/search-bar/sticky-home-search";
```

Replace this block:
```tsx
      <div className="flex justify-center border-b border-hairline px-6 py-6">
        <HomeSearchBar />
      </div>
```
with:
```tsx
      <StickyHomeSearch />
```

(Leave `TopNav`, `HomeListings`, `CityLinkGrid`, and `Footer` as they are.)

- [ ] **Step 7: Run the homepage/lint checks + manual smoke**

Run: `npm run lint`
Expected: no errors.

Manual (optional): `npm run dev`, on `/` scroll down — the full bar morphs into a centered pill that sticks to the top; clicking it scrolls up and restores the full bar.

- [ ] **Step 8: Commit**

```bash
git add app/globals.css components/features/search-bar/sticky-home-search.tsx components/features/search-bar/sticky-home-search.test.tsx app/page.tsx
git commit -m "feat: sticky shrink-to-pill homepage search bar"
```

---

# Final Verification

- [ ] **Run the full unit suite**

Run: `npm test`
Expected: all suites pass.

- [ ] **Run the E2E suite**

Run: `npm run e2e`
Expected: login specs pass.

- [ ] **Lint**

Run: `npm run lint`
Expected: clean.

---

## Notes for the implementer

- **Token verification:** Before using `bg-surface-soft`, `bg-surface-strong`, `text-on-primary`, `rounded-xs`, confirm each exists in `app/globals.css`. `bg-surface-strong`, `rounded-xs`, `text-on-primary` are already used in the codebase; `bg-surface-soft` is referenced in `button.tsx` (`hover:bg-surface-soft`). If any token is missing, substitute the nearest defined token rather than inventing an arbitrary value.
- **Test runner:** single-file runs use `npx vitest run <path>`; the project's `npm test` runs the whole suite once.
- **No new dependencies** are required — Zod, TanStack Query, lucide-react, and Playwright are already installed.
