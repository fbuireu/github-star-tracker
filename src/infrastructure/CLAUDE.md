# src/infrastructure

The layer that owns every outbound side effect: the GitHub REST API, the `git` CLI, the filesystem and SMTP.
It is the only layer that reaches the network, though not the only one that performs I/O at all — `@config`
reads the action inputs and one YAML file via `node:fs`, and `@application` writes the Action log and the
outputs. Four adapters, no framework. None of them decide *when* work happens — `@application/tracker` is the composition
root and their only consumer. They hold no business logic and build no user-facing strings.

| Folder | Owns | Side effects |
| --- | --- | --- |
| `github/` | Repo discovery, filtering, stargazer pagination | Network (octokit) |
| `git/` | `git` CLI wrapper and the data-branch worktree lifecycle | `child_process`, fs |
| `persistence/` | The Data Branch lifecycle, filenames, reads/writes, commit & push | fs, `git` (via `../git/*`) |
| `notification/` | SMTP config from action inputs, sending the digest | `@actions/core` inputs, SMTP |

"Same layer" means all of `src/infrastructure`, not one adapter: `persistence/storage.ts` imports
`../git/commands` and `persistence/data-branch.ts` imports `../git/worktree`, exactly like
`github/filters.ts` imports `./client`. Persistence depending on git is the **only** cross-adapter direction
allowed, and it does not run the other way.

**Failure policy.** Repository fetching and worktree setup are **fatal** — they throw wrapped errors with
remediation text and fail the action. Per-repo stargazer failures are **degradable**: swallowed here and
downgraded to `core.warning` so the run continues with partial data. `sendEmail` rejects on SMTP failure, but
the caller catches and warns.

## github/

Fetch, then filter, then map. What survives every configured filter is the **Tracked Set**, and nothing
downstream can see a repository outside it.

- **The `accept: application/vnd.github.star+json` header is load-bearing** and is set per request, not on
  the client. Without it GitHub returns bare user objects with **no `starred_at`** and the whole star-history
  reconstruction silently degrades. Any new stargazer request must set it too.
- The token is always a user-supplied PAT, never the injected `GITHUB_TOKEN`, and the role it carries decides
  whether the stargazer endpoint answers at all
  ([ADR 0002](../../docs/adr/0002-require-a-personal-access-token.md)).
- **`filterRepos`' order of operations is part of the contract**: `onlyOrgs` narrows first, then `onlyRepos`
  **short-circuits** — it returns the org-narrowed matches and skips archived/fork/exclude/min-stars
  entirely. `onlyRepos` can never bring back a repo `onlyOrgs` excluded.
- Every list filter accepts an exact name **or** a `/body/flags` regex literal. Exact matching is
  case-sensitive; regex patterns honour their own flags. Matching is on the short `repo.name`, org matching on
  `owner.login`. An invalid regex is caught, warned about and treated as non-matching — never fatal.
- `fetchRepos` requests `sort: 'full_name'`, so downstream ordering is GitHub's ascending full-name order.
  Anything relying on stable report ordering depends on it. The loop stops on any page shorter than 100, so a
  page of exactly 100 always triggers one more request.
- **`client.ts` owns the whole `listForAuthenticatedUser` request**, including the `visibility`-to-query-param
  translation in `VISIBILITY_PARAMS`. GitHub's REST vocabulary has no `owned`: it is expressed as
  `visibility: 'all'` plus `affiliation: 'owner'`, which is why the map is not the identity. It is keyed by
  bare string literals and typed `Record<Config['visibility'], …>`, so a new `Visibility` is still a type
  error here while `@infrastructure` takes no *value* import from `@config` at all. The map used to live in
  `@config/defaults`, which put octokit's dialect in the one layer that must not know octokit exists — and
  its spec was in `filters.test.ts` here the whole time.
- **`fetchAllStargazers` returns exactly one entry per input repo, in input order**, even when the fetch
  failed. Downstream code may assume 1:1 alignment.
