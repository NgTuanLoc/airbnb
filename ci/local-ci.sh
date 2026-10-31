#!/usr/bin/env sh
# Runs on this machine what .github/workflows/ci.yml runs on GitHub, so pull requests need no cloud CI
# (https://milanjovanovic.tech/blog/i-turned-off-ci-for-pull-requests). The pre-push hook (.githooks/pre-push) runs it.
#
#   sh ci/local-ci.sh             frontend, backend and every service (Docker must be running: Testcontainers)
#   sh ci/local-ci.sh --apphost   also the Aspire smoke test (the whole stack: stop `aspire run` first, port 3000 must be free)
#   sh ci/local-ci.sh --signoff   then post the `signoff` commit status with gh-signoff (after pushing; see ci/README.md)
#   sh ci/local-ci.sh --force     run even if this commit already passed
set -eu

root=$(git rev-parse --show-toplevel)
cd "$root"
apphost=false signoff=false force=false
for arg in "$@"; do
  case "$arg" in
    --apphost) apphost=true ;;
    --signoff) signoff=true ;;
    --force) force=true ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

head=$(git rev-parse HEAD)
marker="$(git rev-parse --git-dir)/local-ci-passed"
# A commit that passed once passes again: pushing it twice, or signing it off, doesn't rerun everything.
if [ "$force" = false ] && [ -f "$marker" ] && [ "$(cat "$marker")" = "$head" ] && [ -z "$(git status --porcelain)" ]; then
  echo "local CI already passed for $head"
else
  # Builds go to their own folder, so a running Aspire stack's locked files don't get in the way.
  artifacts="$root/ci/.local/artifacts"
  step() { printf '\n== %s\n' "$1"; }

  step "frontend: lint, types, seed data, tests, build"
  (cd frontend && npm run lint && npx tsc --noEmit && npm run seed:check && npm test && npm run build)

  step "backend: unit, architecture and integration tests"
  for project in Airbnb.UnitTests Airbnb.ArchitectureTests Airbnb.Api.Tests; do
    (cd backend && dotnet test --project "tests/$project" --artifacts-path "$artifacts/backend")
  done

  for service in notifications payments chat assistant; do
    name="$(printf '%s' "$service" | cut -c1 | tr a-z A-Z)$(printf '%s' "$service" | cut -c2-)"
    step "$service service tests"
    (cd "services/$service" && dotnet test --project "tests/Airbnb.$name.Tests" --artifacts-path "$artifacts/$service")
  done

  if [ "$apphost" = true ]; then
    step "Aspire smoke test"
    (cd backend && dotnet test --project tests/Airbnb.AppHost.Tests --artifacts-path "$artifacts/backend")
  fi

  # Only a clean tree's commit is vouched for: uncommitted changes weren't what got pushed.
  if [ -z "$(git status --porcelain)" ]; then echo "$head" > "$marker"; fi
  printf '\nlocal CI passed for %s\n' "$head"
fi

if [ "$signoff" = true ]; then
  gh signoff
fi
