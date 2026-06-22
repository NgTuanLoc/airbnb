# Homepage Search, Map & Interaction Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the homepage search bar fully interactive (Where/When/Who popover), render a real map basemap, and add site-wide pointer-cursor + hover image-zoom polish.

**Architecture:** A controlled presentational `SearchBar` atom plus a `HomeSearchBar` feature orchestrator that owns state, three popover panels (destination/date/guest), and routing. The map change is a one-line style-URL swap. Polish is CSS/className-only and lives in shared components so it propagates everywhere.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4 (`app/globals.css` `@theme`), MapLibre via `react-map-gl/maplibre`, Vitest + React Testing Library, Playwright.

## Global Constraints

- Design tokens only — no raw hex/arbitrary colors. Layout arbitrary values (`max-w-[1280px]`, `aspect-[4/5]`) are allowed. Available tokens incl.: `bg-canvas`, `bg-surface-soft`, `bg-surface-strong`, `text-ink`, `text-muted`, `border-hairline`, `shadow-airbnb`, `rounded-sm`/`rounded-md`/`rounded-full`.
- Test imports come from `@/lib/test-utils` (re-exports RTL `render`/`screen` + `userEvent`); `describe`/`test`/`expect`/`vi` from `vitest`.
- Tests assert class names to verify token usage (project convention).
- No `any`, no `console.log`. Immutable updates only (spread, no mutation).
- Explicit prop types via named `interface`/`type`. No `React.FC`.
- TDD: write failing test → verify it fails → minimal implementation → verify it passes → commit.
- Repository remains the only importer of `lib/data`; this plan adds no data/API/hook layers.
- Run unit tests with `npx vitest run <path>`; E2E with `npm run e2e`.

---

### Task 1: Refactor `SearchBar` atom to controlled

**Files:**
- Modify: `components/design-system/search-bar.tsx`
- Modify: `components/design-system/index.ts` (re-export the new types)
- Test: `components/design-system/search-bar.test.tsx` (rewrite — current props change)

**Interfaces:**
- Produces:
  - `type SearchSegment = "where" | "when" | "who"`
  - `interface SearchValues { where: string; when: string; who: string }`
  - `interface SearchBarProps { values: SearchValues; activeSegment: SearchSegment | null; onSegmentClick: (segment: SearchSegment) => void; onSearch: () => void }`
  - `function SearchBar(props: SearchBarProps)` — each segment is a `<button>` whose accessible name is the capitalized label ("Where"/"When"/"Who"); the active segment carries `bg-surface-strong`. The orb keeps `aria-label="Search"`, `bg-rausch`, `rounded-full`.

- [ ] **Step 1: Rewrite the failing test**

```tsx
// components/design-system/search-bar.test.tsx
import { describe, expect, test, vi } from "vitest";
import { render, screen, userEvent } from "@/lib/test-utils";
import { SearchBar } from "./search-bar";

const values = { where: "Lisbon", when: "Add dates", who: "Add guests" };

describe("SearchBar", () => {
  test("renders the three segment values", () => {
    render(<SearchBar values={values} activeSegment={null} onSegmentClick={() => {}} onSearch={() => {}} />);
    expect(screen.getByText("Lisbon")).toBeInTheDocument();
    expect(screen.getByText("Add dates")).toBeInTheDocument();
    expect(screen.getByText("Add guests")).toBeInTheDocument();
  });

  test("clicking a segment fires onSegmentClick with its key", async () => {
    const onSegmentClick = vi.fn();
    render(<SearchBar values={values} activeSegment={null} onSegmentClick={onSegmentClick} onSearch={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Where" }));
    expect(onSegmentClick).toHaveBeenCalledWith("where");
  });

  test("the active segment carries a highlight class", () => {
    render(<SearchBar values={values} activeSegment="where" onSegmentClick={() => {}} onSearch={() => {}} />);
    expect(screen.getByRole("button", { name: "Where" }).className).toContain("bg-surface-strong");
  });

  test("the orb is a rausch circular button that triggers onSearch", async () => {
    const onSearch = vi.fn();
    render(<SearchBar values={values} activeSegment={null} onSegmentClick={() => {}} onSearch={onSearch} />);
    const orb = screen.getByRole("button", { name: "Search" });
    expect(orb.className).toContain("bg-rausch");
    expect(orb.className).toContain("rounded-full");
    await userEvent.click(orb);
    expect(onSearch).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/design-system/search-bar.test.tsx`
