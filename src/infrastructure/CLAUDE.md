# src/infrastructure

The layer that owns every outbound side effect: the GitHub REST API, the `git` CLI, the filesystem and SMTP.
It is the only layer that reaches the network, which is not the same as being the only one that performs I/O;
the root [`CLAUDE.md`](../../CLAUDE.md) states that rule for the whole tree. Four adapters, no framework.
None of them decide *when* work happens: `@application/tracker` is the composition root and their only
consumer. They hold no business logic, and no string they build is localized or ends up in a Report. They do
write plain log lines.

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

**Failure policy.** Repository fetching and worktree setup are **fatal**: they throw wrapped errors with
remediation text and fail the action. Per-repo stargazer failures are **degradable**, swallowed here and
downgraded to `core.warning` so the run continues with partial data. `sendEmail` rejects on SMTP failure, but
the caller catches and warns. `describeFetchError` in `github/errors.ts` is the single formatter behind every
one of those wrapped messages: it renders `HTTP <status> <message>`, falling back to `String(error)` when the
error carries neither. Change the shape of a fetch failure's text there, not at each call site.

## github/

Fetch, then map, then narrow. `getRepos` maps GitHub's rows onto `RepoInfo` **first** and hands them to
`resolveTrackedSet` in `@domain/tracked-set`, which decides what survives. What survives is the
**Tracked Set**, and nothing downstream can see a repository outside it.

**The narrowing rules are not in this folder.** They are pure and they read domain vocabulary
(`repo.owner`, `repo.name`, `repo.stars`), not GitHub's `owner.login` / `stargazers_count`, so
`tracked-set.test.ts` asserts them without a fake octokit or a mocked logger. This folder does the two things
the domain cannot: it fetches, and it logs. `resolveTrackedSet` returns `afterOnlyOrgs`, `afterOnlyRepos` and
`invalidPatterns` as **numbers and strings**; `getRepos` turns them into `core.info` and `core.warning`
lines.

- **The `accept: application/vnd.github.star+json` header is load-bearing** and is set per request, not on
  the client. Without it GitHub returns bare user objects with **no `starred_at`** and the whole star-history
  reconstruction silently degrades. Any new stargazer request must set it too.
- The token is always a user-supplied PAT, never the injected `GITHUB_TOKEN`, and the role it carries decides
  whether the stargazer endpoint answers at all
  ([ADR 0002](../../docs/adr/0002-require-a-personal-access-token.md)).
- **`resolveTrackedSet`'s order of operations is part of the contract**: `onlyOrgs` narrows first, then
  `onlyRepos` **short-circuits**, returning the org-narrowed matches and skipping archived/fork/exclude/min-stars
  entirely. `onlyRepos` can never bring back a repo `onlyOrgs` excluded. `afterOnlyRepos` is non-`null`
  exactly when that short-circuit fired, which is how `getRepos` knows to log that count instead of the
  general one.
- Every list filter accepts an exact name **or** a `/body/flags` regex literal. Exact matching is
  case-sensitive; regex patterns honour their own flags. Matching is on the short `repo.name`, org matching on
  `repo.owner`. An invalid regex is collected into `invalidPatterns` and treated as non-matching, never
  fatal, and each distinct pattern is reported once.
- `fetchRepos` requests `sort: 'full_name'`, so downstream ordering is GitHub's ascending full-name order.
  Anything relying on stable report ordering depends on it. Its loop stops on the first page that is not
  full, sized by `REPOS_PER_PAGE` in `client.ts`, so a full page always triggers one more request.
- **`client.ts` owns the whole `listForAuthenticatedUser` request**, including the `visibility`-to-query-param
  translation in `VISIBILITY_PARAMS`. GitHub's REST vocabulary has no `owned`: it is expressed as
  `visibility: 'all'` plus `affiliation: 'owner'`, which is why the map is not the identity. It is keyed by
  bare string literals and typed `Record<Config['visibility'], …>`, so a new `Visibility` is still a type
  error here while `@infrastructure` takes no *value* import from `@config` at all. The map used to live in
  `@config/defaults`, which put octokit's dialect in the one layer that must not know octokit exists, and
  its spec was in `filters.test.ts` here the whole time.
- **A full stargazer fetch pages until it reads a page shorter than 100**, the stargazer page size owned by
  `@domain/sampling`, so an exactly full page always costs one more request. A sampled fetch does not page at
  all; it reads the specific pages it was handed.
