# src/application — run orchestrator

The single use case of the action: wire config, GitHub I/O, domain computation, rendering and persistence
into one ordered run. It owns sequencing, the data-worktree lifecycle, the read-only branch, the
`core.setOutput` contract and top-level error handling. It contains **no** business logic (comparison,
forecasting, notification thresholds live in `@domain/*`), **no** rendering (`@presentation/*`) and **no**
direct fs or git calls (`@infrastructure/*` owns those). Its only first-hand SDK use is `core.getInput`
for `github-token` and `github-api-url` and the `github.getOctokit` call that builds the client
(`tracker.ts:54-56`).

## Files
| File | Responsibility |
| --- | --- |
| `tracker.ts` | `trackStars()` end-to-end orchestration, worktree lifecycle, action outputs, error trapping |

## Public API

### `tracker.ts`
- `export async function trackStars(): Promise<void>` — the entire action run. Called exactly once, from
  `src/index.ts` (`import { trackStars } from '@application/tracker'`). It is the only export of this
  folder and the only cross-layer consumer of the application layer. **Never rejects**: every failure is
  converted to `core.setFailed`.

Module-private (not exported, used only inside `tracker.ts`):
- `withDataDir({ branch, readOnly, fn }: WithDataDirParams): Promise<void>`
- `setOutputs({ summary, markdownReport, htmlReport, csvReport, shouldNotify, newStargazers }: SetOutputsParams): void`
- `setEmptyOutputs(): void`

## Key types
Both interfaces are local to `tracker.ts` and are not exported.

| Type | Fields |
| --- | --- |
| `WithDataDirParams` | `branch: string`, `readOnly: boolean`, `fn: (dataDir: string) => Promise<void>` |
| `SetOutputsParams` | `summary: Summary`, `markdownReport: string`, `htmlReport: string`, `csvReport: string`, `shouldNotify: boolean`, `newStargazers: number` |

## Run sequence

1. `loadConfig()` → `Config` (`@config/loader`). Throws propagate to the outer catch.
2. `core.getInput('github-token', { required: true })`. The same token is later handed to `commitAndPush`
   for the push credential.
3. `apiUrl = core.getInput('github-api-url') || process.env.GITHUB_API_URL || ''`, then
   `github.getOctokit(token, apiUrl ? { baseUrl: apiUrl } : undefined, retry)` — the
   `@octokit/plugin-retry` plugin is always applied.
4. `getTranslations(config.locale)` — used only for the email subject.
5. `getRepos({ octokit, config })`.
6. **Empty-repos early return**: if `repos.length === 0` → `core.warning('No repositories matched the
   configured filters')`, `setEmptyOutputs()`, `return`. `initializeDataBranch` is never called, so no
   worktree, no commit and no email on this path.
7. `withDataDir({ branch: config.dataBranch, readOnly: config.readOnly, fn })`. Everything below runs
   inside `fn(dataDir)`.
8. `readHistory(dataDir)` → `storedHistory`.
9. `getBaselineSnapshot({ history: storedHistory, compareAgainst: config.compareAgainst })`;
   `previousTimestamp = baselineSnapshot?.timestamp ?? null` (logged as `'first run'` when null).
10. `compareStars({ currentRepos: repos, previousSnapshot: baselineSnapshot })` → `results`, `summary`.
11. Stargazers: `fetchAllStargazers({ octokit, repos, config })` only when
    `config.includeCharts || config.trackStargazers`; otherwise `repoStargazers = []`.
12. Stargazer diff: only when `config.trackStargazers` — `readStargazers(dataDir)` →
    `diffStargazers({ current, previousMap })` → `writeStargazers({ dataDir, stargazerMap: buildStargazerMap({ repoStargazers, previousMap }) })` — the
    previous map is passed in so a sampled or failed repo keeps its known logins instead of being wiped.
    Otherwise `stargazerDiff` stays `null`.
13. `createSnapshot({ currentRepos: repos, summary })`; pruning warning when
    `storedHistory.snapshots.length + 1 - config.maxHistory > 0`; `addSnapshot({ history, snapshot, maxHistory })`
    → `updatedHistory`.
14. `topRepoNames` = `results.repos` copied, `isRemoved` filtered out, sorted by `current` descending,
    `slice(0, config.topRepos)`, mapped to `fullName`.
15. `chartNow = new Date()` and `repoTotals` (from the freshly fetched `repos`, not from `results`).
16. `starHistory` = `buildStarHistory({ repoStargazers, repos: repoTotals, maxPoints: config.chartMaxPoints, now: chartNow })`
    when `includeCharts`, else `{ snapshots: [] }`; then
    `history = resolveChartHistory({ candidate: starHistory, fallback: updatedHistory })`.
