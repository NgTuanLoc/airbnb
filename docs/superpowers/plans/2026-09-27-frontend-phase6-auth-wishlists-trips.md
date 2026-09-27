# Frontend Phase 6 — Mock Auth, Wishlists, Trips and Booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guests can log in (mock), save listings to named wishlists, book a stay through a "Confirm and pay" page, and see it under Trips, all on in-memory frontend mocks that work in both `DATA_SOURCE` modes.

**Architecture:**
- An httpOnly `session` cookie (base64 JSON mock user) is written and read by `/api/auth/*` route handlers. Server components read it through `lib/auth/get-session.ts`.
- Wishlists and bookings sit behind new repository interfaces with in-memory mocks, returned by `getRepositories()` in both modes, and are exposed through session-guarded `/api/*` handlers.
- On the client, two context providers in `app/providers.tsx` carry the session and the wishlist hearts (plus the save dialog). Components read them null-safely, so anything rendered outside the providers (isolated tests) behaves as logged out.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Zod v4, TanStack Query v5, Tailwind v4 tokens, Vitest + RTL, Playwright. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-27-frontend-phase6-auth-wishlists-trips-design.md`

## Global Constraints

- **No new npm dependencies.** Use the native `<dialog>` element, not shadcn. Do not add Zustand.
- **Session cookie:**
  - `session=<base64url JSON {id,name,email}>; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`;
  - cleared with the same attributes and `Max-Age=0`;
  - `userId` = `"u-" + email.trim().toLowerCase()`; the name defaults to the part of the email before `@`.
  - An invalid cookie means logged out (never an error).
- **Exact error messages:**
  - 401: `Log in to continue`
  - bad JSON: `Request body must be JSON`
  - 404: `Listing '<id>' was not found`, `Wishlist not found`
  - 409: `Those dates are no longer available`
  - guest cap: `This place allows at most N guests`
  - `Check-in can't be in the past`, `Check-out must be after check-in`, `Stays can be at most 30 nights`, `At least 1 adult is required`
  - `Give your wishlist a name`, `Wishlist names can be at most 50 characters`
- **Limits:**
  - wishlist name 1–50 chars (trimmed);
  - `adults` 1–16, `children` 0–15, `adults + children ≤ listing.maxGuests`;
  - stays of 1–30 nights;
  - `checkIn` ≥ today (UTC) minus 1 day;
  - dates are `YYYY-MM-DD` and must be real calendar dates.
- **Bookings:**
  - overlap is checked per listing across all users, with half-open `[checkIn, checkOut)` nights;
  - the server recomputes the price with `calculatePriceBreakdown`; client-sent prices are ignored.
- **Routes:**
  - `?next=` is accepted only if it starts with `/` and not `//` or `/\`; otherwise `/`;
  - gated pages redirect to `/login?next=<encoded path with query>`.
- **Data modes:** wishlists and bookings are frontend mocks in both `DATA_SOURCE` modes, and only `lib/repositories/**` imports mock repositories (the ESLint guard).
- **Style:** use design tokens only (`bg-rausch`, `text-ink`, `border-hairline`, `shadow-airbnb`, `text-error`, `text-on-primary`, `bg-scrim`, `.text-*` type classes); no arbitrary colors.
- **Tests that may change:** only `property-card.test.tsx`, `reservation-card.test.tsx`, `top-nav.test.tsx`, `login-form.test.tsx` and `register-form.test.tsx`, because their components' behavior changes on purpose. Every other existing unit and e2e test passes unchanged.
- **Route handler tests** start with `// @vitest-environment node` (real `Set-Cookie` headers).
- **Commands:** run from `frontend/`: `npm test`, `npx tsc --noEmit`, `npm run lint`.
- **Commits** use conventional format and end with exactly:
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
  Never substitute another model name.
- **Branch:** `feat/frontend-phase6-auth-wishlists-trips` (it already exists and holds the spec).

## Implementation notes (decided at planning; the user reviews them with this plan)

1. **Hearts and session live in context providers, not a wrapper around each grid.** `SessionProvider` and `WishlistHeartsProvider` sit in `app/providers.tsx`.
   - The null-safe hooks `useSessionState()` and `useWishlistHearts()` return `null` outside the providers.
   - Many existing tests render `TopNav`, `PropertyGrid` and pages without a `QueryClientProvider` or App Router; with this approach they stay unchanged.
2. **Save-dialog rows show the list name and "N saved" without a cover photo.** Wishlists carry only listing ids; covers appear on the `/wishlists` page, which resolves them on the server.
3. **Log out does a full navigation to `/` (`window.location.assign`)**, which resets every client cache at once. `AccountMenu` can't rely on the App Router, because `TopNav` renders in tests without one.
4. **Login and register pages pass `next` to the forms as a prop**, read from `searchParams`, so the forms don't need `useSearchParams`.
5. **`TopNav` (design system) renders `AccountMenu` (features).** It is the one design-system → features import, accepted so every page gets the menu without changes.

## Review Focus

1. **A tampered, truncated or non-JSON `session` cookie.** Expected: treated as logged out (401 from the APIs, redirect from pages), never a 500. → Task 1 test `a tampered or garbage cookie is logged out`; Task 3 test `a garbage session cookie gets 401`.
2. **A crafted `?next=` (`//evil.com`, `https://evil.com`, `/\evil.com`, `javascript:…`).** Expected: after login the guest lands on `/`, never another site. → Task 1 test `safeNextPath rejects anything that isn't a same-site path`.
3. **Double-clicking "Confirm and pay", or a slow network.** Expected: exactly one booking. The button is disabled from the first click until navigation, and a second overlapping booking gets 409. → Task 7 test `disables the button while the booking is being created`; Task 3 test `overlapping dates get 409`.
4. **User B opening user A's wishlist or trip URL, or calling the APIs with A's ids.** Expected: 404, never A's data. → Task 2 isolation tests; Task 3 test `another user's wishlist is 404`; Task 6 and Task 7 page tests `another user's … is not found`.
5. **Impossible or hand-edited dates and prices** (`2026-02-30`, check-out before check-in, 31 nights, a `total` field in the body). Expected: 400 with a clear message, and prices always computed by the server. → Task 2 schema tests; Task 3 test `computes the price on the server and ignores a client total`.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/types.ts` (modify) | `User`, `Wishlist`, `Booking` |
| `lib/auth/session.ts` | cookie encode/decode, `userFromCredentials`, `sessionCookie`, `clearedSessionCookie`, `sessionFromRequest` |
| `lib/auth/next-path.ts` | `safeNextPath`, `loginPath` (client-safe) |
| `lib/auth/get-session.ts` | server-only `getSession`, `requireSession` |
| `lib/auth/test-helpers.ts` | test-only `sessionCookieHeader`, `jsonRequest` |
| `lib/api/request.ts` | `jsonError`, `unauthorized`, `parseBody` for route handlers |
| `app/api/auth/{login,register,logout,session}/route.ts` | auth endpoints |
| `lib/repositories/{wishlist,booking}-repository.ts` | interfaces |
| `lib/repositories/mock/mock-{wishlist,booking}-repository.ts` | in-memory implementations |
| `lib/repositories/index.ts` (modify) | `AppRepositories` with `wishlists` and `bookings` in both modes |
| `lib/bookings/schemas.ts` | `bookingRequestSchema`, `nightsBetweenDates`, `MAX_NIGHTS` |
| `lib/bookings/trips.ts` | `splitTrips` (upcoming/past) |
| `lib/wishlists/schemas.ts` | `createWishlistSchema`, `addListingSchema` |
| `app/api/wishlists/route.ts`, `app/api/wishlists/[id]/listings/route.ts`, `app/api/wishlists/saved/[listingId]/route.ts`, `app/api/bookings/route.ts` | data endpoints |
| `lib/api-client/{request,auth,wishlists,bookings}.ts`, `lib/api-client/schemas.ts` (modify) | client calls to our `/api` |
| `components/features/auth/session-provider.tsx` | `SessionProvider`, `SessionContext`, `useSessionState` |
| `components/features/auth/account-menu.tsx` | nav account menu |
| `components/features/wishlists/wishlist-hearts.tsx` | `WishlistHeartsProvider`, `useWishlistHearts` |
| `components/features/wishlists/save-to-wishlist-dialog.tsx` | the save modal |
| `components/features/price-breakdown-list.tsx` | shared price `<dl>` for the book and trip pages |
| `components/features/bookings/confirm-booking-button.tsx` | posts the booking |
| `lib/reservation/dates.ts` | `toIsoDate`, `formatDateRange` |
| `app/wishlists/page.tsx`, `app/wishlists/[id]/page.tsx`, `app/book/[listingId]/page.tsx`, `app/trips/page.tsx`, `app/trips/[id]/page.tsx` | pages |
| `e2e/wishlists.spec.ts`, `e2e/trips.spec.ts` | e2e flows |

All paths are relative to `frontend/` except the docs paths in Task 8.

---

### Task 1: Session helpers and the auth API

**Files:**
- Modify: `lib/types.ts` (append)
- Create: `lib/auth/session.ts`, `lib/auth/next-path.ts`, `lib/auth/get-session.ts`, `lib/auth/test-helpers.ts`, `lib/api/request.ts`
- Create: `app/api/auth/login/route.ts`, `app/api/auth/register/route.ts`, `app/api/auth/logout/route.ts`, `app/api/auth/session/route.ts`
- Test: `lib/auth/session.test.ts`, `lib/auth/next-path.test.ts`, `app/api/auth/auth-routes.test.ts`

**Interfaces:**
- Produces:
  - `User { id: string; name: string; email: string }`
  - `SESSION_COOKIE = "session"`
  - `userFromCredentials(email: string, name?: string): User`
  - `encodeSession(user: User): string`, `decodeSession(value: string | undefined): User | null`
  - `sessionCookie(user: User): string`, `clearedSessionCookie(): string`
  - `sessionFromRequest(request: Request): User | null`
  - `safeNextPath(next: string | null | undefined): string`, `loginPath(next: string): string`
  - `getSession(): Promise<User | null>`, `requireSession(path: string): Promise<User>` (server only)
  - `jsonError(message: string, status: number): Response`, `unauthorized(): Response`
  - `parseBody<T extends z.ZodType>(request, schema): Promise<{ data: z.infer<T> } | { error: Response }>`
  - Test-only: `sessionCookieHeader(email?: string): string` (a `cookie` header value), `jsonRequest(url: string, method: string, body?: unknown, cookie?: string): Request`.

- [ ] **Step 1: Write the failing tests**

`lib/auth/session.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  SESSION_COOKIE,
  clearedSessionCookie,
  decodeSession,
  encodeSession,
  sessionCookie,
  sessionFromRequest,
  userFromCredentials,
} from "./session";

describe("userFromCredentials", () => {
  test("derives a stable id from the email, whatever its case or spacing", () => {
    expect(userFromCredentials("  Ana@Example.COM ").id).toBe("u-ana@example.com");
    expect(userFromCredentials("ana@example.com").id).toBe(userFromCredentials("ANA@example.com").id);
  });

  test("uses the given name, or the part of the email before @", () => {
    expect(userFromCredentials("ana@example.com", " Ana Lima ").name).toBe("Ana Lima");
    expect(userFromCredentials("ana@example.com").name).toBe("ana");
  });
});

describe("session cookie", () => {
  const user = userFromCredentials("ana@example.com", "Ana");

  test("round-trips the user", () => {
    expect(decodeSession(encodeSession(user))).toEqual(user);
  });

  test("a tampered or garbage cookie is logged out", () => {
    expect(decodeSession(undefined)).toBeNull();
    expect(decodeSession("")).toBeNull();
    expect(decodeSession("not-base64-json")).toBeNull();
    expect(decodeSession(encodeSession(user).slice(0, 10))).toBeNull();
    expect(decodeSession(Buffer.from(JSON.stringify({ id: "u-x" })).toString("base64url"))).toBeNull();
  });

  test("sets an httpOnly lax cookie for 7 days and clears it with Max-Age=0", () => {
    expect(sessionCookie(user)).toBe(`${SESSION_COOKIE}=${encodeSession(user)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);
    expect(clearedSessionCookie()).toBe(`${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  });

  test("reads the session from a request's cookie header among other cookies", () => {
    const request = new Request("http://localhost/", { headers: { cookie: `theme=dark; ${SESSION_COOKIE}=${encodeSession(user)}; x=1` } });
    expect(sessionFromRequest(request)).toEqual(user);
    expect(sessionFromRequest(new Request("http://localhost/"))).toBeNull();
  });
});
```

`lib/auth/next-path.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { loginPath, safeNextPath } from "./next-path";

describe("safeNextPath", () => {
  test("keeps same-site paths, including their query", () => {
    expect(safeNextPath("/trips")).toBe("/trips");
    expect(safeNextPath("/book/l1?checkIn=2026-10-01")).toBe("/book/l1?checkIn=2026-10-01");
  });

  test("safeNextPath rejects anything that isn't a same-site path", () => {
    for (const next of [undefined, null, "", "trips", "//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)"]) {
      expect(safeNextPath(next)).toBe("/");
    }
  });
});

test("loginPath encodes the path to come back to", () => {
  expect(loginPath("/book/l1?checkIn=2026-10-01&adults=2")).toBe("/login?next=%2Fbook%2Fl1%3FcheckIn%3D2026-10-01%26adults%3D2");
});
```

`app/api/auth/auth-routes.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, test } from "vitest";
import { POST as login } from "./login/route";
import { POST as register } from "./register/route";
import { POST as logout } from "./logout/route";
import { GET as session } from "./session/route";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth/session";
import { jsonRequest, sessionCookieHeader } from "@/lib/auth/test-helpers";

function sessionFrom(res: Response) {
  const first = (res.headers.get("set-cookie") ?? "").split(";")[0];
  return decodeSession(first.slice(SESSION_COOKIE.length + 1));
}

describe("POST /api/auth/login", () => {
  test("logs in with any valid email and password and sets the session cookie", async () => {
    const res = await login(jsonRequest("http://localhost/api/auth/login", "POST", { email: "Ana@Example.com", password: "supersecret" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ id: "u-ana@example.com", name: "ana", email: "ana@example.com" });
    expect(res.headers.get("set-cookie")).toContain("HttpOnly");
    expect(sessionFrom(res)).toEqual(body.data);
  });

  test("rejects an invalid email with the 400 envelope and no cookie", async () => {
    const res = await login(jsonRequest("http://localhost/api/auth/login", "POST", { email: "nope", password: "supersecret" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: "Enter a valid email address" });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  test("rejects a body that isn't JSON", async () => {
    const res = await login(jsonRequest("http://localhost/api/auth/login", "POST", "{not json"));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Request body must be JSON");
  });
});

describe("POST /api/auth/register", () => {
  test("creates the session with the given name", async () => {
    const res = await register(jsonRequest("http://localhost/api/auth/register", "POST", {
      name: " Ana Lima ", email: "ana@example.com", password: "supersecret", confirmPassword: "supersecret",
    }));

    expect(res.status).toBe(201);
    expect(sessionFrom(res)?.name).toBe("Ana Lima");
  });

  test("rejects mismatched passwords", async () => {
    const res = await register(jsonRequest("http://localhost/api/auth/register", "POST", {
      name: "Ana", email: "ana@example.com", password: "supersecret", confirmPassword: "different1",
    }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Passwords do not match");
  });
});

test("POST /api/auth/logout clears the cookie", async () => {
  const res = await logout();

  expect(res.status).toBe(200);
  expect(res.headers.get("set-cookie")).toBe(`${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
});

describe("GET /api/auth/session", () => {
  test("returns the logged-in user", async () => {
    const res = await session(new Request("http://localhost/api/auth/session", { headers: { cookie: sessionCookieHeader("ana@example.com") } }));
    expect((await res.json()).data.id).toBe("u-ana@example.com");
  });

  test("returns null when logged out or the cookie is garbage", async () => {
    expect((await (await session(new Request("http://localhost/api/auth/session"))).json()).data).toBeNull();
    const garbage = new Request("http://localhost/api/auth/session", { headers: { cookie: `${SESSION_COOKIE}=%%%` } });
    expect((await (await session(garbage)).json()).data).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd frontend && npx vitest run lib/auth app/api/auth`
Expected: FAIL, because the modules `./session`, `./next-path`, `./login/route`, etc. cannot be resolved.

- [ ] **Step 3: Implement**

Append to `lib/types.ts`:

```ts
export interface User {
  id: string;
  name: string;
  email: string;
}
```

`lib/auth/session.ts`:

```ts
import { z } from "zod";
import type { User } from "@/lib/types";

export const SESSION_COOKIE = "session";
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

const userSchema = z.object({ id: z.string().min(1), name: z.string().min(1), email: z.email() });

/** The mock user for an email: the same email always maps to the same id, whatever its case or spacing. */
export function userFromCredentials(email: string, name?: string): User {
  const normalized = email.trim().toLowerCase();
  return { id: `u-${normalized}`, name: name?.trim() || normalized.split("@")[0], email: normalized };
}