- `coveredStars` is `undefined` on a clean fetch and only set when coverage was cut short. It is the signal
  `@domain/star-history` uses to decide the tail must be ramped. A page that succeeds but returns nothing does
  not advance it.
- Partial-failure semantics differ between the two paths: a **full** fetch rethrows if page 1 fails but keeps
  what it has if a later page fails; a **sampled** fetch attempts every selected page regardless, then
  rethrows only if nothing at all was collected. Sampled pages have no early break, so gaps in the page
  sequence are expected.
- **This folder decides no Smart Sampling arithmetic.** `@domain/sampling` owns all of it — `shouldSample`,
  `reachablePages`, `sampledPages` (which pages to read) and `coveredStars` (how many Stars those pages
  account for). This folder fetches the pages it is handed and reports what came back. That is why the page
  spread, the rounding collisions and the ceiling clamp are asserted in `sampling.test.ts` against plain
  numbers instead of through a fake octokit.
- `sampled` is decided *before* the request, so it stays `true` on failure. The threshold comparison is
  strict: 1500 stars with threshold 1500 is not sampled. A sampled repo loses new-stargazer detection
  downstream ([ADR 0008](../../docs/adr/0008-sampled-repositories-are-excluded-from-stargazer-diffing.md)).
- `MAX_REACHABLE_PAGE` is 400 because GitHub only pages through a repo's oldest 40,000 stargazers. It is
  derived in `@domain/sampling` from `MAX_REACHABLE_STARGAZERS` and `STARGAZER_PAGE_SIZE`, never written down.
- **`fetchAllStargazers` is sequential on purpose** — parallelising would blow through the secondary rate
  limit that `@octokit/plugin-retry` exists to absorb. Retries happen inside octokit; this folder only ever
  sees the final failure, so its own handling is "give up on this page/repo", never "retry".
- `starredAt` passes through verbatim as the raw ISO string. This folder never parses or normalizes it.
- `GitHubRepo` is a hand-written structural subset, not octokit's generated type. Reading a new field means
  adding it there first, and to the tests' `makeRepo` factory.

## git/

- **`dataDir` is derived, never hardcoded**: `` `.${dataBranch}` ``. Code that needs the directory must use
  the value **returned** by `initializeDataBranch`. Why a branch at all is
  [ADR 0001](../../docs/adr/0001-star-data-lives-on-a-dedicated-data-branch.md).
- Subcommands that must run *in* the worktree get `cwd: path.resolve(dataDir)`; the resolve is required
  because a relative `cwd` would be read against the process cwd, not the repo root.
- **The order of operations in `initializeDataBranch` is load-bearing**: repo guard, commit identity, remote
  probe, stale-worktree removal, read-only guard, then create-orphan or fetch+add. Identity and cleanup
  therefore run even on a read-only run and even on a run about to throw.
- **Branch missing + read-only → throw**, before any worktree exists. A read-only run may never bring the
  data branch into existence. Branch missing + writable → an *orphan* branch, so data history shares no
  ancestry with code history; it is local-only until the first push.
- **Branch present → `worktree add` from `origin/<branch>`, leaving HEAD detached** — which is exactly why
  `commitAndPush` pushes the refspec `HEAD:<dataBranch>` and not a branch name. Do not "fix" either half
  in isolation.
- `execute` uses `execFileSync` with an **argv array, never a shell**. Arguments containing `;`, quotes, `$`
  or newlines pass verbatim to git (pinned by `commands.test.ts`). Commit messages and branch names are
  user-controlled — never reintroduce string interpolation here.
- `stdio` is all `pipe`, so git never writes to the Action log. Anything a user must see goes through
  `@actions/core` explicitly. `cleanup` is best-effort and idempotent: it never rethrows, so it is safe in a
  `finally`.

## persistence/

**`withDataBranch` is the folder's only external surface.** It opens the worktree, hands the caller a
`DataBranch` — `readHistory`, `readStargazers`, `publish` — and removes the worktree in a `finally`.
Everything else here is behind it.

