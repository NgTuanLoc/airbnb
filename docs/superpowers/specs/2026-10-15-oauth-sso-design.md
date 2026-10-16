# OAuth Sign-in and Enterprise SSO — Design

**Date:** 2026-10-15
**Status:** Scope approved by the user: Google and GitHub buttons, enterprise SSO over OIDC with a Keycloak "Acme" demo provider, and "log in with your password, then connect" for email collisions. Architecture and remaining calls are the controller's; review happens on the branch.
**Builds on:**
- `2026-10-07-backend-identity-design.md` (users, opaque session tokens, the `Session` scheme, the auth gateway);
- `2026-09-27-frontend-phase6-auth-wishlists-trips-design.md` (the session cookie, `next` paths);
- `2026-09-26-backend-modular-monolith-design.md` (modules, envelope, Aspire).

## Goal

Sign in the way modern sites do:
- **Continue with Google** and **Continue with GitHub** on the log-in and sign-up pages;
- **Continue with SSO**: a person enters a work email and is sent to their company's identity provider (Okta, Entra ID, Google Workspace, Keycloak…) over OpenID Connect;
- a **Login & security** page where a signed-in person connects and disconnects those sign-in methods.

An external sign-in ends exactly like a password login: the backend issues its opaque session token and Next stores it in the httpOnly `session` cookie. Nothing downstream changes.

## Success criteria

1. In `DATA_SOURCE=api` mode with provider credentials configured:
   - "Continue with Google/GitHub" creates an account on first use, signs into the same account afterwards, and survives a Next restart like any session;
   - "Continue with SSO" with an `@acme.test` email signs in through the Keycloak demo realm under `aspire run`, with no extra setup;
   - an email that already belongs to a password account is refused with guidance, and that person can connect the provider from Login & security after logging in with their password;
   - a forged, replayed, expired or mixed-up callback never produces a session.
2. Client secrets never leave the backend; the browser only ever holds the httpOnly session and flow cookies.
3. `DATA_SOURCE=mock` gets the whole experience through a built-in demo provider page, so the e2e suite covers it without real credentials. The demo page does not exist in api mode.
4. Existing password login, registration, session and e2e behaviour is unchanged.
5. Every new backend endpoint answers in the envelope format, and integration tests cover each status code below against a fake identity provider.

## Decisions

| Decision | Choice | Why (and rejected alternatives) |
|---|---|---|
| Where OAuth lives | The backend Identity module runs the authorization-code flow; Next relays the browser's redirects and stores cookies | The Identity module already owns accounts and sessions. **Auth.js / Better Auth** in Next would own users and sessions a second time and put client secrets in Next. **ASP.NET's `AddGoogle`/`AddOpenIdConnect` handlers** need the browser to reach the API directly and use their own correlation cookies; here only Next is public. |
| Protocol hardening | Authorization code + PKCE (S256), `state`, OIDC `nonce`, single-use 10-minute flows, one callback URL per provider | RFC 9700 (OAuth 2.0 Security BCP). Per-provider callback URLs plus a provider check defeat IdP mix-up. GitHub supports S256 PKCE since July 2025. |
| Flow state | A `external_login_flows` row (state, nonce, PKCE verifier) found by the SHA-256 of an opaque flow id that only the browser's httpOnly flow cookie holds | Binds the callback to the browser that started it (login CSRF), survives API restarts and scales out. The `state` in the URL is a different random value, so a leaked callback URL can't be replayed without the cookie. Rejected: encrypting the flow into the cookie with Data Protection (key management for nothing). |
| ID tokens | `Microsoft.IdentityModel.Protocols.OpenIdConnect` (discovery, JWKS refresh) + `Microsoft.IdentityModel.JsonWebTokens` (validation) | The libraries ASP.NET's own handlers use. Asymmetric algorithms only; issuer, audience, lifetime and nonce validated. No hand-rolled JWT code. |
| Providers | Google (OIDC), GitHub (OAuth 2.0 + REST user API), enterprise connections (generic OIDC by email domain) | The user's pick. Apple, Facebook and Microsoft are out of scope (see the end). |
| Trusted emails | Google: `email_verified`. GitHub: the primary email, only if verified. SSO: any email on the connection's domains, which the operator vouches for by configuring the connection; other domains are refused | Linking by email is only safe when the provider has verified that email. |
| Email collisions | A trusted email matching an account whose email is **verified** links automatically. One matching an **unverified** account (any password registration, since sign-up never verifies emails) is refused: "log in with your password, then connect". | Prevents account pre-hijacking: someone who registered the victim's email with a password must not inherit the victim's Google sign-in. The user's pick. |
| Machine-readable failures | The shared envelope gains an optional `code` (`{ success: false, error, code? }`), omitted when null | The callback route has to tell "account exists" from "no verified email" without matching message strings. Existing bodies are byte-for-byte unchanged. |
| Provider configuration | `Identity:External` options in the API; a provider is on when its client id and secret are set; SSO connections are keyed by id with their domains | Operators configure connections; a self-service admin UI is out of scope. Under Aspire, Google/GitHub credentials come from the AppHost's user secrets when present, and the Keycloak demo connection is always on. |
| Demo identity providers | Mock mode: a built-in `/auth/mock-provider` consent page. Aspire: a Keycloak container with an imported `acme` realm | Both work with zero setup. Keycloak is the standard open-source IdP and Aspire has an integration for it. |

