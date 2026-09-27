# Backend Phase 3 — Frontend Flag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A server-only `DATA_SOURCE=mock|api` flag switches every frontend data read between today's mock data and the .NET API, and Aspire runs the frontend in API mode next to the backend.

**Architecture:**
- One switch point, `getRepositories()` in `frontend/lib/repositories/index.ts`, returns either the existing mock repositories or new HTTP repositories. The HTTP repositories use one `apiFetch` helper that validates responses with Zod.
- Every server-side caller (the three route handlers, the three detail pages and the homepage) goes through the switch. An ESLint rule stops anything outside `lib/repositories/` from importing the mocks directly.
- The AppHost adds the frontend as an `AddJavaScriptApp` resource on port 3000, with `DATA_SOURCE=api` and the API's URL in `API_HTTP`. One Aspire.Hosting.Testing smoke test proves the wiring.

**Tech Stack:** Next.js 16, TypeScript strict, Zod v4, Vitest 4.1.9 (+ `@vitest/coverage-v8`), ESLint 9 flat config; .NET 10, Aspire 13.5.4 (`Aspire.Hosting.JavaScript`, `Aspire.Hosting.Testing`), xUnit v3 on Microsoft Testing Platform; GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-26-backend-modular-monolith-design.md` — §5 (flag, switch point, HTTP repositories, parity check), §6 (AppHost frontend resource), §7 (AppHost smoke test, frontend tests), §8 (CI `apphost` job), §9 phase 3, §11 items 1–3 and 7.

## Global Constraints

- `DATA_SOURCE` is server-only: `mock` (the default, also when unset or empty) or `api`. Any other value throws a clear error.
- `API_HTTP` is the backend base URL, injected by Aspire through `WithReference(api)`. `DATA_SOURCE=api` without it fails fast with a clear message.
- `npm run dev`, unit tests, e2e and CI keep running on mock data. Existing frontend tests must pass **unchanged**.
- HTTP repositories:
  - `findById` maps 404 to `null`;
  - any other non-2xx response, an invalid payload, or a network error or timeout throws;
  - requests time out after **5 s** and use `cache: "no-store"`.
- The reviews adapter maps `subjectId → listingId` and `createdAt → date` using exactly `new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" })`.
- List URLs reuse `listingQueryString` for listings, and the `category && category !== "All"` rule for experiences and services.
- The frontend resource uses `AddJavaScriptApp` (not `AddNextJsApp`), is pinned to port **3000** through `PORT`, and gets `DATA_SOURCE` from `Frontend:DataSource` (default `api`).
- Package versions:
  - `Aspire.Hosting.JavaScript` 13.5.4;
  - `Aspire.Hosting.Testing` 13.5.4;
  - `@vitest/coverage-v8` **4.1.9**, which must equal the installed `vitest`.
- Backend package versions live only in `backend/Directory.Packages.props`. Warnings are errors, and xUnit tests pass `TestContext.Current.CancellationToken`.
- Run frontend commands from `frontend/` and dotnet commands from `backend/`. Run `aspire` from PowerShell only (it is `aspire.cmd`).
- Commits use conventional format and end with exactly:
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
  Never substitute another model name.
- Work on branch `feat/backend-phase3-frontend-flag`, created from `main`.

## Spike findings (already verified — do not re-investigate)

- `AddJavaScriptApp("frontend", "../../../frontend")` with `.WithReference(api)` injects `API_HTTP=http://localhost:<port>` and `services__api__http__0`. The default runs `npm run dev`, and Aspire runs `npm install` itself when `node_modules` is missing.
- Without a launch profile the API also gets an HTTPS endpoint (`API_HTTPS`), which needs a dev certificate that Linux CI runners lack. Passing `launchProfileName: "http"` to `AddProject` removes it. This was verified in the smoke test.
- The dashboard resource snapshot exposes environment variables: `(await app.ResourceNotifications.WaitForResourceHealthyAsync("frontend", ct)).Snapshot.EnvironmentVariables`. Use it instead of the obsolete `GetEnvironmentVariableValuesAsync`, which fails the build under warnings-as-errors.
- The full AppHost smoke test (containers, migrations, API, `next dev`, first page compile) runs in about 35–55 s locally.
- The frontend's homepage listings render client-side (TanStack Query), so the homepage HTML contains no listing titles. The smoke test reads `/rooms/l1` instead, which is server-rendered and goes through listings, hosts and reviews. This deliberately deviates from spec §7's "homepage HTML" wording.
- Backend reviews come newest first with an id tie-break. The mock data is already in that order, so review order is identical in both modes.
- `z.iso.datetime({ offset: true })` accepts both `...Z` and `...+00:00`. The UTC formatter turns `2026-03-01T00:30:00+02:00` into `"February 2026"`.

## Review Focus

1. **An out-of-range filter the mock accepts but the backend rejects** (e.g. `?guests=0` from a hand-edited search URL). Expected: the error thrown names the path and carries the backend's 400 message (`Guests: …`), not a Zod dump. → Task 2, test `a 400 throws with the backend's message`.
2. **A review timestamp with a non-UTC offset near a month boundary.** Expected: the month is computed in UTC (`2026-03-01T00:30:00+02:00` → `February 2026`), whatever the server's timezone. → Task 3, test `formats createdAt as the UTC month`.
3. **Ids containing `/`, `?` or `#`.** Expected: they are encoded into one path segment and can't reach a different backend route. → Task 3, test `encodes ids into a single path segment`.
4. **Backend down or hung.** Expected: the request is abandoned after 5 s, bypasses Next's data cache, and the error names the path. → Task 2, tests `requests bypass the Next data cache and carry a timeout signal` and `a network failure or timeout throws naming the path`.
5. **A mistyped flag (`DATA_SOURCE=API`), or `api` without `API_HTTP`.** Expected: a clear error on the first request, never a silent fallback to mock data. An empty `DATA_SOURCE` means mock. → Task 4, tests in `lib/repositories/index.test.ts`.

---

## File Structure

**Frontend (`frontend/`)**

