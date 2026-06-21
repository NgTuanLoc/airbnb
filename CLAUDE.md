# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Next.js dev server (http://localhost:3000)
npm run build        # Production build
npm test             # Run Vitest unit tests (single run)
npm run test:watch   # Vitest in watch mode
npm run test:coverage # Vitest with v8 coverage report
npm run e2e          # Playwright E2E tests (requires dev server or auto-starts it)
npm run lint         # ESLint
```

Run a single test file:
```bash
npx vitest run components/design-system/button.test.tsx
npx vitest run lib/utils.test.ts
```

## Architecture

### Technology Stack
- **Next.js 16 App Router** + **React 19** + **TypeScript strict mode**
- **Tailwind CSS v4** with a custom `@theme` block in `app/globals.css` — all design tokens are CSS custom properties there, not `tailwind.config.js`
- **TanStack Query v5** for server state on the client
- **Zod v4** for API response validation
- **Vitest** + **React Testing Library** for unit/component tests; **Playwright** for E2E

### Design Token System
`DESIGN.md` is the source of truth for the visual design. All tokens are encoded in `app/globals.css`:
- **Colors:** `bg-rausch`, `text-ink`, `bg-canvas`, `border-hairline`, etc.
- **Typography:** CSS component classes `.text-display-xl`, `.text-body-md`, `.text-caption`, etc. (not Tailwind utility classes)
- **Radii:** `rounded-sm` (8px), `rounded-md` (14px), `rounded-full`
- **Shadow:** single tier `shadow-airbnb`

Always use these named tokens rather than arbitrary Tailwind values.

### Component Layers

**`components/design-system/`** — tokenized atoms. Barrel export via `components/design-system/index.ts`. Components here: `Button`, `TextInput`, `SearchBar`, `TopNav`, `Footer`, `PropertyCard`, `ExperienceCard`, `RatingDisplay`, `DatePickerDay`, `HostCard`, `NewBadge`, `GuestFavoriteBadge`.

**`components/features/`** — composed feature components that assemble atoms and connect to data hooks. Components here: `HomeListings`, `CategoryStrip`, `PropertyGrid`, `CityLinkGrid`, `ListingGallery`, `ListingOverview`, `AmenityList`, `ReviewsGrid`, `ReservationCard`, `BookingCalendar`, `GuestStepper`.

### Data Layer (bottom-up)

```
lib/data/              Static mock data arrays (listings, hosts, reviews, cities)
lib/repositories/      Repository interfaces + mock implementations
  mock/                MockListingRepository, MockHostRepository, MockReviewRepository
lib/api/envelope.ts    ApiResponse<T> type + ok()/fail() helpers
app/api/listings/      GET /api/listings?category=X — wraps mock repository
lib/api-client/        fetchListings() + Zod schemas validating the envelope
lib/hooks/             useListings(category?) — TanStack Query wrapper
```

- Server components (`app/rooms/[id]/page.tsx`) call mock repositories directly.
- Client components (`HomeListings`) use `useListings()` which fetches `/api/listings`.
- `app/providers.tsx` wraps the app with `QueryClientProvider`.

### Core Types
All shared domain types live in `lib/types.ts`: `Listing`, `Host`, `Review`, `City`, `CATEGORIES`, `Category`.

### Pages
- `/` — Homepage: `TopNav` + `SearchBar` + `HomeListings` (category filter + property grid) + `CityLinkGrid` + `Footer`
- `/rooms/[id]` — Listing detail: server component, fetches listing/host/reviews from repositories
- `/design-system` — Component gallery (development reference)

### Testing Conventions
- Import `render`, `screen`, `userEvent` from `@/lib/test-utils` (not directly from RTL)
- Tests assert class names to verify token usage (e.g., `expect(el.className).toContain("bg-rausch")`)
- E2E tests live in `e2e/`; Playwright config in `playwright.config.ts` auto-starts the dev server
- TDD workflow: write failing test → minimal implementation → passing test → commit

### Path Alias
`@/*` maps to the repo root (e.g., `@/lib/utils`, `@/components/design-system`).
