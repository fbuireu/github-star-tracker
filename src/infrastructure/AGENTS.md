# src/infrastructure

The layer that owns the Run's outbound side effects: the GitHub REST API, the `git` CLI, every file the Run
writes and SMTP. The Action log and the outputs are not among them: every shell layer logs, and
`@application` sets the outputs. It is the only layer that reaches the network, which is not the same as being
the only one that performs I/O. Adapters only, no framework. None of them decide *when* work happens:
`@application/tracker` is the composition root and their only consumer.

| Folder | Owns | Side effects |
| --- | --- | --- |
| `github/` | Repo discovery, filtering, stargazer pagination | Network (octokit) |
| `git/` | `git` CLI wrapper and the data-branch worktree lifecycle | `child_process`, fs |
| `persistence/` | The Data Branch lifecycle, filenames, reads/writes, commit & push | fs, `git` (via `../git/*`) |
| `notification/` | SMTP config from action inputs, sending the digest | `@actions/core` inputs, SMTP |

`persistence` is the one adapter that imports another: [`persistence/storage.ts`](./persistence/storage.ts) imports
`../git/commands` and [`persistence/data-branch.ts`](./persistence/data-branch.ts) imports `../git/worktree`.

A failed repository-listing request always carries the token-permissions hint. Worktree setup throws remediation
text for a missing `actions/checkout` and for a read-only Run on an absent Data Branch, and `execute`'s wrapper
around git's own text for any other git failure. `describeFetchError` in [`github/errors.ts`](./github/errors.ts) renders every
fetch failure's text, the fatal repository listing and the stargazer warnings alike, as
`HTTP <status> <message>`, falling back to `String(error)` when the error carries neither. It reads `status` and
`message` through a schema whose fields each fall back to absent on their own, so a numeric `message` or a string
`status` drops that one part instead of throwing. `execute` reads git's text the same way, `stderr` and then
`message` through `GitFailureSchema`, and falls back to `Unknown error`, so a throw that carries neither, or is not
an object, still gets its wrapper.

## github/

Fetch, then map, then narrow. `getRepos` maps GitHub's rows onto `RepoInfo` **first** and hands them to
`resolveTrackedSet` in `@domain/tracked-set`, which decides what survives. What survives is the
**Tracked Set**, and nothing downstream can see a repository outside it.

The narrowing rules live in `@domain/tracked-set` and read domain vocabulary (`repo.owner`, `repo.name`,
`repo.stars`), not GitHub's `owner.login` / `stargazers_count`, and
[`tracked-set.test.ts`](../domain/tracked-set.test.ts) asserts them. `resolveTrackedSet` returns `afterOnlyOrgs`,
`afterOnlyRepos` and `invalidPatterns` as **numbers and strings**; `getRepos` turns them into `core.info` and
`core.warning` lines.

- **The `accept: application/vnd.github.star+json` header is what returns the dates**, and it is set per
  request, not on the client. Without it GitHub returns bare user objects, with no `user` wrapper and **no
  `starred_at`**, so every page fails `GitHubStargazerRowSchema`, every repository's fetch fails with a warning,
  and the star-history reconstruction has nothing to work from. Any new stargazer request must set it too.
- The token is always a user-supplied PAT, never the injected `GITHUB_TOKEN`, and the role it carries decides
  whether the stargazer endpoint answers at all
  ([ADR 0002](../../docs/adr/0002-require-a-personal-access-token.md)).
- `resolveTrackedSet`'s order of operations is part of the contract: `onlyOrgs` narrows first, then
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
  full, sized by `REPOS_PER_PAGE` in [`client.ts`](./github/client.ts), so a full page always triggers one more request.
- `client.ts` owns the whole `listForAuthenticatedUser` request, including the `visibility`-to-query-param
  translation in `VISIBILITY_PARAMS`. GitHub's REST vocabulary has no `owned`: it is expressed as
  `visibility: 'all'` plus `affiliation: 'owner'`, which is why the map is not the identity. It is keyed by
  bare string literals and typed `Record<Config['visibility'], …>`, so a new `Visibility` is still a type
  error here.
- A full stargazer fetch pages until it reads a page shorter than 100, the stargazer page size owned by
  `@domain/sampling`, so an exactly full page always costs one more request, **or until it exhausts
  `MAX_REACHABLE_PAGE`**, or until a page fails (below). A sampled fetch does not page at all; it reads the
  specific pages it was handed.
