# Frontend Phase 8 — Responsive Polish, E2E and Accessibility — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the clone work at phone, tablet and desktop widths as DESIGN.md describes, pass an automated WCAG 2.1 AA gate, and be operable by keyboard; run e2e at desktop and mobile widths; fix the bugs deferred from phases 3, 6 and 7.

**Architecture:** CSS-first responsive layout:
- Tailwind's breakpoints are retuned in `@theme`.
- Mobile-only pieces are separate client components, shown or hidden with `md:hidden` / `hidden md:flex`: the nav sheet, the search overlay and the reservation bar.
- The shared state they need is extracted into hooks: `useSearchForm` and `useReservationState`.

Accessibility is enforced by `@axe-core/playwright` in a new e2e spec that runs in both a `desktop` and a `mobile` Playwright project.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4 (`@theme` in `app/globals.css`), TanStack Query v5, Zod v4, Vitest + React Testing Library, Playwright, `@axe-core/playwright` (new dev dependency).

**Spec:** `docs/superpowers/specs/2026-09-28-frontend-phase8-responsive-a11y-design.md`

All paths are relative to `frontend/` unless marked *repo root*. All commands run from `frontend/`.

## Global Constraints

- **Breakpoints:** `--breakpoint-md: 744px`, `--breakpoint-lg: 1128px`, `--breakpoint-xl: 1440px`; `sm` stays 640px.
- **Width tokens:** `--container-listing: 1440px` and `--container-editorial: 1280px` (classes `max-w-listing` and `max-w-editorial`).
- **Gutters on page wrappers:** `px-6 md:px-10 xl:px-20`.
- **Styling:** use design tokens only. Arbitrary Tailwind values are allowed only for grid track templates (`md:grid-cols-[1fr_320px]`) and `env(safe-area-inset-bottom)`.
- **Mobile sheets and overlays:** native `<dialog>`, opened with `showModal()` in a mount effect. They unmount on close and return focus to the element that opened them. This is the pattern in `components/features/wishlists/save-to-wishlist-dialog.tsx`.
- **Tests:**
  - Import `render`, `screen`, `userEvent` and `renderHook` from `@/lib/test-utils`.
  - Use `mockRejectedValueOnce`, never `mockRejectedValue`.
  - Route handler and file-reading tests start with `// @vitest-environment node`.
- **Axe gate:** tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`. It fails on `serious` or `critical` violations and excludes only `.maplibregl-map`.
- **E2E:** wait for `networkidle` before filling or submitting forms. Pick booking dates at least one month ahead ("Next month" first).
- **Copy:** "Open menu", "Close menu", "Start your search", "Clear all", "Check availability", "Add dates for prices", "Skip to content", "Couldn't log you out. Try again.", "Dismiss".
- **Commits:** conventional commits, each ending with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Rulings made while planning (the spec defers to these)

- **Detail page widths:** the detail pages (`/rooms/[id]`, `/experiences/[id]`, `/services/[id]`, `/book/[listingId]`, `/trips/[id]`, and the rooms not-found page) keep their current narrower `max-w-[…]` caps. The spec only caps listing and editorial pages.
- **Mobile search pill:** the pill's visible text is "Start your search" / "Anywhere · Any week · Add guests". The accessible name then matches the visible text, as axe expects. The spec says "Where to?"; the section inside the overlay keeps that label.
- **Unsave error toast:** it is an error, so it keeps `role="alert"` and has no auto-hide timer. It never had one. It gains a Dismiss button and closes on Escape.
- **`BookingCalendar` `minDate`:** already defaults to today on the live path, so there is no code change. The item is closed with this ruling.
- **`home-listings` category state:** it stays `string`. `CategoryStrip` is shared with the experience and service categories, so narrowing it needs a generic strip, which isn't worth the churn.
- **`/book` Edit links:** they carry `checkIn`, `checkOut`, `adults` and `children`. These are the keys `/book` already uses; the spec said `guests`.

## Review Focus

1. **The reservation bar covering content on small phones.** The footer and the page's last controls must stay reachable. Task 4 adds `pb-24` and a test.
2. **Invalid or past dates in the `/rooms/[id]` query.** The card must start empty, not show a negative or zero-night price. Task 4 tests `parseReservationQuery`.
3. **Guest counts in the query above `maxGuests`.** They fall back to 1 adult. Task 4 tests this.
4. **Hydration.** No mobile or desktop branch may depend on `window` during render. The components render both trees, and CSS picks one. Tasks 2–4 never read `matchMedia` in render.
5. **Focus after a dialog closes by navigation.** The opener may be gone, so focus is restored only when `opener.isConnected`. Task 3 tests this.

---

### Task 1: Breakpoints, width tokens, grids and gutters

**Files:**
- Modify:
  - `app/globals.css`
  - `components/features/property-grid.tsx`, `experience-grid.tsx`, `service-grid.tsx`, `skeletons/card-grid-skeleton.tsx`, `city-link-grid.tsx`, `search/search-results-list.tsx`, `skeletons/detail-skeleton.tsx`
  - `app/rooms/[id]/page.tsx`, `app/experiences/[id]/page.tsx`, `app/services/[id]/page.tsx`, `app/book/[listingId]/page.tsx` (grid and sticky classes only)
  - `components/design-system/top-nav.tsx`, `components/design-system/footer.tsx`, `components/features/search-bar/sticky-home-search.tsx` (gutters)
  - Page `<main>` wrappers: `app/page.tsx`, `app/experiences/page.tsx`, `app/services/page.tsx`, `app/wishlists/page.tsx`, `app/wishlists/[id]/page.tsx` → `max-w-listing`; `app/host/page.tsx`, `app/host/listings/page.tsx`, `app/host/reservations/page.tsx`, `app/trips/page.tsx` → `max-w-editorial`. All get gutters. Include the matching `loading.tsx` files.
- Test: `app/theme.test.ts` (new), `components/features/property-grid.test.tsx`, `components/features/city-link-grid.test.tsx` (append)

**Interfaces:**
- Produces: the `md` (744), `lg` (1128) and `xl` (1440) breakpoints and the `max-w-listing` / `max-w-editorial` classes, used by every later task.

- [ ] **Step 1: Write the failing tests**

`app/theme.test.ts`:

```ts
// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