17. `computeForecast({ history, topRepoNames })` → `ForecastData | null`.
18. `generateMarkdownReport(reportParams)` and `generateHtmlReport(reportParams)` from one shared
    `reportParams` object; `generateCsvReport(results)`; `generateBadge({ totalStars, locale })`.
19. `shouldNotify({ totalStars, starsAtLastNotification: storedHistory.starsAtLastNotification, threshold: config.notificationThreshold, mode: config.notificationMode })`;
    `notify = summary.changed && thresholdReached`.
20. Email, **before persistence**: `getEmailConfig(config.locale)`; sends when
    `emailConfig && (notify || config.sendOnNoChanges)`, subject built with
    `interpolate({ template: t.email.subjectLine, params: { subject, totalStars, delta } })`.
    `sendEmail` is wrapped in its own try/catch that downgrades failures to `core.warning` and clears
    `notificationDelivered`; its `boolean` return is also honoured, so an empty `email-to` (which returns
    `false` without throwing) counts as *not* delivered. Then `updatedHistory.starsAtLastNotification = summary.totalStars`, but only
    when `notificationDelivered` — a configured-and-failed send leaves the baseline alone so the
    accumulated change is not lost, while an unconfigured transport advances it because the
    `should-notify` output is the notification. See ADR 0011.
21. Persist into the worktree: `writeHistory`, `writeReport`, `writeBadge`, `writeCsv`, then
    `buildChartFiles({ config, history, fallbackHistory: updatedHistory, forecastData, topRepoNames, repoTotals, repoStargazers, now: chartNow })`
    and one `writeChart({ dataDir, filename, svg })` per returned file.
22. Commit: skipped with an info log on `config.readOnly`; otherwise `commitAndPush` is called with
    `{ dataDir, dataBranch, token }` and the message `Update star data: <totalStars> total (<deltaIndicator(totalDelta)>)`.
23. `setOutputs(...)`.
24. `finally` in `withDataDir`: `cleanup(dataDir)`.
25. Outer `catch`: `core.setFailed` with the message `Star Tracker failed: <err.message>`, plus
    `core.debug(err.stack)` when a stack exists.

## Outputs
Ten keys, matching the `outputs:` block of the repo-root `action.yml` exactly (no extra, none missing).
The four report values are passed through as-is; the six numeric/boolean ones are wrapped in `String()`.

| Key | Value |
| --- | --- |
| `report` | markdown report |
| `report-html` | HTML report |
| `report-html-path` | return value of `writeHtmlReport({ htmlReport })` (a filesystem path) |
| `report-csv` | CSV report |
| `total-stars` | `summary.totalStars` |
| `stars-changed` | `summary.changed` |
| `new-stars` | `summary.newStars` |
| `lost-stars` | `summary.lostStars` |
| `should-notify` | `notify` (`summary.changed && thresholdReached`) |
| `new-stargazers` | `stargazerDiff?.totalNew ?? 0` |

`setEmptyOutputs()` emits the same ten keys with a zeroed `Summary`,
`'No repositories matched the configured filters.'` as markdown,
`'<p>No repositories matched the configured filters.</p>'` as HTML, `''` as CSV, and `false`/`0`.

## Invariants & rules
- `withDataDir` **must** keep `cleanup(dataDir)` in a `finally`. The worktree is removed even when `fn`
  throws; the throw then reaches the outer catch and becomes `setFailed`.
- The empty-repos branch returns **before** `withDataDir`, so `initializeDataBranch` and `cleanup` are
  never invoked and no email is attempted.
- `trackStars` never rethrows and never rejects; the run's failure signal is `core.setFailed` only.
- The `setFailed` prefix is literally `Star Tracker failed: `, asserted verbatim in `tracker.test.ts`.
- Email failures are non-fatal by design: they warn, never `setFailed`. Everything else inside `fn`
  (git, fs, octokit) is fatal.
- `shouldNotify` reads `storedHistory.starsAtLastNotification`, i.e. the value *before* this run's
  snapshot is appended. This is what makes the threshold accumulate across runs.
- `starsAtLastNotification` is only written when `notify` is true. `addSnapshot` returns a fresh object
  (`{ ...history, snapshots }`), so the assignment mutates that copy, never `storedHistory`.
- `notify` requires **both** `summary.changed` and the threshold; a threshold of `0` alone does not
  notify on an unchanged run.
- `new-stargazers` is `0` whenever `trackStargazers` is false, even though stargazers may still have been
  fetched for chart reconstruction. `writeStargazers` and `diffStargazers` are gated on `trackStargazers`
  alone; `fetchAllStargazers` is gated on `includeCharts || trackStargazers`.
- `topRepoNames` sorts a **copy** (`[...results.repos]`); `results.repos` must not be reordered in place.
  Removed repos (`isRemoved`) are excluded from `topRepoNames` and therefore from per-repo charts.
