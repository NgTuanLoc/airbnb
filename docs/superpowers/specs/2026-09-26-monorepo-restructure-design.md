# Monorepo Restructure — Design

**Date:** 2026-09-26
**Status:** Approved (design), pending spec review

## Goal

Turn the frontend-only repo into a monorepo that hosts the existing Next.js
frontend and a new ASP.NET Core (C#) backend side by side, without changing
frontend behavior.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Backend stack | ASP.NET Core, .NET 10 (LTS) | User choice |
| Repo model | Monorepo | Atomic cross-stack changes, single CI |
| Layout | Sibling `frontend/` + `backend/` folders | No JS code sharing with .NET, so workspace tooling (npm workspaces/Turborepo) adds nothing |
| FE↔BE contract | OpenAPI (later spec) | Cross-language; not in this scope |

## Target layout

```
airbnb/
├── frontend/                 # everything Next.js, moved with git mv
│   ├── app/ components/ lib/ e2e/ public/
│   ├── package.json package-lock.json
│   ├── next.config.ts tsconfig.json eslint.config.mjs postcss.config.mjs
│   ├── vitest.config.ts vitest.setup.ts playwright.config.ts
│   └── DESIGN.md
├── backend/
│   ├── global.json           # pins SDK 10.0.x, rollForward latestFeature
│   ├── Airbnb.slnx
│   ├── src/Airbnb.Api/       # minimal API: GET /health -> {"status":"ok"}
│   └── tests/Airbnb.Api.Tests/  # xUnit + Microsoft.AspNetCore.Mvc.Testing
├── docs/                     # unchanged location (specs/plans span both sides)
├── .github/workflows/ci.yml
├── .gitignore
├── CLAUDE.md
└── README.md
```

## Frontend move

- `git mv` all frontend files/dirs into `frontend/` so history is preserved
  (`git log --follow` works).
- Untracked/generated artifacts (`node_modules/`, `.next/`, `test-results/`,
  `tsconfig.tsbuildinfo`, `next-env.d.ts`) are deleted at root and regenerated
  inside `frontend/` via `npm ci` / build.
- No source changes expected: all imports use the `@/*` alias (relative to
  `frontend/tsconfig.json`) or relative paths within the moved tree.
- The uncommitted change in `lib/data/experiences.ts` moves with the file and
  stays uncommitted; it is not part of the restructure commits.

## Backend skeleton

- `backend/global.json`: `{"sdk": {"version": "10.0.100", "rollForward": "latestFeature"}}`
  — required because an SDK 11 preview is installed and would otherwise be selected.
- `Airbnb.Api`: `dotnet new web`, target `net10.0`, one endpoint
  `GET /health` returning `{"status":"ok"}`. `public partial class Program {}`
  exposed for the test host.
- `Airbnb.Api.Tests`: `dotnet new xunit`, references `Airbnb.Api` and
  `Microsoft.AspNetCore.Mvc.Testing`; one test asserting `/health` returns
  200 with `status == "ok"`.
- No database, auth, CORS, OpenAPI, or domain endpoints (later specs).

## Repo-level files

- `.gitignore`: un-anchor `/coverage`, `/out`, `/build` (they now live under
  `frontend/`); add .NET entries `bin/`, `obj/`, `.vs/`, `*.user`, `TestResults/`.
- `CLAUDE.md`: prefix frontend commands with `cd frontend`, note paths are
  relative to `frontend/`, add backend commands (`dotnet run`, `dotnet test`)
  and layout.
- `README.md`: short — layout, prerequisites (Node 24, .NET 10 SDK), how to
  run each side.
- `.github/workflows/ci.yml` on push/PR to `master`, two jobs:
  - `frontend` (working-directory `frontend`): `npm ci`, `npm run lint`,
    `npx tsc --noEmit`, `npm test`, `npm run build`.
  - `backend` (working-directory `backend`): setup-dotnet 10.0.x,
    `dotnet test`.
  - No path filters (only two cheap jobs; add filters when CI time matters).
  - E2E not in CI (not run in CI today either; add in a later spec).

## Verification (definition of done)

1. In `frontend/`: `npm ci`, `npm test`, `npx tsc --noEmit`, `npm run lint`,
   `npm run build`, `npm run e2e` all pass with the same counts as before the move.
2. In `backend/`: `dotnet test` passes; `dotnet run --project src/Airbnb.Api`
   serves `GET /health`.
3. `git log --follow frontend/app/page.tsx` shows pre-move history.

## Out of scope

Database/EF Core, docker-compose, OpenAPI → TS client generation, replacing
mock repositories with HTTP calls, auth, deployment.