## 1. Backend: the Identity module

### Data (schema `identity`, one migration `ExternalLogins`)

**`users`** changes:
- `PasswordHash` becomes nullable: accounts created by an external sign-in have no password.
- `EmailVerifiedAt` (timestamptz, nullable): set when an account is created from a trusted email, or when a trusted email equal to the account's email is connected. Password registrations leave it null.

**`external_logins`**:
- `Provider` (varchar 64) + `Subject` (varchar 255): the primary key; the provider's stable user id (`sub`, or GitHub's numeric id).
- `UserId` (FK to `users`, cascade), unique together with `Provider`: one account per provider per user.
- `Email` (varchar 254): what the provider reported, shown on Login & security.
- `CreatedAt`.

**`external_login_flows`**:
- `IdHash` (varchar 64, PK): hex SHA-256 of the flow id, like session tokens.
- `Provider`, `State`, `Nonce`, `CodeVerifier`.
- `LinkUserId` (nullable FK to `users`, cascade): set for "connect" flows.
- `CreatedAt`, `ExpiresAt` (10 minutes, indexed). Expired rows are purged on every start.

### Providers

Provider keys appear in URLs, the database and the frontend: `google`, `github`, and `sso-<connection id>` (for example `sso-acme`).

| Provider | Protocol | Scopes | Identity |
|---|---|---|---|
| Google | OIDC, authority `https://accounts.google.com` (issuer also `accounts.google.com`), `prompt=select_account` | `openid email profile` | `sub`; email trusted when `email_verified` is true |
| GitHub | OAuth 2.0: `github.com/login/oauth/authorize` and `/access_token`, then `api.github.com/user` and `/user/emails` | `read:user user:email` | the numeric `id`; name or login; the primary email when verified |
| SSO connection | OIDC with the connection's authority; `login_hint` = the email typed | `openid email profile` | `sub`; email trusted when its domain is one of the connection's domains, refused otherwise |

OIDC details:
- Discovery and JWKS are fetched through a named `HttpClient` and cached by a `ConfigurationManager` per provider. On an unknown signing key it refreshes once and retries.
- The discovery document's `issuer` must equal the configured authority.
- HTTPS is required for metadata unless a connection sets `RequireHttpsMetadata: false` (the local Keycloak).
- ID tokens: RS/PS/ES algorithms only; issuer, audience (`client_id`), lifetime (2-minute skew) and `nonce` validated; `azp` must be the client id when there are several audiences.
- The token request authenticates with `client_secret_basic` when discovery allows it (the OAuth default), otherwise `client_secret_post`.
- If the callback carries an `iss` parameter (RFC 9207), it must equal the issuer.

