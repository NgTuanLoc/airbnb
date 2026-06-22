# App Icons Design

**Date:** 2026-06-22
**Status:** Approved
**Topic:** Add iconography across the app using `lucide-react`

## Problem

The app is almost entirely text-only. Sections that read as plain text in the
real Airbnb UI carry icons that aid scanning and give the product its visual
signature — the category bar, the amenities list, the listing stat line. Today:

- `CategoryStrip` renders category names as text-only tabs.
- `AmenityList` ("What this place offers") renders amenities as a plain text grid.
- `ListingOverview` joins guests/bedrooms/beds/baths into one `·`-separated string.
- `Footer` and `TopNav` use text links and glyph placeholders (`☰`).

The project has **no icon library**; the only existing icons are two hand-written
inline `<svg>` elements (wishlist heart, search magnifier).

## Goal

Add icons to four areas — category strip, "What this place offers", listing
facts, and footer/nav — sourced from `lucide-react`, wired through a single
shared mapping layer, following the existing design-token and TDD conventions.

## Non-Goals

- Replacing the existing hand-rolled icons (heart, magnifier). They stay.
- Adding icons to areas not listed (reviews, reservation card, search filters).
- Changing any domain data (amenity strings, category lists remain as-is).

## Approach

Centralize the string→icon mapping in `lib/icons.ts` rather than scattering icon
picks inline across components. One place to edit, easy to unit-test, and keeps
components presentational. This is the only real architectural decision; all
other changes follow existing `components/design-system` and `components/features`
patterns.

## Design

### A. Shared icon-mapping layer — `lib/icons.ts`

Two pure helpers, each returning a `LucideIcon`, each with a safe fallback for
unknown strings so new data never crashes the UI:

```ts
import type { LucideIcon } from "lucide-react";

export function getAmenityIcon(name: string): LucideIcon;
export function getCategoryIcon(name: string): LucideIcon;
```

**Amenity map** (6 known keys):

| Amenity | Icon |
|---|---|
| Wifi | `Wifi` |
| Kitchen | `Utensils` |
| Free parking | `SquareParking` |
| Self check-in | `KeyRound` |
| Air conditioning | `AirVent` |
| Washer | `WashingMachine` |

**Category map** (covers all three verticals, keyed by label):

| Vertical | Mappings |
|---|---|
| Homes | All→`LayoutGrid`, Cabins→`TreePine`, Beachfront→`Waves`, Countryside→`Wheat`, Amazing views→`Mountain`, Tiny homes→`House`, Lakefront→`Sailboat`, Trending→`Flame` |
| Experiences | Food & drink→`UtensilsCrossed`, Art & culture→`Palette`, Nature→`Leaf`, Sports→`Dumbbell`, Wellness→`Sparkles` |
| Services | Photography→`Camera`, Chefs→`ChefHat`, Massage→`HandHeart`, Training→`Dumbbell`, Hair & makeup→`Scissors` |

**Fallback:** unknown key → `Circle`.

### B. Component changes

1. **`CategoryStrip`** (`components/features/category-strip.tsx`) — each tab
   becomes a vertical icon-over-label layout: a 24px line icon above a small
   label. Muted by default; ink text + bottom border when active (preserve the
   existing active behavior). Applies to home, `/experiences`, `/services`
   automatically since the component is shared.

2. **`AmenityList`** (`components/features/amenity-list.tsx`) — each `<li>`
   becomes `icon + text` in a flex row: 24px icon (`text-ink`) + existing label.

3. **`ListingOverview`** (`components/features/listing-overview.tsx`) — replace
   the `·`-joined spec string with a horizontal row of 4 stat items, each
   `icon + label`: guests→`Users`, bedrooms→`DoorOpen`, beds→`Bed`, baths→`Bath`.
   `propertyType` remains as the lead text above the row.

4. **`Footer`** (`components/design-system/footer.tsx`) — add a `Globe` icon
   before "English (US)" and a small social row (`Facebook`, `Instagram`,
   `Twitter`) in the bottom bar.

5. **`TopNav`** (`components/design-system/top-nav.tsx`) — replace the `☰` glyph
   with the lucide `Menu` icon and the placeholder account circle with
   `UserCircle`.

### C. Conventions

- All icons are decorative → `aria-hidden`. Labels already provide the
  accessible text.
- Size and color via tokens only (`size-6`, `text-ink`, `text-muted`) — no
  arbitrary Tailwind values, per `CLAUDE.md`.
- New dependency: `lucide-react` (tree-shakeable; one import per icon).

## Testing (TDD)

- `lib/icons.test.ts` — known key → expected icon; unknown key → `Circle`
  fallback, for both helpers.
- Each changed component test asserts an icon `<svg>` renders alongside the
  existing text assertions:
  - `category-strip.test.tsx` — an svg per category tab.
  - `amenity-list.test.tsx` — an svg per amenity row.
  - `listing-overview.test.tsx` — svgs for the 4 stat items.
  - `footer.test.tsx` / `top-nav.test.tsx` — globe/social/menu icons present.
- Existing text/token assertions must continue to pass.

## Risks

- A second agent is working in the repo concurrently. Mitigation: keep changes
  scoped to the files listed above, commit only intended files (no `git add -A`),
  and rebase/merge carefully if overlap appears.
- Icon picks are subjective; the map is centralized so swaps are one-line edits.