| File | Change | Responsibility |
|---|---|---|
| `package.json`, `package-lock.json` | Modify | add `@vitest/coverage-v8@4.1.9` |
| `lib/api-client/schemas.ts` | Modify | add `envelopeSchema()`, `hostSchema`, `citySchema`, `reviewDtoSchema`, `ReviewDto` |
| `lib/api-client/schemas.test.ts` | Modify | tests for the new schemas |
| `lib/repositories/city-repository.ts` | Create | `CityRepository` interface |
| `lib/repositories/mock/mock-city-repository.ts` (+ `.test.ts`) | Create | cities from `lib/data/cities` |
| `lib/repositories/http/api-fetch.ts` (+ `.test.ts`) | Create | GET + timeout + no-store + Zod envelope validation; 404 → `null` |
| `lib/repositories/http/http-repositories.ts` (+ `.test.ts`) | Create | `createHttpRepositories(baseUrl)`, `toReview` |
| `lib/repositories/index.ts` (+ `.test.ts`) | Create | `Repositories` type, `getRepositories()` flag switch |
| `app/api/{listings,experiences,services}/route.ts` | Modify | use `getRepositories()` |
| `app/rooms/[id]/page.tsx`, `app/experiences/[id]/page.tsx`, `app/services/[id]/page.tsx` | Modify | use `getRepositories()` |
| `app/page.tsx` | Modify | async; cities through `getRepositories().cities` |
| `eslint.config.mjs` | Modify | `no-restricted-imports` guard on `repositories/mock/*` |

**Backend (`backend/`)**

| File | Change | Responsibility |
|---|---|---|
| `Directory.Packages.props` | Modify | add `Aspire.Hosting.JavaScript`, `Aspire.Hosting.Testing` |
| `src/Airbnb.AppHost/Airbnb.AppHost.csproj` | Modify | reference `Aspire.Hosting.JavaScript` |
| `src/Airbnb.AppHost/AppHost.cs` | Modify | api on the `http` profile; `frontend` resource |
| `src/Airbnb.AppHost/appsettings.json` | Modify | `Frontend:DataSource = api` |
| `tests/Airbnb.AppHost.Tests/Airbnb.AppHost.Tests.csproj` | Create | test project |
| `tests/Airbnb.AppHost.Tests/AppHostSmokeTests.cs` | Create | the smoke test |
| `Airbnb.slnx` | Modify | add the test project |

**Repo root:** `.github/workflows/ci.yml` (backend job lists its three projects; new `apphost` job), `README.md`, `CLAUDE.md`.

---

### Task 1: Coverage tooling, city repository and the new Zod schemas

**Files:**
- Modify: `frontend/package.json`, `frontend/package-lock.json` (via npm)
- Create: `frontend/lib/repositories/city-repository.ts`
- Create: `frontend/lib/repositories/mock/mock-city-repository.ts`
- Test: `frontend/lib/repositories/mock/mock-city-repository.test.ts`
- Modify: `frontend/lib/api-client/schemas.ts` (append)
- Test: `frontend/lib/api-client/schemas.test.ts` (append)

**Interfaces:**
- Consumes: `City`, `Host` from `@/lib/types`; `cities` from `@/lib/data/cities`.
- Produces:
  - `interface CityRepository { findAll(): Promise<City[]> }`
  - `mockCityRepository: CityRepository`
  - `envelopeSchema<T extends z.ZodType>(data: T)`, a Zod object `{ success: boolean; data?: T; error?: string; meta?: { total; page; limit } }`
  - `hostSchema`, `citySchema`
  - `reviewDtoSchema`, parsing `{ id, subjectType: "stay"|"experience", subjectId, authorName, authorAvatar, rating, body, createdAt: ISO string }`
  - `type ReviewDto = z.infer<typeof reviewDtoSchema>`

- [ ] **Step 1: Create the branch and add coverage tooling**

```bash
cd D:/PersonalProjects/airbnb
git checkout main && git pull --ff-only
git checkout -b feat/backend-phase3-frontend-flag
cd frontend
npm install -D @vitest/coverage-v8@4.1.9
npx vitest --version
```

Expected: `vitest/4.1.9`. `package.json` devDependencies now has `"@vitest/coverage-v8": "^4.1.9"`. If `npx vitest --version` shows another version, reinstall coverage with that exact version; the two must match.

- [ ] **Step 2: Write the failing city repository test**

`frontend/lib/repositories/mock/mock-city-repository.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { mockCityRepository } from "./mock-city-repository";

describe("mockCityRepository", () => {
  test("findAll returns every city in mock order", async () => {
    const cities = await mockCityRepository.findAll();
    expect(cities.map((c) => c.id)).toEqual(["wilmington", "athens", "aspen", "malibu", "kyoto", "lisbon"]);
  });
});
```

- [ ] **Step 3: Write the failing schema tests**

Append to `frontend/lib/api-client/schemas.test.ts`, and extend its import to `import { listingSchema, experiencesEnvelopeSchema, servicesEnvelopeSchema, envelopeSchema, hostSchema, citySchema, reviewDtoSchema } from "./schemas";`:

```ts
describe("envelopeSchema", () => {
  test("parses a single-item envelope", () => {
    const parsed = envelopeSchema(hostSchema).parse({
      success: true,
      data: { id: "h1", name: "Maya", avatar: "https://example.com/a.jpg", isSuperhost: true, responseRate: 98, joinedYear: 2019 },
    });
    expect(parsed.data?.name).toBe("Maya");
  });

  test("parses an error envelope without data", () => {
    const parsed = envelopeSchema(hostSchema).parse({ success: false, error: "Host 'x' was not found" });
    expect(parsed.error).toBe("Host 'x' was not found");
  });
});

describe("citySchema", () => {
  test("parses a city", () => {
    const city = { id: "aspen", name: "Aspen", subLabel: "Colorado", image: "https://example.com/c.jpg", listingCount: 4 };
    expect(citySchema.parse(city)).toEqual(city);
  });
});

describe("reviewDtoSchema", () => {
  const dto = {
    id: "l1-r1",
    subjectType: "stay",
    subjectId: "l1",
    authorName: "Sarah",
    authorAvatar: "https://example.com/a.jpg",
    rating: 5,
    body: "Lovely",
    createdAt: "2026-03-01T00:00:00+00:00",
  };

  test("accepts offset and Z timestamps", () => {
    expect(reviewDtoSchema.parse(dto).subjectId).toBe("l1");
    expect(reviewDtoSchema.parse({ ...dto, createdAt: "2026-03-01T00:00:00Z" }).createdAt).toBe("2026-03-01T00:00:00Z");
  });

  test("rejects a preformatted date and an unknown subject type", () => {
    expect(() => reviewDtoSchema.parse({ ...dto, createdAt: "March 2026" })).toThrow();
    expect(() => reviewDtoSchema.parse({ ...dto, subjectType: "service" })).toThrow();
  });
});
```

- [ ] **Step 4: Run the tests and confirm they fail**