- **`fetchAllStargazers` returns exactly one entry per input repo, in input order**, even when the fetch
  failed. Downstream code may assume 1:1 alignment.
- `coveredStars` is `undefined` on a clean fetch and only set when coverage was cut short. It is the signal
  `@domain/star-history` uses to decide the tail must be ramped. A page that succeeds but returns nothing does
  not advance it.
- Partial-failure semantics differ between the two paths: a **full** fetch rethrows if page 1 fails but keeps
  what it has if a later page fails; a **sampled** fetch attempts every selected page regardless, then
  rethrows only if nothing at all was collected. Sampled pages have no early break, so gaps in the page
  sequence are expected.
- **This folder decides no Smart Sampling arithmetic.** `@domain/sampling` owns all of it: `shouldSample`,
  `reachablePages`, `sampledPages` (which pages to read) and `coveredStars` (how many Stars those pages
  account for). This folder fetches the pages it is handed and reports what came back. That is why the page
  spread, the rounding collisions and the ceiling clamp are asserted in `sampling.test.ts` against plain
  numbers instead of through a fake octokit.
- **The one `coveredStars` this folder computes itself is not sampling arithmetic.** A *full* fetch that dies
  part-way reports `stargazers.length`, the exact number it holds, rather than
  `coveredStars({ lastFetchedPage, totalStars })`, which estimates from a page count and would understate a
  partial page. The two formulas answer the same question for different situations and are meant to differ;
  only the sampled path goes through `@domain`.
- `sampled` is decided *before* the request, so it stays `true` on failure. The threshold comparison is
  strict: 1500 stars with threshold 1500 is not sampled. A sampled repo loses new-stargazer detection
  downstream ([ADR 0008](../../docs/adr/0008-sampled-repositories-are-excluded-from-stargazer-diffing.md)).
- `MAX_REACHABLE_PAGE` is 400 because GitHub only pages through a repo's oldest 40,000 stargazers. It is
  derived in `@domain/sampling` from `MAX_REACHABLE_STARGAZERS` and `STARGAZER_PAGE_SIZE`, never written down.
- **`fetchAllStargazers` is sequential on purpose.** Parallelising would blow through the secondary rate
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
- **Branch absence is empty output, never a thrown probe.** `ls-remote --heads` exits 0 with no output when
  nothing matches; `--exit-code` is what turns that into a failure, so it is deliberately *not* passed. The
  probe used to carry it and sit in a bare `catch`, which read every network, DNS or auth failure as "the
  branch is not there". The run then built an orphan, pushed it over the real branch, was rejected, and told
  the user another run had raced it and to add a `concurrency` group. That remediation could never work. A
  failing probe now propagates git's own text.
- **Every remote command carries the token, as a *fallback*, not an override.** `ls-remote` and `fetch` used
  to run unauthenticated while only the push was authenticated, relying on whatever `actions/checkout` had
  persisted. On a repository checked out with `persist-credentials: false`, which is what OpenSSF and zizmor
  recommend and what this repo's own five checkout steps use, there is nothing to rely on, so the probe
  failed on every run. `authenticatedArgs` (`git/commands.ts`) fixes that case.
- **It does not win against `actions/checkout`, and it is not meant to.** Verified with `GIT_TRACE_CURL`
  against the real remote, because two reviews reasoned about this from the config file and both got it wrong:
  `actions/checkout` persists its credential under the **URL-scoped** `http.https://github.com/.extraheader`,
  ours is the **bare** `http.extraheader`, and when both match **only the URL-scoped one is sent**. Git
  accumulates multiple values of the *same* key (two bare, or two URL-scoped, really do send two headers)
  but a URL-scoped entry replaces the bare list rather than adding to it. So with the default
  `persist-credentials: true` the run authenticates with checkout's token exactly as it always did, and
  `github-token` is what git uses only when checkout persisted nothing.
  A leading `-c http.extraheader=` was tried as a way to clear checkout's entry. It does not: an empty *bare*
  value cannot reset a *URL-scoped* list. Only `-c http.https://github.com/.extraheader=` does, and hardcoding
  that host would break GitHub Enterprise, so the fallback shape is deliberate. Do not add a reset back
  without tracing what git actually sends.
- `core.setSecret` is not optional here, because `execute` puts the whole argv into its error message.
- **Branch missing + read-only throws**, before any worktree exists. A read-only run may never bring the
  data branch into existence. Branch missing + writable gives an *orphan* branch, so data history shares no
  ancestry with code history; it is local-only until the first push.
