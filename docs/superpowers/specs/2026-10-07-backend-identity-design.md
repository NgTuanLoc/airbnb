# Backend Phase 5 — Identity (Real Authentication) — Design

**Date:** 2026-10-07
**Status:** Approved by the user in advance ("just think and get the best plan, do not have to ask me", then "LGTM do it please" on the four-phase roadmap). Design calls below are the controller's; review happens on the branch.
**Roadmap:** phase 1 of 4. The later phases are Bookings with availability, reviews from trips, and persisting wishlists and host listings.
**Builds on:**
- `2026-09-26-backend-modular-monolith-design.md` (modules, envelope, Aspire, caching, rate limiting);
- `2026-09-27-frontend-phase6-auth-wishlists-trips-design.md` (the mock session the frontend uses today).

## Goal

Replace the frontend's mock login with real accounts in the .NET backend:
- users with hashed passwords;
- server-side sessions that logout really revokes;
- an ASP.NET authentication scheme, so later modules protect endpoints with one call.

The browser never holds a forgeable cookie in `DATA_SOURCE=api` mode.

## Success criteria

1. In `DATA_SOURCE=api` mode:
   - register creates an account in Postgres;
   - login fails with a wrong password;
   - a tampered, expired or logged-out session cookie reads as logged out;
   - the session survives a Next.js restart.
2. `DATA_SOURCE=mock` keeps working exactly as today. Unit and e2e tests run against it and must stay green unchanged, apart from mechanical `await` changes.
3. The backend exposes `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout` and `GET /api/auth/me`, all in the envelope format. Integration tests cover each status code below.
4. Any later module can call `.RequireAuthorization()` and read the user id from `ClaimTypes.NameIdentifier`.
5. Rate limiting is per real browser IP, not per Next.js server, which closes the `ponytail:` note in `ApiRateLimiting.cs`.
6. Frontend route handlers never return a bare 500. A backend failure becomes a `{ success: false, error }` envelope. `getRepositories()` and the auth gateway cannot be imported into client bundles.

## Decisions

| Decision | Choice | Why (and rejected alternatives) |
|---|---|---|
| Credentials | A custom `users` table, with `PasswordHasher<User>` from `Microsoft.Extensions.Identity.Core` (PBKDF2, versioned hashes) | Full ASP.NET Identity brings ~7 tables, roles and claims we don't need, and `MapIdentityApi` responses don't use our envelope. Rolling our own hashing is out: the framework hasher is battle-tested and rehash-aware. |
| Session tokens | Opaque random tokens (32 bytes, base64url). Only the SHA-256 hash is stored, in a `sessions` table, with a fixed 7-day expiry. | Logout really revokes, and there's no signing key to manage or rotate in Aspire. A JWT can't be revoked without a denylist, and it puts a secret into config. A DB lookup per request is a primary-key hit. |
| Authentication | A custom `AuthenticationHandler` scheme `"Session"` that reads `Authorization: Bearer <token>` | Plugs into `UseAuthentication`/`RequireAuthorization`, so phase 2 needs no new plumbing. |
| Frontend | An `AuthGateway` interface, mock or HTTP, chosen by `DATA_SOURCE` exactly like the repositories. The httpOnly `session` cookie holds the gateway's token. | Mock mode, tests and e2e are untouched. In api mode the cookie holds an opaque backend token instead of a readable user. |
| Mock mode security | Stays the deliberately unsigned demo cookie, documented as dev/test only | It has no credentials to protect. The AppHost runs api mode by default. |
| Client IP | Next forwards `X-Forwarded-For`. The backend uses `ForwardedHeaders` and trusts only loopback proxies (the Next server in Aspire). | The rate limiter can then partition by real client. |
| User ids | `usr_` + a UUID v7 | Distinct from mock `u-<email>` ids. Frontend code treats ids as opaque strings, including host-listing `hostId`. |

## 1. Backend: the `Identity` module