Run: `npx vitest run lib/repositories/mock/mock-city-repository.test.ts lib/api-client/schemas.test.ts`
Expected: FAIL — `./mock-city-repository` cannot be resolved; `envelopeSchema` / `hostSchema` / `citySchema` / `reviewDtoSchema` are not exported.

- [ ] **Step 5: Implement**

`frontend/lib/repositories/city-repository.ts`:

```ts
import type { City } from "@/lib/types";

export interface CityRepository {
  findAll(): Promise<City[]>;
}
```

`frontend/lib/repositories/mock/mock-city-repository.ts`:

```ts
import type { City } from "@/lib/types";
import { cities } from "@/lib/data/cities";
import type { CityRepository } from "../city-repository";

export const mockCityRepository: CityRepository = {
  async findAll(): Promise<City[]> {
    return cities;
  },
};
```

Append to `frontend/lib/api-client/schemas.ts`:

```ts
const pageMetaSchema = z.object({ total: z.number(), page: z.number(), limit: z.number() });

/** The backend's `{ success, data?, error?, meta? }` envelope around any payload schema. */
export function envelopeSchema<T extends z.ZodType>(data: T) {
  return z.object({
    success: z.boolean(),
    data: data.optional(),
    error: z.string().optional(),
    meta: pageMetaSchema.optional(),
  });
}

export const hostSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatar: z.string(),
  isSuperhost: z.boolean(),
  responseRate: z.number(),
  joinedYear: z.number().int(),
});

export const citySchema = z.object({
  id: z.string(),
  name: z.string(),
  subLabel: z.string(),
  image: z.string(),
  listingCount: z.number().int().nonnegative(),
});

/** The backend's review shape; the HTTP repository maps it to the frontend `Review`. */
export const reviewDtoSchema = z.object({
  id: z.string(),
  subjectType: z.enum(["stay", "experience"]),
  subjectId: z.string(),
  authorName: z.string(),
  authorAvatar: z.string(),
  rating: z.number(),
  body: z.string(),
  createdAt: z.iso.datetime({ offset: true }),
});

export type ReviewDto = z.infer<typeof reviewDtoSchema>;
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npx vitest run lib/repositories/mock/mock-city-repository.test.ts lib/api-client/schemas.test.ts && npx tsc --noEmit`
Expected: all PASS; tsc prints nothing.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json lib/repositories/city-repository.ts lib/repositories/mock/mock-city-repository.ts lib/repositories/mock/mock-city-repository.test.ts lib/api-client/schemas.ts lib/api-client/schemas.test.ts
git commit -m "feat: add the city repository, backend envelope schemas and coverage tooling

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `apiFetch` — the one HTTP helper

**Files:**
- Create: `frontend/lib/repositories/http/api-fetch.ts`
- Test: `frontend/lib/repositories/http/api-fetch.test.ts`

**Interfaces:**
- Consumes: `envelopeSchema` from `@/lib/api-client/schemas` (Task 1).
- Produces: `apiFetch<T extends z.ZodType>(baseUrl: string, path: string, schema: T): Promise<z.infer<T> | null>`.
  - `path` starts with `/api/...` and may include a query string.
  - It resolves to `null` on 404, and to the envelope's `data` on 2xx with `success: true` and data present.
  - It throws `Error` in every other case. The message starts with `GET <path>`.

- [ ] **Step 1: Write the failing tests**

`frontend/lib/repositories/http/api-fetch.test.ts`:

```ts
// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { apiFetch } from "./api-fetch";

const BASE = "http://backend.test";
const itemSchema = z.object({ id: z.string() });

function stubResponse(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("apiFetch", () => {
  test("returns the envelope data on success", async () => {
    const fetchMock = stubResponse(200, { success: true, data: { id: "a" } });

    await expect(apiFetch(BASE, "/api/things/a", itemSchema)).resolves.toEqual({ id: "a" });
    expect(String(fetchMock.mock.calls[0][0])).toBe("http://backend.test/api/things/a");
  });

  test("requests bypass the Next data cache and carry a timeout signal", async () => {
    const fetchMock = stubResponse(200, { success: true, data: { id: "a" } });

    await apiFetch(BASE, "/api/things/a", itemSchema);

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  test("a 404 resolves to null", async () => {
    stubResponse(404, { success: false, error: "Thing 'x' was not found" });

    await expect(apiFetch(BASE, "/api/things/x", itemSchema)).resolves.toBeNull();
  });

  test("a 400 throws with the backend's message", async () => {
    stubResponse(400, { success: false, error: "Guests: The field Guests must be between 1 and 2147483647." });

    await expect(apiFetch(BASE, "/api/listings?guests=0", itemSchema)).rejects.toThrow(
      "GET /api/listings?guests=0 failed with 400: Guests: The field Guests must be between 1 and 2147483647.",
    );
  });

  test("a 5xx with a non-JSON body throws naming the status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>Bad gateway</html>", { status: 502 })));

    await expect(apiFetch(BASE, "/api/things", itemSchema)).rejects.toThrow("GET /api/things failed with 502");
  });

  test("an invalid payload throws", async () => {
    stubResponse(200, { success: true, data: { id: 42 } });

    await expect(apiFetch(BASE, "/api/things/a", itemSchema)).rejects.toThrow("GET /api/things/a returned an invalid payload");
  });

  test("a success envelope without data throws", async () => {
    stubResponse(200, { success: true });

    await expect(apiFetch(BASE, "/api/things/a", itemSchema)).rejects.toThrow("GET /api/things/a returned no data");
  });

  test("a network failure or timeout throws naming the path", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError")),
    );

    await expect(apiFetch(BASE, "/api/things", itemSchema)).rejects.toThrow(
      "GET /api/things failed: The operation was aborted due to timeout",
    );
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run lib/repositories/http/api-fetch.test.ts`
Expected: FAIL — `./api-fetch` cannot be resolved.

- [ ] **Step 3: Implement**

`frontend/lib/repositories/http/api-fetch.ts`:

