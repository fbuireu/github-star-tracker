# src/application

The single use case: `trackStars()` in `src/application/tracker.ts`, the only export and the only thing
`src/index.ts` imports. It wires config, GitHub I/O, domain computation, rendering and persistence into one
ordered run and owns sequencing, the worktree lifecycle, the output contract and top-level error handling.
No business logic (`@domain/*`), no rendering (`@presentation/*`), no direct fs or git calls
(`@infrastructure/*`). Its only first-hand SDK use is `core.getInput` for `github-token` / `github-api-url`
and the `github.getOctokit` call that builds the client.

**The run, step by step, is the end-to-end table in [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md)** — it
is not repeated here. What follows is what that table cannot express.

## Invariants & rules

- **`trackStars` never rejects.** Every failure becomes `core.setFailed`, prefixed literally
  `Star Tracker failed: ` (asserted verbatim in `tracker.test.ts`), plus `core.debug(stack)` when there is one.
- **`withDataDir` must keep `cleanup(dataDir)` in a `finally`.** The worktree is removed even when the body
  throws; the throw then reaches the outer catch.
- **The empty-repos branch returns before `withDataDir`**, so `initializeDataBranch` and `cleanup` are never
  invoked and no email is attempted.
- **Email failures are non-fatal by design**: they warn, never `setFailed`. Everything else inside the body
  (git, fs, octokit) is fatal. `sendEmail`'s `boolean` return is also honoured, so an empty `email-to`
  (which returns `false` without throwing) counts as *not* delivered.
- **`starsAtLastNotification` advances only on delivery.** A configured-and-failed send leaves the baseline
  alone so the accumulated change is not lost, while an unconfigured transport advances it because the
  `should-notify` output *is* the notification
  ([ADR 0011](../../docs/adr/0011-the-notification-baseline-advances-only-on-delivery.md)).
- **Two variables track the send, and conflating them is a bug that already happened.**
  `notificationDelivered` is `notify && sent` and gates the baseline only: a courtesy send under
  `send-on-no-changes` must not consume the accumulated threshold, so it stays `false` there on purpose.
  `mailDelivered` is plain `sent` and feeds the `notification-sent` output, which is a factual claim about
  delivery. Feeding the output from `notificationDelivered` made it report `false` after a successful
  courtesy email; `tracker.test.ts` now pins both outputs for that case.
- **`shouldNotify` reads the pre-append `storedHistory.starsAtLastNotification`.** That is what makes the
  threshold accumulate across runs. `addSnapshot` returns a fresh object, so the later assignment mutates
  that copy, never `storedHistory`.
- **The reports receive two histories and they are not interchangeable.** `history` is the *resolved* chart
  history (stargazer-reconstructed when it has >= 2 snapshots, stored otherwise) and drives charts and the
  forecast. `velocityHistory` is always the stored per-run series, so velocity measures real elapsed time
  between runs instead of a chart bucket whose width follows `chart-max-points`. What gets persisted is
  always the stored history.
- **The two reports share one `reportParams` object except for `theme`.** `generateMarkdownReport` gets
  `config.chartTheme`, `generateHtmlReport` gets `config.emailTheme` spread over it. Passing `reportParams`
  unchanged to both is the regression to watch for: it silently gives the email the SVG palette again, which
  is what left dark-mode readers with a white chart background.
- **One `chartNow` `Date` is created and reused** for `buildStarHistory` and `buildChartFiles`, so the global
  chart and every per-repo chart end on the same instant.
- `topRepoNames` sorts a **copy** of `results.repos`; that array must not be reordered in place. Removed
  repos are excluded, and therefore have no per-repo chart.
- **Read-only runs do everything except `commitAndPush`** — they still read, compute, render, write into the
  worktree, set every output and send the email. `cleanup` then discards the unpushed worktree. The guard
  lives here, not in the persistence layer.
- `github-api-url` takes precedence over the `GITHUB_API_URL` env var; when both are empty `getOctokit` is
  called with `undefined` options, not `{ baseUrl: '' }`.

## Outputs

Eleven keys, matching the `outputs:` block of `action.yml` exactly. The four report values pass through
as-is; the rest are wrapped in `String()`.

| Key | Value |
| --- | --- |
| `report` / `report-html` / `report-csv` | the rendered markdown / HTML / CSV report |
| `report-html-path` | return value of `writeHtmlReport` — a filesystem path |
| `total-stars` / `stars-changed` / `new-stars` / `lost-stars` | the matching `Summary` fields |
| `should-notify` | `summary.changed && thresholdReached` — the *decision* |
| `notification-sent` | `mailDelivered` — an email actually left the runner |
| `new-stargazers` | `stargazerDiff?.totalNew ?? 0` |

`setEmptyOutputs()` emits the same eleven keys zeroed, with a "No repositories matched the configured
filters" message as the markdown and HTML bodies and `''` as the CSV.

`new-stargazers` is `0` whenever `track-stargazers` is off, even though stargazers may still have been
fetched for chart reconstruction: the diff and the write are gated on `trackStargazers` alone, while the
fetch is gated on `includeCharts || trackStargazers`.

## Gotchas

- **`setOutputs` performs a filesystem write.** `writeHtmlReport` targets `RUNNER_TEMP || cwd`, i.e. *outside*
  the worktree, so it happens on read-only runs and on the empty-repos path too, and the file survives
  `cleanup`. Do not assume "setting outputs" is side-effect free.
- `generateCsvReport(results)` is called positionally — it is a single-argument function that destructures
  the results object itself, so it does not violate the named-params convention.
- `getEmailConfig` reads the SMTP inputs itself, inside `@infrastructure/notification/email`; the tracker
  never reads them. A missing `smtp-host` returns `null` and silently skips email.
- `initializeDataBranch` throws when the data branch is absent from the remote **and** the run is read-only.
  That surfaces as a `setFailed` before the body ever runs.
- The `else if (emailConfig)` branch logs `'Notification threshold not reached, skipping email'`, but it also
  fires when `summary.changed` is false, since `notify` needs both. So the message names the threshold even
  when nothing changed at all. It is pinned verbatim by `tracker.test.ts`, so fix the wording and the test
  together or not at all.
- `tracker.test.ts` mocks most of the tree but deliberately **not** `@presentation/charts` or
  `@domain/star-history`, so `buildChartFiles` and `buildStarHistory` execute for real.