- **`dataDir` never leaves this folder.** `initializeDataBranch` returns it, `withDataBranch` closes over it,
  and every read and write derives its path from that closure. `@application` no longer holds it, so it
  cannot thread a stale one into a later call.
- **`publish` is one call and its order is load-bearing**: history, report, badge, CSV, the Stargazer map
  when there is one, then every chart, then `pruneCharts`, then the commit. `add -A` inside `commitAndPush`
  is what stages all of it, so any new write must go **before** the commit — which is exactly what putting
  them in one function enforces. `data-branch.test.ts` pins that ordering.
- **The read-only guard lives here**, not in the tracker: `publish` writes everything into the worktree and
  then returns without committing when `readOnly` is set. `commitAndPush` itself still has no read-only
  awareness and must not gain any.
- The `write*`/`read*` helpers in `storage.ts` are internal to this folder. Only `writeHtmlReport` is
  consumed from outside, and it deliberately writes **off** the Data Branch.
- **`readHistory` always returns a usable `History`.** Missing file → `{ snapshots: [] }`; a stored
  `snapshots` that is not an array normalizes to `[]` while `starsAtLastNotification` survives untouched.
  Downstream domain code never null-checks it.
- **Invalid JSON throws and does not fall back.** Silently resetting corrupt history would destroy a user's
  tracking record — keep it fatal. `readStargazers` does no normalization at all; missing file → `{}`.
- **`stars-data.json` carries a `version` and this folder owns it end to end**
  ([ADR 0015](../../docs/adr/0015-the-stored-history-declares-its-format-version.md)). `writeHistory` stamps
  `DATA_FORMAT_VERSION` as the first key; `readHistory` validates it through `assertReadableFormat` and
  **strips it**, so `History` in `@domain/types` never gains the field and the domain stays unaware a file
  format exists. Absent means version 1 and always will, because every existing data branch predates the
  field. A higher number, or a version that is not a number, throws rather than being read optimistically.
  **Bump `DATA_FORMAT_VERSION` in the same commit as any change to `History`, `Snapshot` or `SnapshotRepo`** —
  nothing checks that for you, and the split between the shape (`@domain`) and the version (here) is
  deliberate. `stargazers.json` is deliberately unversioned: it is a flat map keyed by repo full name, so a
  reserved key would collide with the data.
- **JSON formatting is part of the on-disk contract**: 2-space indent, no trailing newline. Changing it
  rewrites the whole file and produces a full-file diff in every user's data branch.
- `writeChart` is the only function that creates a directory (`charts/`); every other writer assumes the
  worktree provides `dataDir`. **`writeHtmlReport` takes no `dataDir`** — it writes to
  `RUNNER_TEMP || cwd`, deliberately off the data branch, so the HTML report never lands in a commit.
- **`commitAndPush` is a no-op when nothing changed.** It runs `add -A`, then `diff --cached --quiet`; a
  *successful* exit means no staged changes, so the commit path is the `catch` branch. Do not "fix" that
  inverted-looking try/catch.
- **A rejected push is translated, every other push failure is not.** The worktree is pinned to
  `origin/<dataBranch>` at Run start and never re-fetched, so two overlapping writing Runs both branch from
  the same commit and the second one's push is refused as non-fast-forward. `commitAndPush` matches
  `PUSH_REJECTED_PATTERN` against the error and replaces only that case with remediation text naming
  `concurrency` and `read-only`; anything else rethrows untouched, because git's own detail is the useful
  part there. Do not widen the pattern into a bare catch — an auth or network failure must keep its message.
  This layer does **not** retry: re-reading and re-appending the Stored History after losing the race is a
  behaviour change, not an error-handling one.
- **`core.setSecret` on the push credential must stay before the push.** The base64 credential is passed as
  `-c http.extraheader=…`, and `execute` embeds the whole argv in any thrown error — the mask is what keeps a
  push failure from leaking the token. Any new call passing a secret in argv must do the same.