Expected: FAIL (SearchBar still uses old `onSearch?`-only signature; `values`/segment buttons don't exist).

- [ ] **Step 3: Rewrite the implementation**

```tsx
// components/design-system/search-bar.tsx
import { cn } from "@/lib/utils";

export type SearchSegment = "where" | "when" | "who";

export interface SearchValues {
  where: string;
  when: string;
  who: string;
}

export interface SearchBarProps {
  values: SearchValues;
  activeSegment: SearchSegment | null;
  onSegmentClick: (segment: SearchSegment) => void;
  onSearch: () => void;
}

const SEGMENTS: { key: SearchSegment; label: string }[] = [
  { key: "where", label: "Where" },
  { key: "when", label: "When" },
  { key: "who", label: "Who" },
];

function Segment({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn("flex flex-col rounded-full px-6 py-2 text-left", active && "bg-surface-strong")}
    >
      <span className="text-caption text-ink">{label}</span>
      <span className="text-body-sm text-muted">{value}</span>
    </button>
  );
}

export function SearchBar({ values, activeSegment, onSegmentClick, onSearch }: SearchBarProps) {
  return (
    <div className="flex h-16 items-center rounded-full border border-hairline bg-canvas pr-2 shadow-airbnb">
      {SEGMENTS.map((segment, index) => (
        <div key={segment.key} className="flex items-center">
          {index > 0 && <span className="h-8 w-px bg-hairline" aria-hidden />}
          <Segment
            label={segment.label}
            value={values[segment.key]}
            active={activeSegment === segment.key}
            onClick={() => onSegmentClick(segment.key)}
          />
        </div>
      ))}
      <button
        type="button"
        aria-label="Search"
        onClick={onSearch}
        className={cn(
          "ml-2 flex h-12 w-12 items-center justify-center rounded-full bg-rausch text-on-primary",
          "hover:bg-rausch-active",
        )}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="M20 20L16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/design-system/search-bar.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Re-export the new types from the barrel**

In `components/design-system/index.ts`, change the existing line:

```ts
export { SearchBar } from "./search-bar";
```

to:

```ts
export { SearchBar } from "./search-bar";
export type { SearchSegment, SearchValues } from "./search-bar";
```

- [ ] **Step 6: Commit**

```bash
git add components/design-system/search-bar.tsx components/design-system/search-bar.test.tsx components/design-system/index.ts
git commit -m "refactor: make SearchBar atom controlled with segment props"
```

---

### Task 2: Destination panel

**Files:**
- Create: `components/features/search-bar/destination-panel.tsx`
- Test: `components/features/search-bar/destination-panel.test.tsx`

**Interfaces:**
- Consumes: `City` from `@/lib/types` (`{ id, name, subLabel, image, listingCount }`).
- Produces: `interface DestinationPanelProps { value: string; suggestions: City[]; onChange: (value: string) => void; onSelect: (cityName: string) => void }`; `function DestinationPanel(props: DestinationPanelProps)`. Text input has accessible name "Where to?". Suggestions are filtered case-insensitively by `value` (substring on `name`); empty `value` shows all. Each suggestion is a `<button>` named by the city name.

- [ ] **Step 1: Write the failing test**

```tsx
// components/features/search-bar/destination-panel.test.tsx
import { describe, expect, test, vi } from "vitest";
import { render, screen, userEvent } from "@/lib/test-utils";
import type { City } from "@/lib/types";
import { DestinationPanel } from "./destination-panel";

const cities: City[] = [
  { id: "lisbon", name: "Lisbon", subLabel: "Apartment rentals", image: "/l.jpg", listingCount: 1 },
  { id: "aspen", name: "Aspen", subLabel: "Cabin rentals", image: "/a.jpg", listingCount: 1 },
];

describe("DestinationPanel", () => {
  test("filters suggestions by the typed value", () => {
    render(<DestinationPanel value="lis" suggestions={cities} onChange={() => {}} onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: "Lisbon" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aspen" })).not.toBeInTheDocument();
  });

  test("shows all suggestions when value is empty", () => {
    render(<DestinationPanel value="" suggestions={cities} onChange={() => {}} onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: "Lisbon" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aspen" })).toBeInTheDocument();
  });

  test("typing fires onChange", async () => {
    const onChange = vi.fn();
    render(<DestinationPanel value="" suggestions={cities} onChange={onChange} onSelect={() => {}} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Where to?" }), "a");
    expect(onChange).toHaveBeenCalledWith("a");
  });

  test("clicking a suggestion fires onSelect with the city name", async () => {
    const onSelect = vi.fn();
    render(<DestinationPanel value="" suggestions={cities} onChange={() => {}} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: "Lisbon" }));
    expect(onSelect).toHaveBeenCalledWith("Lisbon");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/features/search-bar/destination-panel.test.tsx`
Expected: FAIL ("Failed to resolve import './destination-panel'").

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/features/search-bar/destination-panel.tsx
"use client";

import type { City } from "@/lib/types";

export interface DestinationPanelProps {
  value: string;
  suggestions: City[];
  onChange: (value: string) => void;
  onSelect: (cityName: string) => void;
}

export function DestinationPanel({ value, suggestions, onChange, onSelect }: DestinationPanelProps) {
  const query = value.trim().toLowerCase();
  const filtered = query ? suggestions.filter((city) => city.name.toLowerCase().includes(query)) : suggestions;

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-caption text-ink">
        Where to?
        <input
          type="text"
          aria-label="Where to?"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Search destinations"
          className="rounded-sm border border-hairline bg-canvas px-4 py-3 text-body-md text-ink"
        />
      </label>
      <ul className="flex flex-col">
        {filtered.map((city) => (
          <li key={city.id}>
            <button
              type="button"
              onClick={() => onSelect(city.name)}
              className="flex w-full flex-col rounded-sm px-3 py-2 text-left hover:bg-surface-soft"
            >
              <span className="text-body-md text-ink">{city.name}</span>
              <span className="text-body-sm text-muted">{city.subLabel}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/features/search-bar/destination-panel.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add components/features/search-bar/destination-panel.tsx components/features/search-bar/destination-panel.test.tsx
git commit -m "feat: add search destination panel with city suggestions"
```

---

### Task 3: Date panel

**Files:**
- Create: `components/features/search-bar/date-panel.tsx`
- Test: `components/features/search-bar/date-panel.test.tsx`

**Interfaces:**
- Consumes: `BookingCalendar` from `@/components/features/booking-calendar` (props: `month: Date`, `checkIn: Date | null`, `checkOut: Date | null`, `minDate?: Date`, `onSelect: (date: Date) => void`, `onMonthChange: (next: Date) => void`).
- Produces: `interface DatePanelProps { checkIn: Date | null; checkOut: Date | null; onSelect: (date: Date) => void }`; `function DatePanel(props: DatePanelProps)`. Owns the displayed `month` via local state (defaults to current month); passes `minDate = new Date()` so past days are disabled.

- [ ] **Step 1: Write the failing test**

```tsx
// components/features/search-bar/date-panel.test.tsx
import { describe, expect, test, vi } from "vitest";
import { render, screen, userEvent } from "@/lib/test-utils";
import { DatePanel } from "./date-panel";

describe("DatePanel", () => {
  test("renders a month grid with weekday headers", () => {
    render(<DatePanel checkIn={null} checkOut={null} onSelect={() => {}} />);
    // BookingCalendar renders weekday labels; "Mo" is one of them.
    expect(screen.getByText("Mo")).toBeInTheDocument();
  });

  test("advancing the month updates the visible label", async () => {
    render(<DatePanel checkIn={null} checkOut={null} onSelect={() => {}} />);
    const before = screen.getByText(/\b\d{4}\b/).textContent;
    await userEvent.click(screen.getByRole("button", { name: "Next month" }));
    const after = screen.getByText(/\b\d{4}\b/).textContent;
    expect(after).not.toBe(before);
  });

  test("selecting a day fires onSelect", async () => {
    const onSelect = vi.fn();
    render(<DatePanel checkIn={null} checkOut={null} onSelect={onSelect} />);
    // Click the "15" day button of the visible month (always selectable in a future month).
    await userEvent.click(screen.getByRole("button", { name: "Next month" }));
    await userEvent.click(screen.getByRole("button", { name: "15" }));
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/features/search-bar/date-panel.test.tsx`
Expected: FAIL ("Failed to resolve import './date-panel'").

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/features/search-bar/date-panel.tsx
"use client";

import { useState } from "react";
import { BookingCalendar } from "@/components/features/booking-calendar";

export interface DatePanelProps {
  checkIn: Date | null;
  checkOut: Date | null;
  onSelect: (date: Date) => void;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function DatePanel({ checkIn, checkOut, onSelect }: DatePanelProps) {
  const [month, setMonth] = useState<Date>(() => startOfMonth(checkIn ?? new Date()));

  return (
    <div className="w-[320px]">
      <BookingCalendar
        month={month}
        checkIn={checkIn}
        checkOut={checkOut}
        minDate={new Date()}
        onSelect={onSelect}
        onMonthChange={setMonth}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/features/search-bar/date-panel.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add components/features/search-bar/date-panel.tsx components/features/search-bar/date-panel.test.tsx
git commit -m "feat: add search date panel wrapping BookingCalendar"
```

---

### Task 4: Guest panel

**Files:**
- Create: `components/features/search-bar/guest-panel.tsx`
- Test: `components/features/search-bar/guest-panel.test.tsx`

**Interfaces:**
- Consumes: `GuestStepper` and `GuestCounts` from `@/components/features/guest-stepper` (`GuestCounts = { adults: number; children: number }`; `GuestStepperProps = { value: GuestCounts; onChange: (next: GuestCounts) => void; maxGuests: number }`; the stepper renders rows with buttons named `Increase adults` / `Decrease adults`, etc.).
- Produces: `const MAX_GUESTS = 16`; `interface GuestPanelProps { value: GuestCounts; onChange: (next: GuestCounts) => void }`; `function GuestPanel(props: GuestPanelProps)`.

- [ ] **Step 1: Write the failing test**

```tsx
// components/features/search-bar/guest-panel.test.tsx
import { describe, expect, test, vi } from "vitest";
import { render, screen, userEvent } from "@/lib/test-utils";
import { GuestPanel } from "./guest-panel";

describe("GuestPanel", () => {
  test("renders the guest stepper rows", () => {
    render(<GuestPanel value={{ adults: 0, children: 0 }} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Increase adults" })).toBeInTheDocument();
  });

  test("increasing adults fires onChange with the next counts", async () => {
    const onChange = vi.fn();
    render(<GuestPanel value={{ adults: 0, children: 0 }} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Increase adults" }));
    expect(onChange).toHaveBeenCalledWith({ adults: 1, children: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/features/search-bar/guest-panel.test.tsx`
Expected: FAIL ("Failed to resolve import './guest-panel'").

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/features/search-bar/guest-panel.tsx
"use client";

import { GuestStepper, type GuestCounts } from "@/components/features/guest-stepper";

export const MAX_GUESTS = 16;

export interface GuestPanelProps {
  value: GuestCounts;
  onChange: (next: GuestCounts) => void;
}

export function GuestPanel({ value, onChange }: GuestPanelProps) {
  return (
    <div className="w-[320px]">
      <GuestStepper value={value} onChange={onChange} maxGuests={MAX_GUESTS} />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/features/search-bar/guest-panel.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add components/features/search-bar/guest-panel.tsx components/features/search-bar/guest-panel.test.tsx
git commit -m "feat: add search guest panel wrapping GuestStepper"
```

---

### Task 5: HomeSearchBar orchestrator + popover animation + page wiring

**Files:**
- Create: `components/features/search-bar/home-search-bar.tsx`
- Test: `components/features/search-bar/home-search-bar.test.tsx`
- Delete: `components/features/home-search-bar.tsx`
- Modify: `app/page.tsx` (update import path)
- Modify: `app/globals.css` (add `searchPopIn` keyframe + `.search-pop-in` utility)

**Interfaces:**
- Consumes: `SearchBar`, `SearchSegment` from `@/components/design-system` (verify the barrel re-exports them — see Step 3 note); `DestinationPanel`, `DatePanel`, `GuestPanel` from sibling files; `GuestCounts` from `@/components/features/guest-stepper`; `cities` from `@/lib/data/cities`; `useRouter` from `next/navigation`.
- Produces: `function HomeSearchBar()` (no props). Builds and pushes `/s/<dest>?guests&checkIn&checkOut`.

- [ ] **Step 1: Add the popover animation to globals.css**

Append to `app/globals.css` (after the existing `@theme` block, at the end of the file):

```css
@keyframes searchPopIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.search-pop-in {
  animation: searchPopIn 150ms ease-out;
}
```

- [ ] **Step 2: Write the failing test**

```tsx
// components/features/search-bar/home-search-bar.test.tsx
import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, userEvent } from "@/lib/test-utils";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import { HomeSearchBar } from "./home-search-bar";

beforeEach(() => {
  push.mockClear();
});

describe("HomeSearchBar", () => {
  test("opens the destination panel when Where is clicked", async () => {
    render(<HomeSearchBar />);
    await userEvent.click(screen.getByRole("button", { name: "Where" }));
    expect(screen.getByRole("textbox", { name: "Where to?" })).toBeInTheDocument();
  });

  test("selecting a destination updates the Where display", async () => {
    render(<HomeSearchBar />);
    await userEvent.click(screen.getByRole("button", { name: "Where" }));
    await userEvent.click(screen.getByRole("button", { name: "Lisbon" }));
    expect(screen.getByRole("button", { name: "Where" }).textContent).toContain("Lisbon");
  });

  test("Escape closes the open panel", async () => {
    render(<HomeSearchBar />);
    await userEvent.click(screen.getByRole("button", { name: "Where" }));
    expect(screen.getByRole("textbox", { name: "Where to?" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("textbox", { name: "Where to?" })).not.toBeInTheDocument();
  });

  test("increasing guests updates the Who display", async () => {
    render(<HomeSearchBar />);
    await userEvent.click(screen.getByRole("button", { name: "Who" }));
    await userEvent.click(screen.getByRole("button", { name: "Increase adults" }));
    expect(screen.getByRole("button", { name: "Who" }).textContent).toContain("1 guest");
  });

  test("search with no input routes to /s/anywhere", async () => {
    render(<HomeSearchBar />);
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(push).toHaveBeenCalledWith("/s/anywhere");
  });

  test("search with a destination and guests builds the URL", async () => {
    render(<HomeSearchBar />);
    await userEvent.click(screen.getByRole("button", { name: "Where" }));
    await userEvent.click(screen.getByRole("button", { name: "Lisbon" }));
    await userEvent.click(screen.getByRole("button", { name: "Who" }));
    await userEvent.click(screen.getByRole("button", { name: "Increase adults" }));
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(push).toHaveBeenCalledWith("/s/Lisbon?guests=1");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run components/features/search-bar/home-search-bar.test.tsx`
Expected: FAIL ("Failed to resolve import './home-search-bar'").

> NOTE: Task 1 Step 5 already added `export type { SearchSegment, SearchValues }` to the barrel, so the import below resolves. If for any reason it is missing, add it or import directly from `@/components/design-system/search-bar`.

- [ ] **Step 4: Write minimal implementation**

```tsx
// components/features/search-bar/home-search-bar.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchBar, type SearchSegment } from "@/components/design-system";
import type { GuestCounts } from "@/components/features/guest-stepper";
import { cities } from "@/lib/data/cities";
import { DestinationPanel } from "./destination-panel";
import { DatePanel } from "./date-panel";
import { GuestPanel } from "./guest-panel";

function toISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatShort(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function buildSearchUrl(destination: string, guests: GuestCounts, checkIn: Date | null, checkOut: Date | null): string {
  const trimmed = destination.trim();
  const dest = trimmed ? encodeURIComponent(trimmed) : "anywhere";
  const params = new URLSearchParams();
  const total = guests.adults + guests.children;
  if (total > 0) params.set("guests", String(total));
  if (checkIn) params.set("checkIn", toISO(checkIn));
  if (checkOut) params.set("checkOut", toISO(checkOut));
  const qs = params.toString();
  return qs ? `/s/${dest}?${qs}` : `/s/${dest}`;
}

export function HomeSearchBar() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<SearchSegment | null>(null);
  const [destination, setDestination] = useState("");
  const [checkIn, setCheckIn] = useState<Date | null>(null);
  const [checkOut, setCheckOut] = useState<Date | null>(null);
  const [guests, setGuests] = useState<GuestCounts>({ adults: 0, children: 0 });

  useEffect(() => {
    if (!active) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setActive(null);
    }
    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setActive(null);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [active]);

  function handleSegmentClick(segment: SearchSegment) {
    setActive((current) => (current === segment ? null : segment));
  }

  function handleSelectDate(date: Date) {
    if (!checkIn || checkOut) {
      setCheckIn(date);
      setCheckOut(null);
    } else if (date > checkIn) {
      setCheckOut(date);
    } else {
      setCheckIn(date);
    }
  }

  function handleSearch() {
    router.push(buildSearchUrl(destination, guests, checkIn, checkOut));
  }

  const total = guests.adults + guests.children;
  const whenLabel =
    checkIn && checkOut
      ? `${formatShort(checkIn)} – ${formatShort(checkOut)}`
      : checkIn
        ? formatShort(checkIn)
        : "Add dates";
  const whoLabel = total > 0 ? `${total} ${total === 1 ? "guest" : "guests"}` : "Add guests";

  return (
    <div ref={containerRef} className="relative">
      <SearchBar
        values={{ where: destination || "Search destinations", when: whenLabel, who: whoLabel }}
        activeSegment={active}
        onSegmentClick={handleSegmentClick}
        onSearch={handleSearch}
      />
      {active && (
        <div className="search-pop-in absolute left-0 top-full z-50 mt-3 rounded-md border border-hairline bg-canvas p-6 shadow-airbnb">
          {active === "where" && (
            <DestinationPanel
              value={destination}
              suggestions={cities}
              onChange={setDestination}
              onSelect={(name) => {
                setDestination(name);
                setActive("when");
              }}
            />
          )}
          {active === "when" && <DatePanel checkIn={checkIn} checkOut={checkOut} onSelect={handleSelectDate} />}
          {active === "who" && <GuestPanel value={guests} onChange={setGuests} />}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run components/features/search-bar/home-search-bar.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 6: Update the page import and delete the old file**

In `app/page.tsx`, change line 2 from:

```tsx
import { HomeSearchBar } from "@/components/features/home-search-bar";
```

to:

```tsx
import { HomeSearchBar } from "@/components/features/search-bar/home-search-bar";
```

Then delete the old orchestrator:

```bash
rm components/features/home-search-bar.tsx
```

- [ ] **Step 7: Run the full suite to confirm no broken imports**

Run: `npx vitest run`
Expected: PASS (all files). If a Windows "Worker exited unexpectedly" crash appears, re-run once — it is pre-existing intermittent flakiness, not a code defect.

- [ ] **Step 8: Commit**

```bash
git add components/features/search-bar/home-search-bar.tsx components/features/search-bar/home-search-bar.test.tsx app/page.tsx app/globals.css
git rm components/features/home-search-bar.tsx
git commit -m "feat: make homepage search bar interactive with Where/When/Who popover"
```

---

### Task 6: Real map basemap (CARTO)

**Files:**
- Modify: `components/features/search/listing-map.tsx:7`
- Test: `components/features/search/listing-map.test.tsx` (add a style-URL assertion)

**Interfaces:**
- Produces: exported `MAP_STYLE` constant set to the CARTO Voyager GL style. Export it so the test can assert the value without rendering MapLibre.

- [ ] **Step 1: Add the failing test**

Append this test inside the existing `describe("ListingMap", ...)` block in `components/features/search/listing-map.test.tsx`, and add the import at the top:

```tsx
import { ListingMap, MAP_STYLE } from "./listing-map";
```

```tsx
  test("uses the CARTO no-key basemap style", () => {
    expect(MAP_STYLE).toBe("https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json");
  });
```

(Change the existing `import { ListingMap } from "./listing-map";` line to the combined import above so it is not duplicated.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/features/search/listing-map.test.tsx`
Expected: FAIL — either `MAP_STYLE` is not exported, or it still equals the demotiles URL.

- [ ] **Step 3: Update the implementation**

In `components/features/search/listing-map.tsx`, change line 7 from:

```tsx
const MAP_STYLE = "https://demotiles.maplibre.org/style.json";
```

to:

```tsx
export const MAP_STYLE = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/features/search/listing-map.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add components/features/search/listing-map.tsx components/features/search/listing-map.test.tsx
git commit -m "fix: use CARTO basemap so the map renders real streets"
```

---

### Task 7: Site-wide pointer cursor for clickable elements

**Files:**
- Modify: `app/globals.css` (append a base rule)

**Interfaces:** none (CSS only).

- [ ] **Step 1: Append the base rule to globals.css**

Add at the end of `app/globals.css`:

```css
button:not(:disabled),
[role="button"] {
  cursor: pointer;
}
```

- [ ] **Step 2: Verify the rule is present and correct**

Run: `grep -n "cursor: pointer" app/globals.css`
Expected: shows the rule. Confirm `<a>`/`<Link>` are unaffected (already pointer by default) and disabled buttons keep `cursor-not-allowed` via their existing `disabled:` utilities (e.g. in `components/features/guest-stepper.tsx`).

- [ ] **Step 3: Sanity-run the unit suite (no behavior change expected)**

Run: `npx vitest run`
Expected: PASS (all files unchanged in behavior).

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "feat: show pointer cursor on clickable buttons site-wide"
```

---

### Task 8: Hover image-zoom across all cards

**Files:**
- Modify: `components/design-system/property-card.tsx`
- Modify: `components/design-system/experience-card.tsx`
- Modify: `components/design-system/service-card.tsx`
- Modify: `components/features/city-link-grid.tsx`
- Test: `components/design-system/property-card.test.tsx`, `components/design-system/experience-card.test.tsx`, `components/design-system/service-card.test.tsx` (add a class assertion to each; create the file if it does not exist)

**Interfaces:** none (className-only). The hover target ancestor gets `group`; the `<Image>` gets `transition-transform duration-300 ease-out group-hover:scale-105`. The image's wrapping div already has `overflow-hidden`, which clips the scaled image so card size never changes.

- [ ] **Step 1: Write/extend the failing tests**

For each of the three card test files, add this assertion (adapt the entity prop to the card). Example for PropertyCard — add inside its `describe`:

```tsx
test("the photo zooms on hover without resizing the card", () => {
  render(<PropertyCard listing={listing} />);
  const img = screen.getByRole("img", { name: listing.title });
  expect(img.className).toContain("group-hover:scale-105");
  expect(img.className).toContain("transition-transform");
});
```

All three test files already exist — reuse each file's existing fixture:
- `property-card.test.tsx` — reuse its `listing` fixture; assert on `screen.getByRole("img", { name: listing.title })`.
- `experience-card.test.tsx` — reuse its `experience` fixture; assert on `screen.getByRole("img", { name: experience.title })`.
- `service-card.test.tsx` — reuse its `service` fixture; assert on `screen.getByRole("img", { name: service.title })`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/design-system/property-card.test.tsx components/design-system/experience-card.test.tsx components/design-system/service-card.test.tsx`
Expected: FAIL (images lack `group-hover:scale-105`).

- [ ] **Step 3: Add the zoom classes**

In `components/design-system/property-card.tsx`: add `group` to the root `<article>` className (becomes `className="group relative flex flex-col gap-2"`), and change the `<Image>` className from `"object-cover"` to:

```
"object-cover transition-transform duration-300 ease-out group-hover:scale-105"
```

In `components/design-system/experience-card.tsx`: add `group` to the root `<article>` (becomes `className="group flex flex-col gap-2"`), and change the `<Image>` className from `"object-cover"` to the same zoom string above.

In `components/design-system/service-card.tsx`: same change — add `group` to the root `<article>`, update the `<Image>` className to the zoom string above.

In `components/features/city-link-grid.tsx`: add `group` to the `<Link>` className (becomes `className="group flex flex-col gap-2"`), and change the `<Image>` className from `"object-cover"` to the zoom string above.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/design-system/property-card.test.tsx components/design-system/experience-card.test.tsx components/design-system/service-card.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/design-system/property-card.tsx components/design-system/experience-card.tsx components/design-system/service-card.tsx components/features/city-link-grid.tsx components/design-system/property-card.test.tsx components/design-system/experience-card.test.tsx components/design-system/service-card.test.tsx
git commit -m "feat: zoom card photos on hover without changing card size"
```

---

### Task 9: E2E — interactive search flow + real map

**Files:**
- Modify: `e2e/search.spec.ts` (add a popover-flow test)

**Interfaces:** none. Uses the running dev server (Playwright auto-starts it).

- [ ] **Step 1: Add the failing E2E test**

Append to `e2e/search.spec.ts`:

```ts
test("uses the search popover to route with a destination and guests", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Where" }).click();
  await page.getByRole("button", { name: "Lisbon" }).click();

  await page.getByRole("button", { name: "Who" }).click();
  await page.getByRole("button", { name: "Increase adults" }).click();

  await page.getByRole("button", { name: "Search" }).click();

  // First navigation to /s/[location] can trigger an on-demand dev compile.
  await expect(page).toHaveURL(/\/s\/Lisbon\?guests=1/, { timeout: 30000 });
  await expect(page.getByTestId("map-panel")).toBeAttached();
});
```

- [ ] **Step 2: Run the E2E suite to verify the new test passes (and existing ones still pass)**

Run: `npm run e2e`
Expected: PASS — the new test plus the existing three search tests. The "search orb routes to the search page" test still passes because an empty search routes to `/s/anywhere`.

> NOTE: If a single test flakes on first dev-server compile, re-run once. Keep the 30s timeout on the first `/s/` navigation.

- [ ] **Step 3: Commit**

```bash
git add e2e/search.spec.ts
git commit -m "test: cover interactive search popover flow end-to-end"
```

---

## Self-Review

**Spec coverage:**
- Search bar full popover (Where/When/Who) → Tasks 1–5. ✅
- URL contract `/s/<dest>?guests&checkIn&checkOut`, empty→`/s/anywhere`, omit-when-unset → Task 5 `buildSearchUrl` + tests. ✅
- Popover animation effect → Task 5 (`searchPopIn`). ✅
- Outside-click + Escape close → Task 5 effect + test. ✅
- CARTO basemap → Task 6. ✅
- Pointer cursor site-wide → Task 7. ✅
- Hover image-zoom on all four cards, no layout shift → Task 8. ✅
- Reuse existing `BookingCalendar`/`GuestStepper`/`cities`; no new data/API/hook layer → Tasks 3–5. ✅
- E2E popover + map → Task 9. ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code. Conditional notes (barrel export, GuestCounts export, missing test files) include the exact `grep`/`ls` command to resolve them. ✅

**Type consistency:** `SearchSegment`/`SearchValues`/`SearchBarProps` defined in Task 1 and consumed in Task 5; `GuestCounts` from `guest-stepper` used in Tasks 4 & 5; `DestinationPanelProps`/`DatePanelProps`/`GuestPanelProps` defined in Tasks 2–4 and consumed in Task 5; `MAP_STYLE` exported in Task 6 and asserted in its test. Names match across tasks. ✅
