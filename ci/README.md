# Local CI

GitHub Actions no longer runs on pull requests: the checks run on your machine before a push, and the cloud workflow
(`.github/workflows/ci.yml`) runs only once a change reaches `main`, as a backstop on a clean runner, or by hand
(**Run workflow**). The idea and its trade-offs: https://milanjovanovic.tech/blog/i-turned-off-ci-for-pull-requests

## Set up (once per clone)

```sh
git config core.hooksPath .githooks
```

From then on every `git push` runs `ci/local-ci.sh` first and is refused if it fails. Docker must be running (the
integration tests start Testcontainers).

## Run it yourself

```sh
sh ci/local-ci.sh             # what CI runs: frontend lint, types, seed check, tests, build; backend and every service's tests
sh ci/local-ci.sh --apphost   # also the Aspire smoke test (stop `aspire run` first: it needs port 3000)
sh ci/local-ci.sh --force     # run again even though this commit already passed
```

A commit that passed is remembered (`.git/local-ci-passed`, only for a clean working tree), so pushing it again or
signing it off doesn't rerun everything. Builds go to `ci/.local/artifacts` (gitignored), so a running Aspire stack's
locked files don't get in the way.

## Optional: require a signoff on `main`

The hook can be skipped (`git push --no-verify`), so on its own it vouches for nothing. To make GitHub require that
someone ran the checks, use Basecamp's [gh-signoff](https://github.com/basecamp/gh-signoff):

```sh
gh extension install basecamp/gh-signoff
gh signoff install            # a ruleset on main: requires the `signoff` status, blocks force pushes
sh ci/local-ci.sh --signoff   # after pushing a branch: runs the checks (or reuses the pass) and posts the status
```

Pull requests from forks can't be signed off (posting a status needs push access), so outside contributions would need
cloud CI again. And since the cloud run happens after the merge, a broken change can reach `main`: the backstop run
then says so.
