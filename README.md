# Airbnb Clone

Monorepo with a Next.js frontend and an ASP.NET Core backend.

| Folder | What | Stack |
|---|---|---|
| `frontend/` | Web app | Next.js 16, React 19, TypeScript, Tailwind v4 |
| `backend/` | API | ASP.NET Core (.NET 10) modular monolith, orchestrated by Aspire 13.6 |
| `docs/` | Specs and plans | Markdown |
| `tools/sonar/` | Local SonarQube scan | PowerShell, Docker |

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
aspire run    # dashboard + postgres, redis, messaging (LavinMQ), kafka, mailpit, mongo, ollama, migrations, api, notifications, payments, chat (×2), gateway, assistant, frontend (http://localhost:3000, on the API)
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
- Payment service (a second microservice in `services/payments`, same AppHost): "Confirm and pay" takes a card. The monolith saves the booking as pending (holding its nights), then calls the service over HTTP (`X-Service-Key` = the `payments-service-key` parameter; 4 s per attempt, 3 attempts, the booking id as the idempotency key): success confirms it, a decline frees the nights (402), no answer leaves it pending (202, "Payment processing") until the API's reconciler asks again (every 30 s; unknown after 2 minutes or still processing after 15 → declined, voided first). Cancelling a confirmed booking refunds it (the service hears `booking-cancelled` on its own queue). No real money: test cards `4242 4242 4242 4242` (succeeds), `4000 0000 0000 0002` (declined), `4000 0000 0000 9995` (insufficient funds), `4000 0000 0000 0119` (errors twice, then succeeds), `4000 0000 0000 0077` (takes 10 s, so the booking goes pending); any future expiry, any CVC. Only brand and last 4 digits are stored. Its tests run from `services/payments` with `dotnet test`.
- Chat service (the third microservice, `services/chat`, same AppHost): **Message host** on a listing page opens a conversation, and replies arrive live in **Messages** (`/inbox`, also in the account menu). It's the one service the browser talks to directly. The frontend fetches a 10-minute token the API signs (`chat-token-key`) and the hub's address. It then opens a WebSocket through the `gateway` resource (YARP, route `/chat/*`) to one of two `chat` instances, which reach each other's connections through Redis. Conversations and messages live in MongoDB; open Mongo Express from the dashboard to browse them. Seed listings have demo hosts with no accounts, so the first message in such a conversation gets an automatic reply about 1.5 s later. To chat for real, sign in as one user, create a listing, and message it from a second browser signed in as another. Chat needs the backend, so mock mode shows a notice instead. Its tests run from `services/chat` with `dotnet test`.
- Smart chat box (`services/assistant`, same AppHost): the **Ask** button on every page opens an assistant. Guests ask it to find a place ("a cabin for 4 in Aspen under $200"), about the place they're looking at ("is it free May 3 to 6, and what would it cost?"), or how the site works ("how do I cancel?"). Answers stream in as they're written, with links to the places a search found.
  - It runs a local model on Ollama through Aspire's Ollama integration: no API keys, and nothing leaves your machine.
  - The first `aspire run` downloads the model (`qwen2.5:3b`, about 2 GB) into the `ollama` volume, so the assistant starts once that's done. Watch the `assistant-model` resource in the dashboard.
  - Set `Assistant:Model` in `src/Airbnb.AppHost/appsettings.json` to use another Ollama model that can call tools (for example `llama3.1:8b`). Set `Assistant:Gpu` to `true` to use an NVIDIA GPU; it fails to start without one.
  - Answers come only from the real listings, their calendars and prices, and a short guide to the site. It can't book, cancel or see anyone's trips. On CPU an answer takes from a few seconds to about a minute.
  - Mock mode hides the box. To chat with the model directly, add `.WithOpenWebUI()` to `ollama` in the AppHost; it's left out because it's another large container.
  - Its tests (a scripted model, no Ollama) run from `services/assistant` with `dotnet test`.
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

## Code quality (SonarQube)

`pwsh tools/sonar/scan.ps1` scans the backend, the services and the frontend with a local SonarQube (Docker), prints the quality gate and the open issues, and writes them to `tools/sonar/.local/`. Add `-Coverage` to import the tests' coverage. See [tools/sonar/README.md](tools/sonar/README.md).