- `fetchAllStargazers` returns exactly one entry per input repo, in input order, even when the fetch
  failed. Downstream code may assume 1:1 alignment.
- `coveredStars` is set whenever a fetch that returned Stargazers was cut short, and `undefined` when the
  fetch reached the end of the list or failed outright (no Stargazers, `incomplete` set). It is the signal
  `@domain/star-history` uses to decide the tail must be ramped. A page that succeeds but returns nothing
  does not advance it.
- The page ceiling is a short fetch, not a clean one. A full fetch that runs all 400 pages with a full
  last page has no idea whether more exist, so it reports `coveredStars` and warns, exactly as a fetch that
  died mid-pagination does. `fetchAllStargazers` therefore marks it `incomplete`, which keeps a repository
  above the ceiling out of new-stargazer diffing and leaves its Stargazer map entry as it was: the reachable
  window is the **oldest** 40,000 logins and never moves, so diffing it would report zero new Stargazers on
  every Run.
- Partial-failure semantics differ between the two paths: a **full** fetch rethrows if page 1 fails but keeps
  what it has if a later page fails; a **sampled** fetch attempts every selected page regardless, then
  rethrows only if nothing at all was collected. Sampled pages have no early break, so gaps in the page
  sequence are expected.
- `@domain/sampling` plans the fetch: `shouldSample`, `sampledPages` (which pages to read) and `coveredStars`
  (how many Stars those pages account for). This folder fetches the pages it is handed and reports what came
  back. [`sampling.test.ts`](../domain/sampling.test.ts) asserts that arithmetic on plain numbers, and
  `stargazers.test.ts` repeats the spread, the small-repository fallback, the ceiling and the one-page budget
  through a fake octokit, so a change to it fails both files.
- A *full* fetch cut short, mid-pagination or at the ceiling, reports `stargazers.length` as its `coveredStars`;
  only the sampled path goes through `@domain`'s `coveredStars`.
- `sampled` is decided *before* the request, so it stays `true` on failure. The threshold comparison is
  strict: 1500 stars with threshold 1500 is not sampled. A sampled repo loses new-stargazer detection
  downstream ([ADR 0008](../../docs/adr/0008-sampled-repositories-are-excluded-from-stargazer-diffing.md)).
- `MAX_REACHABLE_PAGE` is 400 because GitHub only pages through a repo's oldest 40,000 stargazers. It is
  derived in `@domain/sampling` from `MAX_REACHABLE_STARGAZERS` and `STARGAZER_PAGE_SIZE`, never written down.
- `fetchAllStargazers` is sequential on purpose. Parallelising would trip GitHub's secondary rate limit,
  which `@octokit/plugin-retry` absorbs only in part: with the defaults the tracker attaches, it retries a
  `429` and never a `403`, and GitHub answers that limit with either. Retries happen inside octokit; this
  folder only ever sees the final failure, so its own handling is "give up on this page/repo", never "retry".
- A `starred_at` that is not a string (absent, or a number) is the one `starredAt` this folder does not pass
  through: `GitHubStargazerRowSchema` reads it as `""`, an unusable date, so the "without usable starred_at
  dates" warning covers it and `diffStargazers` never compares `undefined`.
- `GitHubRepo` is inferred from `GitHubRepoSchema` in [`types.ts`](./github/types.ts), a hand-written
  structural subset, not octokit's generated type, whose shapes exist at compile time only. `fetchRepos`
  checks that each page is a list before reading its length, and validates the whole list after paging, both
  outside the fetch `catch`, so a page or a row it cannot read fails the Run with
  `GitHub returned a repository list this action cannot read:` and the path, not with the token-permissions
  hint meant for a failed request. A stargazer page that fails `GitHubStargazerRowSchema` (a `null` user, say)
  throws from `fetchStargazerPage` and takes the same degradable path as a failed request, with the path in
  the warning. Reading a new field means adding it to the schema first, and to the tests' `makeRepo` factory.

## git/

- **`dataDir` is derived, never hardcoded**: `` `.${dataBranch}` ``. Code that needs the directory must use
  the value **returned** by `initializeDataBranch`. Why a branch at all is
  [ADR 0001](../../docs/adr/0001-star-data-lives-on-a-dedicated-data-branch.md).