- **Branch present means `worktree add` from `origin/<branch>`, leaving HEAD detached**, which is exactly why
  `commitAndPush` pushes the refspec `HEAD:<dataBranch>` and not a branch name. Do not "fix" either half
  in isolation.
- `execute` uses `execFileSync` with an **argv array, never a shell**. Arguments containing `;`, quotes, `$`
  or newlines pass verbatim to git (pinned by `commands.test.ts`). Commit messages and branch names are
  user-controlled, so never reintroduce string interpolation here.
- `stdio` is all `pipe`, so git never writes to the Action log. Anything a user must see goes through
  `@actions/core` explicitly. `cleanup` is best-effort and idempotent: it never rethrows, so it is safe in a
  `finally`.

## persistence/

**`withDataBranch` is the only surface that touches the Data Branch.** It opens the worktree, hands the
caller a `DataBranch` (`readHistory`, `readStargazers`, `publish`) and removes the worktree in a `finally`.
The one other export consumed from outside this folder is `writeHtmlReport`, which deliberately writes
**off** the Data Branch: it takes no `dataDir` and targets `RUNNER_TEMP`, falling back to `process.cwd()`
when that is unset, so the report survives `cleanup`, exists on read-only runs and on runs where nothing
matched, and never lands in a commit. On a local run that fallback puts it in the checkout root.

- **`dataDir` never leaves this folder.** `initializeDataBranch` returns it, `withDataBranch` closes over it,
  and every read and write derives its path from that closure. `@application` no longer holds it, so it
  cannot thread a stale one into a later call.
- **`publish` is one call and its order is load-bearing**: history, report, badge, CSV, the Stargazer map
  when there is one, then every chart, then `pruneCharts`, then the commit. `add -A` inside `commitAndPush`
  is what stages all of it, so any new write must go **before** the commit, which is exactly what putting
  them in one function enforces. `data-branch.test.ts` pins that ordering.
- **The read-only guard lives here**, not in the tracker: `publish` writes everything into the worktree and
  then returns without committing when `readOnly` is set. `commitAndPush` itself still has no read-only
  awareness and must not gain any.
- Every other `write*`/`read*` helper in `storage.ts` is internal to this folder.
- **One writer covers every plain-text artefact.** `writeArtefact({ dataDir, artefact, contents })` takes an
  `Artefact` (`REPORT`, `BADGE` or `CSV`) and looks the filename up in `DATA_FILES`. Adding a text format
  is one entry in that enum and one in the table, not a fourth function that is `path.join` plus
  `writeFileSync` under a different field name. `writeHistory` and `writeStargazers` stay separate because
  they are JSON and one of them stamps the format version; `writeChart` stays separate because it creates a
  directory.
- **`readHistory` always returns a usable `History`.** A missing file gives `{ snapshots: [] }`; a stored
  `snapshots` that is not an array normalizes to `[]` while `starsAtLastNotification` survives untouched.
  Downstream domain code never null-checks it.
- **Invalid JSON throws and does not fall back.** Silently resetting corrupt history would destroy a user's
  tracking record, so keep it fatal
  ([ADR 0021](../../docs/adr/0021-an-unreadable-stored-history-fails-the-run.md), which covers all three
  guards here and why the accepted cost is that a broken file blocks every later run until a human fixes
  it). `readStargazers` does no normalization at all; a missing file gives `{}`.
- **So does JSON that parses but is not an object.** That invariant used to cover only *unparseable* text.
  A `stars-data.json` holding `null`, `[]`, `5` or a string destructured to `{}`, normalized to
  `{ snapshots: [] }`, and the Run then treated a populated Data Branch as a first Run, appending one
  Snapshot and **pushing**, discarding the record, while reporting success. `assertJsonObject` makes the
  stated invariant true. A `snapshots` key that is not an array still normalizes to `[]`; that one is
  deliberate and pinned, because the surrounding object is intact and `starsAtLastNotification` must survive.
- **`stars-data.json` carries a `version` and this folder owns it end to end**
  ([ADR 0015](../../docs/adr/0015-the-stored-history-declares-its-format-version.md)). `writeHistory` stamps
  `DATA_FORMAT_VERSION` as the first key; `readHistory` validates it through `assertReadableFormat` and
  **strips it**, so `History` in `@domain/types` never gains the field and the domain stays unaware a file
  format exists. Absent means version 1 and always will, because every existing data branch predates the
  field. A higher number, or a version that is not a number, throws rather than being read optimistically.
  **Bump `DATA_FORMAT_VERSION` in the same commit as any change to `History`, `Snapshot` or `SnapshotRepo`.**
  Nothing checks that for you, and the split between the shape (`@domain`) and the version (here) is
  deliberate. `stargazers.json` is deliberately unversioned: it is a flat map keyed by repo full name, so a
  reserved key would collide with the data.
