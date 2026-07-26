# src/infrastructure/persistence — on-disk layout of the data branch, plus commit & push

This folder is the only place that knows the *filenames* stored on the data branch and the only place that
reads or writes them. Every function that touches the data branch takes the `dataDir` returned by
`initializeDataBranch` (`@infrastructure/git/worktree`) — it never derives or guesses that path. It does not
render content (all markdown/HTML/SVG/CSV strings arrive pre-rendered from `@presentation/*`), does not decide
*whether* to commit (the read-only guard lives in `@application/tracker`), and does not create or delete the
worktree.

## Files
| File | Responsibility |
| --- | --- |
| `storage.ts` | Read/write the data-branch files (JSON, markdown, SVG, CSV), write the HTML report to the runner temp dir, and stage/commit/push the data branch. |

## On-disk layout
`DATA_FILES` (module-private const at `storage.ts:8-16`) is the single source of truth for names:

```
<dataDir>/                      # e.g. .star-tracker-data
  README.md                     # markdown report — the data branch landing page
  stars-data.json               # History
  stars-data.csv                # CSV report
  stars-badge.svg               # shields-style badge
  stargazers.json               # StargazerMap, only written when track-stargazers is on
  charts/                       # created on demand
    star-history.svg
    comparison.svg
    forecast.svg
    <owner>-<repo>.svg          # one per top repo; filenames come from @presentation/charts
```

`star-tracker-report.html` is **not** part of this layout: it is written outside the worktree (see
`writeHtmlReport`) and never committed.

### File shapes
- `stars-data.json` — `History` from `@domain/types`:
  `{ snapshots: Snapshot[]; starsAtLastNotification?: number }`, where
  `Snapshot = { timestamp: string; totalStars: number; repos: { fullName, name, owner, stars }[] }`.
  `timestamp` is an ISO-8601 UTC string.
- `stargazers.json` — `StargazerMap` from `@domain/stargazers`: `Record<string, string[]>`, keyed by
  `owner/repo`, values are login arrays.
- Both are serialized with `JSON.stringify(data, null, 2)` and **no trailing newline**.
- `stars-data.csv` — header `repository,owner,name,stars,previous,delta,status`, produced by
  `@presentation/csv`; this folder writes the string as-is.

## Public API
All exports are consumed by `@application/tracker`. `readJsonFile` and `writeJsonFile` are module-private.

```ts
export function readHistory(dataDir: string): History
export function writeHistory({ dataDir, history }: WriteHistoryParams): void            // { dataDir: string; history: History }
export function pruneCharts({ dataDir, keep }: { dataDir: string; keep: string[] }): string[]
export function readStargazers(dataDir: string): StargazerMap
export function writeStargazers({ dataDir, stargazerMap }: WriteStargazersParams): void // { dataDir: string; stargazerMap: StargazerMap }
export function writeReport({ dataDir, markdown }: WriteReportParams): void             // -> <dataDir>/README.md
export function writeBadge({ dataDir, svg }: WriteBadgeParams): void                    // -> <dataDir>/stars-badge.svg
export function writeCsv({ dataDir, csv }: WriteCsvParams): void                        // -> <dataDir>/stars-data.csv
export function writeChart({ dataDir, filename, svg }: WriteChartParams): void          // -> <dataDir>/charts/<filename>
export function writeHtmlReport({ htmlReport }: WriteHtmlReportParams): string          // -> $RUNNER_TEMP/star-tracker-report.html, returns the path
export function commitAndPush({ dataDir, dataBranch, message, token }: CommitAndPushParams): boolean
```

- `readHistory` / `readStargazers` — call before computing anything; both tolerate a first run.
- `write*` — call after the report strings exist; all of them overwrite unconditionally.
- `writeHtmlReport` — returns the absolute path published as the `report-html-path` action output; use it
  instead of the `report-html` output when the report is too large for an env var.
- `commitAndPush` — call last, and only on a writable run.

## Invariants & rules
- **`readHistory` always returns a usable `History`.** Missing file → `{ snapshots: [] }`. Present file →
  `{ ...raw, snapshots: Array.isArray(raw.snapshots) ? raw.snapshots : [] }`, so a stored `"snapshots":
  "garbage"` or a missing key both normalize to `[]` while `starsAtLastNotification` survives untouched.
  Downstream `@domain/*` code relies on `snapshots` being an array and never null-checks it.
- **`readStargazers` does no normalization.** Missing file → `{}`; anything else is returned as parsed and
  cast to `StargazerMap`.
- **Invalid JSON throws, it does not fall back.** The message is
  `` `${path.basename(filePath)} on the data branch is not valid JSON (...). Fix or delete the file on that branch and re-run.` ``
  Silently resetting corrupt history would destroy a user's tracking record — keep it fatal.
