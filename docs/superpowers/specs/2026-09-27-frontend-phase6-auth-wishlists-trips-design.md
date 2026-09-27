# Frontend Phase 6 — Mock Auth, Wishlists, Trips and Booking — Design

**Date:** 2026-09-27
**Status:** Approved (design), pending spec review
**Builds on:**
- `2026-06-21-airbnb-frontend-clone-design.md` §10 phase 6;
- `2026-09-26-backend-modular-monolith-design.md` (the backend lists auth, bookings and wishlists as out of scope).

## Goal

Make the remaining guest flows work end to end on mock data:
- log in and out;
- save listings to named wishlists;
- book a stay through an Airbnb-style "Confirm and pay" page;
- see the booking under Trips.

## Success criteria

1. Logging in (any valid email and password) or registering starts a session that survives page loads and ends with Log out.
2. A logged-in guest can save a listing to a new or existing named wishlist from any property card, unsave it, and browse `/wishlists` and `/wishlists/[id]`.
3. Reserve → `/book/[listingId]` → Confirm creates a booking. The guest lands on its confirmation page, and it shows under `/trips`.
4. Logged-out visitors to gated pages, or clicking a heart, go to `/login?next=…` and come back after logging in.
5. Everything works with `DATA_SOURCE=mock` and `DATA_SOURCE=api`. Existing unit and e2e tests pass, apart from updates to `PropertyCard` and `ReservationCard` tests whose props change.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Persistence | Frontend mocks: in-memory repositories in the Next.js server, in both data modes | The backend excludes auth, bookings and wishlists; the repository seam lets a later backend add HTTP implementations without touching components |
| Session | httpOnly `session` cookie holding a base64 JSON mock user, validated with Zod | Server components can gate pages and route handlers can authorize; no real credentials exist (frontend spec §1 non-goal) |
| Writes | `/api/*` route handlers, not Server Actions | Same contract as every other data flow in the app |
| Client state | TanStack Query (`useSession`, `useWishlists`); **no Zustand** | The cookie plus the query cache cover what the frontend spec assigned to Zustand |
| Modal | Native `<dialog>` with `showModal()` | Focus trap, Esc and backdrop for free; `shadcn init` would overwrite the token theme |
| Booking flow | Review page (`/book/[listingId]`), then confirm | Faithful to Airbnb's "Confirm and pay" |
| Wishlists | Multiple named lists and a save modal | Matches Airbnb and the frontend spec's `/wishlists/[id]` route |

## 1. Session and auth

- **Cookie.** `session` is httpOnly, `SameSite=Lax`, path `/`, max age 7 days. Its value is base64-encoded JSON `{ userId, name, email }`, deliberately unsigned (mock).
  - `userId` = `"u-" + email.trim().toLowerCase()`, so the same email always maps to the same data.
  - An unparsable or invalid cookie means logged out.
- **`lib/auth/session.ts`** (server-only):
  - `getSession(): Promise<User | null>` reads `cookies()` and validates with Zod.
  - `sessionCookie(user)` / `clearedSessionCookie()` build `Set-Cookie` values for route handlers.
  - `sessionFromRequest(request)` reads the cookie in route handlers.
- **Route handlers** (envelope responses, as today):
  - `POST /api/auth/login` `{ email, password }` is validated with the existing `loginSchema`. It sets the cookie and returns the user; the name defaults to the part of the email before `@`.
  - `POST /api/auth/register` `{ name, email, password, confirmPassword }` is validated with `registerSchema`, sets the cookie and returns the user.
  - `POST /api/auth/logout` clears the cookie.
  - `GET /api/auth/session` returns the user, or `data: null` when logged out.
- **Forms.** `LoginForm` and `RegisterForm` post to these endpoints instead of the simulated delay, show the envelope error inline on failure, then `router.push(next)` and `router.refresh()`.
  - `next` comes from `?next=` and is used only if it starts with `/` and not `//`; otherwise the target is `/`. The rule lives in `lib/auth/next-path.ts`.
- **Client session.** `useSession()` is a TanStack Query hook over `GET /api/auth/session` (`["session"]`). Login, register and logout invalidate it.
- **TopNav.** The account button opens a small menu:
  - logged out: "Log in", "Sign up";
  - logged in: the user's initial in a Rausch circle, plus "Wishlists", "Trips", "Log out".
  - Log out posts `/api/auth/logout`, invalidates the session and wishlist queries, and goes to `/`.
- **Gating.** Server components for `/wishlists`, `/wishlists/[id]`, `/trips`, `/trips/[id]` and `/book/[listingId]` call `getSession()` and `redirect("/login?next=" + encodeURIComponent(pathWithQuery))` when it is null.