Location: `backend/src/Modules/Identity/Airbnb.Modules.Identity/`, following the module rules in CLAUDE.md:
- `IdentityModule.cs` (`AddIdentityModule`, `AddIdentityModuleDatabase`, `MapIdentityEndpoints`);
- one file per slice;
- `Data/IdentityDbContext.cs` in schema `identity`, with migrations.
- No Contracts project yet: phase 2 reads the user id from the `ClaimsPrincipal`, not through a module call.

### Data

**`users`:**
- `Id` (text PK, `usr_…`);
- `Email` (text, stored trimmed and lower-cased; unique index);
- `Name` (text, 1–60);
- `PasswordHash` (text);
- `CreatedAt` (timestamptz).

**`sessions`:**
- `TokenHash` (text PK: hex SHA-256 of the raw token);
- `UserId` (text, FK to `users`, indexed);
- `CreatedAt`;
- `ExpiresAt`.

No seed data.

### Endpoints (under `/api`; every body is the `ApiResponse` envelope)

| Endpoint | Request | Success | Errors |
|---|---|---|---|
| `POST /auth/register` | `{ name, email, password }`. Validation: name 1–60 after trim, email ≤ 254 and valid, password 8–128 | 201 `{ user, token, expiresAt }` | 400 validation (field message); 409 `An account with that email already exists` |
| `POST /auth/login` | `{ email, password }` | 200 `{ user, token, expiresAt }` | 400 validation; 401 `Email or password is incorrect` |
| `POST /auth/logout` | `Authorization: Bearer <token>` | 204, idempotent: unknown or missing tokens also get 204 | none |
| `GET /auth/me` | `Authorization: Bearer <token>` | 200 `user` | 401 `Log in to continue` |

`user` is `{ id, name, email }`, the same shape as the frontend `User`.

### Behaviour

- **Email** is normalised (trim, lower-case) before every lookup and insert. A concurrent duplicate insert that loses the unique-index race also returns 409.
- **Unknown email on login:** the handler still runs a hash verification against a fixed dummy hash, so response time doesn't reveal which emails exist. The response is the same 401 as for a wrong password.
- **Rehash:** `PasswordVerificationResult.SuccessRehashNeeded` updates the stored hash.
- **Session lookup** (in the auth handler):
  1. Hash the bearer token.
  2. Find the session by primary key with `ExpiresAt > now`, joined to its user.
  3. On a hit, authenticate with claims `NameIdentifier`, `Name` and `Email`.
  4. On a miss, `NoResult`.

  Expired rows are deleted when they are hit. `ponytail:` no periodic purge; add a Wolverine scheduled job if the table grows.
- `TimeProvider` is injected everywhere "now" is read, so tests can control time.
- **Failure envelope:** the scheme's challenge writes the 401 envelope `Log in to continue`, so `RequireAuthorization()` failures match the rest of the API.
- **Pipeline order** in `Program.cs`: `UseForwardedHeaders` (first) → exception handler → status pages → `UseAuthentication` → `UseAuthorization` → `UseRateLimiter`.
- **Rate limiting:** the auth endpoints are writes, so they fall under the existing per-client write limit, now per real client IP.

## 2. Frontend: the auth gateway

`lib/auth/gateway.ts` (`import "server-only"`):

```ts
export interface AuthSession { user: User; token: string; expiresAt: string }
export type AuthResult = { ok: true; session: AuthSession } | { ok: false; status: number; error: string };
export interface AuthGateway {
  register(input: { name: string; email: string; password: string }): Promise<AuthResult>;
  login(input: { email: string; password: string }): Promise<AuthResult>;
  logout(token: string): Promise<void>;
  me(token: string): Promise<User | null>;
}
export function getAuthGateway(): AuthGateway; // mock unless DATA_SOURCE=api
```

### Mock gateway (`lib/auth/mock-gateway.ts`)

