# Airbnb Clone

Monorepo with a Next.js frontend and an ASP.NET Core backend.

| Folder | What | Stack |
|---|---|---|
| `frontend/` | Web app | Next.js 16, React 19, TypeScript, Tailwind v4 |
| `backend/` | API | ASP.NET Core (.NET 10) modular monolith, orchestrated by Aspire 13.6 |
| `docs/` | Specs and plans | Markdown |

## Prerequisites

- Node.js 24
- .NET 10 SDK (pinned by `backend/global.json`)
- Docker Desktop (Aspire containers and backend integration tests)
- Aspire CLI: `dotnet tool install -g aspire.cli`
- Azure Functions Core Tools v4 (Aspire runs the photo-processor function with `func`): `npm i -g azure-functions-core-tools@4`
- ReportGenerator (optional, for backend coverage summaries): `dotnet tool install -g dotnet-reportgenerator-globaltool`

## Frontend

```bash
cd frontend
npm ci
npm run dev        # http://localhost:3000
npm test
```

Data comes from in-repo mock data by default. `DATA_SOURCE=api` (server-only; needs `API_HTTP`, the backend URL) switches every server-side data read — pages and the `/api/*` route handlers — to the backend. Aspire sets both.

## Backend

Run from PowerShell; Docker must be running. On a Mac older than macOS 15 (Aspire's orchestrator needs 15+), or in GitHub Codespaces, open the repo in the dev container (VS Code: **Dev Containers: Reopen in Container**) and run the same commands in its terminal.

```powershell
cd backend
aspire run    # dashboard + postgres, redis, messaging (LavinMQ), kafka, mailpit, migrations, api, notifications, frontend (http://localhost:3000, on the API)
dotnet test   # unit, architecture, integration and AppHost smoke tests (Docker; the smoke test needs port 3000 free)
```

- The dashboard URL is printed on start. The API answers at http://localhost:5283 (`/health`, and `/scalar` for the API reference in Development).
- Without the Aspire CLI: `dotnet run --project src/Airbnb.AppHost`.
- In VS Code, start it from a regular terminal (or F5): a plain `aspire run` in the Aspire extension's own terminal fails with "Aspire debug session is not initialized".
- In the local dev container the dashboard and Keycloak are served with the container's own development certificate, which your browser doesn't trust: continue past the warning.
- Containers are persistent between runs. `aspire stop --force` removes them; the Postgres data volume survives until `docker volume rm`.
- Read API (all under `/api`, try them in `/scalar`): `GET /listings`, `/listings/{id}`, `/cities`, `/experiences`, `/experiences/{id}`, `/services`, `/services/{id}`, `/hosts/{id}`, `/reviews?subjectId=…`. Data is seeded from the frontend mock (`npm run seed:export` in `frontend/` regenerates it).
- Write API: `POST /api/reviews` with `{ subjectType: "stay" | "experience", subjectId, authorName, rating (1–5), body }` → 201 with the review. The listing's or experience's rating and review count update a moment later, via the message broker (LavinMQ by default); the trace shows up in the dashboard. Try it in `/scalar`.
- Message broker: Wolverine's review events go through the `messaging` resource, LavinMQ by default (its management UI is on http://localhost:15672, guest/guest). Both brokers speak AMQP 0-9-1, so switching changes nothing in the API: set `Messaging:Broker` to `RabbitMQ` in `src/Airbnb.AppHost/appsettings.json` to use RabbitMQ again. Integration tests follow the `MESSAGING_BROKER` environment variable the same way (LavinMQ unless it is `RabbitMQ`).
- Notification service (a separate microservice in `services/notifications`, run by the same AppHost): guests get an email when a booking is confirmed or cancelled, and a review reminder the morning after check-out. The monolith only publishes `booking-confirmed` / `booking-cancelled` events to the `bookings` exchange on `messaging`; the service consumes them on its own queue, keeps its own `notifications` database and sends through `mailpit` (open its web UI from the dashboard to read every email). Run **Send due reminders now** on the `notifications` resource to get the review reminders without waiting for check-out. Its tests run from `services/notifications` with `dotnet test`.
- Under Aspire the frontend runs on the backend (`DATA_SOURCE=api`). Set `Frontend:DataSource` to `mock` in `src/Airbnb.AppHost/appsettings.json` to run it on mock data instead.
- Parity check: with `aspire run` up, `npm run e2e` in `frontend/` runs the whole e2e suite against the backend (Playwright reuses the server on port 3000). The OAuth specs need mock mode's demo provider and skip themselves.
- Photo uploads: `storage` is Azure Blob Storage, run as the Azurite emulator with a persistent volume. The API stores each uploaded original there, and the `photo-processor` Azure Function (`src/Airbnb.Functions`, blob-triggered) checks it's a real image, turns it upright, drops its metadata (GPS included) and saves it as WebP, at most 2560 px. The API serves only that processed copy, at `GET /api/photos/{id}/image`.
- Listing views (Kafka): every listing page records a view, which the API publishes to the `listing-views` topic on `kafka`. The Insights module counts the views per listing per day: guests see "N views in the past week" and hosts see their last 7 days on `/host/listings`. Open `kafka-ui` from the dashboard to browse the topic and the `insights-listing-views` consumer group. The topic keeps every view forever, so **Rebuild view stats** (a command on the `api` resource, or `aspire resource api "api-http-http-post-/api/insights/rebuild"`) wipes the counts and recounts them from the log. A k6 run records about a thousand views.
- Load test: the `k6` resource runs `backend/perf/k6/load.js` when you press Start on it in the dashboard (or `aspire resource k6 start`). For 1 minute, 20 guests browse listings and 10 members read their account and bookings, all signed in as `k6@perf.test` (registered on the first run; the password is the generated `k6-user-password` parameter). The results are in the resource's console log, and the resource ends as failed if p95 goes over 500 ms or more than 1% of requests fail. Under `aspire run` the API's read limit is raised to 100,000/min so the limiter doesn't throttle k6.

## Sign in with Google, GitHub or SSO

- **Mock mode** (`npm run dev`): each provider is a demo page (`/auth/mock-provider`) where you type the email to sign in as. "Continue with SSO" works for `@acme.test` emails.
- **Under Aspire**: "Continue with SSO" with `alex@acme.test` (or `sam@acme.test`), password `acme-demo`, signs in through the bundled Keycloak "Acme Corp" realm. Keycloak's admin console is the `keycloak` resource in the dashboard (user `admin`, password in the `keycloak-password` parameter).
- **Real Google and GitHub** (api mode): register an OAuth client, then put its credentials in the AppHost's user secrets. The buttons appear on the next `aspire run`.

| Provider | Register at | Callback URL |
|---|---|---|
| Google | Google Cloud console → APIs & Services → Credentials → OAuth client ID (Web application) | `http://localhost:3000/api/auth/callback/google` |
| GitHub | GitHub → Settings → Developer settings → OAuth Apps | `http://localhost:3000/api/auth/callback/github` |

```powershell
cd backend
dotnet user-secrets set "Identity:Google:ClientId" "<client id>" --project src/Airbnb.AppHost
dotnet user-secrets set "Identity:Google:ClientSecret" "<client secret>" --project src/Airbnb.AppHost
dotnet user-secrets set "Identity:GitHub:ClientId" "<client id>" --project src/Airbnb.AppHost
dotnet user-secrets set "Identity:GitHub:ClientSecret" "<client secret>" --project src/Airbnb.AppHost
```

- Signing in with a provider whose email already belongs to a password account is refused, so nobody inherits an account by registering its email first. Log in with the password, then connect the provider under **Login & security** in the account menu.
- To add a company's SSO, give the API an `Identity:External:Sso:<id>` connection (name, email domains, OIDC authority, client id and secret), and register `<frontend>/api/auth/callback/sso-<id>` as the redirect URI with their identity provider.