```ts
import type { z } from "zod";
import { envelopeSchema } from "@/lib/api-client/schemas";

const REQUEST_TIMEOUT_MS = 5_000;

/**
 * GETs a backend envelope and returns its validated `data`.
 * 404 resolves to null; any other failure throws an Error naming the path.
 * Skips Next's data cache: the backend caches.
 */
export async function apiFetch<T extends z.ZodType>(
  baseUrl: string,
  path: string,
  schema: T,
): Promise<z.infer<T> | null> {
  let response: Response;
  try {
    response = await fetch(new URL(path, baseUrl), {
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`GET ${path} failed: ${reason}`, { cause });
  }

  if (response.status === 404) return null;

  const body: unknown = await response.json().catch(() => undefined);
  const envelope = envelopeSchema(schema).safeParse(body);

  if (!response.ok) {
    const backendError = envelope.success && envelope.data.error ? `: ${envelope.data.error}` : "";
    throw new Error(`GET ${path} failed with ${response.status}${backendError}`);
  }
  if (!envelope.success) {
    throw new Error(`GET ${path} returned an invalid payload: ${envelope.error.message}`);
  }
  if (!envelope.data.success || envelope.data.data === undefined) {
    throw new Error(`GET ${path} returned no data${envelope.data.error ? `: ${envelope.data.error}` : ""}`);
  }
  return envelope.data.data as z.infer<T>;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run lib/repositories/http/api-fetch.test.ts && npx tsc --noEmit`
Expected: 8 PASS; tsc prints nothing.

- [ ] **Step 5: Commit**

```bash
git add lib/repositories/http/api-fetch.ts lib/repositories/http/api-fetch.test.ts
git commit -m "feat: add apiFetch for validated backend requests with a 5 s timeout

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: HTTP repositories and the reviews adapter

**Files:**
- Create: `frontend/lib/repositories/http/http-repositories.ts`
- Test: `frontend/lib/repositories/http/http-repositories.test.ts`

**Interfaces:**
- Consumes:
  - `apiFetch` (Task 2);
  - `listingSchema`, `experienceSchema`, `serviceSchema`, `hostSchema`, `citySchema`, `reviewDtoSchema`, `ReviewDto` (Task 1 plus existing);
  - `listingQueryString` from `@/lib/search/filters`;
  - the repository interfaces;
  - `CityRepository` (Task 1).
- Produces:
  - `interface Repositories { listings: ListingRepository; experiences: ExperienceRepository; services: ServiceRepository; hosts: HostRepository; reviews: ReviewRepository; cities: CityRepository }`, exported from **this file**. Task 4 re-exports it from `lib/repositories/index.ts`.
  - `createHttpRepositories(baseUrl: string): Repositories`
  - `toReview(dto: ReviewDto): Review`

- [ ] **Step 1: Write the failing tests**

`frontend/lib/repositories/http/http-repositories.test.ts`:

```ts
// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";
import { listings } from "@/lib/data/listings";
import { hosts } from "@/lib/data/hosts";
import { cities } from "@/lib/data/cities";
import type { ReviewDto } from "@/lib/api-client/schemas";
import { createHttpRepositories, toReview } from "./http-repositories";

const BASE = "http://backend.test";