- **JSON formatting is part of the on-disk contract**: 2-space indent, no trailing newline. Changing it
  rewrites the whole file and produces a full-file diff in every user's data branch.
- `writeChart` is the only function that creates a directory (`charts/`); every other writer assumes the
  worktree provides `dataDir`.
- **`commitAndPush` is a no-op when nothing changed.** It runs `add -A`, then `diff --cached --quiet`; a
  *successful* exit means no staged changes, so the commit path is the `catch` branch. Do not "fix" that
  inverted-looking try/catch.
- **A rejected push is translated, every other push failure is not.** The worktree is pinned to
  `origin/<dataBranch>` at Run start and never re-fetched, so two overlapping writing Runs both branch from
  the same commit and the second one's push is refused as non-fast-forward. `commitAndPush` matches
  `PUSH_REJECTED_PATTERN` against the error and replaces only that case with remediation text naming
  `concurrency` and `read-only`; anything else rethrows untouched, because git's own detail is the useful
  part there. Do not widen the pattern into a bare catch: an auth or network failure must keep its message.
  This layer does **not** retry. Re-reading and re-appending the Stored History after losing the race is a
  behaviour change, not an error-handling one.
- **`core.setSecret` on the push credential must stay before the push.** The base64 credential is passed as
  `-c http.extraheader=…`, and `execute` embeds the whole argv in any thrown error, so the mask is what keeps
  a push failure from leaking the token. Any new call passing a secret in argv must do the same.
- `commitAndPush` has **no read-only awareness**; calling it on a read-only run would push. The guard lives in
  `data-branch.ts`, which is also what guarantees every `write*` has completed before it.
- Filenames are module-private but referenced by users' workflows and READMEs. Renaming `stars-badge.svg`,
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
  before the caller can report it. Equally, do not let it escape the caller's try, which would turn a mail
  outage into a red run.
- `getEmailConfig` is one of the few infrastructure functions that reads `@actions/core` inputs directly
  rather than receiving a parsed `Config`. Only `locale` is passed in, to resolve the default sender name, so
  changing `locale` changes the visible sender.
- **`smtp-password` is passed to `core.setSecret`** as soon as it is read, so it is masked in the Action log
  even when a workflow hardcodes it instead of supplying it through `secrets.*`. `email.test.ts` pins that.
- A non-null `EmailConfig` does **not** mean email will be sent; `to` is only checked at send time.

## Gotchas

- **`worktree.test.ts` and the `commitAndPush` tests mock `../git/commands`, not `node:child_process`.**
  `execute` is the seam, so a test scripts failures by *which git command ran* (`args.includes('ls-remote')`,
  matching on membership rather than `args[0]`, since an authenticated command begins with `-c`)
  and asserts on argv through a local `ranGit(...)` helper. They used to drive `execFileSync` with positional
  `mockReturnValueOnce` chains up to seven deep, where adding or reordering one git call shifted every later
  mock and broke tests that looked unrelated. Do not mock a level deeper than the seam again.
- `storage.test.ts` mocks `@actions/core` with a factory exposing only `info`, `debug` and `setSecret`.
  Adding a `core.warning(...)` to `storage.ts` fails the suite with "not a function", not a useful assertion.
- **`filters.test.ts` is the spec for `client.ts` too**, so a change to `client.ts` can fail here. It is the
  one sanctioned case of a test file covering two modules, and `client.ts` is the only module in the tree
  with no colocated test of its own.
- **Stale charts are pruned, but not by the writer.** `writeChart` only writes; `pruneCharts({ dataDir, keep })`
  deletes the `charts/*.svg` files the current run did not produce, and `publish` calls it immediately after
  the write loop, which is what stops a repo dropping out of `top-repos` from stranding its chart forever.
- The action **requires an `actions/checkout` step**; the repo guard converts git's opaque "not in a git
  directory" into that instruction. Do not swallow it.
- `.<dataBranch>` is a hidden directory inside the primary checkout for the duration of the run. Linters,
  upload-artifact globs and other actions will see it until `cleanup`.
