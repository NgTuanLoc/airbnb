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

Run from PowerShell; Docker must be running.

```powershell
cd backend
aspire run    # dashboard + postgres, redis, rabbitmq, migrations, api, frontend (http://localhost:3000, on the API)
dotnet test   # unit, architecture, integration and AppHost smoke tests (Docker; the smoke test needs port 3000 free)
```

- The dashboard URL is printed on start. The API answers at http://localhost:5283 (`/health`, and `/scalar` for the API reference in Development).
- Without the Aspire CLI: `dotnet run --project src/Airbnb.AppHost`.
- Containers are persistent between runs. `aspire stop --force` removes them; the Postgres data volume survives until `docker volume rm`.
- Read API (all under `/api`, try them in `/scalar`): `GET /listings`, `/listings/{id}`, `/cities`, `/experiences`, `/experiences/{id}`, `/services`, `/services/{id}`, `/hosts/{id}`, `/reviews?subjectId=…`. Data is seeded from the frontend mock (`npm run seed:export` in `frontend/` regenerates it).
- Write API: `POST /api/reviews` with `{ subjectType: "stay" | "experience", subjectId, authorName, rating (1–5), body }` → 201 with the review. The listing's or experience's rating and review count update a moment later, via RabbitMQ; the trace shows up in the dashboard. Try it in `/scalar`.
- Under Aspire the frontend runs on the backend (`DATA_SOURCE=api`). Set `Frontend:DataSource` to `mock` in `src/Airbnb.AppHost/appsettings.json` to run it on mock data instead.
- Parity check: with `aspire run` up, `npm run e2e` in `frontend/` runs the whole e2e suite against the backend (Playwright reuses the server on port 3000). The OAuth specs need mock mode's demo provider and skip themselves.

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