## 2. Data model, repositories and API

### Types (`lib/types.ts`)

- `User { id: string; name: string; email: string }`
- `Wishlist { id: string; name: string; listingIds: string[]; createdAt: string }`
- `Booking { id: string; listingId: string; checkIn: string; checkOut: string; guests: { adults: number; children: number }; priceBreakdown: PriceBreakdown; status: "confirmed"; createdAt: string }`
  - `checkIn` and `checkOut` are `YYYY-MM-DD`.
  - `PriceBreakdown` is the existing type from `lib/reservation/pricing.ts`.

### Repositories

- `lib/repositories/wishlist-repository.ts`: `WishlistRepository`
  - `listForUser(userId): Promise<Wishlist[]>`, newest first;
  - `findById(userId, id): Promise<Wishlist | null>`;
  - `create(userId, name): Promise<Wishlist>`;
  - `addListing(userId, wishlistId, listingId): Promise<Wishlist | null>` — null for an unknown list; idempotent;
  - `removeListing(userId, listingId): Promise<void>` — removes the listing from every list of the user.
- `lib/repositories/booking-repository.ts`: `BookingRepository`
  - `listForUser(userId): Promise<Booking[]>`;
  - `findById(userId, id): Promise<Booking | null>`;
  - `create(userId, booking: Omit<Booking, "id" | "createdAt" | "status">): Promise<Booking | "unavailable">` — `"unavailable"` when the dates overlap an existing booking of the same listing by any user. Ranges are half-open, `[checkIn, checkOut)`.
- `lib/repositories/mock/mock-wishlist-repository.ts` and `mock-booking-repository.ts`:
  - `Map`s stored on `globalThis` so they survive dev hot reload; data resets on server restart.
  - Ids come from `crypto.randomUUID()`.
  - Every method is scoped by `userId`.
- `getRepositories()` returns `wishlists` and `bookings` from the mocks in both modes, with a comment that the backend doesn't serve them yet.

### Route handlers (all require a session → otherwise 401 `{ success: false, error: "Log in to continue" }`)

- `GET /api/wishlists` → `Wishlist[]`.
- `POST /api/wishlists` `{ name: 1–50 chars trimmed, listingId?: string }` → 201 with the new list.
  - `listingId`, when given, must exist (`getRepositories().listings.findById`), else 404.
- `POST /api/wishlists/[id]/listings` `{ listingId }` → 200 with the list; 404 if the list isn't the user's or the listing doesn't exist.
- `DELETE /api/wishlists/saved/[listingId]` → 200.
- `POST /api/bookings` `{ listingId, checkIn, checkOut, adults, children }` → 201 with the booking. The shared schema from §4 enforces:
  - dates are `YYYY-MM-DD`;
  - `checkIn` is not before today (UTC) minus one day;
  - `checkOut` is after `checkIn`;
  - at most **30 nights**;
  - `adults` is 1–16 and `children` 0–15;
  - `adults + children ≤ listing.maxGuests`, otherwise 400 "This place allows at most N guests".
  - Unknown listing → 404.
  - Overlapping booking → 409 "Those dates are no longer available".
  - **The price is recomputed on the server** with `calculatePriceBreakdown(listing.pricePerNight, nights)`; client-sent prices are ignored.

Bodies are parsed with Zod: invalid JSON or fields → 400 envelope with the first issue's message.

## 3. Wishlists UI

- **`PropertyCard`** (design system) drops its local `saved` state and takes `saved?: boolean` and `onToggleSave?: () => void`. The heart renders only when `onToggleSave` is given.
- **`SaveToWishlist`** (`components/features/wishlists/`) is a client wrapper used by `PropertyGrid` and the search results list (the listing detail page has no heart today and gets none). It combines `useSession()` and `useWishlists()` (enabled only when logged in) to compute the saved ids. On a heart click:
  - logged out → `router.push("/login?next=" + current path)`;
  - saved → optimistic `DELETE`, rolled back on error, with an inline error message;
  - not saved → open the save dialog.
- **Save dialog** (`save-to-wishlist-dialog.tsx`) is a native `<dialog>` opened with `showModal()`, using the scrim token for the backdrop. It holds:
  - a title "Save to wishlist";
  - one row per list (cover photo of its first listing, name, "N saved"); clicking a row posts `/api/wishlists/[id]/listings` and closes the dialog;
  - "Create new wishlist", which switches to a name input (1–50 chars, inline validation) with Cancel and Create; Create posts `/api/wishlists` with the listing and closes the dialog.
  - Esc and the close button close it. Every mutation invalidates `["wishlists"]`, and errors show inline.