- `commitAndPush` has **no read-only awareness**; calling it on a read-only run would push. The guard lives in
  `data-branch.ts`, which is also what guarantees every `write*` has completed before it.
- Filenames are module-private but referenced by users' workflows and READMEs — renaming `stars-badge.svg`,
  `stars-data.json`, `stars-data.csv`, `stargazers.json` or the report `README.md` is a breaking change to
  consumers outside this repo.

## notification/

- **`smtp-host` is the only mandatory switch.** An empty host returns `null` *before* reading any other input,
  and `null` is the caller's master on/off switch.
- **`secure` is derived purely from the port** (`port === 465`). There is no `smtp-secure` input.
- **The port is validated.** `resolvePort` requires an integer in `1..MAX_TCP_PORT`; anything else, including a
  non-numeric string, warns and falls back to `587`. `NaN` never reaches nodemailer.
- **Auth is all-or-nothing**: `auth` is set only when username *and* password are both truthy, otherwise
  literally `undefined` (a test asserts the value, not an absent key).
- From-address resolution, in order: a `from` containing `@` is used verbatim; otherwise a `username`
  containing `@` becomes `` `${from} <${username}>` ``; otherwise the bare `from` as a display name.
- **Three distinct "no email" outcomes**, and the log level is the difference: not configured (`info`, here),
  configured but nothing to say (`info`, in the caller), configured but empty `email-to` (`warning`, here,
  because it is almost certainly a misconfiguration). Rejected recipients warn but still count as delivered.
- **Failures propagate as rejections, not warnings.** Do not add a local try/catch: it would swallow the error
  before the caller can report it. Equally, do not let it escape the caller's try — that would turn a mail
  outage into a red run.
- `getEmailConfig` is one of the few infrastructure functions that reads `@actions/core` inputs directly
  rather than receiving a parsed `Config`. Only `locale` is passed in, to resolve the default sender name —
  so changing `locale` changes the visible sender.
- **`smtp-password` is passed to `core.setSecret`** as soon as it is read, so it is masked in the Action log
  even when a workflow hardcodes it instead of supplying it through `secrets.*`. `email.test.ts` pins that.
- A non-null `EmailConfig` does **not** mean email will be sent — `to` is only checked at send time.

## Gotchas

- **`worktree.test.ts` and the `commitAndPush` tests mock `../git/commands`, not `node:child_process`.**
  `execute` is the seam, so a test scripts failures by *which git command ran* (`args[0] === 'ls-remote'`)
  and asserts on argv through a local `ranGit(...)` helper. They used to drive `execFileSync` with positional
  `mockReturnValueOnce` chains up to seven deep, where adding or reordering one git call shifted every later
  mock and broke tests that looked unrelated. Do not mock a level deeper than the seam again.
- `storage.test.ts` mocks `@actions/core` with a factory exposing only `info`, `debug` and `setSecret`.
  Adding a `core.warning(...)` to `storage.ts` fails the suite with "not a function", not a useful assertion.
- **`filters.test.ts` is the spec for `client.ts` too**, so a change to `client.ts` can fail here.
- **Stale charts are pruned, but not by the writer.** `writeChart` only writes; `pruneCharts({ dataDir, keep })`
  deletes the `charts/*.svg` files the current run did not produce, and `publish` calls it immediately after
  the write loop — which is what stops a repo dropping out of `top-repos` from stranding its chart forever.
- `writeHtmlReport` falls back to `process.cwd()` when `RUNNER_TEMP` is unset, writing the report into the
  checkout root on local runs.
- The action **requires an `actions/checkout` step**; the repo guard converts git's opaque "not in a git
  directory" into that instruction. Do not swallow it.
- `.<dataBranch>` is a hidden directory inside the primary checkout for the duration of the run. Linters,
  upload-artifact globs and other actions will see it until `cleanup`.
