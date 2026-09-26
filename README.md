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

## Backend

Run from PowerShell; Docker must be running.

```powershell
cd backend
aspire run    # dashboard + postgres, redis, rabbitmq, migrations, api
dotnet test   # unit, architecture and integration tests (integration uses Docker)
```

- The dashboard URL is printed on start. The API answers at http://localhost:5283 (`/health`, and `/scalar` for the API reference in Development).
- Without the Aspire CLI: `dotnet run --project src/Airbnb.AppHost`.
- Containers are persistent between runs. `aspire stop --force` removes them; the Postgres data volume survives until `docker volume rm`.