/** Serves each "pathname+search" key; anything else is the backend's 404 envelope. */
function stubBackend(routes: Record<string, unknown>) {
  const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    const data = routes[url.pathname + url.search];
    return data === undefined
      ? new Response(JSON.stringify({ success: false, error: "not found" }), { status: 404 })
      : new Response(JSON.stringify({ success: true, data }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function requestedPaths(fetchMock: ReturnType<typeof stubBackend>): string[] {
  return fetchMock.mock.calls.map(([input]) => {
    const url = new URL(String(input));
    return url.pathname + url.search;
  });
}

const dto: ReviewDto = {
  id: "l1-r1",
  subjectType: "stay",
  subjectId: "l1",
  authorName: "Sarah",
  authorAvatar: "https://example.com/a.jpg",
  rating: 5,
  body: "Lovely",
  createdAt: "2026-03-01T00:00:00+00:00",
};

afterEach(() => vi.unstubAllGlobals());

describe("createHttpRepositories", () => {
  const repos = createHttpRepositories(BASE);

  test("listings.findAll sends the filters with the mock's 'anywhere'/'All' semantics", async () => {
    const fetchMock = stubBackend({ "/api/listings?category=Cabins&guests=2": [listings[0]] });

    const result = await repos.listings.findAll({ location: "anywhere", category: "Cabins", guests: 2 });

    expect(result).toEqual([listings[0]]);
    expect(requestedPaths(fetchMock)).toEqual(["/api/listings?category=Cabins&guests=2"]);
  });

  test("experiences and services skip the 'All' category and encode real ones", async () => {
    const fetchMock = stubBackend({ "/api/experiences": [], "/api/services?category=Hair%20%26%20makeup": [] });

    await repos.experiences.findAll({ category: "All" });
    await repos.services.findAll({ category: "Hair & makeup" });

    expect(requestedPaths(fetchMock)).toEqual(["/api/experiences", "/api/services?category=Hair%20%26%20makeup"]);
  });

  test("findById returns the item, or null on 404", async () => {
    stubBackend({ "/api/listings/l1": listings[0], "/api/hosts/h1": hosts[0] });

    expect(await repos.listings.findById("l1")).toEqual(listings[0]);
    expect(await repos.hosts.findById("h1")).toEqual(hosts[0]);
    expect(await repos.listings.findById("l999")).toBeNull();
    expect(await repos.experiences.findById("e999")).toBeNull();
    expect(await repos.services.findById("s999")).toBeNull();
  });

  test("encodes ids into a single path segment", async () => {
    const fetchMock = stubBackend({});

    await repos.listings.findById("a/b?c#d");

    expect(requestedPaths(fetchMock)).toEqual(["/api/listings/a%2Fb%3Fc%23d"]);
  });

  test("cities.findAll returns the cities", async () => {
    stubBackend({ "/api/cities": cities });

    expect(await repos.cities.findAll()).toEqual(cities);
  });

  test("reviews.findByListingId queries by subject and maps to the frontend Review", async () => {
    const fetchMock = stubBackend({ "/api/reviews?subjectId=l1": [dto] });

    const result = await repos.reviews.findByListingId("l1");

    expect(requestedPaths(fetchMock)).toEqual(["/api/reviews?subjectId=l1"]);
    expect(result).toEqual([
      { id: "l1-r1", listingId: "l1", authorName: "Sarah", authorAvatar: "https://example.com/a.jpg", date: "March 2026", rating: 5, body: "Lovely" },
    ]);
  });

  test("a list endpoint answering 404 throws instead of returning nothing", async () => {
    stubBackend({});

    await expect(repos.cities.findAll()).rejects.toThrow("GET /api/cities returned 404");
  });
});

describe("toReview", () => {
  test("formats createdAt as the UTC month", () => {
    expect(toReview(dto).date).toBe("March 2026");
    expect(toReview({ ...dto, createdAt: "2026-03-01T00:30:00+02:00" }).date).toBe("February 2026");
    expect(toReview({ ...dto, createdAt: "2025-12-31T23:59:59Z" }).date).toBe("December 2025");
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run lib/repositories/http/http-repositories.test.ts`
Expected: FAIL — `./http-repositories` cannot be resolved.

- [ ] **Step 3: Implement**

`frontend/lib/repositories/http/http-repositories.ts`:

```ts
import { z } from "zod";
import type { Review } from "@/lib/types";
import {
  citySchema,
  experienceSchema,
  hostSchema,
  listingSchema,
  reviewDtoSchema,
  serviceSchema,
  type ReviewDto,
} from "@/lib/api-client/schemas";
import { listingQueryString } from "@/lib/search/filters";
import type { CityRepository } from "../city-repository";
import type { ExperienceRepository } from "../experience-repository";
import type { HostRepository } from "../host-repository";
import type { ListingRepository } from "../listing-repository";
import type { ReviewRepository } from "../review-repository";
import type { ServiceRepository } from "../service-repository";
import { apiFetch } from "./api-fetch";

export interface Repositories {
  listings: ListingRepository;
  experiences: ExperienceRepository;
  services: ServiceRepository;
  hosts: HostRepository;
  reviews: ReviewRepository;
  cities: CityRepository;
}

// UTC so the server's timezone can never shift a review into another month.
const MONTH_YEAR = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

export function toReview(dto: ReviewDto): Review {
  return {
    id: dto.id,
    listingId: dto.subjectId,
    authorName: dto.authorName,
    authorAvatar: dto.authorAvatar,
    date: MONTH_YEAR.format(new Date(dto.createdAt)),
    rating: dto.rating,
    body: dto.body,
  };
}

function categoryQuery(category?: string): string {
  return category && category !== "All" ? `?category=${encodeURIComponent(category)}` : "";
}

export function createHttpRepositories(baseUrl: string): Repositories {
  async function list<T extends z.ZodType>(path: string, schema: T): Promise<z.infer<T>[]> {
    const data = await apiFetch(baseUrl, path, z.array(schema));
    if (data === null) throw new Error(`GET ${path} returned 404`);
    return data;
  }

  const byId =
    <T extends z.ZodType>(resource: string, schema: T) =>
    (id: string) =>
      apiFetch(baseUrl, `/api/${resource}/${encodeURIComponent(id)}`, schema);

  return {
    listings: {
      findAll: (filters = {}) => list(`/api/listings${listingQueryString(filters)}`, listingSchema),
      findById: byId("listings", listingSchema),
    },
    experiences: {
      findAll: (filters) => list(`/api/experiences${categoryQuery(filters?.category)}`, experienceSchema),
      findById: byId("experiences", experienceSchema),
    },
    services: {
      findAll: (filters) => list(`/api/services${categoryQuery(filters?.category)}`, serviceSchema),
      findById: byId("services", serviceSchema),
    },
    hosts: { findById: byId("hosts", hostSchema) },
    reviews: {
      findByListingId: async (listingId) =>
        (await list(`/api/reviews?subjectId=${encodeURIComponent(listingId)}`, reviewDtoSchema)).map(toReview),
    },
    cities: { findAll: () => list("/api/cities", citySchema) },
  };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run lib/repositories/http && npx tsc --noEmit`
Expected: all PASS; tsc prints nothing.

- [ ] **Step 5: Commit**

```bash
git add lib/repositories/http/http-repositories.ts lib/repositories/http/http-repositories.test.ts
git commit -m "feat: add HTTP repositories backed by the API with a UTC review-date adapter

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `getRepositories()`, call-site switch and the ESLint guard

**Files:**
- Create: `frontend/lib/repositories/index.ts`
- Test: `frontend/lib/repositories/index.test.ts`
- Modify: `frontend/app/api/listings/route.ts`, `frontend/app/api/experiences/route.ts`, `frontend/app/api/services/route.ts`
- Modify: `frontend/app/rooms/[id]/page.tsx`, `frontend/app/experiences/[id]/page.tsx`, `frontend/app/services/[id]/page.tsx`
- Modify: `frontend/app/page.tsx`
- Modify: `frontend/eslint.config.mjs`

**Interfaces:**
- Consumes:
  - `createHttpRepositories` and `Repositories` (Task 3);
  - `mockCityRepository` (Task 1);
  - the five existing mock repositories.
- Produces:
  - `getRepositories(): Repositories`, importable as `@/lib/repositories`;
  - the re-exported `type Repositories`.

- [ ] **Step 1: Write the failing tests**

`frontend/lib/repositories/index.test.ts`:

```ts
// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";
import { cities } from "@/lib/data/cities";
import { getRepositories } from "./index";
import { mockListingRepository } from "./mock/mock-listing-repository";
import { mockCityRepository } from "./mock/mock-city-repository";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("getRepositories", () => {
  test("uses the mock repositories when DATA_SOURCE is unset or empty", () => {
    vi.stubEnv("DATA_SOURCE", undefined);
    expect(getRepositories().listings).toBe(mockListingRepository);

    vi.stubEnv("DATA_SOURCE", "");
    expect(getRepositories().cities).toBe(mockCityRepository);
  });

  test("uses the mock repositories when DATA_SOURCE=mock", () => {
    vi.stubEnv("DATA_SOURCE", "mock");
    expect(getRepositories().listings).toBe(mockListingRepository);
  });

  test("uses the API at API_HTTP when DATA_SOURCE=api", async () => {
    vi.stubEnv("DATA_SOURCE", "api");
    vi.stubEnv("API_HTTP", "http://backend.test");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: cities }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const repos = getRepositories();

    expect(repos.listings).not.toBe(mockListingRepository);
    expect(await repos.cities.findAll()).toEqual(cities);
    expect(String(fetchMock.mock.calls[0][0])).toBe("http://backend.test/api/cities");
  });

  test("throws when DATA_SOURCE=api has no API_HTTP", () => {
    vi.stubEnv("DATA_SOURCE", "api");
    vi.stubEnv("API_HTTP", undefined);

    expect(() => getRepositories()).toThrow("DATA_SOURCE=api needs API_HTTP");
  });

  test("throws on any other DATA_SOURCE value instead of falling back", () => {
    vi.stubEnv("DATA_SOURCE", "API");

    expect(() => getRepositories()).toThrow('DATA_SOURCE must be "mock" or "api", got "API"');
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run lib/repositories/index.test.ts`
Expected: FAIL — `./index` cannot be resolved.

- [ ] **Step 3: Implement `getRepositories()`**

`frontend/lib/repositories/index.ts`:

```ts
import { createHttpRepositories, type Repositories } from "./http/http-repositories";
import { mockCityRepository } from "./mock/mock-city-repository";
import { mockExperienceRepository } from "./mock/mock-experience-repository";
import { mockHostRepository } from "./mock/mock-host-repository";
import { mockListingRepository } from "./mock/mock-listing-repository";
import { mockReviewRepository } from "./mock/mock-review-repository";
import { mockServiceRepository } from "./mock/mock-service-repository";

export type { Repositories };

const mockRepositories: Repositories = {
  listings: mockListingRepository,
  experiences: mockExperienceRepository,
  services: mockServiceRepository,
  hosts: mockHostRepository,
  reviews: mockReviewRepository,
  cities: mockCityRepository,
};

/**
 * The one switch between mock data and the backend, driven by the server-only
 * DATA_SOURCE flag (mock by default). Reads the env on every call.
 */
export function getRepositories(): Repositories {
  const source = process.env.DATA_SOURCE || "mock";
  if (source === "mock") return mockRepositories;
  if (source !== "api") throw new Error(`DATA_SOURCE must be "mock" or "api", got "${source}"`);

  const baseUrl = process.env.API_HTTP;
  if (!baseUrl) throw new Error("DATA_SOURCE=api needs API_HTTP, the backend base URL (Aspire sets it)");
  return createHttpRepositories(baseUrl);
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run lib/repositories/index.test.ts`
Expected: 5 PASS.

- [ ] **Step 5: Switch the route handlers**

`frontend/app/api/listings/route.ts`: replace the import line
`import { mockListingRepository } from "@/lib/repositories/mock/mock-listing-repository";`
with `import { getRepositories } from "@/lib/repositories";`. Then replace
`const data = await mockListingRepository.findAll({` with
`const data = await getRepositories().listings.findAll({`.

`frontend/app/api/experiences/route.ts` in full:

```ts
import { getRepositories } from "@/lib/repositories";
import { ok } from "@/lib/api/envelope";

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") ?? undefined;
  const data = await getRepositories().experiences.findAll({ category });
  return Response.json(ok(data, { total: data.length, page: 1, limit: data.length }));
}
```

`frontend/app/api/services/route.ts` in full:

```ts
import { getRepositories } from "@/lib/repositories";
import { ok } from "@/lib/api/envelope";

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") ?? undefined;
  const data = await getRepositories().services.findAll({ category });
  return Response.json(ok(data, { total: data.length, page: 1, limit: data.length }));
}
```

- [ ] **Step 6: Switch the detail pages**

`frontend/app/rooms/[id]/page.tsx`: replace the three `mock*Repository` import lines with `import { getRepositories } from "@/lib/repositories";`. Then replace the data-loading block with:

```tsx
  const { id } = await params;
  const repos = getRepositories();
  const listing = await repos.listings.findById(id);
  if (!listing) notFound();

  const [host, reviews] = await Promise.all([
    repos.hosts.findById(listing.hostId),
    repos.reviews.findByListingId(listing.id),
  ]);
```

`frontend/app/experiences/[id]/page.tsx`: replace the three `mock*Repository` import lines with `import { getRepositories } from "@/lib/repositories";`. Then replace the data-loading block with:

```tsx
  const { id } = await params;
  const repos = getRepositories();
  const experience = await repos.experiences.findById(id);
  if (!experience) notFound();

  const [host, reviews] = await Promise.all([
    repos.hosts.findById(experience.hostId),
    repos.reviews.findByListingId(experience.id),
  ]);
```

`frontend/app/services/[id]/page.tsx`: replace the `mockServiceRepository` import with `import { getRepositories } from "@/lib/repositories";`. Then replace
`const service = await mockServiceRepository.findById(id);` with
`const service = await getRepositories().services.findById(id);`.

- [ ] **Step 7: Switch the homepage**

`frontend/app/page.tsx` in full:

```tsx
import { TopNav, Footer } from "@/components/design-system";
import { StickyHomeSearch } from "@/components/features/search-bar/sticky-home-search";
import { HomeListings } from "@/components/features/home-listings";
import { CityLinkGrid } from "@/components/features/city-link-grid";
import { getRepositories } from "@/lib/repositories";

export default async function Home() {
  const cities = await getRepositories().cities.findAll();

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav active="homes" />
      <StickyHomeSearch />
      <main className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col gap-12 px-6 py-8">
        <HomeListings />
        <CityLinkGrid cities={cities} />
      </main>
      <Footer />
    </div>
  );
}
```

`components/features/search-bar/home-search-bar.tsx` keeps its static `@/lib/data/cities` import. It is a client component (search suggestions) and can't call a server-side repository. That matches the spec: the guard covers `repositories/mock/*` only.

- [ ] **Step 8: Add the ESLint guard**

In `frontend/eslint.config.mjs`, add this object to the `defineConfig([...])` array after `...nextTs,`:

```js
  {
    // Everything outside lib/repositories goes through getRepositories(), so the DATA_SOURCE flag always applies.
    ignores: ["lib/repositories/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/repositories/mock/*", "**/repositories/mock/*"],
              message: "Import getRepositories from @/lib/repositories so the DATA_SOURCE flag applies.",
            },
          ],
        },
      ],
    },
  },
```

- [ ] **Step 9: Prove the guard fires, then remove the probe**

```bash
printf 'import { mockListingRepository } from "@/lib/repositories/mock/mock-listing-repository";\nexport const probe = mockListingRepository;\n' > app/lint-probe.ts
npx eslint app/lint-probe.ts; echo "exit=$?"
rm app/lint-probe.ts
```

Expected: one `no-restricted-imports` error with the message above, and `exit=1`.

- [ ] **Step 10: Run the whole frontend suite, type check and lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: every test passes, including the unchanged route handler and page tests, which run on mock data because `DATA_SOURCE` is unset. tsc and lint are clean. Also confirm nothing outside `lib/repositories/` still imports a mock:

```bash
grep -rn "repositories/mock" app components lib --include=*.ts --include=*.tsx | grep -v "^lib/repositories/"
```

Expected: no output.

- [ ] **Step 11: Commit**

```bash
git add lib/repositories app eslint.config.mjs
git status --short   # expect only the files listed for this task
git commit -m "feat: route every data read through the DATA_SOURCE flag

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Frontend in the AppHost, the smoke test, CI and docs

**Files:**
- Modify: `backend/Directory.Packages.props`
- Modify: `backend/src/Airbnb.AppHost/Airbnb.AppHost.csproj`
- Modify: `backend/src/Airbnb.AppHost/AppHost.cs`
- Modify: `backend/src/Airbnb.AppHost/appsettings.json`
- Create: `backend/tests/Airbnb.AppHost.Tests/Airbnb.AppHost.Tests.csproj`
- Create: `backend/tests/Airbnb.AppHost.Tests/AppHostSmokeTests.cs`
- Modify: `backend/Airbnb.slnx`
- Modify: `.github/workflows/ci.yml`, `README.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: Task 4's `getRepositories()`, which reads `DATA_SOURCE` and `API_HTTP` when the frontend handles a request.
- Produces:
  - AppHost resource `frontend` on `http://localhost:3000` with `DATA_SOURCE` and `API_HTTP`;
  - the API resource on the `http` launch profile only;
  - test class `Airbnb.AppHost.Tests.AppHostSmokeTests`.

- [ ] **Step 1: Add the packages**

In `backend/Directory.Packages.props`:
- In the `Aspire hosting` item group, add
  `<PackageVersion Include="Aspire.Hosting.JavaScript" Version="13.5.4" />`
  above the PostgreSQL line.
- In the test packages item group (next to `Microsoft.AspNetCore.Mvc.Testing`), add
  `<PackageVersion Include="Aspire.Hosting.Testing" Version="13.5.4" />`.
  Keep each group alphabetical.

In `backend/src/Airbnb.AppHost/Airbnb.AppHost.csproj`, add `<PackageReference Include="Aspire.Hosting.JavaScript" />` as the first package reference.

- [ ] **Step 2: Write the smoke test project (failing)**

`backend/tests/Airbnb.AppHost.Tests/Airbnb.AppHost.Tests.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <IsPackable>false</IsPackable>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Aspire.Hosting.Testing" />
    <PackageReference Include="Microsoft.Testing.Extensions.CodeCoverage" />
    <PackageReference Include="xunit.v3" />
  </ItemGroup>

  <ItemGroup>
    <Using Include="Xunit" />
  </ItemGroup>

  <ItemGroup>
    <ProjectReference Include="..\..\src\Airbnb.AppHost\Airbnb.AppHost.csproj" />
  </ItemGroup>

</Project>
```

`backend/tests/Airbnb.AppHost.Tests/AppHostSmokeTests.cs`:

```csharp
using System.Net.Http.Json;
using System.Text.Json;
using Aspire.Hosting;
using Aspire.Hosting.Testing;

namespace Airbnb.AppHost.Tests;

public sealed class AppHostSmokeTests
{
    private static readonly TimeSpan StartupTimeout = TimeSpan.FromMinutes(5);

    // next dev compiles a page on its first request.
    private static readonly TimeSpan FirstPageTimeout = TimeSpan.FromMinutes(3);

    [Fact]
    public async Task The_frontend_serves_backend_data_under_aspire()
    {
        var ct = TestContext.Current.CancellationToken;
        var appHost = await DistributedApplicationTestingBuilder.CreateAsync<Projects.Airbnb_AppHost>(ct);
        await using var app = await appHost.BuildAsync(ct);
        await app.StartAsync(ct);

        using var startup = CancellationTokenSource.CreateLinkedTokenSource(ct);
        startup.CancelAfter(StartupTimeout);
        await app.ResourceNotifications.WaitForResourceHealthyAsync("api", startup.Token);
        var frontend = await app.ResourceNotifications.WaitForResourceHealthyAsync("frontend", startup.Token);

        var env = frontend.Snapshot.EnvironmentVariables;
        Assert.Contains(env, v => v.Name == "DATA_SOURCE" && v.Value == "api");
        Assert.Contains(env, v => v.Name == "API_HTTP" && v.Value?.StartsWith("http://", StringComparison.Ordinal) == true);

        using var api = app.CreateHttpClient("api", "http");
        var listings = await api.GetFromJsonAsync<JsonElement>("/api/listings", ct);
        Assert.Equal(16, listings.GetProperty("meta").GetProperty("total").GetInt32());

        // Server-rendered through getRepositories(): listing, host and reviews all come from the API in api mode.
        using var web = app.CreateHttpClient("frontend");
        web.Timeout = FirstPageTimeout;
        var html = await web.GetStringAsync("/rooms/l1", ct);
        Assert.Contains("Cozy cabin in the pines", html);
    }
}
```

Add the project to `backend/Airbnb.slnx` inside the `/tests/` folder, keeping alphabetical order:
`<Project Path="tests/Airbnb.AppHost.Tests/Airbnb.AppHost.Tests.csproj" />`
goes after the `Airbnb.Api.Tests` line.

Make sure nothing else is listening on port 3000 (stop `npm run dev` or `aspire run`). Then run from `backend/`:

`dotnet test --project tests/Airbnb.AppHost.Tests`

Expected: FAIL. `WaitForResourceHealthyAsync("frontend")` throws because no resource named `frontend` exists yet.

- [ ] **Step 3: Add the frontend resource**

`backend/src/Airbnb.AppHost/AppHost.cs`: change the API declaration and add the frontend. The file after the change:

```csharp
var builder = DistributedApplication.CreateBuilder(args);

var postgres = builder.AddPostgres("postgres")
    .WithDataVolume()
    .WithLifetime(ContainerLifetime.Persistent)
    .WithPgWeb();
var db = postgres.AddDatabase("airbnb");

var redis = builder.AddRedis("redis")
    .WithLifetime(ContainerLifetime.Persistent);

var rabbitmq = builder.AddRabbitMQ("rabbitmq")
    .WithManagementPlugin()
    .WithLifetime(ContainerLifetime.Persistent);

var migrations = builder.AddProject<Projects.Airbnb_MigrationService>("migrations")
    .WithReference(db)
    .WaitFor(db);

// The http profile only: an HTTPS endpoint would need a dev certificate, which CI runners don't have.
var api = builder.AddProject<Projects.Airbnb_Api>("api", launchProfileName: "http")
    .WithReference(db)
    .WithReference(redis)
    .WithReference(rabbitmq)
    .WaitFor(db)
    .WaitFor(redis)
    .WaitFor(rabbitmq)
    .WaitForCompletion(migrations)
    .WithHttpHealthCheck("/health");

// Port 3000 so Playwright (baseURL localhost:3000, reuseExistingServer) can run e2e against this frontend.
builder.AddJavaScriptApp("frontend", "../../../frontend")
    .WithHttpEndpoint(port: 3000, env: "PORT")
    .WithReference(api)
    .WaitFor(api)
    .WithEnvironment("DATA_SOURCE", builder.Configuration["Frontend:DataSource"] ?? "api");

builder.Build().Run();
```

`backend/src/Airbnb.AppHost/appsettings.json`: add the `Frontend` section:

```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning",
      "Aspire.Hosting.Dcp": "Warning"
    }
  },
  "Frontend": {
    "DataSource": "api"
  }
}
```

- [ ] **Step 4: Run the smoke test and confirm it passes**

Run (port 3000 free): `dotnet test --project tests/Airbnb.AppHost.Tests`
Expected: 1 PASS in roughly 35–90 s. The first run on a machine without `frontend/node_modules` takes longer, because Aspire runs `npm install`.

Then run the other three projects so nothing regressed:

`dotnet test --project tests/Airbnb.UnitTests && dotnet test --project tests/Airbnb.ArchitectureTests && dotnet test --project tests/Airbnb.Api.Tests`
Expected: 17 + 12 + 45 pass.

- [ ] **Step 5: CI — keep the backend job fast, add the `apphost` job**

In `.github/workflows/ci.yml`, replace the backend job's last step `- run: dotnet test` with:

```yaml
      - run: |
          dotnet test --project tests/Airbnb.UnitTests
          dotnet test --project tests/Airbnb.ArchitectureTests
          dotnet test --project tests/Airbnb.Api.Tests
```

Append a new job at the end of `jobs:`:

```yaml
  apphost:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: 10.0.x
      - run: dotnet test --project tests/Airbnb.AppHost.Tests
```

- [ ] **Step 6: Docs**

`README.md`:
- In the **Frontend** section, after the code block, add:

  ```markdown
  Data comes from in-repo mock data by default. `DATA_SOURCE=api` (server-only; needs `API_HTTP`, the backend URL) switches every page to the backend — Aspire sets both.
  ```

- In the **Backend** section, change the two code lines to:

  ```powershell
  aspire run    # dashboard + postgres, redis, rabbitmq, migrations, api, frontend (http://localhost:3000, on the API)
  dotnet test   # unit, architecture, integration and AppHost smoke tests (Docker; the smoke test needs port 3000 free)
  ```

- Append these bullets to the Backend list:

  ```markdown
  - Under Aspire the frontend runs on the backend (`DATA_SOURCE=api`). Set `Frontend:DataSource` to `mock` in `src/Airbnb.AppHost/appsettings.json` to run it on mock data instead.
  - Parity check: with `aspire run` up, `npm run e2e` in `frontend/` runs the whole e2e suite against the backend (Playwright reuses the server on port 3000).
  ```

`CLAUDE.md`:
- In **Repository Layout**, in the backend bullet's test list, change `tests/Airbnb.Api.Tests` (integration) to `tests/Airbnb.Api.Tests` (integration), `tests/Airbnb.AppHost.Tests` (Aspire smoke test).
- Replace the **Data Layer** code block and the two bullets under it with:

  ````markdown
  ```
  lib/data/              Static mock data arrays (listings, hosts, reviews, cities, experiences, services)
  lib/repositories/      Repository interfaces + getRepositories() (index.ts) — the DATA_SOURCE switch
    mock/                mock*Repository implementations over lib/data
    http/                apiFetch + createHttpRepositories(API_HTTP) — the .NET API, Zod-validated
  lib/api/envelope.ts    ApiResponse<T> type + ok()/fail() helpers
  app/api/*/route.ts     GET /api/{listings,experiences,services} — call getRepositories()
  lib/api-client/        fetch* functions + Zod schemas validating the envelope
  lib/hooks/             TanStack Query wrappers (useListings, …)
  ```

  - `DATA_SOURCE=mock|api` (server-only, default `mock`; `api` needs `API_HTTP`) selects the implementations. Server code gets data only through `getRepositories()`; ESLint forbids importing `repositories/mock/*` outside `lib/repositories/`.
  - Server components (detail pages, the homepage's cities) call `getRepositories()` directly; client components fetch the Next `/api/*` route handlers, which call it too.
  ````

- In **Backend Conventions**, append:

  ```markdown
  - The AppHost runs the frontend (`AddJavaScriptApp`, port 3000, `DATA_SOURCE` from `Frontend:DataSource`, default `api`) and the API on its `http` launch profile only. `tests/Airbnb.AppHost.Tests` starts the whole AppHost, so it needs Docker and port 3000 free; CI runs it in its own `apphost` job.
  ```

- [ ] **Step 7: Commit**

```bash
cd D:/PersonalProjects/airbnb
git add backend/Directory.Packages.props backend/src/Airbnb.AppHost backend/tests/Airbnb.AppHost.Tests backend/Airbnb.slnx .github/workflows/ci.yml README.md CLAUDE.md
git commit -m "feat: run the frontend on the API under Aspire with an AppHost smoke test

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Verification in both modes

No new code. Fix anything that fails in the task that owns it, then re-run.

- [ ] **Step 1: Mock mode (DATA_SOURCE unset), from `frontend/`**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build && npm run seed:check && npm run e2e`
Expected: all pass. The test count is the previous 232 plus the new tests.

- [ ] **Step 2: Coverage of the new frontend code**

Run: `npm run test:coverage`
Expected: the text report shows at least 80% line coverage for each of:
- `lib/repositories/index.ts`
- `lib/repositories/http/api-fetch.ts`
- `lib/repositories/http/http-repositories.ts`
- `lib/repositories/mock/mock-city-repository.ts`

- [ ] **Step 3: Backend, from `backend/`**

Run: `dotnet test` (port 3000 free)
Expected: unit 17, architecture 12, integration 45 and AppHost 1 all pass.

- [ ] **Step 4: API-mode parity (spec §11.1–11.2), from PowerShell**

```powershell
cd D:\PersonalProjects\airbnb\backend
aspire start --non-interactive
aspire wait frontend --non-interactive
cd ..\frontend
npm run e2e
cd ..\backend
aspire stop --non-interactive
```

Expected:
- `aspire start` reports postgres, redis and rabbitmq running, migrations finished, api healthy and frontend running.
- The full e2e suite passes against the Aspire frontend on port 3000.

If e2e fails only in API mode with HTTP 429 from the API (rate limit: 600 reads/min per IP, and every request comes from Next's single IP), give the API's `WithEnvironment` a higher `RateLimiting__ReadsPerMinute` in `AppHost.cs`. Commit that separately with a `fix:` message. Any other API-mode-only failure is a parity bug: fix it in the owning task's code.

- [ ] **Step 5: Report**

Report every command above with its result: counts, coverage percentages, and whether e2e passed in each mode.
