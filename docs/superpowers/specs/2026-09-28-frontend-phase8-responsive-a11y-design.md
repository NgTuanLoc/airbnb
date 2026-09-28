# Frontend Phase 8 — Responsive Polish, E2E and Accessibility — Design

**Date:** 2026-09-28
**Status:** Design sections approved in conversation; awaiting written-spec review.
**Builds on:**
- `2026-06-21-airbnb-frontend-clone-design.md` §8 (responsive), §9 (testing), §10 phase 8;
- `frontend/DESIGN.md` "Responsive Behavior";
- the deferred items from phases 3, 6 and 7.

## Goal

The clone works at phone, tablet and desktop widths as DESIGN.md describes. It passes an automated WCAG 2.1 AA check, it can be operated by keyboard, and the e2e suite runs at both desktop and mobile widths. The small bugs deferred from earlier phases are fixed.

## Success criteria

1. Every main page is usable at 375px, 744–1128px and 1280px+, with no horizontal page scroll.
2. Below 744px:
   - the nav is logo + hamburger sheet;
   - home search is one pill opening a full-screen overlay;
   - card grids are 1-up;
   - `/rooms/[id]` has a sticky bottom reservation bar.
3. `e2e/a11y.spec.ts` (axe, tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`) finds no `serious` or `critical` violations on the listed pages and open states, at desktop and mobile widths.
4. The critical booking flow can be completed with the keyboard only.
5. Playwright runs a `desktop` and a `mobile` project. All existing unit and e2e tests pass, except where a test's component changes on purpose (listed in the plan).
6. Each deferred item in §5 has a test that failed before its fix.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Responsive technique | CSS-first. Breakpoints retuned in `@theme`; mobile-only pieces are separate components shown or hidden with `md:hidden` / `hidden md:flex` | No viewport detection in JavaScript, so no hydration mismatch or first-paint flash |
| Breakpoints | `md` 744px, `lg` 1128px, `xl` 1440px (`sm` stays 640px) | DESIGN.md's values; existing `md:`/`lg:` classes land on the design's breakpoints |
| A11y enforcement | `@axe-core/playwright` (dev dependency) in e2e | Real browser, so colour contrast is checked too; guards against regressions |
| Mobile sheets and overlays | Native `<dialog>` | Focus trap, Escape and inert background for free; same pattern as the phase 6 save dialog |
| Scope | Full DESIGN.md responsive table + a11y + deferred bugs | Chosen by the user |

## 1. Foundations and layout

- **Breakpoints and width tokens.** `app/globals.css` `@theme` gets:
  - `--breakpoint-md: 744px`, `--breakpoint-lg: 1128px`, `--breakpoint-xl: 1440px`;
  - `--container-listing: 1440px` and `--container-editorial: 1280px`, which give the `max-w-listing` and `max-w-editorial` classes.
- **Grids** (columns at mobile / tablet / desktop):

  | Grid | Mobile (<744) | Tablet (744–1128) | Desktop (≥1128) |
  |---|---|---|---|
  | Property, experience, service and skeleton card grids | 1 | 2 | 4 |
  | City links | 1 | 3 | 6 |
  | Search results list | 1 | 2 | 2 |
  | Footer | 1 | 3 | 3 |

  The search map shows from `lg` up.
- **Detail pages** (`/rooms/[id]`, `/experiences/[id]`, `/services/[id]`, `/book/[listingId]`):
  - one column below `md`;
  - from `md` up, a body column plus a right column, sticky from `md`;
  - the right column is 320px on tablet and keeps today's proportions from `lg`.
- **Gutters and width caps.**
  - Page wrappers use `px-6`, `md:px-10` and `xl:px-20`.
  - Listing and search pages cap at `max-w-listing`.
  - Editorial pages (host landing, trips, wishlists, host dashboard) cap at `max-w-editorial`.
- **Touch targets:**
  - primary `Button` and the search orb: at least 48px;
  - `DatePickerDay`: 40×40;
  - heart: 32×32 inside a 12px-padded hit area;
  - hamburger, account trigger and close buttons: at least 44px.
- **No horizontal scroll.** An e2e helper asserts `document.documentElement.scrollWidth <= window.innerWidth` on every main page at 375px.

## 2. Mobile-only components

### `MobileNavSheet` (`components/features/nav/mobile-nav-sheet.tsx`)

- `TopNav` renders a hamburger button, labelled "Open menu" and visible only below `md`. The product tabs, "Become a host" and `AccountMenu` are hidden below `md`.
- The hamburger opens a bottom-sheet `<dialog>` labelled "Menu". It contains:
  - the product tabs, with the active one marked `aria-current="page"`;
  - "Become a host";
  - the account links: when logged in, Wishlists, Trips, Host dashboard and Log out; when logged out, Log in and Sign up.
- `AccountMenu` and the sheet render the account links from one shared module (`components/features/auth/account-links.tsx`).
- Escape, the ✕ button and choosing a link all close the sheet. Focus returns to the hamburger.

### Mobile search (`components/features/search-bar/mobile-search.tsx`)

- Below `md`, the home page shows one pill button with the accessible name "Start your search" and the text "Where to? · Anywhere · Any week · Add guests". From `md` up, the existing three-segment bar shows.
- The pill opens a full-screen `<dialog>` titled "Search".
  - Its sections are **Where**, **When** and **Who**, with one expanded at a time. Each section header is a button with `aria-expanded`.
  - The sections reuse `DestinationPanel`, `DatePanel` and `GuestPanel`.
  - The footer holds "Clear all" and "Search". Close (✕) returns focus to the pill.
  - On open, focus moves to the Where input.
- `lib/search/use-search-form.ts` holds the shared search state plus `buildSearchUrl`. `HomeSearchBar` and `MobileSearch` both use it, so both produce identical `/s/...` URLs.

### `ReservationBar` (`components/features/reservation-bar.tsx`)

- A client wrapper, `ReservationPanel`, owns the date and guest state. It renders:
  - `ReservationCard` (unchanged look): in the rail from `md` up, and in flow after the reviews on mobile, with the id `reserve`;
  - `ReservationBar`: `md:hidden`, fixed to the bottom, with `pb-[env(safe-area-inset-bottom)]`. It shows "$X night" and the dates, or "Add dates for prices".
- The bar's action:
  - with valid dates, it is a **Reserve** link to the same `/book/...` URL the card builds;
  - otherwise it is a **Check availability** button that scrolls `#reserve` into view and focuses its first enabled date.
- `/rooms/[id]` gets `pb-24 md:pb-0` so the bar never covers the footer.
- The owner and unlisted variants render no bar.

## 3. Accessibility

- **Landmarks:** exactly one `<main id="main">` per page; a `<header>` holding `<nav aria-label="Main">`; `<footer>`; one `h1` per page.
- **Skip link:** "Skip to content" is the first focusable element. It is visually hidden until focused, and it targets `#main`.
- **Focus:**
  - Every `<dialog>` and sheet returns focus to its trigger.
  - Menus close on Escape.
  - Every interactive atom shows a `focus-visible` ring from a `--color-focus-ring` token.
- **Contrast:** any token pair axe flags is darkened in `globals.css` (likely muted-on-canvas and `NewBadge`). DESIGN.md is updated to match.
- **Names and semantics:**
  - Meaningful `alt` text on listing photos.
  - Icon-only buttons (heart, arrows, close, hamburger) have accessible names.
  - Form controls keep their labels.
- **Motion:** the search pop-in, the sheet slide and smooth scroll are disabled under `prefers-reduced-motion: reduce`.
- **Axe gate** (`e2e/a11y.spec.ts`):
  - Pages: `/`, `/s/Aspen`, `/rooms/l1`, `/experiences`, `/experiences/e1`, `/services`, `/services/s1`, `/login`, `/register`, `/host`.
  - Logged-in pages: `/wishlists`, `/trips`, `/book/l1?…`, `/host/listings`, `/host/listings/new`, `/host/reservations`.
  - Open states: the account menu (desktop), the mobile nav sheet, the mobile search overlay, and the save-to-wishlist dialog.
  - The Mapbox canvas is excluded; nothing else is muted.

## 4. E2E

- **Projects.** `playwright.config.ts` defines:
  - `desktop` (1280×800): runs every spec except `mobile.spec.ts`;
  - `mobile` (the Pixel 7 device): runs `mobile.spec.ts` and `a11y.spec.ts`.
- **`e2e/mobile.spec.ts`:**
  - The hamburger sheet opens, navigates to Experiences, and closes on Escape.
  - Mobile search: pill → overlay → Aspen, dates and 2 guests → lands on `/s/Aspen?...` with results.
  - Listing bar: "Check availability" → pick dates → Reserve → "Confirm and pay".
  - No horizontal scroll on the main pages.
- **Keyboard flow** (desktop): from `/`, using only Tab, Shift+Tab, Enter, Space and the arrow keys, search Aspen, open a listing, pick dates, and reach "Confirm and pay".
- **Date-picking helpers** move at least one month ahead, so month-end runs are stable.

## 5. Deferred fixes

| Origin | Item | Fix |
|---|---|---|
| Phase 7 | Host listings share city coordinates on the map | `buildHostListing` adds a deterministic ±0.02° offset derived from the listing id |
| Phase 7 | Edit prefill is keyed by city name | Listings store `cityId`; `toHostListingInput` reads it and falls back to the name |
| Phase 7 | Back stays enabled while submitting | Back is disabled while `submitting` |
| Phase 6 | A failed logout is unhandled | Inline "Couldn't log you out. Try again." in the menu and the sheet |
| Phase 6 | Save dialog Cancel keeps the typed name | Cancel resets the name |
| Phase 6 | Unsave toast can't be dismissed | Close button and Escape; keeps its timer and `role="status"` |
| Phase 6 | `/book` Edit links drop dates | Links carry `checkIn`, `checkOut` and `guests`; the card and bar start from valid query params |
| Phase 3 | ReservationCard date tests fail near month end | `vi.setSystemTime` in unit tests; the e2e helpers above |
| Phase 3 | `minDate` unused on the live path | Wire "today" through it, or remove it (whichever is smaller) |
| Phase 3 | `app/rooms/[id]/not-found.tsx` nests a Button in a Link | One `Link` styled with `buttonClassName` |
| Phase 3 | "Guest favorite" hardcoded in the reviews band | Shown only when `isGuestFavorite`; otherwise "{n} reviews" |
| Open minor | `PropertyCard` crashes with no photos | Placeholder surface when `photos` is empty |
| Open minor | `home-listings` category state is typed `string` | Narrowed to `Category` |

## 6. Testing and docs

- **Vitest:**
  - `MobileNavSheet`, `MobileSearch`, `ReservationBar` / `ReservationPanel` and `useSearchForm` (URL parity with desktop);
  - the skip link;
  - touch-target classes;
  - each item in §5.
- **Playwright:** §3's axe gate and §4's specs.
- **Coverage:** at least 80% lines on new files.
- **Docs:**
  - CLAUDE.md: breakpoints and width tokens, the mobile components, the Playwright projects, the axe gate;
  - the frontend spec §10 phase 8 row: link to this spec.

## Out of scope

- The shadcn/ui init.
- Dark mode, right-to-left layouts, and i18n.
- A mobile bottom tab bar.
- A sticky bar on experiences and services.
- A map on mobile search.
- Visual regression screenshots.