// Deliberately unsigned: this is a mock session and no real credentials exist (spec §1).
export function encodeSession(user: User): string {
  return Buffer.from(JSON.stringify(user), "utf8").toString("base64url");
}

/** The user in a session cookie value; anything unreadable is simply "logged out". */
export function decodeSession(value: string | undefined): User | null {
  if (!value) return null;
  try {
    const parsed = userSchema.safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function sessionCookie(user: User): string {
  return `${SESSION_COOKIE}=${encodeSession(user)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/** The session of a route handler's request. */
export function sessionFromRequest(request: Request): User | null {
  const entry = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  return decodeSession(entry?.slice(SESSION_COOKIE.length + 1));
}
```

`lib/auth/next-path.ts`:

```ts
/** A post-login target: same-site paths only, so ?next= can't send anyone to another site. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}

/** The login page, coming back to `next` afterwards. */
export function loginPath(next: string): string {
  return `/login?next=${encodeURIComponent(next)}`;
}
```

`lib/auth/get-session.ts`:

```ts
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@/lib/types";
import { SESSION_COOKIE, decodeSession } from "./session";
import { loginPath } from "./next-path";

/** The logged-in user for a server component, or null. */
export async function getSession(): Promise<User | null> {
  return decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
}

/** The logged-in user, or a redirect to /login that comes back to `path` afterwards. */
export async function requireSession(path: string): Promise<User> {
  const user = await getSession();
  if (!user) redirect(loginPath(path));
  return user;
}
```

`lib/auth/test-helpers.ts`:

```ts
import { SESSION_COOKIE, encodeSession, userFromCredentials } from "./session";

/** A `cookie` header value for a logged-in guest; a fresh random email unless one is given. */
export function sessionCookieHeader(email = `guest-${crypto.randomUUID()}@example.com`): string {
  return `${SESSION_COOKIE}=${encodeSession(userFromCredentials(email))}`;
}

/** A JSON request for route handler tests; a string body is sent as-is (to test malformed JSON). */
export function jsonRequest(url: string, method: string, body?: unknown, cookie?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  return new Request(url, {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}
```

`lib/api/request.ts`:

```ts
import type { z } from "zod";
import { fail } from "./envelope";

export function jsonError(message: string, status: number): Response {
  return Response.json(fail(message), { status });
}

export function unauthorized(): Response {
  return jsonError("Log in to continue", 401);
}

/** Parses a JSON body with a Zod schema; on failure, a ready 400 envelope naming the first problem. */
export async function parseBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { error: Response }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { error: jsonError("Request body must be JSON", 400) };
  }
  const parsed = schema.safeParse(body);
  return parsed.success
    ? { data: parsed.data }
    : { error: jsonError(parsed.error.issues[0]?.message ?? "Invalid request", 400) };
}
```

`app/api/auth/login/route.ts`:

```ts
import { ok } from "@/lib/api/envelope";
import { parseBody } from "@/lib/api/request";
import { loginSchema } from "@/lib/auth/schemas";
import { sessionCookie, userFromCredentials } from "@/lib/auth/session";

// Mock auth: any valid email and password logs in; nothing is checked against stored credentials.
export async function POST(request: Request): Promise<Response> {
  const body = await parseBody(request, loginSchema);
  if ("error" in body) return body.error;
  const user = userFromCredentials(body.data.email);
  return Response.json(ok(user), { headers: { "Set-Cookie": sessionCookie(user) } });
}
```

`app/api/auth/register/route.ts`:

```ts
import { ok } from "@/lib/api/envelope";
import { parseBody } from "@/lib/api/request";
import { registerSchema } from "@/lib/auth/schemas";
import { sessionCookie, userFromCredentials } from "@/lib/auth/session";

// Mock auth: registering just starts a session with the given name; no account is stored.
export async function POST(request: Request): Promise<Response> {
  const body = await parseBody(request, registerSchema);
  if ("error" in body) return body.error;
  const user = userFromCredentials(body.data.email, body.data.name);
  return Response.json(ok(user), { status: 201, headers: { "Set-Cookie": sessionCookie(user) } });
}
```

`app/api/auth/logout/route.ts`:

```ts
import { ok } from "@/lib/api/envelope";
import { clearedSessionCookie } from "@/lib/auth/session";

export async function POST(): Promise<Response> {
  return Response.json(ok(null), { headers: { "Set-Cookie": clearedSessionCookie() } });
}
```

`app/api/auth/session/route.ts`:

```ts
import { ok } from "@/lib/api/envelope";
import { sessionFromRequest } from "@/lib/auth/session";

export async function GET(request: Request): Promise<Response> {
  return Response.json(ok(sessionFromRequest(request)));
}
```
- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run lib/auth app/api/auth && npx tsc --noEmit`
Expected: all PASS; tsc is clean.

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts lib/auth lib/api/request.ts app/api/auth
git commit -m "feat: add the mock session cookie and auth endpoints

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Wishlist and booking repositories and the booking rules

**Files:**
- Modify: `lib/types.ts` (append), `lib/repositories/index.ts`, `lib/repositories/index.test.ts` (append one test)
- Create: `lib/repositories/wishlist-repository.ts`, `lib/repositories/booking-repository.ts`
- Create: `lib/repositories/mock/mock-wishlist-repository.ts`, `lib/repositories/mock/mock-booking-repository.ts`
- Create: `lib/bookings/schemas.ts`
- Test: `lib/repositories/mock/mock-wishlist-repository.test.ts`, `lib/repositories/mock/mock-booking-repository.test.ts`, `lib/bookings/schemas.test.ts`

**Interfaces:**
- Consumes: `PriceBreakdown` from `lib/reservation/pricing.ts`.
- Produces:
  - `Wishlist { id; name; listingIds: string[]; createdAt: string }`;
  - `Booking { id; listingId; checkIn; checkOut; guests: { adults; children }; priceBreakdown: PriceBreakdown; status: "confirmed"; createdAt }`;
  - `WishlistRepository` and `BookingRepository` (signatures below), `NewBooking`;
  - `getRepositories(): AppRepositories` (= `Repositories & { wishlists; bookings }`);
  - `bookingRequestSchema`, `BookingRequest`, `nightsBetweenDates(checkIn, checkOut): number`, `MAX_NIGHTS = 30`.

- [ ] **Step 1: Write the failing tests**

`lib/repositories/mock/mock-wishlist-repository.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { mockWishlistRepository as repo } from "./mock-wishlist-repository";

const newUser = () => `u-${crypto.randomUUID()}`;

describe("mockWishlistRepository", () => {
  test("creates lists newest first, per user", async () => {
    const user = newUser();
    const first = await repo.create(user, "Summer");
    const second = await repo.create(user, "Winter");

    expect((await repo.listForUser(user)).map((w) => w.id)).toEqual([second.id, first.id]);
    expect(first.listingIds).toEqual([]);
  });

  test("one user never sees or changes another user's lists", async () => {
    const owner = newUser();
    const other = newUser();
    const list = await repo.create(owner, "Mine");

    expect(await repo.listForUser(other)).toEqual([]);
    expect(await repo.findById(other, list.id)).toBeNull();
    expect(await repo.addListing(other, list.id, "l1")).toBeNull();
    expect((await repo.findById(owner, list.id))?.listingIds).toEqual([]);
  });

  test("addListing is idempotent", async () => {
    const user = newUser();
    const list = await repo.create(user, "Trip");

    await repo.addListing(user, list.id, "l1");
    await repo.addListing(user, list.id, "l1");

    expect((await repo.findById(user, list.id))?.listingIds).toEqual(["l1"]);
  });

  test("removeListing clears the listing from every list", async () => {
    const user = newUser();
    const a = await repo.create(user, "A");
    const b = await repo.create(user, "B");
    await repo.addListing(user, a.id, "l1");
    await repo.addListing(user, b.id, "l1");
    await repo.addListing(user, b.id, "l2");

    await repo.removeListing(user, "l1");

    expect((await repo.findById(user, a.id))?.listingIds).toEqual([]);
    expect((await repo.findById(user, b.id))?.listingIds).toEqual(["l2"]);
  });
});
```

`lib/repositories/mock/mock-booking-repository.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { calculatePriceBreakdown } from "@/lib/reservation/pricing";
import { mockBookingRepository as repo } from "./mock-booking-repository";
import type { NewBooking } from "../booking-repository";

const newUser = () => `u-${crypto.randomUUID()}`;
const newListing = () => `l-test-${crypto.randomUUID()}`;

function stay(listingId: string, checkIn: string, checkOut: string): NewBooking {
  return { listingId, checkIn, checkOut, guests: { adults: 1, children: 0 }, priceBreakdown: calculatePriceBreakdown(100, 1) };
}

describe("mockBookingRepository", () => {
  test("creates a confirmed booking only its guest can read", async () => {
    const guest = newUser();
    const created = await repo.create(guest, stay(newListing(), "2030-01-01", "2030-01-04"));

    expect(created).toMatchObject({ status: "confirmed" });
    if (created === "unavailable") throw new Error("unexpected");
    expect(await repo.findById(guest, created.id)).toEqual(created);
    expect(await repo.findById(newUser(), created.id)).toBeNull();
    expect(await repo.listForUser(guest)).toEqual([created]);
  });

  test("rejects overlapping nights on the same listing, by any guest", async () => {
    const listing = newListing();
    await repo.create(newUser(), stay(listing, "2030-02-10", "2030-02-15"));

    expect(await repo.create(newUser(), stay(listing, "2030-02-14", "2030-02-16"))).toBe("unavailable");
    expect(await repo.create(newUser(), stay(listing, "2030-02-08", "2030-02-11"))).toBe("unavailable");
  });

  test("allows back-to-back stays and other listings on the same dates", async () => {
    const listing = newListing();
    await repo.create(newUser(), stay(listing, "2030-03-10", "2030-03-15"));

    expect(await repo.create(newUser(), stay(listing, "2030-03-15", "2030-03-18"))).not.toBe("unavailable");
    expect(await repo.create(newUser(), stay(listing, "2030-03-05", "2030-03-10"))).not.toBe("unavailable");
    expect(await repo.create(newUser(), stay(newListing(), "2030-03-10", "2030-03-15"))).not.toBe("unavailable");
  });
});
```

`lib/bookings/schemas.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { MAX_NIGHTS, bookingRequestSchema, nightsBetweenDates } from "./schemas";

const DAY = 86_400_000;
const daysFromToday = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);

function firstError(input: Record<string, unknown>): string | undefined {
  const parsed = bookingRequestSchema.safeParse(input);
  return parsed.success ? undefined : parsed.error.issues[0]?.message;
}

const valid = { listingId: "l1", checkIn: daysFromToday(10), checkOut: daysFromToday(13), adults: 2, children: 1 };

describe("bookingRequestSchema", () => {
  test("accepts a valid request, coercing query-string numbers", () => {
    const parsed = bookingRequestSchema.parse({ ...valid, adults: "2", children: "1" });
    expect(parsed).toEqual(valid);
  });

  test("defaults children to 0", () => {
    const withoutChildren = { listingId: valid.listingId, checkIn: valid.checkIn, checkOut: valid.checkOut, adults: 2 };
    expect(bookingRequestSchema.parse(withoutChildren).children).toBe(0);
  });

  test("allows check-in today (one day of slack for timezones)", () => {
    expect(firstError({ ...valid, checkIn: daysFromToday(-1), checkOut: daysFromToday(1) })).toBeUndefined();
  });

  test.each([
    [{ checkIn: daysFromToday(-3), checkOut: daysFromToday(1) }, "Check-in can't be in the past"],
    [{ checkOut: valid.checkIn }, "Check-out must be after check-in"],
    [{ checkOut: daysFromToday(10 + MAX_NIGHTS + 1) }, `Stays can be at most ${MAX_NIGHTS} nights`],
    [{ adults: 0 }, "At least 1 adult is required"],
    [{ checkIn: "2030-02-30" }, "Enter a real date"],
    [{ checkIn: "10/01/2030" }, "Dates must be YYYY-MM-DD"],
  ])("rejects %o", (override, message) => {
    expect(firstError({ ...valid, ...override })).toBe(message);
  });
});

test("nightsBetweenDates counts calendar nights", () => {
  expect(nightsBetweenDates("2030-03-30", "2030-04-02")).toBe(3);
});
```

Append to `lib/repositories/index.test.ts`, inside its `describe`. The file already imports `vi` and stubs env.

```ts
  test("wishlists and bookings are the frontend mocks in both modes", () => {
    vi.stubEnv("DATA_SOURCE", "mock");
    const mock = getRepositories();
    vi.stubEnv("DATA_SOURCE", "api");
    vi.stubEnv("API_HTTP", "http://backend.test");
    const api = getRepositories();

    expect(api.wishlists).toBe(mock.wishlists);
    expect(api.bookings).toBe(mock.bookings);
  });
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run lib/repositories lib/bookings`
Expected: FAIL. The new modules can't be resolved, and `mock.wishlists` is undefined.

- [ ] **Step 3: Implement**

Append to `lib/types.ts` (with `import type { PriceBreakdown } from "@/lib/reservation/pricing";` at the top of the file):

```ts
export interface Wishlist {
  id: string;
  name: string;
  listingIds: string[];
  createdAt: string;
}

export interface Booking {
  id: string;
  listingId: string;
  /** YYYY-MM-DD */
  checkIn: string;
  /** YYYY-MM-DD */
  checkOut: string;
  guests: { adults: number; children: number };
  priceBreakdown: PriceBreakdown;
  status: "confirmed";
  createdAt: string;
}
```

`lib/repositories/wishlist-repository.ts`:

```ts
import type { Wishlist } from "@/lib/types";

// Every method is scoped by userId: one guest can never read or change another guest's lists.
export interface WishlistRepository {
  /** Newest first. */
  listForUser(userId: string): Promise<Wishlist[]>;
  findById(userId: string, id: string): Promise<Wishlist | null>;
  create(userId: string, name: string): Promise<Wishlist>;
  /** Null when the list isn't the user's; adding a listing twice is a no-op. */
  addListing(userId: string, wishlistId: string, listingId: string): Promise<Wishlist | null>;
  /** Removes the listing from every list of the user. */
  removeListing(userId: string, listingId: string): Promise<void>;
}
```

`lib/repositories/booking-repository.ts`:

```ts
import type { Booking } from "@/lib/types";

export type NewBooking = Omit<Booking, "id" | "status" | "createdAt">;

export interface BookingRepository {
  listForUser(userId: string): Promise<Booking[]>;
  findById(userId: string, id: string): Promise<Booking | null>;
  /** "unavailable" when the nights [checkIn, checkOut) overlap another booking of the same listing, by any guest. */
  create(userId: string, booking: NewBooking): Promise<Booking | "unavailable">;
}
```

`lib/repositories/mock/mock-wishlist-repository.ts`:

```ts
import type { Wishlist } from "@/lib/types";
import type { WishlistRepository } from "../wishlist-repository";

// In memory, per user; on globalThis so dev hot reload keeps it. A server restart clears it.
const store: Map<string, Wishlist[]> = ((globalThis as { __mockWishlists?: Map<string, Wishlist[]> }).__mockWishlists ??=
  new Map());

const listsOf = (userId: string): Wishlist[] => store.get(userId) ?? [];

export const mockWishlistRepository: WishlistRepository = {
  async listForUser(userId) {
    return listsOf(userId);
  },

  async findById(userId, id) {
    return listsOf(userId).find((w) => w.id === id) ?? null;
  },

  async create(userId, name) {
    const wishlist: Wishlist = { id: crypto.randomUUID(), name, listingIds: [], createdAt: new Date().toISOString() };
    store.set(userId, [wishlist, ...listsOf(userId)]);
    return wishlist;
  },

  async addListing(userId, wishlistId, listingId) {
    const current = listsOf(userId).find((w) => w.id === wishlistId);
    if (!current) return null;
    if (current.listingIds.includes(listingId)) return current;
    const updated: Wishlist = { ...current, listingIds: [...current.listingIds, listingId] };
    store.set(userId, listsOf(userId).map((w) => (w.id === wishlistId ? updated : w)));
    return updated;
  },

  async removeListing(userId, listingId) {
    store.set(
      userId,
      listsOf(userId).map((w) =>
        w.listingIds.includes(listingId) ? { ...w, listingIds: w.listingIds.filter((id) => id !== listingId) } : w,
      ),
    );
  },
};
```

`lib/repositories/mock/mock-booking-repository.ts`:

```ts
import type { Booking } from "@/lib/types";
import type { BookingRepository, NewBooking } from "../booking-repository";

// In memory, per user; on globalThis so dev hot reload keeps it. A server restart clears it.
const store: Map<string, Booking[]> = ((globalThis as { __mockBookings?: Map<string, Booking[]> }).__mockBookings ??=
  new Map());

const bookingsOf = (userId: string): Booking[] => store.get(userId) ?? [];

// Nights are half-open [checkIn, checkOut): one guest's check-out day can be the next guest's check-in day.
function overlaps(a: Pick<Booking, "checkIn" | "checkOut">, b: Pick<Booking, "checkIn" | "checkOut">): boolean {
  return a.checkIn < b.checkOut && b.checkIn < a.checkOut;
}

export const mockBookingRepository: BookingRepository = {
  async listForUser(userId) {
    return bookingsOf(userId);
  },

  async findById(userId, id) {
    return bookingsOf(userId).find((b) => b.id === id) ?? null;
  },

  async create(userId, booking: NewBooking) {
    const taken = [...store.values()].flat().some((b) => b.listingId === booking.listingId && overlaps(b, booking));
    if (taken) return "unavailable";
    const created: Booking = { ...booking, id: crypto.randomUUID(), status: "confirmed", createdAt: new Date().toISOString() };
    store.set(userId, [...bookingsOf(userId), created]);
    return created;
  },
};
```

`lib/bookings/schemas.ts`:

```ts
import { z } from "zod";

export const MAX_NIGHTS = 30;
const MS_PER_DAY = 86_400_000;

function isRealDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must be YYYY-MM-DD").refine(isRealDate, "Enter a real date");

/** Nights between two YYYY-MM-DD dates. */
export function nightsBetweenDates(checkIn: string, checkOut: string): number {
  return Math.round((Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / MS_PER_DAY);
}

/**
 * A booking request, from a JSON body or the /book page's query string (so numbers may arrive as strings).
 * The listing-dependent rules (it exists, guest cap) are checked where the listing is loaded.
 */
export const bookingRequestSchema = z
  .object({
    listingId: z.string().min(1).max(50),
    checkIn: isoDate,
    checkOut: isoDate,
    adults: z.coerce.number().int().min(1, "At least 1 adult is required").max(16),
    children: z.coerce.number().int().min(0).max(15).default(0),
  })
  .superRefine((value, ctx) => {
    // One day of slack, so a guest whose "today" is still yesterday in UTC can book it.
    const earliest = new Date(Date.now() - MS_PER_DAY).toISOString().slice(0, 10);
    if (value.checkIn < earliest) {
      ctx.addIssue({ code: "custom", path: ["checkIn"], message: "Check-in can't be in the past" });
    }
    const nights = nightsBetweenDates(value.checkIn, value.checkOut);
    if (nights <= 0) {
      ctx.addIssue({ code: "custom", path: ["checkOut"], message: "Check-out must be after check-in" });
    } else if (nights > MAX_NIGHTS) {
      ctx.addIssue({ code: "custom", path: ["checkOut"], message: `Stays can be at most ${MAX_NIGHTS} nights` });
    }
  });

export type BookingRequest = z.infer<typeof bookingRequestSchema>;
```

In `lib/repositories/index.ts`:
- import the two interfaces and the two mocks;
- define and export `AppRepositories`;
- give `mockRepositories` the account repositories;
- make `getRepositories()` return `AppRepositories`.

The file becomes:

```ts
import { createHttpRepositories, type Repositories } from "./http/http-repositories";
import type { BookingRepository } from "./booking-repository";
import type { WishlistRepository } from "./wishlist-repository";
import { mockBookingRepository } from "./mock/mock-booking-repository";
import { mockCityRepository } from "./mock/mock-city-repository";
import { mockExperienceRepository } from "./mock/mock-experience-repository";
import { mockHostRepository } from "./mock/mock-host-repository";
import { mockListingRepository } from "./mock/mock-listing-repository";
import { mockReviewRepository } from "./mock/mock-review-repository";
import { mockServiceRepository } from "./mock/mock-service-repository";
import { mockWishlistRepository } from "./mock/mock-wishlist-repository";

export type { Repositories };

export interface AppRepositories extends Repositories {
  wishlists: WishlistRepository;
  bookings: BookingRepository;
}

// Wishlists and bookings are frontend mocks in both data modes: the backend doesn't serve them yet.
const accountRepositories = { wishlists: mockWishlistRepository, bookings: mockBookingRepository };

const mockRepositories: AppRepositories = {
  listings: mockListingRepository,
  experiences: mockExperienceRepository,
  services: mockServiceRepository,
  hosts: mockHostRepository,
  reviews: mockReviewRepository,
  cities: mockCityRepository,
  ...accountRepositories,
};

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
  return { ...createHttpRepositories(baseUrl), ...accountRepositories };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run lib/repositories lib/bookings && npx tsc --noEmit && npm run lint`
Expected: all PASS (including every existing `index.test.ts` case); tsc and lint are clean.

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts lib/repositories lib/bookings
git commit -m "feat: add wishlist and booking repositories with the booking rules

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Wishlist and booking API route handlers

**Files:**
- Create: `lib/wishlists/schemas.ts`
- Create: `app/api/wishlists/route.ts`, `app/api/wishlists/[id]/listings/route.ts`, `app/api/wishlists/saved/[listingId]/route.ts`, `app/api/bookings/route.ts`
- Test: `app/api/wishlists/wishlist-routes.test.ts`, `app/api/bookings/route.test.ts`

**Interfaces:**
- Consumes (Tasks 1–2):
  - `sessionFromRequest`, `unauthorized`, `jsonError`, `parseBody`, `ok`;
  - `getRepositories()` with `.wishlists`, `.bookings`, `.listings.findById`;
  - `bookingRequestSchema`, `nightsBetweenDates`, `calculatePriceBreakdown`;
  - test helpers `sessionCookieHeader`, `jsonRequest`.
- Produces:
  - `createWishlistSchema` (`{ name: string (trimmed 1–50), listingId?: string }`) and `addListingSchema`, which the save dialog uses in Task 5;
  - the endpoints `GET/POST /api/wishlists`, `POST /api/wishlists/[id]/listings`, `DELETE /api/wishlists/saved/[listingId]` and `POST /api/bookings`.

- [ ] **Step 1: Write the failing tests**

`app/api/wishlists/wishlist-routes.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, test } from "vitest";
import { GET, POST } from "./route";
import { POST as addListing } from "./[id]/listings/route";
import { DELETE as unsave } from "./saved/[listingId]/route";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { jsonRequest, sessionCookieHeader } from "@/lib/auth/test-helpers";

const url = "http://localhost/api/wishlists";
const params = <T,>(value: T) => ({ params: Promise.resolve(value) });

async function createList(cookie: string, body: object) {
  const res = await POST(jsonRequest(url, "POST", body, cookie));
  return { res, body: await res.json() };
}

describe("wishlist API", () => {
  test("every endpoint needs a session", async () => {
    expect((await GET(new Request(url))).status).toBe(401);
    expect((await POST(jsonRequest(url, "POST", { name: "x" }))).status).toBe(401);
    expect((await addListing(jsonRequest(`${url}/w/listings`, "POST", { listingId: "l1" }), params({ id: "w" }))).status).toBe(401);
    const res = await unsave(jsonRequest(`${url}/saved/l1`, "DELETE"), params({ listingId: "l1" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false, error: "Log in to continue" });
  });

  test("a garbage session cookie gets 401", async () => {
    expect((await GET(new Request(url, { headers: { cookie: `${SESSION_COOKIE}=garbage` } }))).status).toBe(401);
  });

  test("creates a list, with or without a first listing, and lists it", async () => {
    const cookie = sessionCookieHeader();
    const empty = await createList(cookie, { name: "  Summer  " });
    const withListing = await createList(cookie, { name: "Cabins", listingId: "l1" });

    expect(empty.res.status).toBe(201);
    expect(empty.body.data).toMatchObject({ name: "Summer", listingIds: [] });
    expect(withListing.body.data.listingIds).toEqual(["l1"]);
    const all = await (await GET(new Request(url, { headers: { cookie } }))).json();
    expect(all.data.map((w: { name: string }) => w.name)).toEqual(["Cabins", "Summer"]);
  });

  test.each([
    [{ name: "" }, "Give your wishlist a name"],
    [{ name: "   " }, "Give your wishlist a name"],
    [{ name: "x".repeat(51) }, "Wishlist names can be at most 50 characters"],
  ])("rejects the name in %o", async (body, message) => {
    const { res, body: json } = await createList(sessionCookieHeader(), body);
    expect(res.status).toBe(400);
    expect(json.error).toBe(message);
  });

  test("a new list with an unknown listing is 404", async () => {
    const { res, body } = await createList(sessionCookieHeader(), { name: "X", listingId: "l999" });
    expect(res.status).toBe(404);
    expect(body.error).toBe("Listing 'l999' was not found");
  });

  test("adds a listing to a list", async () => {
    const cookie = sessionCookieHeader();
    const { body } = await createList(cookie, { name: "Trip" });

    const res = await addListing(jsonRequest(`${url}/${body.data.id}/listings`, "POST", { listingId: "l2" }, cookie), params({ id: body.data.id }));

    expect(res.status).toBe(200);
    expect((await res.json()).data.listingIds).toEqual(["l2"]);
  });

  test("another user's wishlist is 404, and so is an unknown listing", async () => {
    const { body } = await createList(sessionCookieHeader(), { name: "Private" });
    const stranger = sessionCookieHeader();

    const foreign = await addListing(jsonRequest(`${url}/${body.data.id}/listings`, "POST", { listingId: "l2" }, stranger), params({ id: body.data.id }));
    expect(foreign.status).toBe(404);
    expect((await foreign.json()).error).toBe("Wishlist not found");

    const owner = sessionCookieHeader();
    const own = await createList(owner, { name: "Mine" });
    const unknown = await addListing(jsonRequest(`${url}/${own.body.data.id}/listings`, "POST", { listingId: "l999" }, owner), params({ id: own.body.data.id }));
    expect(unknown.status).toBe(404);
  });

  test("unsaving removes the listing from every list", async () => {
    const cookie = sessionCookieHeader();
    await createList(cookie, { name: "A", listingId: "l3" });
    await createList(cookie, { name: "B", listingId: "l3" });

    const res = await unsave(jsonRequest(`${url}/saved/l3`, "DELETE", undefined, cookie), params({ listingId: "l3" }));

    expect(res.status).toBe(200);
    const all = await (await GET(new Request(url, { headers: { cookie } }))).json();
    expect(all.data.every((w: { listingIds: string[] }) => w.listingIds.length === 0)).toBe(true);
  });
});
```

`app/api/bookings/route.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, test } from "vitest";
import { POST } from "./route";
import { jsonRequest, sessionCookieHeader } from "@/lib/auth/test-helpers";
import { calculatePriceBreakdown } from "@/lib/reservation/pricing";
import { listings } from "@/lib/data/listings";

const url = "http://localhost/api/bookings";
const DAY = 86_400_000;
const daysFromToday = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
// l1 in the mock data; each test books its own far-apart dates, since bookings are shared across users.
const l1 = listings.find((l) => l.id === "l1")!;

function book(body: Record<string, unknown>, cookie: string | undefined = sessionCookieHeader()) {
  return POST(jsonRequest(url, "POST", body, cookie));
}

describe("POST /api/bookings", () => {
  test("needs a session", async () => {
    expect((await book({}, undefined)).status).toBe(401);
  });

  test("computes the price on the server and ignores a client total", async () => {
    const res = await book({ listingId: "l1", checkIn: daysFromToday(100), checkOut: daysFromToday(103), adults: 2, children: 0, total: 1 });

    expect(res.status).toBe(201);
    const booking = (await res.json()).data;
    expect(booking).toMatchObject({ listingId: "l1", status: "confirmed", guests: { adults: 2, children: 0 } });
    expect(booking.priceBreakdown).toEqual(calculatePriceBreakdown(l1.pricePerNight, 3));
  });

  test.each([
    [{ checkIn: daysFromToday(-5), checkOut: daysFromToday(2) }, "Check-in can't be in the past"],
    [{ checkIn: daysFromToday(120), checkOut: daysFromToday(120) }, "Check-out must be after check-in"],
    [{ checkIn: daysFromToday(120), checkOut: daysFromToday(151) }, "Stays can be at most 30 nights"],
    [{ checkIn: daysFromToday(120), checkOut: daysFromToday(121), adults: 0 }, "At least 1 adult is required"],
  ])("rejects %o with 400", async (override, message) => {
    const res = await book({ listingId: "l1", adults: 1, ...override });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(message);
  });

  test("rejects more guests than the listing allows", async () => {
    const res = await book({ listingId: "l1", checkIn: daysFromToday(130), checkOut: daysFromToday(131), adults: l1.maxGuests, children: 1 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(`This place allows at most ${l1.maxGuests} guests`);
  });

  test("an unknown listing is 404", async () => {
    const res = await book({ listingId: "l999", checkIn: daysFromToday(140), checkOut: daysFromToday(141), adults: 1 });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Listing 'l999' was not found");
  });

  test("overlapping dates get 409", async () => {
    await book({ listingId: "l1", checkIn: daysFromToday(200), checkOut: daysFromToday(205), adults: 1 });

    const res = await book({ listingId: "l1", checkIn: daysFromToday(203), checkOut: daysFromToday(207), adults: 1 });

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Those dates are no longer available");
  });
});
```

This test imports `@/lib/data/listings` directly. That's allowed: the ESLint guard covers only `repositories/mock/*`.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run app/api/wishlists app/api/bookings`
Expected: FAIL, because the route modules can't be resolved.

- [ ] **Step 3: Implement**

`lib/wishlists/schemas.ts`:

```ts
import { z } from "zod";

export const WISHLIST_NAME_MAX = 50;

export const wishlistNameSchema = z
  .string()
  .trim()
  .min(1, "Give your wishlist a name")
  .max(WISHLIST_NAME_MAX, `Wishlist names can be at most ${WISHLIST_NAME_MAX} characters`);

export const createWishlistSchema = z.object({
  name: wishlistNameSchema,
  listingId: z.string().min(1).max(50).optional(),
});

export const addListingSchema = z.object({ listingId: z.string().min(1).max(50) });
```

`app/api/wishlists/route.ts`:

```ts
import { ok } from "@/lib/api/envelope";
import { jsonError, parseBody, unauthorized } from "@/lib/api/request";
import { sessionFromRequest } from "@/lib/auth/session";
import { getRepositories } from "@/lib/repositories";
import { createWishlistSchema } from "@/lib/wishlists/schemas";

export async function GET(request: Request): Promise<Response> {
  const user = sessionFromRequest(request);
  if (!user) return unauthorized();
  return Response.json(ok(await getRepositories().wishlists.listForUser(user.id)));
}

export async function POST(request: Request): Promise<Response> {
  const user = sessionFromRequest(request);
  if (!user) return unauthorized();
  const body = await parseBody(request, createWishlistSchema);
  if ("error" in body) return body.error;

  const repos = getRepositories();
  const { name, listingId } = body.data;
  if (listingId && !(await repos.listings.findById(listingId))) {
    return jsonError(`Listing '${listingId}' was not found`, 404);
  }

  const created = await repos.wishlists.create(user.id, name);
  const wishlist = listingId ? await repos.wishlists.addListing(user.id, created.id, listingId) : created;
  return Response.json(ok(wishlist), { status: 201 });
}
```

`app/api/wishlists/[id]/listings/route.ts`:

```ts
import { ok } from "@/lib/api/envelope";
import { jsonError, parseBody, unauthorized } from "@/lib/api/request";
import { sessionFromRequest } from "@/lib/auth/session";
import { getRepositories } from "@/lib/repositories";
import { addListingSchema } from "@/lib/wishlists/schemas";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = sessionFromRequest(request);
  if (!user) return unauthorized();
  const body = await parseBody(request, addListingSchema);
  if ("error" in body) return body.error;

  const { id } = await params;
  const repos = getRepositories();
  if (!(await repos.listings.findById(body.data.listingId))) {
    return jsonError(`Listing '${body.data.listingId}' was not found`, 404);
  }
  const wishlist = await repos.wishlists.addListing(user.id, id, body.data.listingId);
  return wishlist ? Response.json(ok(wishlist)) : jsonError("Wishlist not found", 404);
}
```

`app/api/wishlists/saved/[listingId]/route.ts`:

```ts
import { ok } from "@/lib/api/envelope";
import { unauthorized } from "@/lib/api/request";
import { sessionFromRequest } from "@/lib/auth/session";
import { getRepositories } from "@/lib/repositories";

/** Unsaves a listing: removes it from every one of the user's wishlists. */
export async function DELETE(request: Request, { params }: { params: Promise<{ listingId: string }> }): Promise<Response> {
  const user = sessionFromRequest(request);
  if (!user) return unauthorized();
  const { listingId } = await params;
  await getRepositories().wishlists.removeListing(user.id, listingId);
  return Response.json(ok(null));
}
```

`app/api/bookings/route.ts`:

```ts
import { ok } from "@/lib/api/envelope";
import { jsonError, parseBody, unauthorized } from "@/lib/api/request";
import { sessionFromRequest } from "@/lib/auth/session";
import { bookingRequestSchema, nightsBetweenDates } from "@/lib/bookings/schemas";
import { getRepositories } from "@/lib/repositories";
import { calculatePriceBreakdown } from "@/lib/reservation/pricing";

export async function POST(request: Request): Promise<Response> {
  const user = sessionFromRequest(request);
  if (!user) return unauthorized();
  const body = await parseBody(request, bookingRequestSchema);
  if ("error" in body) return body.error;

  const { listingId, checkIn, checkOut, adults, children } = body.data;
  const repos = getRepositories();
  const listing = await repos.listings.findById(listingId);
  if (!listing) return jsonError(`Listing '${listingId}' was not found`, 404);
  if (adults + children > listing.maxGuests) {
    return jsonError(`This place allows at most ${listing.maxGuests} guests`, 400);
  }

  // Priced here from the listing, never from anything the client sent.
  const priceBreakdown = calculatePriceBreakdown(listing.pricePerNight, nightsBetweenDates(checkIn, checkOut));
  const booking = await repos.bookings.create(user.id, { listingId, checkIn, checkOut, guests: { adults, children }, priceBreakdown });
  if (booking === "unavailable") return jsonError("Those dates are no longer available", 409);
  return Response.json(ok(booking), { status: 201 });
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run app/api && npx tsc --noEmit && npm run lint`
Expected: all PASS, including the existing listings/experiences/services route tests; tsc and lint are clean.

- [ ] **Step 5: Commit**

```bash
git add lib/wishlists app/api/wishlists app/api/bookings
git commit -m "feat: add the wishlist and booking API endpoints

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Client session, account menu and the login/register flow

**Files:**
- Modify: `lib/api-client/schemas.ts` (append)
- Create: `lib/api-client/request.ts`, `lib/api-client/auth.ts`
- Create: `components/features/auth/session-provider.tsx`, `components/features/auth/account-menu.tsx`
- Modify: `app/providers.tsx`, `components/design-system/top-nav.tsx`, `components/features/auth/login-form.tsx`, `components/features/auth/register-form.tsx`, `app/login/page.tsx`, `app/register/page.tsx`
- Test:
  - Create: `lib/api-client/request.test.ts`, `components/features/auth/account-menu.test.tsx`
  - Modify: `components/design-system/top-nav.test.tsx`, `components/features/auth/login-form.test.tsx`, `components/features/auth/register-form.test.tsx`

**Interfaces:**
- Consumes: the Task 1 endpoints; `User`; `loginSchema`/`registerSchema` and their `LoginInput`/`RegisterInput` types; `safeNextPath`.
- Produces:
  - `callApi<T extends z.ZodType>(path, schema, init?): Promise<z.infer<T>>`, which throws `Error(<envelope error>)`;
  - `userSchema`, `wishlistSchema`, `bookingSchema` in `lib/api-client/schemas.ts`;
  - `SESSION_QUERY_KEY`, `fetchSession()`, `login(input)`, `register(input)`, `logout()` in `lib/api-client/auth.ts`;
  - `SessionState { user: User | null; isLoading: boolean; refresh(): Promise<void>; logout(): Promise<void> }`, `SessionContext`, `SessionProvider`, and `useSessionState(): SessionState | null`, which returns null outside the provider;
  - `LoginForm` and `RegisterForm` with an optional `next?: string` prop (default `/`).

- [ ] **Step 1: Write the failing tests**

`lib/api-client/request.test.ts`:

```ts
import { afterEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { callApi } from "./request";

afterEach(() => vi.unstubAllGlobals());

function respond(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("callApi", () => {
  test("returns the envelope's data and sends JSON", async () => {
    const fetchMock = respond(200, { success: true, data: { id: "x" } });

    await expect(callApi("/api/thing", z.object({ id: z.string() }), { method: "POST", body: "{}" })).resolves.toEqual({ id: "x" });
    expect(fetchMock.mock.calls[0][1].headers["content-type"]).toBe("application/json");
  });

  test("throws the envelope's error message on failure", async () => {
    respond(409, { success: false, error: "Those dates are no longer available" });
    await expect(callApi("/api/bookings", z.object({}))).rejects.toThrow("Those dates are no longer available");
  });

  test("throws a generic message when the response isn't an envelope", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>", { status: 500 })));
    await expect(callApi("/api/thing", z.object({}))).rejects.toThrow("Unexpected response from /api/thing");
  });
});
```

`components/features/auth/account-menu.test.tsx`:

```tsx
import { describe, expect, test, vi } from "vitest";
import { render, screen, userEvent } from "@/lib/test-utils";
import { AccountMenu } from "./account-menu";
import { SessionContext, type SessionState } from "./session-provider";

function renderWith(state: SessionState | null) {
  return render(
    state ? <SessionContext.Provider value={state}><AccountMenu /></SessionContext.Provider> : <AccountMenu />,
  );
}

const loggedIn = (logout = vi.fn()): SessionState => ({
  user: { id: "u-ana@example.com", name: "ana", email: "ana@example.com" },
  isLoading: false,
  refresh: vi.fn(),
  logout,
});

describe("AccountMenu", () => {
  test("logged out (or outside the provider): offers log in and sign up", async () => {
    renderWith(null);
    await userEvent.click(screen.getByRole("button", { name: "Account menu" }));

    expect(screen.getByRole("menuitem", { name: "Log in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("menuitem", { name: "Sign up" })).toHaveAttribute("href", "/register");
  });

  test("logged in: shows the initial and links to wishlists and trips", async () => {
    renderWith(loggedIn());
    const button = screen.getByRole("button", { name: "Account menu" });
    expect(button).toHaveTextContent("A");

    await userEvent.click(button);

    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menuitem", { name: "Wishlists" })).toHaveAttribute("href", "/wishlists");
    expect(screen.getByRole("menuitem", { name: "Trips" })).toHaveAttribute("href", "/trips");
  });

  test("log out calls the session's logout", async () => {
    const logout = vi.fn();
    renderWith(loggedIn(logout));
    await userEvent.click(screen.getByRole("button", { name: "Account menu" }));

    await userEvent.click(screen.getByRole("menuitem", { name: "Log out" }));

    expect(logout).toHaveBeenCalled();
  });
});
```

`components/design-system/top-nav.test.tsx`: replace the three tests that assert an account **link** (`renders the account menu link`, `renders menu and account icons inside the account link`, `the account control links to the login page`) with:

```tsx
  test("renders the account menu button with its menu and account icons", () => {
    render(<TopNav active="homes" />);
    const button = screen.getByRole("button", { name: /account menu/i });
    expect(button.querySelectorAll("svg.lucide")).toHaveLength(2);
  });
```

Keep the two product-tab tests as they are.

`components/features/auth/login-form.test.tsx` in full:

```tsx
import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, userEvent, waitFor } from "@/lib/test-utils";
import { LoginForm } from "./login-form";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const login = vi.fn();
vi.mock("@/lib/api-client/auth", () => ({ login: (input: unknown) => login(input) }));

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  login.mockReset();
});

async function fillAndSubmit(email: string) {
  await userEvent.type(screen.getByLabelText("Email"), email);
  await userEvent.type(screen.getByLabelText("Password"), "supersecret");
  await userEvent.click(screen.getByRole("button", { name: "Log in" }));
}

describe("LoginForm", () => {
  test("shows a validation error for an invalid email and does not call the API", async () => {
    render(<LoginForm />);
    await fillAndSubmit("nope");
    expect(screen.getByText("Enter a valid email address")).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  test("logs in and navigates home by default", async () => {
    login.mockResolvedValue({ id: "u-a@b.com", name: "a", email: "a@b.com" });
    render(<LoginForm />);
    await fillAndSubmit("a@b.com");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(login).toHaveBeenCalledWith({ email: "a@b.com", password: "supersecret" });
    expect(refresh).toHaveBeenCalled();
  });

  test("goes back to the next path after logging in", async () => {
    login.mockResolvedValue({ id: "u-a@b.com", name: "a", email: "a@b.com" });
    render(<LoginForm next="/trips" />);
    await fillAndSubmit("a@b.com");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/trips"));
  });

  test("shows the API error and stays on the page", async () => {
    login.mockRejectedValue(new Error("Something went wrong"));
    render(<LoginForm />);
    await fillAndSubmit("a@b.com");
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
    expect(push).not.toHaveBeenCalled();
  });

  test("keeps the next path on the sign-up link", () => {
    render(<LoginForm next="/trips" />);
    expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/register?next=%2Ftrips");
  });
});
```

`components/features/auth/register-form.test.tsx` in full:

```tsx
import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, userEvent, waitFor } from "@/lib/test-utils";
import { RegisterForm } from "./register-form";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const register = vi.fn();
vi.mock("@/lib/api-client/auth", () => ({ register: (input: unknown) => register(input) }));

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  register.mockReset();
});

async function fill(confirmPassword: string) {
  await userEvent.type(screen.getByLabelText("Name"), "Ana");
  await userEvent.type(screen.getByLabelText("Email"), "a@b.com");
  await userEvent.type(screen.getByLabelText("Password"), "supersecret");
  await userEvent.type(screen.getByLabelText("Confirm password"), confirmPassword);
  await userEvent.click(screen.getByRole("button", { name: "Sign up" }));
}

describe("RegisterForm", () => {
  test("shows an error when passwords do not match", async () => {
    render(<RegisterForm />);
    await fill("different1");
    expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  test("registers and goes to the next path", async () => {
    register.mockResolvedValue({ id: "u-a@b.com", name: "Ana", email: "a@b.com" });
    render(<RegisterForm next="/wishlists" />);
    await fill("supersecret");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/wishlists"));
    expect(register).toHaveBeenCalledWith({ name: "Ana", email: "a@b.com", password: "supersecret", confirmPassword: "supersecret" });
  });

  test("shows the API error", async () => {
    register.mockRejectedValue(new Error("Something went wrong"));
    render(<RegisterForm />);
    await fill("supersecret");
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run lib/api-client/request.test.ts components/features/auth components/design-system/top-nav.test.tsx`
Expected: FAIL. `./request` and `./account-menu` can't be resolved, TopNav still renders a link, and the forms don't call the API.

- [ ] **Step 3: Implement**

Append to `lib/api-client/schemas.ts`:

```ts
export const userSchema = z.object({ id: z.string(), name: z.string(), email: z.string() });

const priceBreakdownSchema = z.object({
  lineItems: z.array(z.object({ label: z.string(), amount: z.number() })),
  total: z.number(),
});

export const wishlistSchema = z.object({
  id: z.string(),
  name: z.string(),
  listingIds: z.array(z.string()),
  createdAt: z.string(),
});

export const bookingSchema = z.object({
  id: z.string(),
  listingId: z.string(),
  checkIn: z.string(),
  checkOut: z.string(),
  guests: z.object({ adults: z.number(), children: z.number() }),
  priceBreakdown: priceBreakdownSchema,
  status: z.literal("confirmed"),
  createdAt: z.string(),
});
```

`lib/api-client/request.ts`:

```ts
import type { z } from "zod";
import { envelopeSchema } from "./schemas";

/** Calls one of our /api route handlers: returns the envelope's data, or throws with its error message. */
export async function callApi<T extends z.ZodType>(path: string, schema: T, init?: RequestInit): Promise<z.infer<T>> {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const body: unknown = await res.json().catch(() => undefined);
  const envelope = envelopeSchema(schema).safeParse(body);
  if (!envelope.success) throw new Error(`Unexpected response from ${path}`);
  if (!res.ok || !envelope.data.success) throw new Error(envelope.data.error ?? "Something went wrong");
  return envelope.data.data as z.infer<T>;
}
```

`lib/api-client/auth.ts`:

```ts
import { z } from "zod";
import type { LoginInput, RegisterInput } from "@/lib/auth/schemas";
import type { User } from "@/lib/types";
import { callApi } from "./request";
import { userSchema } from "./schemas";

export const SESSION_QUERY_KEY = ["session"] as const;

export function fetchSession(): Promise<User | null> {
  return callApi("/api/auth/session", userSchema.nullable());
}

export function login(input: LoginInput): Promise<User> {
  return callApi("/api/auth/login", userSchema, { method: "POST", body: JSON.stringify(input) });
}

export function register(input: RegisterInput): Promise<User> {
  return callApi("/api/auth/register", userSchema, { method: "POST", body: JSON.stringify(input) });
}

export async function logout(): Promise<void> {
  await callApi("/api/auth/logout", z.null(), { method: "POST" });
}
```

`components/features/auth/session-provider.tsx`:

```tsx
"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SESSION_QUERY_KEY, fetchSession, logout as logoutRequest } from "@/lib/api-client/auth";
import type { User } from "@/lib/types";

export interface SessionState {
  user: User | null;
  isLoading: boolean;
  /** Re-reads the session, e.g. after logging in. */
  refresh: () => Promise<void>;
  /** Ends the session and reloads the app on /, which resets every client cache. */
  logout: () => Promise<void>;
}

export const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: SESSION_QUERY_KEY, queryFn: fetchSession, staleTime: 0, retry: false });

  const value: SessionState = {
    user: data ?? null,
    isLoading,
    refresh: () => queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY }),
    async logout() {
      await logoutRequest();
      window.location.assign("/");
    },
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** The session, or null outside a SessionProvider (isolated component tests), which callers treat as logged out. */
export function useSessionState(): SessionState | null {
  return useContext(SessionContext);
}
```

`components/features/auth/account-menu.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, UserCircle } from "lucide-react";
import { useSessionState } from "./session-provider";

const itemClass = "px-4 py-3 text-left text-body-sm text-ink hover:bg-surface-soft";

export function AccountMenu() {
  const session = useSessionState();
  const user = session?.user ?? null;
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((isOpen) => !isOpen)}
        className="flex h-10 items-center gap-2 rounded-full border border-hairline px-3"
      >
        <Menu aria-hidden className="size-4 text-ink" />
        {user ? (
          <span aria-hidden className="flex size-7 items-center justify-center rounded-full bg-rausch text-caption text-on-primary">
            {user.name.charAt(0).toUpperCase()}
          </span>
        ) : (
          <UserCircle aria-hidden className="size-7 text-muted" />
        )}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 z-20 flex w-56 flex-col rounded-sm bg-canvas py-2 shadow-airbnb">
          {user ? (
            <>
              <p className="px-4 py-2 text-body-sm text-muted">{user.email}</p>
              <Link role="menuitem" href="/wishlists" className={itemClass}>Wishlists</Link>
              <Link role="menuitem" href="/trips" className={itemClass}>Trips</Link>
              <button role="menuitem" type="button" onClick={() => void session?.logout()} className={itemClass}>
                Log out
              </button>
            </>
          ) : (
            <>
              <Link role="menuitem" href="/login" className={itemClass}>Log in</Link>
              <Link role="menuitem" href="/register" className={itemClass}>Sign up</Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

`components/design-system/top-nav.tsx`:
- replace the whole account `<Link href="/login" aria-label="Account menu" …>…</Link>` element with `<AccountMenu />`;
- remove the now-unused `Menu, UserCircle` import;
- add:

```tsx
// The one design-system → features import: every page's nav needs the live session menu.
import { AccountMenu } from "@/components/features/auth/account-menu";
```

`app/providers.tsx`: wrap the children in the session provider.

```tsx
"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "@/components/features/auth/session-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>{children}</SessionProvider>
    </QueryClientProvider>
  );
}
```

`components/features/auth/login-form.tsx` in full:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, TextInput } from "@/components/design-system";
import { login } from "@/lib/api-client/auth";
import { loginSchema } from "@/lib/auth/schemas";
import { useSessionState } from "./session-provider";

type FieldErrors = Partial<Record<"email" | "password", string>>;

export function LoginForm({ next = "/" }: { next?: string }) {
  const router = useRouter();
  const session = useSessionState();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "email" || key === "password") fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setFormError(null);
    setSubmitting(true);
    try {
      await login(parsed.data);
      await session?.refresh();
      router.push(next);
      router.refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      <TextInput label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
      <TextInput label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
      {formError && (
        <p role="alert" className="text-body-sm text-error">
          {formError}
        </p>
      )}
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Logging in…" : "Log in"}
      </Button>
      <p className="text-body-sm text-muted">
        Don&apos;t have an account?{" "}
        <Link href={next === "/" ? "/register" : `/register?next=${encodeURIComponent(next)}`} className="text-ink underline">
          Sign up
        </Link>
      </p>
    </form>
  );
}
```

`components/features/auth/register-form.tsx` in full:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, TextInput } from "@/components/design-system";
import { register } from "@/lib/api-client/auth";
import { registerSchema } from "@/lib/auth/schemas";
import { useSessionState } from "./session-provider";

type RegisterField = "name" | "email" | "password" | "confirmPassword";
type FieldErrors = Partial<Record<RegisterField, string>>;

export function RegisterForm({ next = "/" }: { next?: string }) {
  const router = useRouter();
  const session = useSessionState();
  const [values, setValues] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update(field: RegisterField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = registerSchema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as RegisterField;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setFormError(null);
    setSubmitting(true);
    try {
      await register(parsed.data);
      await session?.refresh();
      router.push(next);
      router.refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      <TextInput label="Name" value={values.name} onChange={(e) => update("name", e.target.value)} error={errors.name} />
      <TextInput label="Email" type="email" value={values.email} onChange={(e) => update("email", e.target.value)} error={errors.email} />
      <TextInput label="Password" type="password" value={values.password} onChange={(e) => update("password", e.target.value)} error={errors.password} />
      <TextInput label="Confirm password" type="password" value={values.confirmPassword} onChange={(e) => update("confirmPassword", e.target.value)} error={errors.confirmPassword} />
      {formError && (
        <p role="alert" className="text-body-sm text-error">
          {formError}
        </p>
      )}
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Creating account…" : "Sign up"}
      </Button>
      <p className="text-body-sm text-muted">
        Already have an account?{" "}
        <Link href={next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`} className="text-ink underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
```

`app/login/page.tsx` in full:

```tsx
import type { Metadata } from "next";
import { AuthCard } from "@/components/design-system";
import { LoginForm } from "@/components/features/auth/login-form";
import { safeNextPath } from "@/lib/auth/next-path";

export const metadata: Metadata = { title: "Log in · Airbnb" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <AuthCard title="Welcome back" subtitle="Log in to your account">
      <LoginForm next={safeNextPath(next)} />
    </AuthCard>
  );
}
```

`app/register/page.tsx`: make the same change. Keep its current `AuthCard` title and subtitle, make it `async`, read `searchParams`, and render `<RegisterForm next={safeNextPath(next)} />`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: the whole suite PASSES, including `providers.test.tsx` (the session query fails quietly in jsdom and renders as logged out) and every page test that renders `TopNav`. tsc and lint are clean.

- [ ] **Step 5: Commit**

```bash
git add lib/api-client components/features/auth components/design-system/top-nav.tsx components/design-system/top-nav.test.tsx app/providers.tsx app/login app/register
git commit -m "feat: log in, register and log out against the mock session with an account menu

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Wishlist hearts and the save dialog

**Files:**
- Create: `lib/api-client/wishlists.ts`, `components/features/wishlists/wishlist-hearts.tsx`, `components/features/wishlists/save-to-wishlist-dialog.tsx`
- Modify: `components/design-system/property-card.tsx`, `components/features/property-grid.tsx`, `components/features/search/search-results-list.tsx`, `app/providers.tsx`, `vitest.setup.ts`
- Test:
  - Create: `components/features/wishlists/wishlist-hearts.test.tsx`, `components/features/wishlists/save-to-wishlist-dialog.test.tsx`
  - Modify: `components/design-system/property-card.test.tsx`

**Interfaces:**
- Consumes: `callApi`, `wishlistSchema` (Task 4); `useSessionState` (Task 4); `loginPath` (Task 1); `wishlistNameSchema` (Task 3); `Listing`, `Wishlist`.
- Produces:
  - `WISHLISTS_QUERY_KEY`, `fetchWishlists()`, `createWishlist({ name, listingId? })`, `addToWishlist(wishlistId, listingId)`, `removeFromWishlists(listingId)`;
  - `WishlistHeartsProvider({ children, redirectToLogin? })` and `useWishlistHearts(): { savedIds: ReadonlySet<string>; toggle(listing: Listing): void } | null`;
  - `PropertyCard` props `saved?: boolean`, `onToggleSave?: () => void` (the heart renders only with `onToggleSave`).

- [ ] **Step 1: Polyfill `<dialog>` for jsdom, then write the failing tests**

Append to `vitest.setup.ts`:

```ts
// jsdom has no modal <dialog> API; this is enough of it for components that open one.
if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
}
```

`components/design-system/property-card.test.tsx`: replace the test `heart toggles to the saved (rausch) state on click` with the three tests below, and add `vi` to the vitest import. Keep every other test in the file as is.

```tsx
  test("shows no heart without a save handler", () => {
    render(<PropertyCard listing={listing} />);
    expect(screen.queryByRole("button", { name: /wishlist/i })).not.toBeInTheDocument();
  });

  test("the heart calls onToggleSave", async () => {
    const onToggleSave = vi.fn();
    render(<PropertyCard listing={listing} saved={false} onToggleSave={onToggleSave} />);
    await userEvent.click(screen.getByRole("button", { name: "Save to wishlist" }));
    expect(onToggleSave).toHaveBeenCalledOnce();
  });

  test("a saved listing shows the filled rausch heart", () => {
    render(<PropertyCard listing={listing} saved onToggleSave={() => {}} />);
    const heart = screen.getByRole("button", { name: "Remove from wishlist" });
    expect(heart.querySelector("svg")).toHaveAttribute("fill", "var(--color-rausch)");
  });
```

`components/features/wishlists/wishlist-hearts.test.tsx`:

```tsx
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, userEvent, waitFor } from "@/lib/test-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { SessionContext, type SessionState } from "@/components/features/auth/session-provider";
import { WishlistHeartsProvider, useWishlistHearts } from "./wishlist-hearts";
import type { Listing, Wishlist } from "@/lib/types";

const api = vi.hoisted(() => ({
  fetchWishlists: vi.fn(),
  removeFromWishlists: vi.fn(),
  createWishlist: vi.fn(),
  addToWishlist: vi.fn(),
}));
vi.mock("@/lib/api-client/wishlists", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client/wishlists")>()),
  ...api,
}));

const listing = { id: "l1", title: "Cozy cabin", photos: ["/a.jpg"] } as Listing;
const list = (listingIds: string[]): Wishlist => ({ id: "w1", name: "Summer", listingIds, createdAt: "2026-01-01" });

function Heart() {
  const hearts = useWishlistHearts();
  const saved = hearts?.savedIds.has(listing.id) ?? false;
  return <button onClick={() => hearts?.toggle(listing)}>{saved ? "saved" : "not saved"}</button>;
}

function renderHearts(user: SessionState["user"], redirectToLogin = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const session: SessionState = { user, isLoading: false, refresh: vi.fn(), logout: vi.fn() };
  const wrap = (ui: ReactNode) => (
    <QueryClientProvider client={client}>
      <SessionContext.Provider value={session}>
        <WishlistHeartsProvider redirectToLogin={redirectToLogin}>{ui}</WishlistHeartsProvider>
      </SessionContext.Provider>
    </QueryClientProvider>
  );
  render(wrap(<Heart />));
  return { redirectToLogin };
}

const ana = { id: "u-ana@example.com", name: "ana", email: "ana@example.com" };

beforeEach(() => Object.values(api).forEach((fn) => fn.mockReset()));

describe("WishlistHeartsProvider", () => {
  test("outside the provider there are no hearts", () => {
    render(<Heart />);
    expect(screen.getByRole("button")).toHaveTextContent("not saved");
  });

  test("a logged-out heart goes to login and back", async () => {
    const { redirectToLogin } = renderHearts(null);
    await userEvent.click(screen.getByRole("button"));
    expect(redirectToLogin).toHaveBeenCalledWith("/login?next=%2F");
    expect(api.fetchWishlists).not.toHaveBeenCalled();
  });

  test("a saved listing is unsaved optimistically", async () => {
    api.fetchWishlists.mockResolvedValue([list(["l1"])]);
    let finish: () => void = () => {};
    api.removeFromWishlists.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    renderHearts(ana);
    const heart = await screen.findByText("saved");

    await userEvent.click(heart);

    expect(await screen.findByText("not saved")).toBeInTheDocument();
    expect(api.removeFromWishlists).toHaveBeenCalledWith("l1");
    finish();
  });

  test("a failed unsave rolls back and says so", async () => {
    api.fetchWishlists.mockResolvedValue([list(["l1"])]);
    api.removeFromWishlists.mockRejectedValue(new Error("boom"));
    renderHearts(ana);

    await userEvent.click(await screen.findByText("saved"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't remove it from your wishlist. Try again.");
    await waitFor(() => expect(screen.getByRole("button", { name: "saved" })).toBeInTheDocument());
  });

  test("an unsaved listing opens the save dialog", async () => {
    api.fetchWishlists.mockResolvedValue([list([])]);
    renderHearts(ana);

    await userEvent.click(await screen.findByText("not saved"));

    expect(screen.getByRole("dialog", { name: "Save to wishlist" })).toBeInTheDocument();
  });
});
```

`components/features/wishlists/save-to-wishlist-dialog.test.tsx`:

```tsx
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, userEvent } from "@/lib/test-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SaveToWishlistDialog } from "./save-to-wishlist-dialog";
import type { Listing, Wishlist } from "@/lib/types";

const api = vi.hoisted(() => ({ createWishlist: vi.fn(), addToWishlist: vi.fn() }));
vi.mock("@/lib/api-client/wishlists", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client/wishlists")>()),
  ...api,
}));

const listing = { id: "l7", title: "Beach house", photos: ["/b.jpg"] } as Listing;
const summer: Wishlist = { id: "w1", name: "Summer", listingIds: ["l1", "l2"], createdAt: "2026-01-01" };

function renderDialog(wishlists: Wishlist[], onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SaveToWishlistDialog listing={listing} wishlists={wishlists} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose };
}