HTTP: the ServiceDefaults resilience handler no longer retries unsafe methods, so a token exchange that reached the provider is never replayed (an authorization code is single-use).

### Configuration

```jsonc
"Identity": {
  "External": {
    // Where the browser lands after the provider: <RedirectBaseUrl>/<provider key>. Required to enable anything.
    "RedirectBaseUrl": "http://localhost:3000/api/auth/callback",
    "Google": { "ClientId": "…", "ClientSecret": "…" },
    "GitHub": { "ClientId": "…", "ClientSecret": "…" },
    "Sso": {
      "acme": {
        "Name": "Acme Corp",
        "Domains": [ "acme.test" ],
        "Authority": "http://localhost:8080/realms/acme",
        "ClientId": "airbnb",
        "ClientSecret": "…",
        "RequireHttpsMetadata": false
      }
    }
  }
}
```

Options are validated at startup: a malformed authority, an `http` authority without `RequireHttpsMetadata: false`, a connection without domains, or two connections claiming one domain fail fast. Unset credentials just switch a provider off.

### Endpoints (under `/api`; every body is the envelope)

| Endpoint | Request | Success | Errors (`code`) |
|---|---|---|---|
| `GET /auth/providers` | — | 200 `{ social: [{ id, name }], sso }` | — |
| `POST /auth/external/start` | `{ provider, email?, link? }`; `provider: "sso"` resolves the connection from `email`'s domain; `link: true` needs a bearer token | 200 `{ authorizationUrl, flowId, provider, expiresAt }` | 400 validation; 401 link without a session; 404 `provider_unavailable`, `sso_not_configured` |
| `POST /auth/external/callback` | `{ provider, flowId, state, code, iss? }` | 200 `{ session: { user, token, expiresAt } }`, or `{ linked: { provider, email } }` for a connect flow | 400 `flow_expired`, `flow_mismatch`, `provider_error`, `no_verified_email`, `email_domain_not_allowed`; 409 `account_exists`, `identity_in_use`, `provider_already_connected`; 502 `provider_unreachable` |
| `GET /auth/connections` | bearer token | 200 `{ hasPassword, connections: [{ provider, name, kind, email?, connectedAt? }] }`: every enabled social provider, the SSO connection for the account's email domain, and anything already connected | 401 |
| `DELETE /auth/connections/{provider}` | bearer token | 204 | 401; 404 `not_connected`; 409 `last_login_method` |

### Callback rules

1. Delete the flow by its id hash; only the request whose delete hits the row continues (single use). Missing or expired → `flow_expired`.
2. The callback's provider (from its URL) must equal the flow's, the `state` must match (constant-time), and `iss` when present → otherwise `flow_mismatch`.
3. Exchange the code with the PKCE verifier and validate the identity (above) → `provider_error` / `provider_unreachable`.
4. **Connect flow** (`LinkUserId` set):
   - the identity is already the user's → success, no change;
   - it belongs to another user → `identity_in_use`;
   - the user already has a different account of this provider → `provider_already_connected`;
   - otherwise insert it. If its trusted email equals the account's, mark the account's email verified. No new session.
