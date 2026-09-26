# Monorepo Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Next.js app into `frontend/` and add a runnable ASP.NET Core skeleton in `backend/`, with CI and docs for both.

**Architecture:** Two sibling folders, no workspace tooling. Frontend files are moved with `git mv` (history preserved, no source edits). Backend is a .NET 10 minimal API with one `/health` endpoint and an xUnit integration test.

**Tech Stack:** Next.js 16 / npm (unchanged), .NET 10 SDK, ASP.NET Core minimal API, xUnit, Microsoft.AspNetCore.Mvc.Testing, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-26-monorepo-restructure-design.md`

## Global Constraints

- Backend targets `net10.0`; `backend/global.json` pins `{"sdk": {"version": "10.0.100", "rollForward": "latestFeature"}}` (an SDK 11 preview is installed and must not be selected).
- Frontend files move with `git mv` only — no source changes.
- `docs/` stays at repo root.
- The pre-existing uncommitted change in `lib/data/experiences.ts` must NOT be staged in any commit (it moves with the file and stays modified). Never use `git add -A` / `git add .` / `git commit -a`.
- Commit messages: conventional commits, ending with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Shell: Git Bash on Windows; repo root `D:/PersonalProjects/airbnb`.

## Review Focus

1. Stale root artifacts (`node_modules/`, `.next/`, `tsconfig.tsbuildinfo`, `next-env.d.ts`) left at root → tooling must still resolve from `frontend/`; Task 1 deletes them and verifies from a clean `npm ci`.
2. Vitest `include: ["**/*.test.{ts,tsx}"]` would pick up tests in a stray root `node_modules` → Task 1 compares the test count to the pre-move baseline.
3. SDK selection: running `dotnet` in `backend/` must report 10.0.x, not the 11 preview → Task 2 Step 1 checks `dotnet --version`.
4. `.gitignore` anchored patterns (`/coverage`, `/out`, `/build`) silently stop matching under `frontend/` → Task 1 un-anchors them and checks `git status` after coverage/build.
5. `git log --follow` history for moved files → Task 1 Step 7 checks it.

---

### Task 1: Move frontend into `frontend/`

**Files:**
- Move: `app/ components/ lib/ e2e/ public/ package.json package-lock.json next.config.ts tsconfig.json eslint.config.mjs postcss.config.mjs vitest.config.ts vitest.setup.ts playwright.config.ts DESIGN.md` → `frontend/`
- Modify: `.gitignore`
- Delete (untracked): `node_modules/ .next/ test-results/ tsconfig.tsbuildinfo next-env.d.ts`

**Interfaces:**
- Produces: all frontend commands now run from `frontend/` (`npm run dev|build|test|lint|e2e`).

- [ ] **Step 1: Record the baseline**

```bash
cd D:/PersonalProjects/airbnb
npm test 2>&1 | tail -5          # note "Test Files" and "Tests" counts
npx tsc --noEmit && echo TSC_OK
```

Write the counts down; Step 6 must match them.

- [ ] **Step 2: Move tracked files**

```bash
cd D:/PersonalProjects/airbnb
mkdir frontend
git mv app components lib e2e public package.json package-lock.json \
  next.config.ts tsconfig.json eslint.config.mjs postcss.config.mjs \
  vitest.config.ts vitest.setup.ts playwright.config.ts DESIGN.md frontend/
