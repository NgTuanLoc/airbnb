# Local SonarQube scan

`scan.ps1` runs [SonarQube Community Build](https://docs.sonarsource.com/sonarqube-community-build/) in Docker and
analyzes the whole repo. Everything stays on your machine: the server listens on localhost only, and its data and
credentials live in Docker volumes and the gitignored `tools/sonar/.local/`.

## Prerequisites

- Docker, running, with about 3 GB of memory to spare for the server
- PowerShell 7.2+ (`pwsh`, on Windows, macOS or Linux)
- The repo's own: .NET 10 SDK, Node.js 22.12+

Nothing to install globally and no Java: the script installs the pinned SonarScanner for .NET into
`tools/sonar/.local/tools`, runs SonarScanner for NPM through `npx`, and both scanners download a JRE from the server.

## Usage

From the repo root:

```powershell
./tools/sonar/scan.ps1                  # scan both projects
./tools/sonar/scan.ps1 -Only dotnet     # or -Only frontend
./tools/sonar/scan.ps1 -Coverage        # also run the tests and import their coverage (see Coverage)
./tools/sonar/scan.ps1 -Rules core      # a smaller rule set (see Rules)
./tools/sonar/scan.ps1 -IssuesOnly      # print and export the last results again, without scanning
./tools/sonar/scan.ps1 -Stop            # stop the server (its data stays)
./tools/sonar/scan.ps1 -Reset           # delete the server, its data and the local credentials
```

The first run pulls the server image (about 2.5 GB on disk), starts it on <http://localhost:9000>, replaces the
default admin password with a random one and creates a token. Later runs reuse all of it.

After each scan the script waits for the server to process the analysis, then prints:

- the quality gate status, with any failed conditions
- the open issues by software quality and severity
- the 20 most frequent rules

Every open issue is also written to `tools/sonar/.local/issues-<project>.json` (file, line, rule, rule name, impacts,
message), sorted by file and line. Grep it, or hand it to a coding agent.

The dashboard is at <http://localhost:9000>. Sign in as `admin` with the password in `tools/sonar/.local/admin-password`.

## What's analyzed

| Project | Covers | Scanner |
|---|---|---|
| `airbnb-dotnet` | `backend/` and the four `services/` solutions (C#), plus the repo's other files: YAML, JSON, scripts, the k6 script, and secrets in config files | SonarScanner for .NET: `begin`, a build of each solution, `end` |
| `airbnb-frontend` | `frontend/` (TypeScript, CSS) | SonarScanner for NPM |

- **Skipped:** gitignored files (`node_modules`, `.next`, `bin`, `obj`, ...) and EF migrations (generated code).
  The .NET project also skips `frontend/`, which is its own project.
- **Test code:** these get test rules and no coverage expectations:
  - the .NET test projects
  - in the frontend, `*.test.ts(x)`, the `test-*.ts(x)` helpers, `vitest.setup.ts` and `e2e/`
- **Build:** the .NET builds use the SDK pinned by `backend/global.json` and write to `tools/sonar/.local/artifacts`.
  A running `aspire run` or your IDE's builds aren't touched.
- **Expected warnings:** `Duplicate ProjectGuid ... will not be analyzed` is fine. Projects that several solutions build
  (ServiceDefaults, and the services the AppHost references) are analyzed once.

## Rules

The server ships three built-in rule sets per language. All three include every security rule:

| `-Rules` | Reliability and maintainability rules | C# rules | TypeScript rules |
|---|---|---|---|
| `core` | Reliability medium and up, maintainability blocker only. The server's own default. | 121 | 198 |
| `extended` | Reliability low and up, maintainability high and up | 173 | 251 |
| `comprehensive` (default) | All the recommended ones. This set replaces the former "Sonar way". | 321 | 439 |

The script makes the chosen set the default profile of each language before it scans. Rule counts are for Community
Build 26.10.

## Coverage

`-Coverage` runs the tests and sends their coverage with the analysis:

- **backend:** `Airbnb.UnitTests` and `Airbnb.Api.Tests`
- **services:** each service's tests
- **frontend:** the Vitest suite, as lcov

The integration tests start containers with Testcontainers, so Docker must be running, and the run takes several
minutes longer. Two suites are left out:

- the architecture tests, which run no product code
- the AppHost smoke test, which needs the whole stack and port 3000

Failing tests show up as warnings; the scan goes on with the coverage they produced. Without `-Coverage`, the dashboard
has no coverage figures.

## Fixing issues

- Fix the code, then rescan: `-Only dotnet` or `-Only frontend` rescans one side.
- A false positive, or an issue you accept: suppress it in the code, with the reason.
  - C#: `#pragma warning disable S1234 // why`, or `[SuppressMessage]` with a `Justification`.
  - TypeScript: `// NOSONAR why` at the end of the line.

  Don't mark it in the dashboard: the local server's data doesn't last (`-Reset`, upgrades).
- **In your editor:** SonarQube for IDE (VS Code, Visual Studio, Rider) shows most of the same issues as you type. To
  get exactly the server's rules, connect it to `http://localhost:9000` (connected mode):
  1. Sign in to the dashboard and create a token of your own (My Account > Security).
  2. Bind `frontend/` to `airbnb-frontend` and the rest of the repo to `airbnb-dotnet`.

## Upgrading

The versions are pinned at the top of `scan.ps1`:

| Variable | What | Latest version |
|---|---|---|
| `$SonarQubeImage` | SonarQube Community Build image | [Docker Hub](https://hub.docker.com/_/sonarqube/tags?name=community) (the `<version>-community` tags) |
| `$DotnetScannerVersion` | SonarScanner for .NET (`dotnet-sonarscanner`) | [NuGet](https://www.nuget.org/packages/dotnet-sonarscanner) |
| `$NpmScannerVersion` | SonarScanner for NPM (`@sonar/scan`) | [npm](https://www.npmjs.com/package/@sonar/scan) (`npm view @sonar/scan version`) |

Bump a version and rerun.
- **Scanners:** a new scanner version just installs on the next run.
- **Server image:** a new image recreates the server and its data, because the embedded database can't be upgraded.
  The history, the admin password and the token start over, and the script sets them up again.

Read the release notes before a major version. For example:
- SonarScanner for .NET 12 needs a server of 2025.1 / Community Build 25.1 or later.
- SonarScanner for NPM 5 needs Node.js 22.12+.

## Troubleshooting

| Problem | Fix |
|---|---|
| `Docker (is it running?) failed` | Start Docker. |
| Port 9000 is taken | Stop whatever uses it, or change `$hostUrl` and the `-p` mapping in `scan.ps1`. |
| `SonarQube isn't up after 5 minutes` | `docker logs airbnb-sonarqube`. It's usually memory: give Docker more. |
| `The admin password ... doesn't match` | The data volume and the saved password disagree (the volume was recreated by hand, say): `-Reset`. |
| The first scan is slow | It pulls the image, and the scanners download a JRE and the analyzers (cached in `~/.sonar/cache`). Later scans are faster. |

## Files

`tools/sonar/.local/` is gitignored:

| Path | What |
|---|---|
| `admin-password`, `token` | The server's admin password and the scan token |
| `issues-<project>.json` | The last export of each project's open issues |
| `tools/`, `artifacts/`, `dotnet/`, `frontend/`, `coverage/` | The .NET scanner, the build output, the scanners' work folders, the coverage reports |