- Subcommands that must run *in* the worktree get `cwd: path.resolve(dataDir)`. `dataDir` is relative, and
  every path built on it resolves against the process cwd, which is where `worktree add` created the worktree.
- `initializeDataBranch` runs its steps in this order deliberately: repo guard, commit identity, remote
  probe, stale-worktree removal, read-only guard, then create-orphan or fetch+add. Identity and cleanup
  therefore run even on a read-only run and even on a run about to throw.
- Branch absence is empty output, never a thrown probe. `ls-remote --heads` exits 0 with no output when
  nothing matches; `--exit-code` is what turns that into a failure, so it is deliberately *not* passed. A
  failing probe propagates git's own text: read as absence, a network, DNS or auth failure would build an
  orphan and push it over the real branch.
- **Every remote command carries the token, as a *fallback*, not an override.** `authenticatedArgs`
  ([`git/commands.ts`](./git/commands.ts)) adds it to `ls-remote`, `fetch` and the push. On a repository
  checked out with `persist-credentials: false`, which OpenSSF and zizmor recommend and this repo's own
  checkout steps use, `actions/checkout` persists nothing, and the token is the only credential git has.
- It does not win against `actions/checkout`, and it is not meant to. `actions/checkout` persists its
  credential under the **URL-scoped** `http.https://github.com/.extraheader`, ours is the **bare**
  `http.extraheader`, and when both match **only the URL-scoped one is sent**. Git accumulates multiple values
  of the *same* key (two bare, or two URL-scoped, really do send two headers) but a URL-scoped entry replaces
  the bare list rather than adding to it. So with the default `persist-credentials: true` the run
  authenticates with checkout's token, and `github-token` is what git uses only when checkout persisted
  nothing. A leading `-c http.extraheader=` does not clear checkout's entry: an empty *bare* value cannot
  reset a *URL-scoped* list. Only `-c http.https://github.com/.extraheader=` does, and hardcoding that host
  would break GitHub Enterprise, so the fallback shape is deliberate. Trace what git sends
  (`GIT_TRACE_CURL`) before adding a reset; reasoning from the config file gets this wrong.
- `core.setSecret` is not optional here, because `execute` puts the whole argv into its error message.
- Branch missing + read-only throws, before any worktree exists. A read-only run may never bring the
  data branch into existence. Branch missing + writable gives an *orphan* branch, so data history shares no
  ancestry with code history; it is local-only until the first push.
- Branch present means `worktree add` from `origin/<branch>`, leaving HEAD detached, which is exactly why
  `commitAndPush` pushes the refspec `HEAD:<dataBranch>` and not a branch name. Do not "fix" either half
  in isolation.
- `stdio` is all `pipe`, so git never writes to the Action log. Anything a user must see goes through
  `@actions/core` explicitly. `cleanup` is best-effort and idempotent: it never rethrows, so it is safe in a
  `finally`.

## persistence/

**`withDataBranch` is the only entry point that touches the Data Branch.** It opens the worktree, hands the
caller a `DataBranch` (`readHistory`, `readStargazers`, `publish`) and removes the worktree in a `finally`.
The one other export consumed from outside this folder is `writeHtmlReport`, which deliberately writes
**off** the Data Branch: it takes no `dataDir` and targets `RUNNER_TEMP`, falling back to `process.cwd()`
when that is unset, so the report survives `cleanup`, exists on read-only runs and on runs where nothing
matched, and never lands in a commit. On a local run that fallback puts it in the checkout root.

- `initializeDataBranch` returns `dataDir`, `withDataBranch` closes over it and hands it back to `cleanup`, and
  every read and write derives its path from that closure.
- `publish` is one call, and the order inside it matters: history, report, badge, CSV, the Stargazer map
  when there is one, then every chart, then `pruneCharts`, then the commit. `add -A` inside `commitAndPush`
  is what stages all of it, so any new write must go **before** the commit, which is exactly what putting
  them in one function enforces. [`data-branch.test.ts`](./persistence/data-branch.test.ts) pins that order.
- `publish` writes everything into the worktree and then returns without committing when `readOnly` is set.
- One writer covers every plain-text Artefact on the Data Branch.
  `writeArtefact({ dataDir, artefact, contents })` takes an `Artefact` (`REPORT`, `BADGE` or `CSV`) and looks
  the filename up in `DATA_FILES`. Adding a text format is one `Artefact` entry, one `DATA_FILES` row, one
  `PublishedArtefacts` field and one `writeArtefact` line in `publish`, not a new function that is `path.join`
  plus `writeFileSync` under a different field name. `writeHistory` and `writeStargazers` stay separate because
  they are JSON and one of them stamps the format version; `writeChart` stays separate because it creates a
  directory.