5. **Sign-in flow**:
   - a known `(provider, subject)` → that user;
   - no trusted email → `no_verified_email` (or `email_domain_not_allowed` for SSO);
   - an account with that email: verified → link and sign in; unverified → `account_exists`;
   - otherwise create the account (name from the provider, else the email's local part; email verified; no password) and its login.
   A concurrent first sign-in that loses a unique index re-reads once.
6. Start a session with the existing `SessionStore`.

### Changes to existing slices

- **Password login** for an account without a password runs the dummy-hash check and returns the same 401, so it reveals nothing more than an unknown email does.
- **Register** is unchanged: an email held by an external account is a 409 like any other.

## 2. Frontend

### Gateway

`AuthGateway` (mock and HTTP) gains:

```ts
providers(): Promise<ProvidersInfo>;                       // { social: { id, name }[]; sso: boolean }
startExternal(input: { provider: string; email?: string; link?: boolean }, context?: RequestContext & { token?: string }): Promise<StartResult>;
completeExternal(input: { provider: string; flowId: string; state: string; code: string; iss?: string }, context?: RequestContext): Promise<CompleteResult>;
connections(token: string, context?: RequestContext): Promise<ConnectionsInfo | null>;  // null = logged out
disconnect(token: string, provider: string, context?: RequestContext): Promise<GatewayFailure | null>;
```

Failures are `{ ok: false, status, error, code? }`; anything that isn't a user-facing status (400, 401, 404, 409, 429) throws, as today.

### Routes

- **`POST /api/auth/oauth/start`** `{ provider, next?, email?, link? }`:
  - JSON-only, like the other auth routes;
  - `link` requires a session (401 otherwise), and its token goes to the backend as the bearer;
  - success answers `{ redirectUrl }` and sets the **flow cookie** `oauth_flow` = base64url JSON `{ id, next, intent }`: httpOnly, `SameSite=Lax` (the provider's redirect back is a top-level GET), `Path=/api/auth`, 10 minutes, `Secure` in production;
  - `next` is checked with `safeNextPath`; a connect flow always returns to `/account/security`.
- **`GET /api/auth/callback/[provider]`** always clears the flow cookie and answers `303` with a relative `Location`:
  - no flow cookie → `expired`; `?error=` from the provider → `cancelled`;
  - otherwise `completeExternal` with the browser's IP;
  - **session** → set the session cookie, revoke the previous one, go to `next`;
  - **linked** → `/account/security?connected=<provider>`;
  - failure → `/login?error=<code>&provider=<key>&next=…`, or `/account/security?error=<code>&provider=<key>` for a connect flow.
  - Error codes go in the URL, never messages: the pages map codes to fixed text, so a crafted link can't put words on our page.
- **`DELETE /api/auth/connections/[provider]`** → 200 envelope, or the gateway's status and message.

### Pages and components

- **`/login` and `/register`**, Airbnb's order:
  - the form;
  - an "or" divider;
  - full-width outlined buttons: Continue with Google, Continue with GitHub (each only when enabled), Continue with SSO (a link to `/login/sso`, when SSO is on);
  - `/login` shows `?error=` as an alert above the form.
- **`/login/sso`**: work email + Continue. Shows `sso_not_configured` inline; otherwise navigates to the IdP.
- **`/account/security`** (gated), "Login & security":
  - the email and whether a password is set;
  - "Connected accounts": one row per provider, either "Connected as {email}" with Disconnect, or "Not connected" with Connect;
  - banners for `?connected=` and `?error=`;
  - Disconnect refreshes the page.
- The account menu (desktop and mobile) gains **Login & security**.
- Provider marks: inline SVGs for Google's "G" and GitHub's mark (lucide has no brand icons); lucide `Building2` for SSO.

### Mock mode

- **Providers:** Google, GitHub, and an "Acme Corp" SSO connection for `acme.test`, the same as the Keycloak demo.
- **Flows** live in an in-memory map on `globalThis`, like the other mock stores. `authorizationUrl` points at `/auth/mock-provider?provider&state&redirect_uri&login_hint`.
- **`/auth/mock-provider`** is a server page that 404s unless `DATA_SOURCE=mock`. It shows "Sign in with Google (demo) — no real Google account is used", an email and a name, Continue and Cancel.
  - Continue submits to `/auth/mock-provider/authorize`, which checks that `redirect_uri` is a same-site `/api/auth/callback/` path and redirects there with a code (base64url JSON of the identity).
  - Cancel returns `error=access_denied`.
- **Completing** a flow signs in `userFromCredentials(email, name)`, exactly like a mock password login, and records the connection for Login & security. Mock mode stays deliberately permissive (no collision rule), as its password login is.

## 3. Aspire

- **`Aspire.Hosting.Keycloak`** (13.6.1 preview) adds a `keycloak` container: persistent, with the realm from `src/Airbnb.AppHost/Realms/acme-realm.json` imported. That realm has:
  - client `airbnb`, whose one allowed redirect URI is the frontend's callback (`http://localhost:<frontend port>/api/auth/callback/sso-acme`, from the environment like the secret, because the testing builder randomizes ports);
  - users `alex@acme.test` and `sam@acme.test`, password `acme-demo`, with fixed ids so subjects survive container re-creation.
- **The client secret** is an Aspire secret parameter `sso-acme-client-secret`, given to Keycloak through an environment placeholder in the realm file (Keycloak substitutes `${VAR}` in imported realms) and to the API as `Identity__External__Sso__acme__ClientSecret`.
- **The API** gets the redirect base from the frontend's endpoint and the Acme authority from Keycloak's endpoint. The browser and the API both reach Keycloak at `localhost:<port>`, so the issuer matches.
- **Google and GitHub** are passed to the API only when `Identity:Google:*` / `Identity:GitHub:*` exist in the AppHost's user secrets (as secret parameters, masked in the dashboard). Callback URLs to register with them: `http://localhost:3000/api/auth/callback/google` and `/github`.
- **The AppHost smoke test** waits for Keycloak too and signs `alex@acme.test` in end to end: the frontend's start route, Keycloak's real login form, the frontend's callback, then the session.

## 4. Testing

### Backend unit tests
- PKCE: the RFC 7636 test vector; verifiers are 43 base64url characters.
- Authorization URLs carry every parameter, encoded.
- Options validation and SSO domain lookup: case-insensitive, no subdomain matching, duplicates rejected.
- The linking decision as a pure function, over every branch.
- GitHub's primary-verified email choice.
- ID token validation against an in-memory configuration: wrong issuer, audience, nonce, expiry, algorithm and key.

### Backend integration tests
`ExternalLoginTests` runs against a fake identity provider: an `HttpMessageHandler` that serves discovery, JWKS and token endpoints, signs ID tokens with a test RSA key, and plays GitHub's API. It covers:
- the providers list;
- start parameters, and the 401/404s;
- Google first sign-in then the same account again;
- GitHub's verified-email rules;
- SSO domains;
- `flow_expired` (replay, and time passing), `flow_mismatch` (state, provider, iss), and a bad nonce or audience;
- `account_exists` with no session created, and auto-link on a verified account;
- connect, `identity_in_use`, `provider_already_connected`;
- connections, disconnect, `last_login_method`;
- password login on a password-less account;
- the database holding flow-id hashes only.

### Frontend unit tests
- Both gateways, the flow cookie, the start, callback and disconnect routes, and the mock provider's authorize route.
- The error-message map.
- `SocialButtons`, `SsoForm`, `ConnectedAccounts`, and the login page's alert.

### E2E (mock mode)
- Google sign-in returns to `next`; cancelling shows the message.
- SSO with `alex@acme.test` signs in; an unknown domain errors inline.
- Connect and disconnect GitHub on Login & security.
- The axe gate gains `/login/sso`, `/account/security` and the demo provider page.

## 5. Docs

- **`CLAUDE.md`:** external logins, the provider keys, the envelope `code`, the flow cookie, the mock provider and the Keycloak demo.
- **`README.md`:** how to try SSO under Aspire, and how to register Google/GitHub apps and set their user secrets.
- **The identity spec:** a note linking this spec.

## Out of scope

- Apple (needs an HTTPS-only callback and a signed-JWT client secret), Facebook, and Microsoft personal accounts (their email claim can't be trusted for linking). Entra ID tenants work today as SSO connections.
- SAML 2.0, SCIM provisioning, and SSO enforcement (forcing a domain's users onto SSO).
- A self-service admin UI for SSO connections.
- Setting or resetting a password, email verification for password sign-ups, passkeys, Google One Tap.
- Keeping provider access or refresh tokens: only the identity is used.