test.each([
  ["--breakpoint-md", "744px"],
  ["--breakpoint-lg", "1128px"],
  ["--breakpoint-xl", "1440px"],
  ["--container-listing", "1440px"],
  ["--container-editorial", "1280px"],
])("the theme defines %s as %s (DESIGN.md Responsive Behavior)", (token, value) => {
  expect(css).toContain(`${token}: ${value};`);
});
```

Append to `components/features/property-grid.test.tsx`. Reuse the file's existing render setup and fixture: render the grid with its listings, then take the grid element as `firstGridElement`, the element whose class list contains `grid`.

```tsx
test("cards go 1-up on mobile, 2-up on tablet and 4-up on desktop", () => {
  // Arrange + Act: render as the other tests in this file do.
  // Assert:
  expect(firstGridElement.className).toContain("grid-cols-1");
  expect(firstGridElement.className).toContain("md:grid-cols-2");
  expect(firstGridElement.className).toContain("lg:grid-cols-4");
  expect(firstGridElement.className).not.toContain("sm:grid-cols-2");
});
```

Append to `components/features/city-link-grid.test.tsx`, in the same way:

```tsx
test("city links go 1 / 3 / 6 columns", () => {
  expect(firstGridElement.className).toContain("grid-cols-1");
  expect(firstGridElement.className).toContain("md:grid-cols-3");
  expect(firstGridElement.className).toContain("lg:grid-cols-6");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/theme.test.ts components/features/property-grid.test.tsx components/features/city-link-grid.test.tsx`
Expected: FAIL (missing tokens; old `sm:` classes).

- [ ] **Step 3: Implement**

In `app/globals.css`, inside `@theme`, after the shadow token:

```css
  /* Breakpoints (DESIGN.md Responsive Behavior) */
  --breakpoint-md: 744px;
  --breakpoint-lg: 1128px;
  --breakpoint-xl: 1440px;

  /* Content width caps: listing/search pages and editorial pages */
  --container-listing: 1440px;
  --container-editorial: 1280px;
```

Change the class strings as follows:

| File | From | To |
|---|---|---|
| `property-grid.tsx`, `experience-grid.tsx`, `service-grid.tsx`, `skeletons/card-grid-skeleton.tsx` | `grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4` | `grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4` |
| `city-link-grid.tsx` | `grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6` | `grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-6` |
| `search/search-results-list.tsx` | `grid grid-cols-1 gap-6 sm:grid-cols-2` | `grid grid-cols-1 gap-6 md:grid-cols-2` |
| rooms, experiences, services detail pages and `skeletons/detail-skeleton.tsx` | `lg:grid-cols-[1.7fr_1fr]` | `md:grid-cols-[1fr_320px] lg:grid-cols-[1.7fr_1fr]` |
| same files | `lg:sticky lg:top-24 lg:self-start` | `md:sticky md:top-24 md:self-start` |
| `app/book/[listingId]/page.tsx` | `lg:grid-cols-[1.4fr_1fr]` | `md:grid-cols-[1fr_320px] lg:grid-cols-[1.4fr_1fr]` |
| `top-nav.tsx` header | `px-10` | `px-6 md:px-10 xl:px-20` |
| `footer.tsx` footer | `px-20` | `px-6 md:px-10 xl:px-20` |
| `sticky-home-search.tsx` sticky bar | `px-6` | `px-6 md:px-10 xl:px-20` |
| listing-page mains | `max-w-[1280px]` and `px-6` | `max-w-listing` and `px-6 md:px-10 xl:px-20` |
| editorial mains | `max-w-[1080px]` and `px-6` | `max-w-editorial` and `px-6 md:px-10 xl:px-20` |
| detail mains (rulings above) | width unchanged | `px-6 md:px-10` |

Existing tests that assert the old breakpoint class strings (`sm:grid-cols-2`, `lg:sticky`, `px-10`, `px-20`, `max-w-[1280px]`) may be updated to the new strings. That is the only change allowed to existing tests in this task.

- [ ] **Step 4: Run the tests**

Run: `npm test`, `npx tsc --noEmit`, `npm run lint`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: retune breakpoints to DESIGN.md and add width tokens and responsive grids"
```

---

### Task 2: Shared search form and the mobile search overlay

**Files:**
- Create: `lib/search/use-search-form.ts`, `components/features/search-bar/mobile-search.tsx`
- Modify: `components/features/search-bar/home-search-bar.tsx`, `components/features/search-bar/sticky-home-search.tsx`
- Test: `lib/search/use-search-form.test.ts`, `components/features/search-bar/mobile-search.test.tsx`, `components/features/search-bar/sticky-home-search.test.tsx` (append)

**Interfaces:**
- Consumes: `DestinationPanel`, `DatePanel`, `GuestPanel` (existing props), `cities` from `@/lib/data/cities`, `GuestCounts`.
- Produces:
  - `buildSearchUrl(destination: string, guests: GuestCounts, checkIn: Date | null, checkOut: Date | null): string`
  - `useSearchForm(): SearchForm`, where `SearchForm = { destination; setDestination; checkIn; checkOut; guests; setGuests; selectDate(date: Date): void; clear(): void; url: string; whenLabel: string; whoLabel: string }`
  - `MobileSearch()`

- [ ] **Step 1: Write the failing tests**

`lib/search/use-search-form.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { act, renderHook } from "@/lib/test-utils";
import { buildSearchUrl, useSearchForm } from "./use-search-form";

describe("buildSearchUrl", () => {
  test("uses 'anywhere' without a destination and omits empty params", () => {
    expect(buildSearchUrl("  ", { adults: 0, children: 0 }, null, null)).toBe("/s/anywhere");
  });

  test("encodes the destination and adds guests and dates", () => {
    const url = buildSearchUrl("New York", { adults: 2, children: 1 }, new Date(2031, 2, 5), new Date(2031, 2, 8));
    expect(url).toBe("/s/New%20York?guests=3&checkIn=2031-03-05&checkOut=2031-03-08");
  });
});

describe("useSearchForm", () => {
  test("selects a check-in, then a later check-out, and restarts on an earlier day", () => {
    const { result } = renderHook(() => useSearchForm());
    act(() => result.current.selectDate(new Date(2031, 2, 5)));
    act(() => result.current.selectDate(new Date(2031, 2, 8)));
    expect(result.current.whenLabel).toBe("Mar 5 – Mar 8");
    act(() => result.current.selectDate(new Date(2031, 2, 1)));
    expect(result.current.checkIn).toEqual(new Date(2031, 2, 1));
    expect(result.current.checkOut).toBeNull();
  });

  test("builds the url from its state and clear() resets everything", () => {
    const { result } = renderHook(() => useSearchForm());
    act(() => {
      result.current.setDestination("Aspen");
      result.current.setGuests({ adults: 2, children: 0 });
    });
    expect(result.current.url).toBe("/s/Aspen?guests=2");
    expect(result.current.whoLabel).toBe("2 guests");
    act(() => result.current.clear());
    expect(result.current.url).toBe("/s/anywhere");
    expect(result.current.whoLabel).toBe("Add guests");
  });
});
```

`components/features/search-bar/mobile-search.test.tsx`:

```tsx
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, userEvent, within } from "@/lib/test-utils";
import { MobileSearch } from "./mobile-search";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

describe("MobileSearch", () => {
  beforeEach(() => push.mockReset());

  test("the pill opens a search dialog focused on the destination field", async () => {
    render(<MobileSearch />);
    await userEvent.click(screen.getByRole("button", { name: /start your search/i }));
    const dialog = screen.getByRole("dialog", { name: "Search" });
    expect(within(dialog).getByRole("textbox", { name: "Where to?" })).toHaveFocus();
  });

  test("choosing a city moves on to When, and Search pushes the same url as desktop", async () => {
    render(<MobileSearch />);
    await userEvent.click(screen.getByRole("button", { name: /start your search/i }));
    const dialog = screen.getByRole("dialog", { name: "Search" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Aspen" }));
    expect(within(dialog).getByRole("button", { name: /^when/i })).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(within(dialog).getByRole("button", { name: /^who/i }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Increase adults" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Search" }));
    expect(push).toHaveBeenCalledWith("/s/Aspen?guests=1");
  });

  test("Clear all resets the choices and closing returns focus to the pill", async () => {
    render(<MobileSearch />);
    const pill = screen.getByRole("button", { name: /start your search/i });
    await userEvent.click(pill);
    const dialog = screen.getByRole("dialog", { name: "Search" });
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Where to?" }), "Kyo");
    await userEvent.click(within(dialog).getByRole("button", { name: "Clear all" }));
    expect(within(dialog).getByRole("textbox", { name: "Where to?" })).toHaveValue("");
    await userEvent.click(within(dialog).getByRole("button", { name: "Close search" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(pill).toHaveFocus();
  });
});
```

Append to `sticky-home-search.test.tsx`. Mock `next/navigation` if the file doesn't already.

```tsx
test("renders the mobile pill below md and the three-segment bar from md", () => {
  render(<StickyHomeSearch />);
  const pill = screen.getByRole("button", { name: /start your search/i });
  expect(pill.parentElement?.className).toContain("md:hidden");
  const where = screen.getByRole("button", { name: "Where" });
  expect(where.closest(".hidden.md\\:block")).not.toBeNull();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/search/use-search-form.test.ts components/features/search-bar`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement**

`lib/search/use-search-form.ts`:

```ts
"use client";

import { useState } from "react";
import type { GuestCounts } from "@/components/features/guest-stepper";
import { toIsoDate } from "@/lib/reservation/dates";

const NO_GUESTS: GuestCounts = { adults: 0, children: 0 };

function formatShort(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** The /s/... results URL for a search. Desktop and mobile search both build it here. */
export function buildSearchUrl(destination: string, guests: GuestCounts, checkIn: Date | null, checkOut: Date | null): string {
  const trimmed = destination.trim();
  const dest = trimmed ? encodeURIComponent(trimmed) : "anywhere";
  const params = new URLSearchParams();
  const total = guests.adults + guests.children;
  if (total > 0) params.set("guests", String(total));
  if (checkIn) params.set("checkIn", toIsoDate(checkIn));
  if (checkOut) params.set("checkOut", toIsoDate(checkOut));
  const qs = params.toString();
  return qs ? `/s/${dest}?${qs}` : `/s/${dest}`;
}

export interface SearchForm {
  destination: string;
  setDestination: (value: string) => void;
  checkIn: Date | null;
  checkOut: Date | null;
  guests: GuestCounts;
  setGuests: (value: GuestCounts) => void;
  selectDate: (date: Date) => void;
  clear: () => void;
  url: string;
  whenLabel: string;
  whoLabel: string;
}

export function useSearchForm(): SearchForm {
  const [destination, setDestination] = useState("");
  const [checkIn, setCheckIn] = useState<Date | null>(null);
  const [checkOut, setCheckOut] = useState<Date | null>(null);
  const [guests, setGuests] = useState<GuestCounts>(NO_GUESTS);

  function selectDate(date: Date) {
    if (!checkIn || checkOut) {
      setCheckIn(date);
      setCheckOut(null);
    } else if (date > checkIn) {
      setCheckOut(date);
    } else {
      setCheckIn(date);
    }
  }

  function clear() {
    setDestination("");
    setCheckIn(null);
    setCheckOut(null);
    setGuests(NO_GUESTS);
  }

  const total = guests.adults + guests.children;
  const whenLabel =
    checkIn && checkOut ? `${formatShort(checkIn)} – ${formatShort(checkOut)}` : checkIn ? formatShort(checkIn) : "Add dates";
  const whoLabel = total > 0 ? `${total} ${total === 1 ? "guest" : "guests"}` : "Add guests";

  return {
    destination, setDestination, checkIn, checkOut, guests, setGuests, selectDate, clear,
    url: buildSearchUrl(destination, guests, checkIn, checkOut), whenLabel, whoLabel,
  };
}
```

`HomeSearchBar`:
- Delete `toISO`, `formatShort`, `buildSearchUrl` and the four state hooks.
- Add `const form = useSearchForm();`.
- Use `form.destination`, `form.setDestination`, `form.checkIn`, `form.checkOut`, `form.guests`, `form.setGuests`, `form.selectDate` in place of `handleSelectDate`, `form.whenLabel` and `form.whoLabel`.
- `handleSearch` becomes `router.push(form.url)`.

Its existing tests must pass unchanged.

`components/features/search-bar/mobile-search.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/design-system";
import { cities } from "@/lib/data/cities";
import { useSearchForm } from "@/lib/search/use-search-form";
import { DestinationPanel } from "./destination-panel";
import { DatePanel } from "./date-panel";
import { GuestPanel } from "./guest-panel";

type Section = "where" | "when" | "who";
const SECTIONS: { key: Section; label: string }[] = [
  { key: "where", label: "Where" },
  { key: "when", label: "When" },
  { key: "who", label: "Who" },
];

export function MobileSearch() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-14 w-full items-center gap-3 rounded-full border border-hairline bg-canvas px-5 text-left shadow-airbnb"
      >
        <Search aria-hidden className="size-5 text-ink" />
        <span className="flex flex-col">
          <span className="text-title-sm text-ink">Start your search</span>
          <span className="text-caption text-muted">Anywhere · Any week · Add guests</span>
        </span>
      </button>
      {open && <MobileSearchDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function MobileSearchDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const form = useSearchForm();
  const [section, setSection] = useState<Section>("where");
  const dialogRef = useRef<HTMLDialogElement>(null);

  // A native modal; it unmounts on close, so focus goes back by hand to the pill.
  useEffect(() => {
    const opener = document.activeElement;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    dialog?.querySelector<HTMLInputElement>("input")?.focus();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  const summaries: Record<Section, string> = {
    where: form.destination || "Anywhere",
    when: form.whenLabel,
    who: form.whoLabel,
  };

  function search() {
    router.push(form.url);
    onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="mobile-search-title"
      onClose={onClose}
      className="m-0 h-full max-h-none w-full max-w-none bg-surface-soft p-0 backdrop:bg-scrim/50"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between px-6 py-4">
          <h2 id="mobile-search-title" className="text-title-md text-ink">Search</h2>
          <button type="button" aria-label="Close search" onClick={onClose} className="flex size-11 items-center justify-center rounded-full border border-hairline bg-canvas">
            <X aria-hidden className="size-4 text-ink" />
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-6">
          {SECTIONS.map(({ key, label }) => (
            <section key={key} className="rounded-md bg-canvas p-4 shadow-airbnb">
              <h3>
                <button
                  type="button"
                  aria-expanded={section === key}
                  aria-controls={`mobile-search-${key}`}
                  onClick={() => setSection(key)}
                  className="flex w-full items-center justify-between text-left"
                >
                  <span className="text-title-sm text-ink">{label}</span>
                  <span className="text-body-sm text-muted">{summaries[key]}</span>
                </button>
              </h3>
              {section === key && (
                <div id={`mobile-search-${key}`} className="mt-4">
                  {key === "where" && (
                    <DestinationPanel
                      value={form.destination}
                      suggestions={cities}
                      onChange={form.setDestination}
                      onSelect={(name) => {
                        form.setDestination(name);
                        setSection("when");
                      }}
                    />
                  )}
                  {key === "when" && <DatePanel checkIn={form.checkIn} checkOut={form.checkOut} onSelect={form.selectDate} />}
                  {key === "who" && <GuestPanel value={form.guests} onChange={form.setGuests} />}
                </div>
              )}
            </section>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-hairline bg-canvas px-6 py-4">
          <button type="button" onClick={form.clear} className="text-title-sm text-ink underline">Clear all</button>
          <Button type="button" onClick={search}>Search</Button>
        </div>
      </div>
    </dialog>
  );
}
```

In `StickyHomeSearch`, wrap the sticky bar's current content and add the mobile pill:

```tsx
<div className="sticky top-0 z-40 flex justify-center border-b border-hairline bg-canvas px-6 py-4 md:px-10 xl:px-20">
  <div className="w-full md:hidden">
    <MobileSearch />
  </div>
  <div className="hidden md:block">
    {/* the existing showPill ? <button …/> : <div className="search-morph-in"><HomeSearchBar …/></div> */}
  </div>
</div>
```

`DatePanel`'s wrapper changes `w-[320px]` to `w-full max-w-[320px]`, so it fits a 375px screen inside the overlay's padding.

- [ ] **Step 4: Run the tests**

Run: `npm test`, `npx tsc --noEmit`, `npm run lint`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add the mobile search overlay on a shared search form hook"
```

---

### Task 3: Mobile nav sheet, shared account links and logout errors

**Files:**
- Create: `lib/nav.ts`, `components/features/auth/account-links.tsx`, `components/features/nav/mobile-nav.tsx`
- Modify: `components/design-system/top-nav.tsx`, `components/features/auth/account-menu.tsx`, `app/globals.css` (sheet animation)
- Test: `components/features/nav/mobile-nav.test.tsx`, `components/features/auth/account-menu.test.tsx` (append), `components/design-system/top-nav.test.tsx` (append)

**Interfaces:**
- Consumes: `useSessionState()` (`{ user: User | null; logout(): Promise<void> } | null`), `NewBadge`.
- Produces:
  - `Product`, `NAV_TABS` (`lib/nav.ts`)
  - `AccountLinks({ itemClass })`
  - `useLogout(): { logout(): Promise<void>; error: string | null }`
  - `MobileNav({ active: Product })`

- [ ] **Step 1: Write the failing tests**

Look at how `account-menu.test.tsx` provides the session (a `SessionContext.Provider` value, or a mock of `./session-provider`) and use the same approach in `mobile-nav.test.tsx`. The tests below assume a helper `renderWithSession(ui, session)` defined at the top of the file in that way. `session` is `{ user, logout }` or `null`.

`components/features/nav/mobile-nav.test.tsx`:

```tsx
import { describe, expect, test, vi } from "vitest";
import { screen, userEvent, within } from "@/lib/test-utils";
import { MobileNav } from "./mobile-nav";

const user = { id: "u-ana@example.com", email: "ana@example.com", name: "Ana" };

describe("MobileNav", () => {
  test("the hamburger is hidden from md up and opens a Menu sheet", async () => {
    renderWithSession(<MobileNav active="experiences" />, null);
    const trigger = screen.getByRole("button", { name: "Open menu" });
    expect(trigger.className).toContain("md:hidden");
    expect(trigger.className).toContain("size-11");
    await userEvent.click(trigger);
    const sheet = screen.getByRole("dialog", { name: "Menu" });
    expect(within(sheet).getByRole("link", { name: /experiences/i })).toHaveAttribute("aria-current", "page");
    expect(within(sheet).getByRole("link", { name: "Become a host" })).toHaveAttribute("href", "/host");
    expect(within(sheet).getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
  });

  test("shows the account links for a logged-in user", async () => {
    renderWithSession(<MobileNav active="homes" />, { user, logout: vi.fn() });
    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const sheet = screen.getByRole("dialog", { name: "Menu" });
    for (const name of ["Wishlists", "Trips", "Host dashboard"]) {
      expect(within(sheet).getByRole("link", { name })).toBeInTheDocument();
    }
    expect(within(sheet).getByRole("button", { name: "Log out" })).toBeInTheDocument();
  });

  test("Close menu closes the sheet and returns focus to the hamburger", async () => {
    renderWithSession(<MobileNav active="homes" />, null);
    const trigger = screen.getByRole("button", { name: "Open menu" });
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("button", { name: "Close menu" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  test("choosing a link closes the sheet", async () => {
    renderWithSession(<MobileNav active="homes" />, null);
    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Menu" })).getByRole("link", { name: "Become a host" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("a failed logout shows an inline error", async () => {
    const logout = vi.fn().mockRejectedValueOnce(new Error("offline"));
    renderWithSession(<MobileNav active="homes" />, { user, logout });
    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't log you out. Try again.");
  });
});
```

Append to `account-menu.test.tsx`, using its existing session setup:

```tsx
test("a failed logout shows an inline error instead of failing silently", async () => {
  // Arrange: a logged-in session whose logout rejects once (mockRejectedValueOnce).
  // Act: open the menu, click "Log out".
  // Assert:
  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't log you out. Try again.");
});

test("the menu trigger is at least 44px tall", () => {
  // render as the file's other tests do
  expect(screen.getByRole("button", { name: "Account menu" }).className).toContain("h-11");
});
```

Append to `top-nav.test.tsx`:

```tsx
test("the product tabs and account area are hidden below md, and the nav is labelled", () => {
  render(<TopNav active="homes" />);
  const nav = screen.getByRole("navigation", { name: "Main" });
  expect(nav.className).toContain("hidden");
  expect(nav.className).toContain("md:flex");
  expect(screen.getByRole("link", { name: "Become a host" }).parentElement?.className).toContain("md:flex");
  expect(screen.getByRole("button", { name: "Open menu" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run components/features/nav components/features/auth/account-menu.test.tsx components/design-system/top-nav.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`lib/nav.ts`:

```ts
export type Product = "homes" | "experiences" | "services";

export const NAV_TABS: { id: Product; label: string; href: string; isNew?: boolean }[] = [
  { id: "homes", label: "Homes", href: "/" },
  { id: "experiences", label: "Experiences", href: "/experiences", isNew: true },
  { id: "services", label: "Services", href: "/services", isNew: true },
];
```

`components/features/auth/account-links.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useSessionState } from "./session-provider";

export const LOGOUT_ERROR = "Couldn't log you out. Try again.";

export function useLogout() {
  const session = useSessionState();
  const [error, setError] = useState<string | null>(null);
  async function logout() {
    setError(null);
    try {
      await session?.logout();
    } catch {
      setError(LOGOUT_ERROR);
    }
  }
  return { logout, error };
}

/** The session's account links, shared by the desktop AccountMenu and the mobile nav sheet. */
export function AccountLinks({ itemClass }: { itemClass: string }) {
  const user = useSessionState()?.user ?? null;
  const { logout, error } = useLogout();
  if (!user) {
    return (
      <>
        <Link href="/login" className={itemClass}>Log in</Link>
        <Link href="/register" className={itemClass}>Sign up</Link>
      </>
    );
  }
  return (
    <>
      <p className="px-4 py-2 text-body-sm text-muted">{user.email}</p>
      <Link href="/wishlists" className={itemClass}>Wishlists</Link>
      <Link href="/trips" className={itemClass}>Trips</Link>
      <Link href="/host/listings" className={itemClass}>Host dashboard</Link>
      <button type="button" onClick={() => void logout()} className={itemClass}>Log out</button>
      {error && <p role="alert" className="px-4 py-2 text-body-sm text-error">{error}</p>}
    </>
  );
}
```

`AccountMenu`:
- Replace the `{user ? (...) : (...)}` block inside the open panel with `<AccountLinks itemClass={itemClass} />`.
- Change the trigger's `h-10` to `h-11`.
- Keep `user` for the avatar initial.

`components/features/nav/mobile-nav.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { NewBadge } from "@/components/design-system/badges";
import { AccountLinks } from "@/components/features/auth/account-links";
import { NAV_TABS, type Product } from "@/lib/nav";
import { cn } from "@/lib/utils";

const itemClass = "block px-4 py-3 text-left text-body-md text-ink hover:bg-surface-soft";

export function MobileNav({ active }: { active: Product }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex size-11 items-center justify-center rounded-full border border-hairline md:hidden"
      >
        <Menu aria-hidden className="size-5 text-ink" />
      </button>
      {open && <MobileNavSheet active={active} onClose={() => setOpen(false)} />}
    </>
  );
}

function MobileNavSheet({ active, onClose }: { active: Product; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const opener = document.activeElement;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  // Any link choice closes the sheet; the route change happens underneath.
  function closeOnLink(event: React.MouseEvent) {
    if ((event.target as Element).closest("a")) onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-label="Menu"
      onClose={onClose}
      onClick={closeOnLink}
      className="sheet-slide-up fixed inset-x-0 bottom-0 top-auto m-0 w-full max-w-none rounded-t-lg bg-canvas p-0 pb-4 backdrop:bg-scrim/50"
    >
      <div className="flex justify-end px-4 pt-4">
        <button type="button" aria-label="Close menu" onClick={onClose} className="flex size-11 items-center justify-center rounded-full hover:bg-surface-soft">
          <X aria-hidden className="size-5 text-ink" />
        </button>
      </div>
      <nav aria-label="Products" className="flex flex-col border-b border-hairline pb-2">
        {NAV_TABS.map((tab) => (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={tab.id === active ? "page" : undefined}
            className={cn(itemClass, "flex items-center gap-2", tab.id === active && "font-semibold")}
          >
            {tab.label}
            {tab.isNew && <NewBadge />}
          </Link>
        ))}
        <Link href="/host" className={itemClass}>Become a host</Link>
      </nav>
      <div className="flex flex-col pt-2">
        <AccountLinks itemClass={itemClass} />
      </div>
    </dialog>
  );
}
```

`TopNav`:
- Import `NAV_TABS` and `Product` from `@/lib/nav`, and delete the local `tabs` and `Product`. Re-export the `Product` type if other files import it from `top-nav`: `export type { Product } from "@/lib/nav";`.
- `<nav>` becomes `<nav aria-label="Main" className="hidden items-center gap-8 md:flex">`, and each tab link gets `aria-current={tab.id === active ? "page" : undefined}`.
- The right-hand wrapper becomes `<div className="hidden items-center gap-2 md:flex">`.
- Add `<MobileNav active={active} />` after it.

`app/globals.css`, after the existing search keyframes:

```css
@keyframes sheetSlideUp {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

.sheet-slide-up {
  animation: sheetSlideUp 250ms ease-out;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`, `npx tsc --noEmit`, `npm run lint`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add the mobile nav sheet with shared account links and logout errors"
```

---

### Task 4: Sticky mobile reservation bar, dates in the URL, listing page fixes

**Files:**
- Create: `lib/reservation/query.ts`, `lib/hooks/use-reservation-state.ts`, `components/features/reservation-bar.tsx`, `components/features/reservation-panel.tsx`
- Modify:
  - `components/features/reservation-card.tsx`
  - `components/design-system/date-picker-day.tsx` (`data-calendar-day`)
  - `app/rooms/[id]/page.tsx`
  - `app/book/[listingId]/page.tsx` (Edit links)
  - `app/rooms/[id]/not-found.tsx`
- Test: `lib/reservation/query.test.ts`, `components/features/reservation-panel.test.tsx`, `app/rooms/[id]/page.test.tsx` (append), `app/book/[listingId]/page.test.tsx` (append), `components/features/reservation-card.test.tsx` (clock freeze)

**Interfaces:**
- Consumes: `toIsoDate`, `nightsBetween`, `calculatePriceBreakdown`, `GuestCounts`, `Button`, `buttonClassName`.
- Produces:
  - `parseReservationQuery(query: Partial<Record<"checkIn" | "checkOut" | "adults" | "children", string>>, today?: Date): ReservationInit`, where `ReservationInit = { checkIn: Date | null; checkOut: Date | null; adults: number; children: number }`
  - `useReservationState(listingId, pricePerNight, maxGuests, init?: ReservationInit): ReservationState`
  - `ReservationCard` gains an optional `state?: ReservationState` prop.
  - `ReservationPanel({ listingId, pricePerNight, maxGuests, query })`

- [ ] **Step 1: Write the failing tests**

`lib/reservation/query.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { parseReservationQuery } from "./query";

const today = new Date(2031, 0, 15);

describe("parseReservationQuery", () => {
  test("reads valid future dates and guest counts", () => {
    expect(parseReservationQuery({ checkIn: "2031-02-01", checkOut: "2031-02-04", adults: "2", children: "1" }, today)).toEqual({
      checkIn: new Date(2031, 1, 1),
      checkOut: new Date(2031, 1, 4),
      adults: 2,
      children: 1,
    });
  });

  test.each([
    [{ checkIn: "2031-01-10", checkOut: "2031-01-20" }, "a past check-in"],
    [{ checkIn: "2031-02-04", checkOut: "2031-02-01" }, "check-out before check-in"],
    [{ checkIn: "2031-02-04", checkOut: "2031-02-04" }, "zero nights"],
    [{ checkIn: "2031-02-30", checkOut: "2031-03-02" }, "an impossible day"],
    [{ checkIn: "tomorrow", checkOut: "2031-03-02" }, "not an ISO date"],
    [{ checkIn: "2031-02-01" }, "a missing check-out"],
  ])("drops the dates for %o (%s)", (query) => {
    const parsed = parseReservationQuery(query, today);
    expect(parsed.checkIn).toBeNull();
    expect(parsed.checkOut).toBeNull();
  });

  test("falls back to 1 adult and 0 children for bad counts", () => {
    expect(parseReservationQuery({ adults: "0", children: "-1" }, today)).toMatchObject({ adults: 1, children: 0 });
    expect(parseReservationQuery({ adults: "1.5", children: "abc" }, today)).toMatchObject({ adults: 1, children: 0 });
  });
});
```

`components/features/reservation-panel.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, userEvent, within } from "@/lib/test-utils";
import { ReservationPanel } from "./reservation-panel";

describe("ReservationPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2031, 0, 15));
  });
  afterEach(() => vi.useRealTimers());

  const bar = () => screen.getByRole("region", { name: "Reservation summary" });

  test("the bar is mobile-only and asks for dates first", () => {
    render(<ReservationPanel listingId="l1" pricePerNight={200} maxGuests={4} query={{}} />);
    expect(bar().className).toContain("md:hidden");
    expect(within(bar()).getByText("Add dates for prices")).toBeInTheDocument();
    expect(within(bar()).getByRole("button", { name: "Check availability" })).toBeInTheDocument();
  });

  test("Check availability focuses the first open day in the card", async () => {
    render(<ReservationPanel listingId="l1" pricePerNight={200} maxGuests={4} query={{}} />);
    await userEvent.click(within(bar()).getByRole("button", { name: "Check availability" }));
    const firstOpenDay = document.querySelector<HTMLButtonElement>("#reserve [data-calendar-day]:not(:disabled)");
    expect(firstOpenDay).toHaveFocus();
  });

  test("picking dates in the card turns the bar into a Reserve link with the same href", async () => {
    render(<ReservationPanel listingId="l1" pricePerNight={200} maxGuests={4} query={{}} />);
    await userEvent.click(screen.getByRole("button", { name: "Next month" }));
    const days = screen.getAllByRole("button").filter((b) => b.hasAttribute("data-calendar-day"));
    await userEvent.click(days[0]);
    await userEvent.click(days[2]);
    const links = screen.getAllByRole("link", { name: "Reserve" });
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute("href")).toBe(links[1].getAttribute("href"));
    expect(within(bar()).getByText("Feb 1 – Feb 3")).toBeInTheDocument();
  });

  test("starts from valid query params", () => {
    render(
      <ReservationPanel listingId="l1" pricePerNight={200} maxGuests={4}
        query={{ checkIn: "2031-02-01", checkOut: "2031-02-04", adults: "2", children: "0" }} />,
    );
    expect(within(bar()).getByRole("link", { name: "Reserve" })).toHaveAttribute(
      "href", "/book/l1?checkIn=2031-02-01&checkOut=2031-02-04&adults=2&children=0",
    );
  });

  test("ignores query guests above the listing's maximum", () => {
    render(
      <ReservationPanel listingId="l1" pricePerNight={200} maxGuests={2}
        query={{ checkIn: "2031-02-01", checkOut: "2031-02-04", adults: "3", children: "1" }} />,
    );
    expect(within(bar()).getByRole("link", { name: "Reserve" }).getAttribute("href")).toContain("adults=1&children=0");
  });
});
```

Append to `app/rooms/[id]/page.test.tsx`. Follow the file's pattern for calling the page and rendering its result, and pass `searchParams: Promise.resolve({})` everywhere the page is called, since the page now takes it.

```tsx
test("the reviews band says Guest favorite only for guest favorites", async () => {
  // Render a seed listing with isGuestFavorite false and reviewCount > 0 (find one in lib/data/listings.ts).
  expect(screen.getByText(/^\d+ reviews$/)).toBeInTheDocument();
  expect(screen.queryByText(/Guest favorite ·/)).not.toBeInTheDocument();
});

test("guests get the mobile reservation bar and bottom padding for it", async () => {
  // Render a guest view (getSession → null) of l1.
  expect(screen.getByRole("region", { name: "Reservation summary" })).toBeInTheDocument();
  expect(container.firstElementChild?.className).toContain("pb-24");
});

test("the owner sees no reservation bar", async () => {
  // Render the existing owner scenario.
  expect(screen.queryByRole("region", { name: "Reservation summary" })).not.toBeInTheDocument();
});
```

Append to `app/book/[listingId]/page.test.tsx`, using the file's valid-render setup:

```tsx
test("the Edit links keep the dates and guests", async () => {
  const links = screen.getAllByRole("link", { name: "Edit" });
  for (const link of links) {
    expect(link.getAttribute("href")).toMatch(/^\/rooms\/l1\?checkIn=\d{4}-\d{2}-\d{2}&checkOut=\d{4}-\d{2}-\d{2}&adults=\d+&children=\d+$/);
  }
});
```

Add a test for the rooms not-found page (`app/rooms/[id]/not-found.test.tsx`):

```tsx
import { expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import ListingNotFound from "./not-found";

test("offers one link home, not a button nested in a link", () => {
  render(<ListingNotFound />);
  const link = screen.getByRole("link", { name: "Back to home" });
  expect(link).toHaveAttribute("href", "/");
  expect(link.querySelector("button")).toBeNull();
  expect(link.className).toContain("bg-rausch");
});
```

In `components/features/reservation-card.test.tsx`, freeze the clock around the date-selection tests with the same `beforeEach` / `afterEach` as `reservation-panel.test.tsx` above, pinned to 2031-01-15. Keep the assertions unchanged.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/reservation components/features/reservation-panel.test.tsx "app/rooms" "app/book"`
Expected: FAIL.

- [ ] **Step 3: Implement**

`lib/reservation/query.ts`:

```ts
export type ReservationQuery = Partial<Record<"checkIn" | "checkOut" | "adults" | "children", string>>;

export interface ReservationInit {
  checkIn: Date | null;
  checkOut: Date | null;
  adults: number;
  children: number;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_COUNT = 16;

function toLocalDate(value: string | undefined): Date | null {
  if (!value || !ISO_DATE.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

function toCount(value: string | undefined, min: number, fallback: number): number {
  const n = Number(value);
  return value !== undefined && Number.isInteger(n) && n >= min && n <= MAX_COUNT ? n : fallback;
}

/** Dates and guests from a /rooms/[id] query; anything invalid or in the past falls back to empty. */
export function parseReservationQuery(query: ReservationQuery, today: Date = new Date()): ReservationInit {
  const checkIn = toLocalDate(query.checkIn);
  const checkOut = toLocalDate(query.checkOut);
  const floor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const valid = checkIn !== null && checkOut !== null && checkIn >= floor && checkOut > checkIn;
  return {
    checkIn: valid ? checkIn : null,
    checkOut: valid ? checkOut : null,
    adults: toCount(query.adults, 1, 1),
    children: toCount(query.children, 0, 0),
  };
}
```

`lib/hooks/use-reservation-state.ts`:

```ts
"use client";

import { useState } from "react";
import type { GuestCounts } from "@/components/features/guest-stepper";
import { toIsoDate } from "@/lib/reservation/dates";
import { calculatePriceBreakdown, nightsBetween } from "@/lib/reservation/pricing";
import type { ReservationInit } from "@/lib/reservation/query";

export interface ReservationState {
  month: Date;
  setMonth: (month: Date) => void;
  checkIn: Date | null;
  checkOut: Date | null;
  guests: GuestCounts;
  setGuests: (guests: GuestCounts) => void;
  select: (date: Date) => void;
  breakdown: ReturnType<typeof calculatePriceBreakdown> | null;
  bookHref: string | null;
}

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

/** The dates and guests a reservation is being built from, shared by the card and the mobile bar. */
export function useReservationState(listingId: string, pricePerNight: number, maxGuests: number, init?: ReservationInit): ReservationState {
  const initialGuests =
    init && init.adults + init.children <= maxGuests ? { adults: init.adults, children: init.children } : { adults: 1, children: 0 };
  const [month, setMonth] = useState<Date>(() => startOfMonth(init?.checkIn ?? new Date()));
  const [checkIn, setCheckIn] = useState<Date | null>(init?.checkIn ?? null);
  const [checkOut, setCheckOut] = useState<Date | null>(init?.checkOut ?? null);
  const [guests, setGuests] = useState<GuestCounts>(initialGuests);

  function select(date: Date) {
    if (checkIn === null || checkOut !== null || date.getTime() <= checkIn.getTime()) {
      setCheckIn(date);
      setCheckOut(null);
      return;
    }
    setCheckOut(date);
  }

  const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;
  const breakdown = nights > 0 ? calculatePriceBreakdown(pricePerNight, nights) : null;
  const bookHref =
    breakdown && checkIn && checkOut
      ? `/book/${listingId}?${new URLSearchParams({
          checkIn: toIsoDate(checkIn),
          checkOut: toIsoDate(checkOut),
          adults: String(guests.adults),
          children: String(guests.children),
        })}`
      : null;

  return { month, setMonth, checkIn, checkOut, guests, setGuests, select, breakdown, bookHref };
}
```

`ReservationCard`:
- Add `state?: ReservationState` to its props.
- Replace its four `useState`s, `handleSelect`, `nights` and `breakdown` with:

  ```ts
  const own = useReservationState(listingId, pricePerNight, maxGuests);
  const s = state ?? own;
  ```

- Render from `s.month`, `s.setMonth`, `s.checkIn`, `s.checkOut`, `s.select`, `s.guests`, `s.setGuests` and `s.breakdown`.
- The Reserve link uses `href={s.bookHref}` when it's non-null; otherwise the disabled Button stays.

The card must look the same and its existing tests must pass. The hook is always called, so there's no conditional hook.

`DatePickerDay`: add `data-calendar-day=""` to its `<button>`.

`components/features/reservation-bar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { Button, buttonClassName } from "@/components/design-system";
import type { ReservationState } from "@/lib/hooks/use-reservation-state";

const short = (date: Date) => date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function ReservationBar({ pricePerNight, state }: { pricePerNight: number; state: ReservationState }) {
  function checkAvailability() {
    const card = document.getElementById("reserve");
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    card?.scrollIntoView?.({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    card?.querySelector<HTMLButtonElement>("[data-calendar-day]:not(:disabled)")?.focus();
  }

  const dates = state.checkIn && state.checkOut ? `${short(state.checkIn)} – ${short(state.checkOut)}` : "Add dates for prices";

  return (
    <section
      aria-label="Reservation summary"
      className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between border-t border-hairline bg-canvas px-6 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] md:hidden"
    >
      <div>
        <p className="text-title-sm text-ink">
          ${pricePerNight} <span className="text-body-sm text-muted">night</span>
        </p>
        <p className="text-body-sm text-muted">{dates}</p>
      </div>
      {state.bookHref ? (
        <Link href={state.bookHref} className={buttonClassName()}>Reserve</Link>
      ) : (
        <Button type="button" onClick={checkAvailability}>Check availability</Button>
      )}
    </section>
  );
}
```

`components/features/reservation-panel.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useReservationState } from "@/lib/hooks/use-reservation-state";
import { parseReservationQuery, type ReservationQuery } from "@/lib/reservation/query";
import { ReservationBar } from "./reservation-bar";
import { ReservationCard } from "./reservation-card";

export interface ReservationPanelProps {
  listingId: string;
  pricePerNight: number;
  maxGuests: number;
  query: ReservationQuery;
}

/** The reservation card (rail from md up, in flow on mobile) plus the mobile sticky bar, over one shared state. */
export function ReservationPanel({ listingId, pricePerNight, maxGuests, query }: ReservationPanelProps) {
  const [init] = useState(() => parseReservationQuery(query));
  const state = useReservationState(listingId, pricePerNight, maxGuests, init);
  return (
    <>
      <div id="reserve" className="scroll-mt-24">
        <ReservationCard listingId={listingId} pricePerNight={pricePerNight} maxGuests={maxGuests} state={state} />
      </div>
      <ReservationBar pricePerNight={pricePerNight} state={state} />
    </>
  );
}
```

`app/rooms/[id]/page.tsx`:
- The page signature gains `searchParams: Promise<Record<string, string | string[] | undefined>>`.
- Build `query: ReservationQuery` from `checkIn`, `checkOut`, `adults` and `children`, taking the first value of array params.
- Replace `<ReservationCard … />` with `<ReservationPanel listingId={listing.id} pricePerNight={listing.pricePerNight} maxGuests={listing.maxGuests} query={query} />`.
- The outer wrapper's class becomes `` `min-h-screen bg-canvas ${!isOwner && !isUnlisted ? "pb-24 md:pb-0" : ""}` ``.
- The reviews-band line becomes `{listing.isGuestFavorite ? "Guest favorite · " : ""}{listing.reviewCount} reviews`.

`app/book/[listingId]/page.tsx`: both Edit links become `href={`/rooms/${listingId}?${new URLSearchParams(query)}`}`. The `query` record is already built at the top of the page.

`app/rooms/[id]/not-found.tsx`:

```tsx
import Link from "next/link";
import { buttonClassName } from "@/components/design-system";

export default function ListingNotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-[60vh] max-w-[680px] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-display-lg text-ink">We can&apos;t find that place</h1>
      <p className="text-body-md text-muted">The listing you&apos;re looking for may have been removed.</p>
      <Link href="/" className={buttonClassName()}>Back to home</Link>
    </main>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`, `npx tsc --noEmit`, `npm run lint`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add the mobile reservation bar and keep dates in listing and booking links"
```

---

### Task 5: Deferred fixes (host listings, wishlists, cards)

**Files:**
- Modify:
  - `lib/types.ts` (`cityId?`), `lib/api-client/schemas.ts`
  - `lib/host/listing-input.ts`
  - `components/features/host/host-listing-form.tsx`
  - `components/features/wishlists/save-to-wishlist-dialog.tsx`, `components/features/wishlists/wishlist-hearts.tsx`
  - `components/design-system/property-card.tsx`
- Test: `lib/host/listing-input.test.ts` (create, or append if it exists), `components/features/host/host-listing-form.test.tsx`, `components/features/wishlists/save-to-wishlist-dialog.test.tsx`, `components/features/wishlists/wishlist-hearts.test.tsx`, `components/design-system/property-card.test.tsx` (append)

**Interfaces:**
- Consumes: `buildHostListing`, `toHostListingInput`, `HOST_CITIES`, `validInput`.
- Produces:
  - `Listing.cityId?: string`
  - `coordinateOffset(id: string, salt: string): number`, in [-0.02, 0.02]

- [ ] **Step 1: Write the failing tests**

`lib/host/listing-input.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { hostListingInputSchema } from "./schemas";
import { validInput } from "./test-fixtures";
import { HOST_CITIES } from "./options";
import { buildHostListing, coordinateOffset, toHostListingInput } from "./listing-input";

const input = hostListingInputSchema.parse(validInput);
const city = HOST_CITIES.find((c) => c.id === input.cityId)!;

describe("host listing coordinates", () => {
  test("offsets stay within 0.02 degrees and are stable per id", () => {
    for (const id of ["hl-a", "hl-b", "hl-c", "hl-0f3e"]) {
      const offset = coordinateOffset(id, "lat");
      expect(Math.abs(offset)).toBeLessThanOrEqual(0.02);
      expect(coordinateOffset(id, "lat")).toBe(offset);
    }
  });

  test("two listings in one city get different map positions near the city", () => {
    const a = buildHostListing("hl-a", "u-x", input, "listed");
    const b = buildHostListing("hl-b", "u-x", input, "listed");
    expect([a.location.lat, a.location.lng]).not.toEqual([b.location.lat, b.location.lng]);
    expect(Math.abs(a.location.lat - city.lat)).toBeLessThanOrEqual(0.02);
    expect(Math.abs(a.location.lng - city.lng)).toBeLessThanOrEqual(0.02);
  });
});

describe("toHostListingInput", () => {
  test("prefills the city from the stored cityId even if the city name changed", () => {
    const listing = { ...buildHostListing("hl-a", "u-x", input, "listed"), location: { ...buildHostListing("hl-a", "u-x", input, "listed").location, city: "Renamed" } };
    expect(toHostListingInput(listing).cityId).toBe(input.cityId);
  });

  test("falls back to the city name for listings without a cityId", () => {
    const { cityId: _drop, ...listing } = buildHostListing("hl-a", "u-x", input, "listed");
    expect(toHostListingInput(listing).cityId).toBe(input.cityId);
  });
});
```

Append to `host-listing-form.test.tsx`, using the file's edit-mode setup:

```tsx
test("Back is disabled while the listing is being saved", async () => {
  let resolveUpdate: (value: unknown) => void = () => {};
  api.updateHostListing.mockReturnValueOnce(new Promise((resolve) => { resolveUpdate = resolve; }));
  render(<HostListingForm mode="edit" listingId="hl-1" initial={hostListingInputSchema.parse(validInput)} />);
  await next(); await next(); await next();
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
  resolveUpdate({ id: "hl-1" });
});
```

Append to `save-to-wishlist-dialog.test.tsx`, following its existing setup with at least one wishlist:

```tsx
test("Cancel forgets the typed name, so reopening the form starts empty", async () => {
  // Arrange: render with one existing wishlist.
  await userEvent.click(screen.getByRole("button", { name: "Create new wishlist" }));
  await userEvent.type(screen.getByLabelText("Name"), "Beach");
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await userEvent.click(screen.getByRole("button", { name: "Create new wishlist" }));
  expect(screen.getByLabelText("Name")).toHaveValue("");
});
```

Append to `wishlist-hearts.test.tsx`, following its existing failed-unsave setup:

```tsx
test("the unsave error can be dismissed with its button or Escape", async () => {
  // Arrange: a failed unsave (mockRejectedValueOnce) so the alert shows.
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  // Trigger the failure again, then press Escape.
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
```

Append to `property-card.test.tsx`:

```tsx
test("renders a placeholder instead of crashing when a listing has no photos", () => {
  render(<PropertyCard listing={{ ...listing, photos: [] }} />);
  expect(screen.getByTestId("photo-placeholder").className).toContain("bg-surface-strong");
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});
```

Use the file's own listing fixture name if it isn't `listing`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/host components/features/host components/features/wishlists components/design-system/property-card.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

- `lib/types.ts`: add `cityId?: string;` to `Listing`, after `location`, with the comment `/** Host listings only: the HOST_CITIES id the host picked. */`.
- `lib/api-client/schemas.ts`: add `cityId: z.string().optional(),` to `listingSchema`.
- `lib/host/listing-input.ts`: add the function below, then set `location: { city: city.name, country: city.country, lat: city.lat + coordinateOffset(id, "lat"), lng: city.lng + coordinateOffset(id, "lng") }` and `cityId: city.id` in `buildHostListing`, and `cityId: listing.cityId ?? HOST_CITIES.find((c) => c.name === listing.location.city)?.id ?? ""` in `toHostListingInput`.

  ```ts
  const MAX_OFFSET_STEPS = 2000; // ±0.02° in 0.00001° steps

  /** A stable offset in [-0.02, 0.02]° from the listing id, so host listings in one city don't share a map pin. */
  export function coordinateOffset(id: string, salt: string): number {
    let hash = 0;
    for (const ch of salt + id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
    return ((Math.abs(hash) % (2 * MAX_OFFSET_STEPS + 1)) - MAX_OFFSET_STEPS) / 100000;
  }
  ```

  Existing tests that assert a host listing's exact `lat`/`lng` equal the city's, or that `toEqual` a whole built listing, may switch to `toBeCloseTo(…, 1)` or add `cityId`. That is the only change allowed to existing tests here.
- `host-listing-form.tsx`: the Back button's `disabled={step === 0}` becomes `disabled={step === 0 || submitting}`.
- `save-to-wishlist-dialog.tsx`: Cancel's `onClick` becomes `() => { setCreating(false); setName(""); setNameError(undefined); }`.
- `wishlist-hearts.tsx`:
  - Replace the error `<p role="alert">` with the markup below.
  - Import `X` from `lucide-react`.
  - Add an effect: while `error` is set, a `keydown` listener clears it on Escape, and is removed on cleanup.

  ```tsx
  <div role="alert" className="fixed bottom-24 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-sm bg-ink px-4 py-3 text-body-sm text-on-primary shadow-airbnb md:bottom-6">
    {error}
    <button type="button" aria-label="Dismiss" onClick={() => setError(null)} className="flex size-8 items-center justify-center rounded-full">
      <X aria-hidden className="size-4" />
    </button>
  </div>
  ```

  `bottom-24` keeps the toast above the mobile reservation bar.
- `property-card.tsx`: render the `<Image>` only when `listing.photos[0]` exists; otherwise render `<div data-testid="photo-placeholder" aria-hidden className="size-full bg-surface-strong" />`.

- [ ] **Step 4: Run the tests**

Run: `npm test`, `npx tsc --noEmit`, `npm run lint`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix: spread host map pins, key edit prefill by city id, and close deferred UI bugs"
```

---

### Task 6: Accessibility foundations and the axe gate

This task is partly discovery. The framework pieces below are exact. The fixes depend on what axe reports, so the implementer decides them, within the rules in Step 5.

**Files:**
- Create: `components/design-system/skip-link.tsx` (+ test), `e2e/helpers.ts`, `e2e/a11y.spec.ts`
- Modify:
  - `app/layout.tsx`, `app/globals.css`, `playwright.config.ts`, `package.json`
  - `components/design-system/index.ts` (export `SkipLink`)
  - `components/design-system/auth-card.tsx`
  - every page `<main>` (`id="main"`)
  - `app/page.tsx` (sr-only `h1`)
  - `app/s/[location]/page.tsx` (`<main>`)
  - whatever axe flags
- Test: `components/design-system/skip-link.test.tsx`, `components/design-system/auth-card.test.tsx` (append), `app/page.test.tsx` or the homepage test (append)

**Interfaces:**
- Consumes: the mobile components from Tasks 2–4 (for the open-state scans).
- Produces:
  - `e2e/helpers.ts`: `unique()`, `logIn(page, email, next)`, `isoDaysAhead(days)`, `expectNoHorizontalScroll(page)`, `tabTo(page, locator, maxPresses?)`
  - Playwright projects `desktop` and `mobile`.

- [ ] **Step 1: Write the failing unit tests**

`components/design-system/skip-link.test.tsx`:

```tsx
import { expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { SkipLink } from "./skip-link";

test("a visually hidden skip link targets #main and shows on focus", () => {
  render(<SkipLink />);
  const link = screen.getByRole("link", { name: "Skip to content" });
  expect(link).toHaveAttribute("href", "#main");
  expect(link.className).toContain("sr-only");
  expect(link.className).toContain("focus:not-sr-only");
});
```

Append to `auth-card.test.tsx`:

```tsx
test("auth pages have a main landmark with the skip-link target", () => {
  render(<AuthCard title="Welcome back">form</AuthCard>);
  expect(screen.getByRole("main")).toHaveAttribute("id", "main");
});
```

Append to the homepage page test (`app/page.test.tsx`; if none exists, create it and mock what `app/page.tsx` needs, as `app/rooms/[id]/page.test.tsx` does):

```tsx
test("the homepage has exactly one h1 and a #main landmark", async () => {
  // render the page as the file does
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  expect(screen.getByRole("main")).toHaveAttribute("id", "main");
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run components/design-system/skip-link.test.tsx components/design-system/auth-card.test.tsx app/page.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement the foundations**

`components/design-system/skip-link.tsx`:

```tsx
export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-sm focus:bg-canvas focus:px-4 focus:py-2 focus:text-title-sm focus:text-ink focus:shadow-airbnb"
    >
      Skip to content
    </a>
  );
}
```

Export it from `components/design-system/index.ts`.

- **`app/layout.tsx`:** render `<SkipLink />` as the first child of `<body>`, before `<Providers>`.
- **`<main>` elements:** every `<main` in `app/**` (pages, `loading.tsx`, `not-found.tsx`) gets `id="main"`. Find them with `grep -rn "<main" app --include=*.tsx`.
- **`AuthCard`:** its outer `<div>` becomes `<main id="main" …>`, keeping the classes.
- **`app/s/[location]/page.tsx`:** wrap the `<Suspense>` in `<main id="main" className="flex flex-1 flex-col">`.
- **`app/page.tsx`:** add `<h1 className="sr-only">Stays, experiences and services on Airbnb</h1>` as the first child of `<main>`.

In `app/globals.css`, add after `@theme`:

```css
@theme {
  --color-focus-ring: #222222;
}

:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .search-pop-in,
  .search-morph-in,
  .sheet-slide-up {
    animation: none;
  }
  html {
    scroll-behavior: auto;
  }
}
```

Put `--color-focus-ring` inside the existing `@theme` block, beside the other colors, rather than adding a second block.

Run: `npm install -D @axe-core/playwright`

`playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:3000" },
  projects: [
    { name: "desktop", testIgnore: /mobile\.spec\.ts/, use: { viewport: { width: 1280, height: 800 } } },
    { name: "mobile", testMatch: /(mobile|a11y)\.spec\.ts/, use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

`e2e/helpers.ts`:

```ts
import { expect, type Locator, type Page } from "@playwright/test";

export const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export async function logIn(page: Page, email: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(next, { timeout: 30000 });
}

/** A local YYYY-MM-DD `days` from today. */
export function isoDaysAhead(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Presses Tab until `target` has focus, so a test can drive the page by keyboard only. */
export async function tabTo(page: Page, target: Locator, maxPresses = 120) {
  for (let i = 0; i < maxPresses; i++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return;
  }
  throw new Error(`Tab never reached ${target}`);
}
```

`e2e/a11y.spec.ts`:

```ts
import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import { isoDaysAhead, logIn, unique } from "./helpers";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function expectNoSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).exclude(".maplibregl-map").analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

async function visit(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("main#main")).toBeVisible({ timeout: 30000 });
}

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1280) < 744;

for (const path of ["/", "/s/Aspen", "/rooms/l1", "/experiences", "/experiences/e1", "/services", "/services/s1", "/login", "/register", "/host"]) {
  test(`${path} has no serious accessibility violations`, async ({ page }) => {
    await visit(page, path);
    await expectNoSeriousViolations(page);
  });
}

test.describe("logged-in pages", () => {
  test.beforeEach(async ({ page }) => {
    await logIn(page, `a11y-${unique()}@example.com`, "/trips");
  });

  const book = `/book/l1?checkIn=${isoDaysAhead(40)}&checkOut=${isoDaysAhead(43)}&adults=1&children=0`;
  for (const path of ["/wishlists", "/trips", book, "/host/listings", "/host/listings/new", "/host/reservations"]) {
    test(`${path.split("?")[0]} has no serious accessibility violations`, async ({ page }) => {
      await visit(page, path);
      await expectNoSeriousViolations(page);
    });
  }

  test("the save-to-wishlist dialog has no serious accessibility violations", async ({ page }) => {
    await visit(page, "/");
    await page.getByRole("button", { name: "Save to wishlist" }).first().click();
    await expect(page.getByRole("dialog", { name: "Save to wishlist" })).toBeVisible();
    await expectNoSeriousViolations(page);
  });
});

test("the open account menu has no serious accessibility violations", async ({ page }) => {
  await visit(page, "/");
  test.skip(isMobile(page), "desktop-only control");
  await page.getByRole("button", { name: "Account menu" }).click();
  await expectNoSeriousViolations(page);
});

test("the mobile nav sheet has no serious accessibility violations", async ({ page }) => {
  await visit(page, "/");
  test.skip(!isMobile(page), "mobile-only control");
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("dialog", { name: "Menu" })).toBeVisible();
  await expectNoSeriousViolations(page);
});

test("the mobile search overlay has no serious accessibility violations", async ({ page }) => {
  await visit(page, "/");
  test.skip(!isMobile(page), "mobile-only control");
  await page.getByRole("button", { name: /start your search/i }).click();
  await expect(page.getByRole("dialog", { name: "Search" })).toBeVisible();
  await expectNoSeriousViolations(page);
});
```

- [ ] **Step 4: Run the unit tests, then the axe spec**

Run: `npm test`, `npx tsc --noEmit`, `npm run lint`. Expected: pass.

Run: `npx playwright test e2e/a11y.spec.ts`. Expected: the first run likely FAILS and lists violations.

- [ ] **Step 5: Fix every serious or critical violation**

Rules:
- **Fix the cause in product code.** Never mute a rule, filter a violation, or add `exclude` beyond `.maplibregl-map`.
- **Colour contrast:** fix it at the token level in `app/globals.css`, and update the matching hex in `frontend/DESIGN.md`. Known likely failures:
  - White text on `bg-rausch` (#ff385c, about 3.9:1) on primary buttons, the `NewBadge` and the avatar initial. Give text-bearing fills a darker token, for example `--color-rausch-text-bg: #e00b41` (about 4.9:1), used by `buttonClassName("primary")` and the badge. Keep `--color-rausch` for the logo, the heart and non-text accents.
  - `text-muted-soft` (#929292) used on non-disabled text. Disabled controls are exempt.
- **Missing names:** add visible labels or `aria-label`s that describe the action.
- **`heading-order`, `landmark-*` and `region` findings:** fix the markup (headings in order, content inside landmarks).
- **Pin each fix with a unit test** where a unit test can see it: for example, the button class using the new token, or a label's presence.
- **Rerun** `npx playwright test e2e/a11y.spec.ts` until both projects pass. Then run `npm test`, `npx tsc --noEmit` and `npm run lint` again.
- List every violation found and its fix in the task report.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add the skip link, landmarks, focus ring and an axe accessibility gate"
```

(Fixes may be split across several `fix:` commits.)

---

### Task 7: Mobile and keyboard e2e, month-end-safe specs, docs and verification

**Files:**
- Create: `e2e/mobile.spec.ts`, `e2e/keyboard.spec.ts`
- Modify:
  - `e2e/listing-detail.spec.ts` (pick dates next month)
  - *repo root* `CLAUDE.md`
  - *repo root* `docs/superpowers/specs/2026-06-21-airbnb-frontend-clone-design.md` (§10 phase 8 row)

**Interfaces:**
- Consumes: `e2e/helpers.ts` (Task 6); the copy and accessible names from Tasks 2–4.

- [ ] **Step 1: Write the e2e specs**

`e2e/mobile.spec.ts` runs in the `mobile` project only:

```ts
import { test, expect } from "@playwright/test";
import { expectNoHorizontalScroll, logIn, unique } from "./helpers";

test("the hamburger sheet closes on Escape and navigates", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const trigger = page.getByRole("button", { name: "Open menu" });
  await trigger.click();
  const sheet = page.getByRole("dialog", { name: "Menu" });
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await sheet.getByRole("link", { name: /experiences/i }).click();
  await expect(page).toHaveURL(/\/experiences$/, { timeout: 30000 });
});

test("mobile search lands on filtered results", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /start your search/i }).click();
  const dialog = page.getByRole("dialog", { name: "Search" });
  await dialog.getByRole("button", { name: "Aspen" }).click();
  await dialog.getByRole("button", { name: "Next month" }).click();
  const days = dialog.locator("[data-calendar-day]:not(:disabled)");
  await days.nth(3).click();
  await days.nth(5).click();
  await dialog.getByRole("button", { name: /^who/i }).click();
  await dialog.getByRole("button", { name: "Increase adults" }).click();
  await dialog.getByRole("button", { name: "Increase adults" }).click();
  await dialog.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/\/s\/Aspen\?guests=2&checkIn=\d{4}-\d{2}-\d{2}&checkOut=\d{4}-\d{2}-\d{2}/, { timeout: 30000 });
  await expect(page.locator('a[href^="/rooms/"]').first()).toBeVisible({ timeout: 30000 });
});

test("the sticky bar checks availability and reserves", async ({ page }) => {
  await logIn(page, `mobile-${unique()}@example.com`, "/rooms/l1");
  await page.waitForLoadState("networkidle");
  const bar = page.getByRole("region", { name: "Reservation summary" });
  await expect(bar).toBeVisible();
  await bar.getByRole("button", { name: "Check availability" }).click();
  await expect(page.locator("#reserve [data-calendar-day]:not(:disabled)").first()).toBeFocused();

  await page.locator("#reserve").getByRole("button", { name: "Next month" }).click();
  const days = page.locator("#reserve [data-calendar-day]:not(:disabled)");
  await days.nth(2).click();
  await days.nth(4).click();
  await bar.getByRole("link", { name: "Reserve" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Confirm and pay" })).toBeVisible({ timeout: 30000 });
});

for (const path of ["/", "/s/Aspen", "/rooms/l1", "/experiences", "/services", "/host", "/login"]) {
  test(`${path} has no horizontal scroll on a phone`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expectNoHorizontalScroll(page);
  });
}
```

`e2e/keyboard.spec.ts` runs in the `desktop` project:

```ts
import { test, expect } from "@playwright/test";
import { logIn, tabTo, unique } from "./helpers";

test("a guest books a stay with the keyboard only", async ({ page }) => {
  await logIn(page, `keyboard-${unique()}@example.com`, "/");
  await page.waitForLoadState("networkidle");

  await tabTo(page, page.getByRole("button", { name: "Where" }));
  await page.keyboard.press("Enter");
  await tabTo(page, page.getByRole("button", { name: "Aspen" }));
  await page.keyboard.press("Enter");
  await tabTo(page, page.getByRole("button", { name: "Search", exact: true }));
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/s\/Aspen/, { timeout: 30000 });
  await page.waitForLoadState("networkidle");

  await tabTo(page, page.locator('a[href^="/rooms/"]').first());
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30000 });
  await page.waitForLoadState("networkidle");

  await tabTo(page, page.locator("#reserve").getByRole("button", { name: "Next month" }));
  await page.keyboard.press("Enter");
  const days = page.locator("#reserve [data-calendar-day]:not(:disabled)");
  await tabTo(page, days.nth(2));
  await page.keyboard.press("Enter");
  await tabTo(page, days.nth(4));
  await page.keyboard.press("Enter");
  await tabTo(page, page.locator("#reserve").getByRole("link", { name: "Reserve" }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Confirm and pay" })).toBeVisible({ timeout: 30000 });
});
```

In `e2e/listing-detail.spec.ts`, before the day buttons are counted, add:

```ts
  // Next month's days are all in the future, so the picks never land on a past day at month end.
  await page.getByRole("button", { name: "Next month" }).click();
```

- [ ] **Step 2: Run the e2e suite**

Run: `npm run e2e` (both projects).
Expected: PASS. If a spec fails because a selector doesn't match the real accessible name, fix the selector. Change product code only if the product is genuinely wrong, and say so in the report.

- [ ] **Step 3: Update the docs**

In *repo root* `CLAUDE.md`:
- **Design Token System:** add "**Breakpoints:** `md` 744px, `lg` 1128px, `xl` 1440px (DESIGN.md); width caps `max-w-listing` (1440) and `max-w-editorial` (1280)".
- **Component Layers:** add `MobileNav`, `MobileSearch`, `ReservationPanel`, `ReservationBar` and `AccountLinks` to the features list, and `SkipLink` to the design-system list.
- **Testing Conventions:** add "Playwright runs a `desktop` (1280×800) and a `mobile` (Pixel 7) project; `e2e/a11y.spec.ts` is an axe gate (WCAG 2.1 AA, serious and critical fail); shared e2e helpers live in `e2e/helpers.ts`."
- **Responsive rule:** add under Architecture: "Mobile-only UI is a separate component shown with `md:hidden`, never a viewport check in render."

In the frontend spec §10, change row 8 to `8. Responsive polish + Playwright E2E + accessibility pass. — see 2026-09-28-frontend-phase8-responsive-a11y-design.md`.

- [ ] **Step 4: Verify everything**

Run, in order: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run e2e`, `npm run test:coverage`.
Expected:
- all pass;
- at least 80% line coverage on each new file: `lib/search/use-search-form.ts`, `lib/reservation/query.ts`, `lib/hooks/use-reservation-state.ts`, `lib/nav.ts`, `components/features/{nav/mobile-nav,search-bar/mobile-search,reservation-bar,reservation-panel,auth/account-links}.tsx`, `components/design-system/skip-link.tsx`.

Report the numbers.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: add mobile and keyboard e2e flows and document the responsive and a11y setup"
```