Today's behaviour:
- any valid input succeeds;
- `token` is the base64url-encoded user (today's cookie value);
- `me` decodes it;
- `logout` does nothing.

### HTTP gateway (`lib/auth/http-gateway.ts`)

- Calls the backend through `API_HTTP` with a 5-second timeout.
- Validates every response with Zod.
- Maps 400/401/409 to `{ ok: false, status, error }` using the backend's message.
- `me` returns null on 401.
- Forwards the browser's IP as `X-Forwarded-For`; the caller passes it in.

### Cookie and session helpers

- `lib/auth/session.ts` keeps the cookie name, attributes and 7-day max age. The value becomes the gateway token.
- `sessionFromRequest(request)` becomes `async` and returns `getAuthGateway().me(token)`.
- `getSession()` does the same with `cookies()`, wrapped in React `cache()` so one render makes one backend call.

### Route handlers

- **Login and register** call the gateway and set the cookie from `session.token`. On failure they return the backend's status and message in the envelope.
- **Logout** calls `gateway.logout(token)`, then clears the cookie.
- **Session** awaits `sessionFromRequest`.
- **Every other handler** that reads the session adds `await`.

UI components are unchanged: the login and register forms already show the envelope's `error`.

### Validation

The frontend's register schema already requires name ≥ 2 and password ≥ 8. The backend is the authority and its messages reach the user.

## 3. Folded-in fixes

- **No bare 500s from route handlers.** `lib/api/request.ts` gains `withErrorEnvelope(handler)`. It catches anything thrown, logs it server-side with `console.error`, and returns `jsonError("Something went wrong. Try again.", 500)`. Every `app/api/**/route.ts` export is wrapped.
- **`server-only` guard.**
  - Add the `server-only` package.
  - Import it in `lib/repositories/index.ts` and `lib/auth/gateway.ts`.
  - Alias it to an empty module in the Vitest config, so tests still import those files.
- **Client IP.** `lib/auth/client-ip.ts` reads the first `x-forwarded-for` entry from the incoming request headers, falling back to none. The HTTP gateway forwards it. Repository GETs aren't forwarded in this phase: reads have a 600/min limit, and the gateway is the write path.

## 4. Testing

### Backend

**Unit tests (`Airbnb.UnitTests`):**
- token hashing is stable and hex;
- email normalisation.

The auth handler itself is covered by the integration tests, so it needs no fake database.

**Integration tests (`Airbnb.Api.Tests`, shared `InfrastructureFixture`):**
- register → 201 with a token; `me` with that token → 200;
- duplicate email (different case) → 409;
- validation 400s: short password, bad email, blank name;
- login with the wrong password and with an unknown email → the same 401 message;
- `me` without a token, with a garbage token, and after logout → 401;
- an expired session → 401, using `ApiFactory` with a fake `TimeProvider` advanced past 7 days;
- logout is idempotent → 204 twice;
- the stored hash isn't the password, and sessions store a hash, not the token.

**Rules and wiring:**
- `ModuleRulesTests` lists the new assembly.
- `InfrastructureFixture` and `Airbnb.MigrationService` migrate the identity schema.

### Frontend

- `mock-gateway` keeps today's behaviour.
- `http-gateway` uses a mocked `fetch` to cover success, 401/409 mapping, the timeout and invalid payloads, and that `X-Forwarded-For` is forwarded.
- The auth route handlers run with a stub gateway for both modes' outcomes.
- `withErrorEnvelope` turns a throwing repository into a 500 envelope.
- The existing route tests pass with `await`.

**E2E:** unchanged; runs in mock mode. The AppHost smoke test keeps running api mode end to end.

## 5. Docs

**`CLAUDE.md`:**
- the Identity module;
- the `AuthGateway` and how `DATA_SOURCE` selects it;
- `withErrorEnvelope`;
- `server-only`;
- forwarded headers.

**`docs/superpowers/specs/2026-09-26-backend-modular-monolith-design.md`:** add a note linking this spec.

## Out of scope

- Email verification, password reset, OAuth and social login, 2FA, account deletion, profile editing.
- Moving wishlists, bookings and host data to the backend. They stay frontend mocks keyed by user id until phases 2 and 4.
- Account lockout beyond IP rate limiting.
