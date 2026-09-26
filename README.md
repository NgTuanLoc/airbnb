# Airbnb Clone

Monorepo with a Next.js frontend and an ASP.NET Core backend.

| Folder | What | Stack |
|---|---|---|
| `frontend/` | Web app | Next.js 16, React 19, TypeScript, Tailwind v4 |
| `backend/` | API | ASP.NET Core (.NET 10) |
| `docs/` | Specs and plans | Markdown |

## Prerequisites

- Node.js 24
- .NET 10 SDK (pinned by `backend/global.json`)

## Frontend

```bash
cd frontend
npm ci
npm run dev        # http://localhost:3000
npm test
```

## Backend

```bash
cd backend
dotnet run --project src/Airbnb.Api   # GET /health
dotnet test
```