- `readHistory` always returns a usable `History` or throws. A missing file gives `{ snapshots: [] }`, and
  so does a file with no `snapshots` key at all, `starsAtLastNotification` surviving untouched. A `snapshots`
  key that is present and is not an array throws instead of normalizing. Downstream domain code never
  null-checks it.
- Invalid JSON throws and does not fall back. Silently resetting corrupt history would destroy a user's
  tracking record, so keep it fatal
  ([ADR 0021](../../docs/adr/0021-an-unreadable-stored-history-fails-the-run.md), which covers the
  guards here and why the accepted cost is that a broken file blocks every later run until a human fixes
  it). The parse catch lives in the shared `readJsonFile`, so unparseable **bytes** are fatal for
  `stargazers.json` too; what `readStargazers` does not get is `StoredHistorySchema`.
- `readHistory` validates the whole file with `StoredHistorySchema` (`zod/mini`), and
  `describeUnreadableHistory` turns the first issue into one of four messages: not an object, an unreadable
  `version`, a `snapshots` key that is not an array, or, for anything deeper, the path and what was found
  there (`snapshots[3].repos[0].stars (expected number, found "7")`, built by `describeIssue` in
  `@shared/errors`). The schema checks types only and is loose: keys it does not name survive the read and
  are written back, and a `timestamp` need only be a string, because an unparseable one is
  [ADR 0017](../../docs/adr/0017-velocity-and-forecast-read-unparseable-timestamps-differently.md)'s to handle.
  `readHistory` returns `History`, so a required field added to `Snapshot` or `SnapshotRepo` without a matching
  schema key is a type error here.
- `readStargazers` repairs its container's contents rather than trusting them. A missing file gives `{}`,
  a parsed value that is not a plain object gives `{}`, and an entry whose value is not an array of strings
  is dropped while its siblings survive. Both checks are `z.validate` calls (`StargazerFileSchema`,
  `LoginListSchema`), because a repair needs a yes or no and never an issue. That is ADR 0021's container rule,
  which survives only for the file that ADR calls disposable. Unrepaired, a hand-edited `{"user/repo": 5}` would
  reach `diffStargazers`, hit `new Set(5)` and fail the whole Run.