- One `chartNow` `Date` is created and reused for `buildStarHistory` and `buildChartFiles`, so the global
  chart and every per-repo chart end on the same instant.
- The reports receive **two** histories and they are not interchangeable. `history` is the **resolved**
  chart history (stargazer-reconstructed when it has >= 2 snapshots, `updatedHistory` otherwise) and drives
  charts and the forecast. `velocityHistory` is always `updatedHistory`, the stored per-run series, so
  velocity measures real elapsed time between runs instead of a chart bucket whose width follows
  `chart-max-points`. Neither is necessarily what is persisted to `stars-data.json`, which is always
  `updatedHistory`.
- `buildChartFiles` receives `fallbackHistory: updatedHistory` so a repo whose stargazers were unreachable
  falls back to stored snapshots rather than rendering an empty chart.
- Read-only runs still read, compute, render, write files **into the worktree**, set every output and send
  the email; only `commitAndPush` is skipped. The unpushed worktree is then discarded by `cleanup`.
- `github-api-url` input takes precedence over the `GITHUB_API_URL` env var; when both are empty,
  `getOctokit` is called with `undefined` options (not `{ baseUrl: '' }`).
- The pruning warning is computed against `storedHistory.snapshots.length + 1` because the current run's
  snapshot is about to be appended.

## Dependencies
Allowed: `@actions/core`, `@actions/github`, `@octokit/plugin-retry`, and every inner layer —
`@config/loader`, `@domain/{comparison,forecast,formatting,notification,snapshot,star-history,stargazers,types}`,
`@i18n`, `@infrastructure/{git/worktree,github/filters,github/stargazers,notification/email,persistence/storage}`,
`@presentation/{badge,charts,csv,html,markdown}`.

Must never be imported by `@domain/*`, `@presentation/*`, `@infrastructure/*` or `@config/*` — the
dependency arrow only points inward (`index -> application -> everything else`). Only `src/index.ts`
imports from here.

## Gotchas
- `setOutputs` performs a **filesystem write**: `core.setOutput('report-html-path', writeHtmlReport({ htmlReport }))`
  (`tracker.ts:290`). `writeHtmlReport` targets `process.env.RUNNER_TEMP || process.cwd()`, i.e. *outside*
  `dataDir`, so it happens on read-only runs and on the empty-repos path too, and the file survives
  `cleanup`. Do not assume "setting outputs" is side-effect free.
- `generateCsvReport(results)` is called positionally — it is a single-argument function
  (`generateCsvReport({ repos }: ComparisonResults)` destructures the results object itself), so it is not
  a violation of the named-params convention.
- `getEmailConfig` reads SMTP inputs via `core.getInput` inside `@infrastructure/notification/email`; the
  tracker never reads those inputs itself. A missing `smtp-host` returns `null` and silently skips email.
- `initializeDataBranch` throws when the data branch does not exist on the remote **and** `readOnly` is
  true. That error surfaces as a `setFailed`, before `fn` ever runs.
- `deltaIndicator(summary.totalDelta)` is called three separate times (info log, commit message, email
  subject); it must stay pure and cheap.
- The `else if (emailConfig)` branch logs `'No star changes detected, skipping email'` even when the real
  reason was an unmet notification threshold — the message is imprecise but pinned by a test.

## Testing
`src/application/tracker.test.ts` is the only test file. Run it with `pnpm vitest run src/application`.

It mocks `@actions/core`, `@actions/github`, `@config/loader`, `@domain/{comparison,stargazers,formatting,notification,snapshot}`,
`@infrastructure/*` and `@presentation/{badge,csv,html,markdown,svg-chart}`, and partially mocks
`@domain/forecast` (`importOriginal` + `computeForecast`). Notably `@presentation/charts` and
`@domain/star-history` are **not** mocked, so `buildChartFiles` and `buildStarHistory` execute for real —
which is why the chart tests can assert on the params reaching `generatePerRepoSvgChart`.

What it pins down: the happy path call set (each step asserted as called, not its order); the empty-repos
early return (`initializeDataBranch` not called); nine of the ten outputs on the normal path (`report-csv`
is not asserted) and four of them on the empty path; `cleanup` running when `readHistory` throws;
the `setFailed` message and `core.debug(stack)`; email send/skip across `changed`, `sendOnNoChanges`,
threshold and null-config combinations, plus the warning on `sendEmail` rejection; GHES `baseUrl`
resolution (input vs `GITHUB_API_URL` vs neither); `maxHistory`, `notificationThreshold`,
`notificationMode` and `compareAgainst` propagation; `starsAtLastNotification` set/not-set; per-repo chart
timelines and the stored-snapshot fallback for unreachable stargazers (issue #148); and that a read-only
run skips `commitAndPush` while still rendering, setting outputs and emailing.

Fixtures come from `@shared/testing` (`makeConfig`, `makeRepoInfo`, `makeStargazerSeries`).