- **`writeChart` is the only function that creates a directory** (`charts/`, `mkdirSync({ recursive: true })`,
  guarded by `existsSync`). Every other writer assumes `dataDir` already exists because the worktree provides it.
- **`writeHtmlReport` takes no `dataDir` at all**: its only parameter is `htmlReport`, and the directory comes
  from `process.env.RUNNER_TEMP || process.cwd()`. The HTML report
  is deliberately kept off the data branch, so nothing about it ever appears in a commit.
- **JSON formatting is part of the on-disk contract.** 2-space indent, no trailing newline. Changing the
  indent or adding a newline rewrites the whole file and produces a full-file diff in every user's data branch.
- **`commitAndPush` is a no-op when nothing changed.** It runs `add -A`, then `diff --cached --quiet`; a
  *successful* (exit 0) diff means no staged changes, so it logs `No data changes to commit` and returns
  `false` **without committing or pushing**. The commit path is the `catch` branch — the non-zero exit from
  `diff --cached --quiet` is the signal that changes exist. Do not "fix" that inverted-looking try/catch.
- `commitAndPush` runs every git command with `options: { cwd: path.resolve(dataDir) }`. A missing `cwd` would
  operate on the primary checkout.
- **`core.setSecret(basicCredential)` must stay before the push.** The base64 `x-access-token:<token>`
  credential is passed as `git -c "http.extraheader=AUTHORIZATION: basic <cred>" push ...`, and `execute`
  embeds the whole argv in any thrown error; the mask is what keeps a push failure from leaking the token.
- The push refspec is `HEAD:<dataBranch>`, not a branch name, because the worktree is detached when the branch
  already existed on the remote (see [`../git/CLAUDE.md`](../git/CLAUDE.md)).
- `-c` must precede the `push` subcommand in the argv; it is a per-invocation config override and leaves no
  credential behind in `.git/config`.
- `commitAndPush` has **no read-only awareness**. Calling it on a read-only run would push. The guard lives in
  `@application/tracker` (`if (config.readOnly) { ... } else { commitAndPush(...) }`).
- Ordering: all `write*` calls must complete before `commitAndPush`, since `add -A` is what stages them.
- Paths are built with `path.join`, so separators are platform-native; the tests assert with `path.join` too.

## Dependencies
- Allowed: `node:fs`, `node:path`, `@actions/core`, type-only `@domain/types` / `@domain/stargazers`, and
  `../git/commands` — a *relative* import because `@infrastructure/git` is the same layer.
- Must never import `@presentation/*` or `@application/*`: this folder writes strings it is handed and must not
  learn how they are produced. It also must not import `@config/*` — `dataDir` and `dataBranch` are parameters.

## Gotchas
- **Stale charts are never deleted.** Nothing removes `charts/*.svg`, so a repo that drops out of `top-repos`
  leaves its `<owner>-<repo>.svg` on the branch forever. `add -A` will stage a deletion, but only if something
  deletes the file first — nothing does.
- `writeHtmlReport` falls back to `process.cwd()` when `RUNNER_TEMP` is unset (local runs, non-GitHub hosts),
  which writes `star-tracker-report.html` into the repository checkout root.
- `commitAndPush` returns `boolean`, but `@application/tracker` currently ignores the return value. Do not
  assume the caller reacts to `false`.
- `DATA_FILES` is not exported. Filenames are referenced by the README and by users' workflows
  (`stars-badge.svg`, `README.md`); renaming any of them is a breaking change to consumers outside this repo.
- `storage.test.ts` mocks `@actions/core` with an explicit factory exposing only `info`, `debug` and
  `setSecret`. Adding a `core.warning(...)` call to `storage.ts` makes the suite fail with "not a function",
  not with a meaningful assertion.
- Like `worktree.test.ts`, the `commitAndPush` tests drive `execFileSync` with positional
  `mockReturnValueOnce` chains; inserting a git call shifts every later mock.

## Testing
`storage.test.ts` covers every export except `writeCsv`, which it neither imports nor exercises. It pins: the
exact relative paths of every file it does cover
(`stars-data.json`, `stargazers.json`, `README.md`, `stars-badge.svg`, `charts/star-history.svg`,
`star-tracker-report.html`); the four `readHistory` normalization cases plus the invalid-JSON error;
`RUNNER_TEMP` vs `process.cwd()` for the HTML report; `mkdirSync` being skipped when `charts/` exists; the
2-space JSON serialization; the full commit+push argv including the masked credential; commit messages
containing quotes surviving verbatim; and the `false` / no-commit path when `diff --cached --quiet` succeeds.

Run just this folder: `pnpm vitest run src/infrastructure/persistence`