- A `stars-data.json` that parses but is not an object throws as well (the schema's root), and so does a
  `snapshots` key holding a string, a number, `null` or an object (its `snapshots` key). Read as
  `{ snapshots: [] }`, either would make the Run treat a populated Data Branch as a first Run, append one
  Snapshot and **push** over the record while reporting success. Only an **absent** `snapshots` key yields
  `[]`.
- `stars-data.json` carries a `version` and this folder owns it end to end
  ([ADR 0015](../../docs/adr/0015-the-stored-history-declares-its-format-version.md)). `writeHistory` stamps
  `DATA_FORMAT_VERSION` as the first key; `readHistory` validates it through the schema's `version` key and
  **strips it**, so `History` in `@domain/types` never gains the field and the domain stays unaware a file
  format exists. Absent means version 1 and always will, because every existing data branch predates the
  field. A higher number, or a version that is not a number, throws rather than being read optimistically.
  **Bump `DATA_FORMAT_VERSION` in the same commit as any change to `History`, `Snapshot` or `SnapshotRepo`.**
  Nothing checks that for you, and the split between the shape (`@domain`) and the version (here) is
  deliberate. `stargazers.json` is deliberately unversioned: it is a flat map keyed by repo full name, so a
  reserved key would collide with the data.
- JSON formatting is part of the on-disk contract: 2-space indent, no trailing newline. Changing it
  rewrites the whole file and produces a full-file diff in every user's data branch.
- `writeChart` is the only function that creates a directory (`charts/`); every other writer assumes the
  worktree provides `dataDir`.
- `commitAndPush` is a no-op when nothing changed. It runs `add -A`, then `diff --cached --quiet`; a
  *successful* exit means no staged changes, so the commit path is the `catch` branch. Do not "fix" that
  inverted-looking try/catch.
- A rejected push is translated, every other push failure is not. The worktree is pinned to
  `origin/<dataBranch>` at Run start and never re-fetched, so two overlapping writing Runs both branch from
  the same commit and the second one's push is refused as non-fast-forward. `commitAndPush` matches
  `PUSH_REJECTED_PATTERN` against the error and replaces only that case with remediation text naming
  `concurrency` and `read-only`.
- **`core.setSecret` on the push credential must stay before the push.** The base64 credential is passed as
  `-c http.extraheader=…`, and `execute` embeds the whole argv in any thrown error, so the mask is what keeps
  a push failure from leaking the token. Any new call passing a secret in argv must do the same.
- `commitAndPush` has **no read-only awareness**; calling it on a read-only run would push. The guard lives in
  `data-branch.ts`, which is also what guarantees every `write*` has completed before it.
- Filenames are module-private but referenced by users' workflows and READMEs. Renaming [`stars-badge.svg`](../../docs/examples/stars-badge.svg),
  `stars-data.json`, `stars-data.csv`, `stargazers.json` or the report [`README.md`](../../README.md) is a breaking change to
  consumers outside this repo.

## notification/

- `smtp-host` is the only mandatory switch. An empty host returns `null` *before* reading any other input,
  and `null` is the caller's master on/off switch.
- `secure` is derived purely from the port (`port === 465`). There is no `smtp-secure` input.
- The port is validated. `resolvePort` runs `PortSchema`, which reads the input's leading integer
  (`Number.parseInt`, so `"465 "` and `"465abc"` are `465`) and requires it in `1..MAX_TCP_PORT`. An empty input
  is `587` without a warning; anything else, a non-numeric string included, warns and falls back to `587`. `NaN`
  never reaches nodemailer.
- Auth is all-or-nothing: `auth` is set only when username *and* password are both truthy, otherwise
  literally `undefined` (a test asserts the value, not an absent key).
- From-address resolution, in order: a `from` containing `@` is used verbatim; otherwise a `username`
  containing `@` becomes `` `${from} <${username}>` ``; otherwise the bare `from` as a display name.
- Distinct "no email" outcomes, and the log level is the difference: not configured (no line: the caller
  calls `sendEmail` only with a non-null `EmailConfig`, so the `info` in its `null` branch runs only under
  `email.test.ts`), configured but nothing to say (`info`, in the caller), configured but empty `email-to`
  (`warning`, here, because it is almost certainly a misconfiguration). Rejected recipients warn but still
  count as delivered. nodemailer reports a rejected recipient as a string or an `{ name, address }` object, and
  `RecipientListSchema` turns both into the address, so the warning never prints `[object Object]`.
- `getEmailConfig` is the one infrastructure function that reads `@actions/core` inputs directly
  rather than receiving a parsed `Config`. Only `locale` is passed in, to resolve the default sender name, so
  changing `locale` changes the visible sender.
- `smtp-password` is passed to `core.setSecret` as soon as it is read, so it is masked in the Action log
  even when a workflow hardcodes it instead of supplying it through `secrets.*`. [`email.test.ts`](./notification/email.test.ts) pins that.
- A non-null `EmailConfig` does **not** mean email will be sent; `to` is only checked at send time.

## Gotchas

- [`worktree.test.ts`](./git/worktree.test.ts) and the `commitAndPush` tests script git through a mocked `execute`
  and assert on argv through a local `ranGit(...)` helper.
- [`storage.test.ts`](./persistence/storage.test.ts) and `worktree.test.ts` mock `@actions/core` with a
  factory exposing only `info`, `debug` and `setSecret`. Adding a `core.warning(...)` to `storage.ts` or
  `worktree.ts` fails the suite with "not a function", not a useful assertion.
- `filters.test.ts` is the spec for `client.ts` too, so a change to `client.ts` can fail there.
- Stale charts are pruned, but not by the writer. `writeChart` only writes; `pruneCharts({ dataDir, keep })`
  deletes the `charts/*.svg` files the current run did not produce, and `publish` calls it immediately after
  the write loop, which is what stops a repo dropping out of `top-repos` from stranding its chart forever.
- The action **requires an `actions/checkout` step**; the repo guard converts any failure of
  `git rev-parse --is-inside-work-tree`, git's opaque "not a git repository" among them, into that
  instruction. Do not swallow it.
- `.<dataBranch>` is a hidden directory inside the primary checkout for the duration of the run. Linters,
  upload-artifact globs and other actions will see it until `cleanup`.