```

- [ ] **Step 3: Delete stale generated artifacts at root**

```bash
cd D:/PersonalProjects/airbnb
rm -rf node_modules .next test-results tsconfig.tsbuildinfo next-env.d.ts
ls -a   # expect only: .claude .git .gitignore .superpowers CLAUDE.md docs frontend
```

- [ ] **Step 4: Update `.gitignore`**

Replace the anchored lines `/out/`, `/build`, `/coverage` with un-anchored ones and append .NET entries. Final file:

```gitignore
node_modules/
.next/
.env*
!.env.example
dist/
*.log
.DS_Store
.superpowers/
playwright-report/
test-results/
out/
build/
.pnp
.pnp.*
.yarn/*
!.yarn/patches
!.yarn/plugins
!.yarn/releases
!.yarn/versions
coverage/
.vercel
*.pem
*.tsbuildinfo
next-env.d.ts

# .NET
bin/
obj/
.vs/
*.user
TestResults/
```

- [ ] **Step 5: Reinstall inside `frontend/`**

```bash
cd D:/PersonalProjects/airbnb/frontend && npm ci
```

Expected: completes without errors.

- [ ] **Step 6: Verify frontend unchanged**

```bash
cd D:/PersonalProjects/airbnb/frontend
npm test 2>&1 | tail -5     # counts identical to Step 1
npx tsc --noEmit && echo TSC_OK
npm run lint
npm run build
npm run test:coverage > /dev/null
npm run e2e
cd .. && git status --short   # must NOT list coverage/, .next/, node_modules/, test-results/
```

Expected: all pass; `git status` shows only renames, `.gitignore` modified, and the pre-existing ` M frontend/lib/data/experiences.ts`.

- [ ] **Step 7: Verify history preserved**

```bash
cd D:/PersonalProjects/airbnb
git log --follow --oneline -- frontend/app/page.tsx | head -3
```

Expected: shows commits from before the move (after committing in Step 8; run it after the commit if nothing appears yet).

- [ ] **Step 8: Commit (without the experiences.ts change)**

```bash
cd D:/PersonalProjects/airbnb
git add .gitignore
git status --short | grep experiences   # must show " M" (unstaged) for frontend/lib/data/experiences.ts
git commit -m "refactor: move Next.js app into frontend/

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(The `git mv` renames are already staged. Confirm the staged diff for `experiences.ts` is a pure rename: `git show --stat HEAD | grep experiences` shows `=>` with no line counts.)

---

### Task 2: Backend skeleton with `/health`

**Files:**
- Create: `backend/global.json`
- Create: `backend/Airbnb.slnx`
- Create: `backend/src/Airbnb.Api/Airbnb.Api.csproj`, `backend/src/Airbnb.Api/Program.cs`, `backend/src/Airbnb.Api/Properties/launchSettings.json` (template-generated)
- Create: `backend/tests/Airbnb.Api.Tests/Airbnb.Api.Tests.csproj`, `backend/tests/Airbnb.Api.Tests/HealthEndpointTests.cs`

**Interfaces:**
- Produces: `GET /health` → `200`, JSON `{"status":"ok"}`. `public partial class Program` for `WebApplicationFactory<Program>`.

- [ ] **Step 1: Pin SDK and verify selection**

Create `backend/global.json`:

```json
{
  "sdk": {
    "version": "10.0.100",
    "rollForward": "latestFeature"
  }
}
```

```bash
cd D:/PersonalProjects/airbnb/backend && dotnet --version
```

Expected: `10.0.4xx` (NOT `11.0.100-preview...`).

- [ ] **Step 2: Scaffold projects and solution**

```bash
cd D:/PersonalProjects/airbnb/backend
dotnet new web -n Airbnb.Api -o src/Airbnb.Api -f net10.0
dotnet new xunit -n Airbnb.Api.Tests -o tests/Airbnb.Api.Tests -f net10.0
dotnet new sln -n Airbnb --format slnx
dotnet sln Airbnb.slnx add src/Airbnb.Api/Airbnb.Api.csproj tests/Airbnb.Api.Tests/Airbnb.Api.Tests.csproj
dotnet add tests/Airbnb.Api.Tests reference src/Airbnb.Api
dotnet add tests/Airbnb.Api.Tests package Microsoft.AspNetCore.Mvc.Testing
rm -f tests/Airbnb.Api.Tests/UnitTest1.cs
```

- [ ] **Step 3: Write the failing test**

`backend/tests/Airbnb.Api.Tests/HealthEndpointTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Airbnb.Api.Tests;

public class HealthEndpointTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    private sealed record HealthResponse(string Status);

    [Fact]
    public async Task Get_health_returns_ok_status()
    {
        var client = factory.CreateClient();

        var response = await client.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<HealthResponse>();
        Assert.Equal("ok", body?.Status);
    }
}
```

- [ ] **Step 4: Run test to verify it fails**

```bash
cd D:/PersonalProjects/airbnb/backend && dotnet test
```

Expected: FAIL — either compile error (`Program` inaccessible) or 404 / status mismatch, since the template maps only `GET /` → "Hello World!".

- [ ] **Step 5: Implement**

Replace `backend/src/Airbnb.Api/Program.cs` with:

```csharp
var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.Run();

public partial class Program;
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd D:/PersonalProjects/airbnb/backend && dotnet test
```

Expected: `Passed! - Failed: 0, Passed: 1`.

- [ ] **Step 7: Smoke-test the running API**

```bash
cd D:/PersonalProjects/airbnb/backend
dotnet run --project src/Airbnb.Api --urls http://localhost:5080 &
sleep 8; curl -s http://localhost:5080/health; echo; kill %1
```

Expected: `{"status":"ok"}`.

- [ ] **Step 8: Commit**

```bash
cd D:/PersonalProjects/airbnb
git add backend
git status --short backend | grep -E '/(bin|obj)/' && echo "ERROR: build output staged"
git commit -m "feat: add ASP.NET Core backend skeleton with health endpoint

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: CI, README, CLAUDE.md

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `README.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `frontend/` npm scripts (Task 1); `backend/Airbnb.slnx` + `global.json` (Task 2).

- [ ] **Step 1: Write CI workflow**

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]

jobs:
  frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit
      - run: npm test
      - run: npm run build

  backend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-dotnet@v4
        with:
          global-json-file: backend/global.json
      - run: dotnet test
```

- [ ] **Step 2: Write README**

`README.md`:

````markdown
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
````

- [ ] **Step 3: Update CLAUDE.md**

Edit `CLAUDE.md`:

1. Right after the first paragraph, add:

```markdown
## Repository Layout

Monorepo:
- `frontend/` — Next.js app. **All frontend commands run from `frontend/`, and all frontend paths below are relative to `frontend/`.**
- `backend/` — ASP.NET Core (.NET 10) API. Solution `backend/Airbnb.slnx`; API in `src/Airbnb.Api`, tests in `tests/Airbnb.Api.Tests`. SDK pinned by `backend/global.json`.
- `docs/` — specs and plans (repo root).
```

2. In `## Commands`, prefix the first code block with `cd frontend` and change the single-test examples to `cd frontend && npx vitest run ...`. Then append:

````markdown
Backend:
```bash
cd backend
dotnet run --project src/Airbnb.Api   # start API
dotnet test                           # run xUnit tests
```
````

3. In `### Design Token System`, change `DESIGN.md` → `frontend/DESIGN.md` and `app/globals.css` → `frontend/app/globals.css`.

- [ ] **Step 4: Validate CI YAML parses**

```bash
cd D:/PersonalProjects/airbnb
node -e "require('fs').readFileSync('.github/workflows/ci.yml','utf8')" && echo READ_OK
```

(Full validation happens on first push; if `actionlint` is installed, run `actionlint` instead.)

- [ ] **Step 5: Commit**

```bash
cd D:/PersonalProjects/airbnb
git add .github/workflows/ci.yml README.md CLAUDE.md
git commit -m "chore: add CI for frontend and backend, README, update CLAUDE.md

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git status --short   # only " M frontend/lib/data/experiences.ts" should remain
```