- **`/wishlists`** is a grid of cards (cover photo, name, "N saved") linking to `/wishlists/[id]`. With no lists it shows the empty state "Create your first wishlist" / "Tap the heart on any stay to save it here."
- **`/wishlists/[id]`** shows the name as an `h1` and a grid of its listings through `PropertyGrid` (hearts work). It returns 404 (`notFound()`) for another user's or an unknown list, skips listings that no longer exist, and shows an empty state when the list is empty.

## 4. Booking flow and trips

- **`lib/bookings/schemas.ts`** holds `bookingRequestSchema`: the rules in §2 minus the listing-dependent ones. It is shared by the book page's query parsing and `POST /api/bookings`.
- **`ReservationCard`** takes `listingId`. When dates are chosen, Reserve is a link to `/book/[listingId]?checkIn&checkOut&adults&children`.
  - Dates are formatted from the calendar's local `Date` as `YYYY-MM-DD` by `lib/reservation/dates.ts` (`toIsoDate`).
  - It stays disabled until both dates are picked.
- **`/book/[listingId]`** ("Confirm and pay") is gated.
  - It parses the query with `bookingRequestSchema`; invalid → `redirect("/rooms/[listingId]")`. Unknown listing → `notFound()`.
  - Left column:
    - "Your trip": the dates and guests, each with an "Edit" link to `/rooms/[listingId]`;
    - "Payment": "This is a demo — no payment details needed.";
    - `ConfirmBookingButton`.
  - Right rail card: the listing's first photo, title, rating, and the server-computed price breakdown.
- **`ConfirmBookingButton`** (client) posts `/api/bookings`.
  - It is disabled with "Confirming…" while pending.
  - 201 → `router.push("/trips/[id]?confirmed=1")`.
  - Any error → the envelope message inline, and the button is re-enabled.
- **`/trips/[id]`** is gated and uses `notFound()` for another user's booking.
  - With `?confirmed=1` it shows a banner "You're going to {city}!".
  - Then the listing photo and title linking to `/rooms/[id]`, the dates, the guests, the price breakdown, and "Booking {id prefix} · Confirmed".
- **`/trips`** is gated.
  - "Upcoming" (checkOut ≥ today, by checkIn ascending) and "Past" (by checkOut descending), shown as cards with photo, city, date range and total, linking to `/trips/[id]`.
  - Empty state: "No trips booked… yet!" plus a "Start searching" button to `/`.

## 5. Testing

- **Vitest**, route handlers called directly with `Request` objects (with a `cookie` header):
  - **session:** round trip; tampered or garbage cookie → null; the email-derived id is case-insensitive; `next` path rules (`/trips` ok; `//evil.com`, `https://evil.com`, `trips` rejected).
  - **mock repositories:**
    - user isolation for lists and bookings;
    - `addListing` is idempotent;
    - `removeListing` clears every list;
    - booking overlap: `[a,b)` vs `[b,c)` is allowed, overlap rejected.
  - **auth handlers:** login and register set the cookie and invalid bodies get 400; logout clears the cookie; the session endpoint returns user or null.
  - **wishlist handlers:** 401 without a session; create (with and without a listing, 404 for an unknown listing); add (404 for another user's list); remove.
  - **bookings handler:** 401; 201 with a server-computed total even when a `total` field is sent; 400 for past dates, check-out ≤ check-in, over 30 nights, 0 adults, too many guests; 404 for an unknown listing; 409 for overlap.
  - **components:**
    - `PropertyCard` saved/unsaved and callback, with no heart without a callback;
    - save dialog: pick a list, create a list, name validation;
    - `ConfirmBookingButton`: navigation on success, inline 409 message, disabled while pending;
    - TopNav menu logged in and out;
    - `ReservationCard` Reserve link query;
    - `toIsoDate` uses local dates.
- **Playwright (mock mode).** Each test logs in with a unique email.
  1. Logged-out heart → login → back → save to a new list → visible on `/wishlists/[id]` → unsave.
  2. Listing → pick dates → Reserve → Confirm → confirmation banner → listed on `/trips`.
  3. `/trips` logged out → login → back on `/trips`.
- **Coverage:** at least 80% lines on the new files.

## 6. Docs

- **CLAUDE.md:** add the session helper, the wishlist and booking repositories ("frontend mocks in both data modes"), and the new pages.
- **Frontend spec §10:** the phase 6 row links to this spec.

## Out of scope

- Real authentication, passwords stored or checked, payments.
- Backend persistence for users, wishlists or bookings.
- Cancelling or editing bookings.
- Wishlists for experiences or services.
- Renaming or deleting wishlists.
- Host pages (phase 7).
- Responsive polish beyond what the new pages need to render sensibly (phase 8).