beforeEach(() => Object.values(api).forEach((fn) => fn.mockReset()));

describe("SaveToWishlistDialog", () => {
  test("lists the guest's wishlists with their counts and saves to the one picked", async () => {
    api.addToWishlist.mockResolvedValue({ ...summer, listingIds: [...summer.listingIds, "l7"] });
    const { onClose } = renderDialog([summer]);

    await userEvent.click(screen.getByRole("button", { name: /Summer.*2 saved/ }));

    expect(api.addToWishlist).toHaveBeenCalledWith("w1", "l7");
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  test("with no lists yet it asks for a name straight away", () => {
    renderDialog([]);
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
  });

  test("creates a new wishlist with the listing", async () => {
    api.createWishlist.mockResolvedValue({ ...summer, id: "w2", name: "Beach", listingIds: ["l7"] });
    const { onClose } = renderDialog([summer]);

    await userEvent.click(screen.getByRole("button", { name: "Create new wishlist" }));
    await userEvent.type(screen.getByLabelText("Name"), "  Beach  ");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(api.createWishlist).toHaveBeenCalledWith({ name: "Beach", listingId: "l7" });
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  test("an empty name is refused before calling the API", async () => {
    renderDialog([]);
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(screen.getByText("Give your wishlist a name")).toBeInTheDocument();
    expect(api.createWishlist).not.toHaveBeenCalled();
  });

  test("shows an API failure inline and stays open", async () => {
    api.addToWishlist.mockRejectedValue(new Error("Wishlist not found"));
    const { onClose } = renderDialog([summer]);

    await userEvent.click(screen.getByRole("button", { name: /Summer/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Wishlist not found");
    expect(onClose).not.toHaveBeenCalled();
  });

  test("the close button closes it", async () => {
    const { onClose } = renderDialog([summer]);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run components/features/wishlists components/design-system/property-card.test.tsx`
Expected: FAIL. The wishlist modules can't be resolved, and PropertyCard still renders a heart without a handler.

- [ ] **Step 3: Implement**

`lib/api-client/wishlists.ts`:

```ts
import { z } from "zod";
import type { Wishlist } from "@/lib/types";
import { callApi } from "./request";
import { wishlistSchema } from "./schemas";

export const WISHLISTS_QUERY_KEY = ["wishlists"] as const;

export function fetchWishlists(): Promise<Wishlist[]> {
  return callApi("/api/wishlists", z.array(wishlistSchema));
}

export function createWishlist(input: { name: string; listingId?: string }): Promise<Wishlist> {
  return callApi("/api/wishlists", wishlistSchema, { method: "POST", body: JSON.stringify(input) });
}

export function addToWishlist(wishlistId: string, listingId: string): Promise<Wishlist> {
  return callApi(`/api/wishlists/${encodeURIComponent(wishlistId)}/listings`, wishlistSchema, {
    method: "POST",
    body: JSON.stringify({ listingId }),
  });
}

export async function removeFromWishlists(listingId: string): Promise<void> {
  await callApi(`/api/wishlists/saved/${encodeURIComponent(listingId)}`, z.null(), { method: "DELETE" });
}
```

`components/design-system/property-card.tsx`:
- remove `useState` and the local `saved` state;
- change the signature to `export function PropertyCard({ listing, saved = false, onToggleSave }: { listing: Listing; saved?: boolean; onToggleSave?: () => void })`;
- render the heart button only when `onToggleSave` is set;
- keep the aria-label logic (`saved ? "Remove from wishlist" : "Save to wishlist"`), the classes and the SVG exactly as they are, with the fill still driven by `saved`.

The heart becomes:

```tsx
      {onToggleSave && (
        <button
          type="button"
          aria-label={saved ? "Remove from wishlist" : "Save to wishlist"}
          onClick={onToggleSave}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden
            fill={saved ? "var(--color-rausch)" : "var(--color-icon-scrim)"}
            stroke="white" strokeWidth="2">
            <path d="M12 21s-7-4.35-9.5-8.5C1 9 2.5 5.5 6 5.5c2 0 3.2 1.2 4 2.3.8-1.1 2-2.3 4-2.3 3.5 0 5 3.5 3.5 7-2.5 4.15-9.5 8.5-9.5 8.5z" />
          </svg>
        </button>
      )}
```

`components/features/wishlists/save-to-wishlist-dialog.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button, TextInput } from "@/components/design-system";
import { WISHLISTS_QUERY_KEY, addToWishlist, createWishlist } from "@/lib/api-client/wishlists";
import type { Listing, Wishlist } from "@/lib/types";
import { wishlistNameSchema } from "@/lib/wishlists/schemas";

export interface SaveToWishlistDialogProps {
  listing: Listing;
  wishlists: Wishlist[];
  onClose: () => void;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong");

export function SaveToWishlistDialog({ listing, wishlists, onClose }: SaveToWishlistDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(wishlists.length === 0);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  // A native modal: focus trap, Esc and a backdrop without a UI library.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  function done() {
    void queryClient.invalidateQueries({ queryKey: WISHLISTS_QUERY_KEY });
    onClose();
  }

  const save = useMutation({
    mutationFn: (wishlistId: string) => addToWishlist(wishlistId, listing.id),
    onSuccess: done,
    onError: (e) => setError(messageOf(e)),
  });
  const create = useMutation({
    mutationFn: (listName: string) => createWishlist({ name: listName, listingId: listing.id }),
    onSuccess: done,
    onError: (e) => setError(messageOf(e)),
  });
  const busy = save.isPending || create.isPending;

  function submitNew(event: React.FormEvent) {
    event.preventDefault();
    const parsed = wishlistNameSchema.safeParse(name);
    if (!parsed.success) {
      setNameError(parsed.error.issues[0]?.message);
      return;
    }
    setNameError(undefined);
    setError(null);
    create.mutate(parsed.data);
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="save-to-wishlist-title"
      onClose={onClose}
      className="m-auto w-full max-w-md rounded-md bg-canvas p-0 shadow-airbnb backdrop:bg-scrim/50"
    >
      <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
        <h2 id="save-to-wishlist-title" className="text-title-md text-ink">Save to wishlist</h2>
        <button type="button" aria-label="Close" onClick={onClose} className="rounded-full p-1 text-ink hover:bg-surface-soft">
          <X aria-hidden className="size-4" />
        </button>
      </div>

      <div className="flex flex-col gap-2 p-6">
        {creating ? (
          <form noValidate onSubmit={submitNew} className="flex flex-col gap-4">
            <TextInput label="Name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} error={nameError} />
            <div className="flex justify-end gap-2">
              {wishlists.length > 0 && (
                <Button type="button" variant="tertiary" onClick={() => setCreating(false)}>Cancel</Button>
              )}
              <Button type="submit" disabled={busy}>Create</Button>
            </div>
          </form>
        ) : (
          <>
            {wishlists.map((wishlist) => (
              <button
                key={wishlist.id}
                type="button"
                disabled={busy}
                onClick={() => {
                  setError(null);
                  save.mutate(wishlist.id);
                }}
                className="flex flex-col items-start rounded-sm px-3 py-2 text-left hover:bg-surface-soft"
              >
                <span className="text-title-sm text-ink">{wishlist.name}</span>
                <span className="text-body-sm text-muted">{wishlist.listingIds.length} saved</span>
              </button>
            ))}
            <Button type="button" variant="secondary" onClick={() => setCreating(true)}>Create new wishlist</Button>
          </>
        )}
        {error && (
          <p role="alert" className="text-body-sm text-error">
            {error}
          </p>
        )}
      </div>
    </dialog>
  );
}
```

`components/features/wishlists/wishlist-hearts.tsx`:

```tsx
"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSessionState } from "@/components/features/auth/session-provider";
import { WISHLISTS_QUERY_KEY, fetchWishlists, removeFromWishlists } from "@/lib/api-client/wishlists";
import { loginPath } from "@/lib/auth/next-path";
import type { Listing, Wishlist } from "@/lib/types";
import { SaveToWishlistDialog } from "./save-to-wishlist-dialog";

export interface WishlistHearts {
  savedIds: ReadonlySet<string>;
  /** Logged out: go to login. Saved: unsave everywhere. Not saved: open the save dialog. */
  toggle: (listing: Listing) => void;
}

const WishlistHeartsContext = createContext<WishlistHearts | null>(null);
const NO_WISHLISTS: Wishlist[] = [];

export function WishlistHeartsProvider({
  children,
  redirectToLogin = (url) => window.location.assign(url),
}: {
  children: ReactNode;
  redirectToLogin?: (url: string) => void;
}) {
  const user = useSessionState()?.user ?? null;
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: wishlists = NO_WISHLISTS } = useQuery({
    queryKey: WISHLISTS_QUERY_KEY,
    queryFn: fetchWishlists,
    enabled: user !== null,
  });
  const savedIds = useMemo(() => new Set(user ? wishlists.flatMap((w) => w.listingIds) : []), [user, wishlists]);

  const unsave = useMutation({
    mutationFn: removeFromWishlists,
    onMutate: async (listingId: string) => {
      await queryClient.cancelQueries({ queryKey: WISHLISTS_QUERY_KEY });
      const previous = queryClient.getQueryData<Wishlist[]>(WISHLISTS_QUERY_KEY);
      queryClient.setQueryData<Wishlist[]>(WISHLISTS_QUERY_KEY, (lists = []) =>
        lists.map((w) => ({ ...w, listingIds: w.listingIds.filter((id) => id !== listingId) })),
      );
      return { previous };
    },
    onError: (_error, _listingId, context) => {
      queryClient.setQueryData(WISHLISTS_QUERY_KEY, context?.previous);
      setError("Couldn't remove it from your wishlist. Try again.");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: WISHLISTS_QUERY_KEY }),
  });

  function toggle(listing: Listing) {
    setError(null);
    if (!user) {
      redirectToLogin(loginPath(window.location.pathname + window.location.search));
      return;
    }
    if (savedIds.has(listing.id)) unsave.mutate(listing.id);
    else setPending(listing);
  }

  return (
    <WishlistHeartsContext.Provider value={{ savedIds, toggle }}>
      {children}
      {pending && <SaveToWishlistDialog listing={pending} wishlists={wishlists} onClose={() => setPending(null)} />}
      {error && (
        <p role="alert" className="fixed bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-sm bg-ink px-4 py-3 text-body-sm text-on-primary shadow-airbnb">
          {error}
        </p>
      )}
    </WishlistHeartsContext.Provider>
  );
}

/** The hearts, or null outside a WishlistHeartsProvider (isolated tests), where cards show no heart. */
export function useWishlistHearts(): WishlistHearts | null {
  return useContext(WishlistHeartsContext);
}
```

`components/features/property-grid.tsx`: add `"use client";` as the first line, import `useWishlistHearts` from `@/components/features/wishlists/wishlist-hearts`, call `const hearts = useWishlistHearts();` at the top of `PropertyGrid`, and render each card as:

```tsx
        <PropertyCard
          key={listing.id}
          listing={listing}
          saved={hearts?.savedIds.has(listing.id) ?? false}
          onToggleSave={hearts ? () => hearts.toggle(listing) : undefined}
        />
```

`components/features/search/search-results-list.tsx`: make the same three changes (`"use client"`, the hook, the two new props on its `PropertyCard`).

`app/providers.tsx`: nest `WishlistHeartsProvider` inside `SessionProvider`:

```tsx
      <SessionProvider>
        <WishlistHeartsProvider>{children}</WishlistHeartsProvider>
      </SessionProvider>
```

with `import { WishlistHeartsProvider } from "@/components/features/wishlists/wishlist-hearts";`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: the whole suite PASSES. Existing `PropertyGrid`, `SearchResultsList`, `SearchResults`, `HomeListings` and page tests pass unchanged: outside the providers the cards simply have no heart. tsc and lint are clean.

- [ ] **Step 5: Commit**

```bash
git add lib/api-client/wishlists.ts components/features/wishlists components/design-system/property-card.tsx components/design-system/property-card.test.tsx components/features/property-grid.tsx components/features/search/search-results-list.tsx app/providers.tsx vitest.setup.ts
git commit -m "feat: save listings to named wishlists from any property card

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Wishlist pages

**Files:**
- Create: `app/wishlists/page.tsx`, `app/wishlists/[id]/page.tsx`
- Test: `app/wishlists/page.test.tsx`, `app/wishlists/[id]/page.test.tsx`

**Interfaces:**
- Consumes: `requireSession(path)` (Task 1); `getRepositories().wishlists` and `.listings` (Task 2); `PropertyGrid` (it shows hearts inside the app's providers); `TopNav`, `Footer`.
- Produces: the routes `/wishlists` and `/wishlists/[id]`.

- [ ] **Step 1: Write the failing tests**

`app/wishlists/page.test.tsx`:

```tsx
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { getRepositories } from "@/lib/repositories";

const session = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock("@/lib/auth/get-session", () => session);

import WishlistsPage from "./page";

const user = () => ({ id: `u-${crypto.randomUUID()}`, name: "ana", email: "ana@example.com" });

beforeEach(() => session.requireSession.mockReset());

describe("WishlistsPage", () => {
  test("asks for a session that comes back to /wishlists", async () => {
    session.requireSession.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(WishlistsPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(session.requireSession).toHaveBeenCalledWith("/wishlists");
  });

  test("shows the empty state when there are no lists", async () => {
    session.requireSession.mockResolvedValue(user());
    render(await WishlistsPage());
    expect(screen.getByText("Create your first wishlist")).toBeInTheDocument();
  });

  test("shows each list as a card with its count, linking to it", async () => {
    const guest = user();
    session.requireSession.mockResolvedValue(guest);
    const repos = getRepositories();
    const list = await repos.wishlists.create(guest.id, "Summer");
    await repos.wishlists.addListing(guest.id, list.id, "l1");

    render(await WishlistsPage());

    const card = screen.getByRole("link", { name: /Summer/ });
    expect(card).toHaveAttribute("href", `/wishlists/${list.id}`);
    expect(card).toHaveTextContent("1 saved");
  });
});
```

`app/wishlists/[id]/page.test.tsx`:

```tsx
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { getRepositories } from "@/lib/repositories";

const session = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock("@/lib/auth/get-session", () => session);

import WishlistPage from "./page";

const user = () => ({ id: `u-${crypto.randomUUID()}`, name: "ana", email: "ana@example.com" });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => session.requireSession.mockReset());

describe("WishlistPage", () => {
  test("shows the list's name and its listings, skipping ones that no longer exist", async () => {
    const guest = user();
    session.requireSession.mockResolvedValue(guest);
    const repos = getRepositories();
    const list = await repos.wishlists.create(guest.id, "Cabins");
    await repos.wishlists.addListing(guest.id, list.id, "l1");
    await repos.wishlists.addListing(guest.id, list.id, "l-gone");

    render(await WishlistPage(params(list.id)));

    expect(session.requireSession).toHaveBeenCalledWith(`/wishlists/${list.id}`);
    expect(screen.getByRole("heading", { level: 1, name: "Cabins" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /cozy cabin in the pines/i })).toHaveAttribute("href", "/rooms/l1");
  });

  test("another user's wishlist is not found", async () => {
    const owner = user();
    const list = await getRepositories().wishlists.create(owner.id, "Private");
    session.requireSession.mockResolvedValue(user());

    await expect(WishlistPage(params(list.id))).rejects.toThrow();
  });

  test("an empty list says so", async () => {
    const guest = user();
    session.requireSession.mockResolvedValue(guest);
    const list = await getRepositories().wishlists.create(guest.id, "Empty");

    render(await WishlistPage(params(list.id)));

    expect(screen.getByText("Nothing saved yet")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run app/wishlists`
Expected: FAIL, because `./page` can't be resolved.

- [ ] **Step 3: Implement**

`app/wishlists/page.tsx`:

```tsx
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Footer, TopNav } from "@/components/design-system";
import { requireSession } from "@/lib/auth/get-session";
import { getRepositories } from "@/lib/repositories";

export const metadata: Metadata = { title: "Wishlists · Airbnb" };

export default async function WishlistsPage() {
  const user = await requireSession("/wishlists");
  const repos = getRepositories();
  const wishlists = await repos.wishlists.listForUser(user.id);
  const covers = await Promise.all(
    wishlists.map(async (w) => (w.listingIds[0] ? (await repos.listings.findById(w.listingIds[0]))?.photos[0] ?? null : null)),
  );

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopNav active="homes" />
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-6 py-8">
        <h1 className="mb-8 text-display-md text-ink">Wishlists</h1>
        {wishlists.length === 0 ? (
          <div className="flex flex-col gap-2">
            <h2 className="text-title-md text-ink">Create your first wishlist</h2>
            <p className="text-body-md text-muted">Tap the heart on any stay to save it here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {wishlists.map((wishlist, index) => (
              <Link key={wishlist.id} href={`/wishlists/${wishlist.id}`} className="flex flex-col gap-2">
                <div className="relative aspect-square w-full overflow-hidden rounded-md bg-surface-soft">
                  {covers[index] && <Image src={covers[index]} alt="" fill sizes="(max-width: 744px) 100vw, 25vw" className="object-cover" />}
                </div>
                <span className="text-title-sm text-ink">{wishlist.name}</span>
                <span className="text-body-sm text-muted">{wishlist.listingIds.length} saved</span>
              </Link>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
```

`app/wishlists/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { Footer, TopNav } from "@/components/design-system";
import { PropertyGrid } from "@/components/features/property-grid";
import { requireSession } from "@/lib/auth/get-session";
import { getRepositories } from "@/lib/repositories";
import type { Listing } from "@/lib/types";

export default async function WishlistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireSession(`/wishlists/${id}`);
  const repos = getRepositories();
  const wishlist = await repos.wishlists.findById(user.id, id);
  if (!wishlist) notFound();

  const listings = (await Promise.all(wishlist.listingIds.map((listingId) => repos.listings.findById(listingId)))).filter(
    (listing): listing is Listing => listing !== null,
  );

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopNav active="homes" />
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-6 py-8">
        <h1 className="mb-8 text-display-md text-ink">{wishlist.name}</h1>
        {listings.length === 0 ? (
          <p className="text-body-md text-muted">Nothing saved yet</p>
        ) : (
          <PropertyGrid listings={listings} />
        )}
      </main>
      <Footer />
    </div>
  );
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run app/wishlists && npx tsc --noEmit && npm run lint`
Expected: PASS; tsc and lint are clean.

- [ ] **Step 5: Commit**

```bash
git add app/wishlists
git commit -m "feat: add the wishlists pages

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Booking flow and trips

**Files:**
- Create: `lib/reservation/dates.ts`, `lib/bookings/trips.ts`, `lib/api-client/bookings.ts`
- Create: `components/features/price-breakdown-list.tsx`, `components/features/bookings/confirm-booking-button.tsx`
- Create: `app/book/[listingId]/page.tsx`, `app/trips/page.tsx`, `app/trips/[id]/page.tsx`
- Modify: `components/design-system/button.tsx`, `components/design-system/index.ts`, `components/features/reservation-card.tsx`, `app/rooms/[id]/page.tsx`
- Test:
  - Create: `lib/reservation/dates.test.ts`, `lib/bookings/trips.test.ts`, `components/features/bookings/confirm-booking-button.test.tsx`, `app/book/[listingId]/page.test.tsx`, `app/trips/page.test.tsx`, `app/trips/[id]/page.test.tsx`
  - Modify: `components/features/reservation-card.test.tsx`

**Interfaces:**
- Consumes:
  - `bookingRequestSchema`, `BookingRequest`, `nightsBetweenDates` (Task 2);
  - `requireSession` (Task 1);
  - `getRepositories().bookings` and `.listings`;
  - `callApi`, `bookingSchema` (Task 4);
  - `calculatePriceBreakdown`, `PriceBreakdown`.
- Produces:
  - `toIsoDate(date: Date): string` and `formatDateRange(checkIn: string, checkOut: string): string`;
  - `splitTrips(bookings: Booking[], today: string): { upcoming: Booking[]; past: Booking[] }`;
  - `createBooking(request: BookingRequest): Promise<Booking>`;
  - `buttonClassName(variant?: ButtonVariant): string`;
  - `ReservationCard` prop `listingId: string`;
  - the routes `/book/[listingId]`, `/trips` and `/trips/[id]`.

- [ ] **Step 1: Write the failing tests**

`lib/reservation/dates.test.ts`:

```ts
import { expect, test } from "vitest";
import { formatDateRange, toIsoDate } from "./dates";

test("toIsoDate uses the local calendar day", () => {
  expect(toIsoDate(new Date(2026, 2, 5))).toBe("2026-03-05");
  expect(toIsoDate(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
});

test("formatDateRange shows both dates in words", () => {
  expect(formatDateRange("2026-03-05", "2026-03-08")).toBe("Mar 5, 2026 – Mar 8, 2026");
});
```

`lib/bookings/trips.test.ts`:

```ts
import { expect, test } from "vitest";
import { splitTrips } from "./trips";
import type { Booking } from "@/lib/types";

const trip = (id: string, checkIn: string, checkOut: string) =>
  ({ id, checkIn, checkOut }) as Booking;

test("splits upcoming (soonest first) from past (most recent first)", () => {
  const { upcoming, past } = splitTrips(
    [
      trip("a", "2026-01-01", "2026-01-03"),
      trip("b", "2026-06-10", "2026-06-12"),
      trip("c", "2026-02-01", "2026-02-05"),
      trip("d", "2026-05-01", "2026-05-20"),
      trip("e", "2026-05-20", "2026-05-22"),
    ],
    "2026-05-20",
  );

  expect(upcoming.map((t) => t.id)).toEqual(["d", "e", "b"]);
  expect(past.map((t) => t.id)).toEqual(["c", "a"]);
});
```

`components/features/bookings/confirm-booking-button.test.tsx`:

```tsx
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, userEvent } from "@/lib/test-utils";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const createBooking = vi.fn();
vi.mock("@/lib/api-client/bookings", () => ({ createBooking: (input: unknown) => createBooking(input) }));

import { ConfirmBookingButton } from "./confirm-booking-button";

const request = { listingId: "l1", checkIn: "2030-01-01", checkOut: "2030-01-04", adults: 2, children: 0 };

beforeEach(() => {
  push.mockReset();
  createBooking.mockReset();
});

describe("ConfirmBookingButton", () => {
  test("creates the booking and goes to its confirmation", async () => {
    createBooking.mockResolvedValue({ id: "b1" });
    render(<ConfirmBookingButton request={request} />);

    await userEvent.click(screen.getByRole("button", { name: "Confirm and pay" }));

    expect(createBooking).toHaveBeenCalledWith(request);
    expect(push).toHaveBeenCalledWith("/trips/b1?confirmed=1");
  });

  test("disables the button while the booking is being created", async () => {
    createBooking.mockReturnValue(new Promise(() => {}));
    render(<ConfirmBookingButton request={request} />);

    await userEvent.click(screen.getByRole("button", { name: "Confirm and pay" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirming…" }));

    expect(screen.getByRole("button", { name: "Confirming…" })).toBeDisabled();
    expect(createBooking).toHaveBeenCalledOnce();
  });

  test("shows why it failed and lets the guest try again", async () => {
    createBooking.mockRejectedValue(new Error("Those dates are no longer available"));
    render(<ConfirmBookingButton request={request} />);

    await userEvent.click(screen.getByRole("button", { name: "Confirm and pay" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Those dates are no longer available");
    expect(screen.getByRole("button", { name: "Confirm and pay" })).toBeEnabled();
    expect(push).not.toHaveBeenCalled();
  });
});
```

`components/features/reservation-card.test.tsx`: pass `listingId="l1"` in both renders. In the second test, replace

```tsx
    expect(screen.getByRole("button", { name: /^reserve$/i })).toBeEnabled();
```

with

```tsx
    const reserve = screen.getByRole("link", { name: /^reserve$/i });
    expect(reserve.getAttribute("href")).toMatch(/^\/book\/l1\?checkIn=\d{4}-\d{2}-\d{2}&checkOut=\d{4}-\d{2}-\d{2}&adults=1&children=0$/);
```

`app/book/[listingId]/page.test.tsx`:

```tsx
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { calculatePriceBreakdown } from "@/lib/reservation/pricing";
import { listings } from "@/lib/data/listings";

const session = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock("@/lib/auth/get-session", () => session);
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn() }),
}));

import BookPage from "./page";

const DAY = 86_400_000;
const daysFromToday = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
const l1 = listings.find((l) => l.id === "l1")!;

function props(listingId: string, query: Record<string, string>) {
  return { params: Promise.resolve({ listingId }), searchParams: Promise.resolve(query) };
}

beforeEach(() => {
  session.requireSession.mockReset();
  session.requireSession.mockResolvedValue({ id: "u-ana@example.com", name: "ana", email: "ana@example.com" });
});

describe("BookPage", () => {
  test("shows the trip and the server-computed price", async () => {
    const query = { checkIn: daysFromToday(20), checkOut: daysFromToday(22), adults: "2", children: "0" };
    render(await BookPage(props("l1", query)));

    expect(session.requireSession).toHaveBeenCalledWith(`/book/l1?${new URLSearchParams(query)}`);
    expect(screen.getByRole("heading", { level: 1, name: "Confirm and pay" })).toBeInTheDocument();
    expect(screen.getByText("2 guests")).toBeInTheDocument();
    expect(screen.getByText(`$${calculatePriceBreakdown(l1.pricePerNight, 2).total}`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm and pay" })).toBeInTheDocument();
  });

  test("invalid dates go back to the listing", async () => {
    await expect(BookPage(props("l1", { checkIn: "nope", checkOut: "nope", adults: "1" }))).rejects.toThrow("NEXT_REDIRECT");
  });

  test("an unknown listing is not found", async () => {
    await expect(
      BookPage(props("l999", { checkIn: daysFromToday(20), checkOut: daysFromToday(22), adults: "1" })),
    ).rejects.toThrow();
  });
});
```

`app/trips/page.test.tsx`:

```tsx
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { getRepositories } from "@/lib/repositories";
import { calculatePriceBreakdown } from "@/lib/reservation/pricing";

const session = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock("@/lib/auth/get-session", () => session);

import TripsPage from "./page";

const user = () => ({ id: `u-${crypto.randomUUID()}`, name: "ana", email: "ana@example.com" });

beforeEach(() => session.requireSession.mockReset());

describe("TripsPage", () => {
  test("says there are no trips yet", async () => {
    session.requireSession.mockResolvedValue(user());
    render(await TripsPage());
    expect(session.requireSession).toHaveBeenCalledWith("/trips");
    expect(screen.getByText("No trips booked… yet!")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start searching" })).toHaveAttribute("href", "/");
  });

  test("lists an upcoming trip linking to its page", async () => {
    const guest = user();
    session.requireSession.mockResolvedValue(guest);
    const booking = await getRepositories().bookings.create(guest.id, {
      listingId: "l1", checkIn: "2031-07-01", checkOut: "2031-07-04", guests: { adults: 1, children: 0 },
      priceBreakdown: calculatePriceBreakdown(100, 3),
    });
    if (booking === "unavailable") throw new Error("unexpected");

    render(await TripsPage());

    expect(screen.getByRole("heading", { name: "Upcoming" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Aspen/ })).toHaveAttribute("href", `/trips/${booking.id}`);
  });
});
```

`app/trips/[id]/page.test.tsx`:

```tsx
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { getRepositories } from "@/lib/repositories";
import { calculatePriceBreakdown } from "@/lib/reservation/pricing";

const session = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock("@/lib/auth/get-session", () => session);

import TripPage from "./page";

const user = () => ({ id: `u-${crypto.randomUUID()}`, name: "ana", email: "ana@example.com" });

async function bookFor(userId: string, checkIn: string, checkOut: string) {
  const booking = await getRepositories().bookings.create(userId, {
    listingId: "l1", checkIn, checkOut, guests: { adults: 2, children: 0 }, priceBreakdown: calculatePriceBreakdown(100, 2),
  });
  if (booking === "unavailable") throw new Error("unexpected");
  return booking;
}

const props = (id: string, query: Record<string, string> = {}) => ({
  params: Promise.resolve({ id }),
  searchParams: Promise.resolve(query),
});

beforeEach(() => session.requireSession.mockReset());

describe("TripPage", () => {
  test("celebrates a fresh booking and shows its details", async () => {
    const guest = user();
    session.requireSession.mockResolvedValue(guest);
    const booking = await bookFor(guest.id, "2032-01-10", "2032-01-12");

    render(await TripPage(props(booking.id, { confirmed: "1" })));

    expect(session.requireSession).toHaveBeenCalledWith(`/trips/${booking.id}`);
    expect(screen.getByText("You're going to Aspen!")).toBeInTheDocument();
    expect(screen.getByText("Jan 10, 2032 – Jan 12, 2032")).toBeInTheDocument();
    expect(screen.getByText(`$${booking.priceBreakdown.total}`)).toBeInTheDocument();
  });

  test("another user's trip is not found", async () => {
    const booking = await bookFor(user().id, "2032-02-10", "2032-02-12");
    session.requireSession.mockResolvedValue(user());
    await expect(TripPage(props(booking.id))).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run lib/reservation/dates.test.ts lib/bookings/trips.test.ts components/features/bookings components/features/reservation-card.test.tsx app/book app/trips`
Expected: FAIL. The new modules and pages can't be resolved, and Reserve is still a button.

- [ ] **Step 3: Implement**

`lib/reservation/dates.ts`:

```ts
/** A calendar day as YYYY-MM-DD from the Date's local fields, so a local midnight never becomes the previous day. */
export function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

const dayFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** "Mar 5, 2026 – Mar 8, 2026" for two YYYY-MM-DD dates. */
export function formatDateRange(checkIn: string, checkOut: string): string {
  return `${dayFormat.format(new Date(`${checkIn}T00:00:00Z`))} – ${dayFormat.format(new Date(`${checkOut}T00:00:00Z`))}`;
}
```

`lib/bookings/trips.ts`:

```ts
import type { Booking } from "@/lib/types";

/** Upcoming trips (check-out today or later) soonest first; past trips most recent first. */
export function splitTrips(bookings: Booking[], today: string): { upcoming: Booking[]; past: Booking[] } {
  const upcoming = bookings.filter((b) => b.checkOut >= today).sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  const past = bookings.filter((b) => b.checkOut < today).sort((a, b) => b.checkOut.localeCompare(a.checkOut));
  return { upcoming, past };
}
```

`lib/api-client/bookings.ts`:

```ts
import type { BookingRequest } from "@/lib/bookings/schemas";
import type { Booking } from "@/lib/types";
import { callApi } from "./request";
import { bookingSchema } from "./schemas";

export function createBooking(request: BookingRequest): Promise<Booking> {
  return callApi("/api/bookings", bookingSchema, { method: "POST", body: JSON.stringify(request) });
}
```

`components/design-system/button.tsx`: export the class builder so links can look like buttons. Add, and use it inside `Button`:

```tsx
export function buttonClassName(variant: ButtonVariant = "primary"): string {
  return cn(base, variants[variant]);
}
```

`Button`'s render becomes `<button className={cn(buttonClassName(variant), className)} {...props} />`. In `components/design-system/index.ts`, change the Button export to `export { Button, buttonClassName } from "./button";`.

`components/features/price-breakdown-list.tsx`:

```tsx
import type { PriceBreakdown } from "@/lib/reservation/pricing";

export function PriceBreakdownList({ breakdown }: { breakdown: PriceBreakdown }) {
  return (
    <dl className="flex flex-col gap-2">
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
  );
}
```

`components/features/reservation-card.tsx`:
- add `listingId: string` to `ReservationCardProps` and destructure it;
- import `Link` from `next/link`, `buttonClassName` from `@/components/design-system`, and `toIsoDate` from `@/lib/reservation/dates`;
- replace the `<Button className="mt-4 w-full" disabled={breakdown === null}>Reserve</Button>` element with:

```tsx
      {breakdown && checkIn && checkOut ? (
        <Link
          href={`/book/${listingId}?${new URLSearchParams({
            checkIn: toIsoDate(checkIn),
            checkOut: toIsoDate(checkOut),
            adults: String(guests.adults),
            children: String(guests.children),
          })}`}
          className={`${buttonClassName()} mt-4 w-full`}
        >
          Reserve
        </Link>
      ) : (
        <Button className="mt-4 w-full" disabled>
          Reserve
        </Button>
      )}
```

`app/rooms/[id]/page.tsx`: pass `listingId={listing.id}` to `ReservationCard`.

`components/features/bookings/confirm-booking-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/design-system";
import { createBooking } from "@/lib/api-client/bookings";
import type { BookingRequest } from "@/lib/bookings/schemas";

export function ConfirmBookingButton({ request }: { request: BookingRequest }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      const booking = await createBooking(request);
      // Stays disabled while navigating, so a second click can't book twice.
      router.push(`/trips/${booking.id}?confirmed=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" onClick={confirm} disabled={pending} className="w-full sm:w-auto">
        {pending ? "Confirming…" : "Confirm and pay"}
      </Button>
      {error && (
        <p role="alert" className="text-body-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}
```

`app/book/[listingId]/page.tsx`:

```tsx
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Footer, TopNav } from "@/components/design-system";
import { ConfirmBookingButton } from "@/components/features/bookings/confirm-booking-button";
import { PriceBreakdownList } from "@/components/features/price-breakdown-list";
import { requireSession } from "@/lib/auth/get-session";
import { bookingRequestSchema, nightsBetweenDates } from "@/lib/bookings/schemas";
import { getRepositories } from "@/lib/repositories";
import { formatDateRange } from "@/lib/reservation/dates";
import { calculatePriceBreakdown } from "@/lib/reservation/pricing";

export const metadata: Metadata = { title: "Confirm and pay · Airbnb" };

type SearchParams = Record<string, string | string[] | undefined>;
const QUERY_KEYS = ["checkIn", "checkOut", "adults", "children"] as const;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ listingId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { listingId } = await params;
  const raw = await searchParams;
  const query: Record<string, string> = {};
  for (const key of QUERY_KEYS) {
    const value = first(raw[key]);
    if (value !== undefined) query[key] = value;
  }
  await requireSession(`/book/${listingId}?${new URLSearchParams(query)}`);

  const parsed = bookingRequestSchema.safeParse({ listingId, ...query });
  if (!parsed.success) redirect(`/rooms/${listingId}`);
  const listing = await getRepositories().listings.findById(listingId);
  if (!listing) notFound();

  const request = parsed.data;
  const breakdown = calculatePriceBreakdown(listing.pricePerNight, nightsBetweenDates(request.checkIn, request.checkOut));
  const guestCount = request.adults + request.children;

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopNav active="homes" />
      <main className="mx-auto w-full max-w-[1080px] flex-1 px-6 py-8">
        <h1 className="mb-8 text-display-md text-ink">Confirm and pay</h1>
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1.4fr_1fr]">
          <div className="flex flex-col gap-8">
            <section className="flex flex-col gap-4 border-b border-hairline pb-8">
              <h2 className="text-title-md text-ink">Your trip</h2>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-title-sm text-ink">Dates</p>
                  <p className="text-body-md text-body">{formatDateRange(request.checkIn, request.checkOut)}</p>
                </div>
                <Link href={`/rooms/${listingId}`} className="text-title-sm text-ink underline">Edit</Link>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-title-sm text-ink">Guests</p>
                  <p className="text-body-md text-body">{guestCount} {guestCount === 1 ? "guest" : "guests"}</p>
                </div>
                <Link href={`/rooms/${listingId}`} className="text-title-sm text-ink underline">Edit</Link>
              </div>
            </section>
            <section className="flex flex-col gap-2 border-b border-hairline pb-8">
              <h2 className="text-title-md text-ink">Payment</h2>
              <p className="text-body-md text-muted">This is a demo — no payment details needed.</p>
            </section>
            <ConfirmBookingButton request={request} />
          </div>
          <aside className="flex flex-col gap-4 self-start rounded-md border border-hairline p-6 shadow-airbnb">
            <div className="flex gap-4 border-b border-hairline pb-4">
              <div className="relative size-24 shrink-0 overflow-hidden rounded-sm">
                <Image src={listing.photos[0]} alt={listing.title} fill sizes="96px" className="object-cover" />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-title-sm text-ink">{listing.title}</p>
                <p className="text-body-sm text-muted">★ {listing.rating.toFixed(2)} · {listing.location.city}</p>
              </div>
            </div>
            <PriceBreakdownList breakdown={breakdown} />
          </aside>
        </div>
      </main>
      <Footer />
    </div>
  );
}
```

`app/trips/[id]/page.tsx`:

```tsx
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Footer, TopNav } from "@/components/design-system";
import { PriceBreakdownList } from "@/components/features/price-breakdown-list";
import { requireSession } from "@/lib/auth/get-session";
import { getRepositories } from "@/lib/repositories";
import { formatDateRange } from "@/lib/reservation/dates";

export default async function TripPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ confirmed?: string }>;
}) {
  const { id } = await params;
  const { confirmed } = await searchParams;
  const user = await requireSession(`/trips/${id}`);
  const repos = getRepositories();
  const booking = await repos.bookings.findById(user.id, id);
  if (!booking) notFound();
  const listing = await repos.listings.findById(booking.listingId);
  const guestCount = booking.guests.adults + booking.guests.children;

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopNav active="homes" />
      <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-8 px-6 py-8">
        {confirmed === "1" && (
          <p className="rounded-md bg-surface-soft px-6 py-4 text-title-md text-ink">
            You&apos;re going to {listing?.location.city ?? "your stay"}!
          </p>
        )}
        {listing && (
          <Link href={`/rooms/${listing.id}`} className="flex items-center gap-4">
            <div className="relative size-24 shrink-0 overflow-hidden rounded-sm">
              <Image src={listing.photos[0]} alt={listing.title} fill sizes="96px" className="object-cover" />
            </div>
            <span className="text-title-md text-ink">{listing.title}</span>
          </Link>
        )}
        <section className="flex flex-col gap-2 border-b border-hairline pb-6">
          <p className="text-body-md text-body">{formatDateRange(booking.checkIn, booking.checkOut)}</p>
          <p className="text-body-md text-body">{guestCount} {guestCount === 1 ? "guest" : "guests"}</p>
          <p className="text-body-sm text-muted">Booking {booking.id.slice(0, 8)} · Confirmed</p>
        </section>
        <PriceBreakdownList breakdown={booking.priceBreakdown} />
      </main>
      <Footer />
    </div>
  );
}
```

`app/trips/page.tsx`:

```tsx
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Footer, TopNav, buttonClassName } from "@/components/design-system";
import { requireSession } from "@/lib/auth/get-session";
import { splitTrips } from "@/lib/bookings/trips";
import { getRepositories } from "@/lib/repositories";
import { formatDateRange } from "@/lib/reservation/dates";
import type { Booking, Listing } from "@/lib/types";

export const metadata: Metadata = { title: "Trips · Airbnb" };

function TripCard({ booking, listing }: { booking: Booking; listing: Listing | undefined }) {
  return (
    <Link href={`/trips/${booking.id}`} className="flex gap-4 rounded-md border border-hairline p-4 hover:shadow-airbnb">
      <div className="relative size-24 shrink-0 overflow-hidden rounded-sm bg-surface-soft">
        {listing && <Image src={listing.photos[0]} alt="" fill sizes="96px" className="object-cover" />}
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-title-sm text-ink">{listing?.location.city ?? "Your stay"}</span>
        <span className="text-body-sm text-body">{formatDateRange(booking.checkIn, booking.checkOut)}</span>
        <span className="text-body-sm text-muted">Total ${booking.priceBreakdown.total}</span>
      </div>
    </Link>
  );
}

function TripSection({ title, trips, listings }: { title: string; trips: Booking[]; listings: Map<string, Listing> }) {
  if (trips.length === 0) return null;
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-title-md text-ink">{title}</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {trips.map((booking) => (
          <TripCard key={booking.id} booking={booking} listing={listings.get(booking.listingId)} />
        ))}
      </div>
    </section>
  );
}

export default async function TripsPage() {
  const user = await requireSession("/trips");
  const repos = getRepositories();
  const bookings = await repos.bookings.listForUser(user.id);
  const listingIds = [...new Set(bookings.map((b) => b.listingId))];
  const listings = new Map(
    (await Promise.all(listingIds.map((id) => repos.listings.findById(id))))
      .filter((listing): listing is Listing => listing !== null)
      .map((listing) => [listing.id, listing]),
  );
  const { upcoming, past } = splitTrips(bookings, new Date().toISOString().slice(0, 10));

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopNav active="homes" />
      <main className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col gap-8 px-6 py-8">
        <h1 className="text-display-md text-ink">Trips</h1>
        {bookings.length === 0 ? (
          <div className="flex flex-col items-start gap-4">
            <p className="text-title-md text-ink">No trips booked… yet!</p>
            <Link href="/" className={buttonClassName()}>Start searching</Link>
          </div>
        ) : (
          <>
            <TripSection title="Upcoming" trips={upcoming} listings={listings} />
            <TripSection title="Past" trips={past} listings={listings} />
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: the whole suite PASSES, including the existing rooms page tests and `button.test.tsx`; tsc and lint are clean.

- [ ] **Step 5: Commit**

```bash
git add lib/reservation/dates.ts lib/reservation/dates.test.ts lib/bookings/trips.ts lib/bookings/trips.test.ts lib/api-client/bookings.ts components app/book app/trips "app/rooms/[id]/page.tsx"
git status --short   # expect only this task's files
git commit -m "feat: book a stay through Confirm and pay and list it under Trips

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: End-to-end flows, docs and verification

**Files:**
- Create: `e2e/wishlists.spec.ts`, `e2e/trips.spec.ts`
- Modify: `CLAUDE.md` and `docs/superpowers/specs/2026-06-21-airbnb-frontend-clone-design.md` (repo root)

- [ ] **Step 1: Write the e2e tests**

`e2e/wishlists.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";

// The mock store is shared by everyone using the dev server, so every run logs in as a new guest.
const uniqueEmail = () => `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

async function logIn(page: Page) {
  await page.getByLabel("Email").fill(uniqueEmail());
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Log in" }).click();
}

test("a logged-out heart asks to log in, then saves to a new wishlist and unsaves", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Save to wishlist" }).first().click();

  await expect(page).toHaveURL(/\/login\?next=%2F/);
  await logIn(page);
  await expect(page).toHaveURL("/");

  await page.getByRole("button", { name: "Save to wishlist" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Save to wishlist" });
  await dialog.getByLabel("Name").fill("Summer trip");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("button", { name: "Remove from wishlist" }).first()).toBeVisible();

  await page.goto("/wishlists");
  await page.getByRole("link", { name: /Summer trip/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Summer trip" })).toBeVisible({ timeout: 30000 });

  await page.getByRole("button", { name: "Remove from wishlist" }).first().click();
  await expect(page.getByRole("button", { name: "Save to wishlist" }).first()).toBeVisible();
});
```

`e2e/trips.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";

const uniqueEmail = () => `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

async function logIn(page: Page) {
  await page.getByLabel("Email").fill(uniqueEmail());
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Log in" }).click();
}

test("a guest books a stay and finds it under Trips", async ({ page }) => {
  await page.goto("/login?next=%2Frooms%2Fl1");
  await logIn(page);
  await expect(page).toHaveURL("/rooms/l1", { timeout: 30000 });

  // A random future month and night, so repeated runs against one dev server don't collide on dates.
  const monthsAhead = 1 + Math.floor(Math.random() * 10);
  for (let i = 0; i < monthsAhead; i++) await page.getByRole("button", { name: "Next month" }).click();
  const days = page.getByRole("button").filter({ hasText: /^\d+$/ });
  const start = Math.floor(Math.random() * ((await days.count()) - 1));
  await days.nth(start).click();
  await days.nth(start + 1).click();

  await page.getByRole("link", { name: /^reserve$/i }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Confirm and pay" })).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "Confirm and pay" }).click();

  await expect(page.getByText("You're going to Aspen!")).toBeVisible({ timeout: 30000 });
  await page.goto("/trips");
  await expect(page.getByRole("link", { name: /Aspen/ }).first()).toBeVisible();
});

test("Trips asks a logged-out visitor to log in and comes back", async ({ page }) => {
  await page.goto("/trips");
  await expect(page).toHaveURL(/\/login\?next=%2Ftrips/);
  await logIn(page);
  await expect(page).toHaveURL("/trips", { timeout: 30000 });
  await expect(page.getByRole("heading", { level: 1, name: "Trips" })).toBeVisible();
});
```

- [ ] **Step 2: Run the e2e suite (mock mode)**

Run: `npm run e2e`
Expected: all specs pass, the 14 existing ones plus the 3 new ones. If a new spec fails because a selector doesn't match the implemented UI, fix the component (not the test) when the component contradicts the spec, and report what changed.

- [ ] **Step 3: Docs**

`CLAUDE.md`, in **Data Layer**:
- add these lines to the code block:

```
lib/auth/              session.ts (mock session cookie), get-session.ts (server: getSession/requireSession), next-path.ts
lib/repositories/      … also WishlistRepository + BookingRepository (in-memory mocks in both data modes)
app/api/auth|wishlists|bookings/   session-guarded route handlers (401 envelope without a session)
```

- add this bullet under the block:

```markdown
- Auth is a mock: any valid email/password logs in; an httpOnly `session` cookie holds the user. Wishlists and bookings are frontend in-memory mocks in both `DATA_SOURCE` modes (the backend doesn't serve them). Client code reads the session and wishlist hearts from `SessionProvider` / `WishlistHeartsProvider` (in `app/providers.tsx`) via `useSessionState()` / `useWishlistHearts()`, which return null outside the providers.
```

`CLAUDE.md`, in **Pages**: add

```markdown
- `/wishlists`, `/wishlists/[id]`, `/trips`, `/trips/[id]`, `/book/[listingId]` — gated server pages (`requireSession` redirects to `/login?next=…`)
```

In `docs/superpowers/specs/2026-06-21-airbnb-frontend-clone-design.md` §10, append to item 6: ` — see 2026-09-27-frontend-phase6-auth-wishlists-trips-design.md`.

- [ ] **Step 4: Full verification**

From `frontend/`, run: `npm test && npx tsc --noEmit && npm run lint && npm run build && npm run seed:check && npm run test:coverage`
Expected:
- all pass;
- in the coverage report, each new file under `lib/auth`, `lib/bookings`, `lib/wishlists`, `lib/repositories/mock/mock-{wishlist,booking}-repository.ts`, `lib/api-client/{request,auth,wishlists,bookings}.ts`, `app/api/{auth,wishlists,bookings}` and `components/features/{auth,wishlists,bookings}` has at least 80% line coverage.
- If `npm run build` reports a dynamic-rendering error on a gated page, report it instead of adding `export const dynamic`.

- [ ] **Step 5: Commit**

```bash
cd D:/PersonalProjects/airbnb
git add frontend/e2e CLAUDE.md docs/superpowers/specs/2026-06-21-airbnb-frontend-clone-design.md
git commit -m "test: cover the wishlist and booking flows end to end and document phase 6

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
