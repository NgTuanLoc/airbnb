# Airbnb Clone

Monorepo with a Next.js frontend and an ASP.NET Core backend.

| Folder | What | Stack |
|---|---|---|
| `frontend/` | Web app | Next.js 16, React 19, TypeScript, Tailwind v4 |
| `backend/` | API | ASP.NET Core (.NET 10) modular monolith, orchestrated by Aspire 13.5 |
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
- Parity check: with `aspire run` up, `npm run e2e` in `frontend/` runs the whole e2e suite against the backend (Playwright reuses the server on port 3000).
