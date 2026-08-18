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
- **The worktree lifecycle is not this layer's job any more.** `withDataBranch` owns it: it opens the
  worktree, hands the body a `DataBranch` and removes the worktree in a `finally`, so a throw inside the body
  still reaches the outer catch with the worktree gone. `dataDir` is never visible here.
- **The empty-repos branch returns before `withDataBranch`**, so no worktree is created and no email is
  attempted.
- **All measurement is one call.** `measureRun` produces the baseline timestamp, the comparison results, the
  Summary, the appended History, the dropped-snapshot count and `thresholdReached`
  ([ADR 0013](../../docs/adr/0013-a-run-is-measured-in-one-place.md)). Do not reach past it into
  `compareStars`, `addSnapshot` or `shouldNotify` — the ordering rules they carry live behind that interface
  on purpose.
- **Email failures are non-fatal by design**: they warn, never `setFailed`. Everything else inside the body
  (git, fs, octokit) is fatal. `sendEmail`'s `boolean` return is also honoured, so an empty `email-to`
  (which returns `false` without throwing) counts as *not* delivered.
- **`starsAtLastNotification` advances only on delivery.** A configured-and-failed send leaves the baseline
  alone so the accumulated change is not lost, while an unconfigured transport advances it because the
  `should-notify` output *is* the notification
  ([ADR 0011](../../docs/adr/0011-the-notification-baseline-advances-only-on-delivery.md)).
- **The due-notification predicate has one owner.** `notificationIsDue({ changed, thresholdReached })` in
  `@domain/notification` gates the send here and is what `settleNotification` computes internally, so the
  rule cannot be changed in one place and left stale in the other.
- **This layer reports what the transport did; it does not decide what that means.** It sets one
  `Delivery` — `NOT_ATTEMPTED`, `SENT` or `FAILED` — and hands it to `settleNotification` in
  `@domain/notification`, which returns `shouldNotify`, `notificationSent` and `historyToPersist` together.
  The three booleans that used to be mutated across the `try/catch` are gone, and so is the bug they caused:
  conflating "an email left the runner" with "the accumulated threshold was consumed" once made a successful
  courtesy send report `notification-sent: false`. Both outputs come off the one outcome now.
- **A `sendEmail` that resolves `false` is a `FAILED` delivery, not an unattempted one.** That is the empty
  `email-to` case: the transport was configured and did not deliver, so the baseline must not advance.
- **Rendering is one call.** `renderRun` in `@presentation/run` returns the markdown, HTML, CSV, badge and
  chart files together, so this layer never calls a renderer directly and never assembles report params.
  It passes `chartHistories` and the **stored** History under separate names, and `renderRun` derives the
  chart history from the first — which is what retired the old hazard of handing the reports two
  interchangeable-looking `History` values, where swapping them made Velocity an average over a chart bucket.
  What gets persisted is always the stored History.
- **This layer relays no chart options.** The renderers read `config` themselves
  ([ADR 0016](../../docs/adr/0016-the-report-renderers-read-config-themselves.md)), so a new one costs
  nothing here.
- **Chart histories are resolved once, by one module.** `resolveChartHistories` returns `.aggregate` and
  `.forRepo(name)`; this layer reads `.aggregate` for the Forecast and the Reports and hands the whole thing
  to `buildChartFiles`. It creates the instant itself, so the global chart and every per-repo chart end on
  the same moment by construction rather than by the shell remembering to share a `Date`.
- **`topRepoNames` is not computed here.** It is `topRepositories({ repos: results.repos, limit:
  config.topRepos })` from `@domain/comparison`, the same call `@presentation/report-model` makes for the
  Report. It ranks a **copy**, so `results.repos` is never reordered in place, and Removed Repositories are
  excluded — they therefore have no per-repo chart.
- **Read-only runs do everything except the push** — they still read, compute, render, write into the
  worktree, set every output and send the email, and the worktree is then discarded unpushed. The guard now
  lives inside `withDataBranch`, which receives `readOnly` and decides; this layer passes the flag and never
  branches on it.
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
| `should-notify` | `notification.shouldNotify` — the *decision* |
| `notification-sent` | `notification.notificationSent` — an email actually left the runner |
| `new-stargazers` | `stargazerDiff?.totalNew ?? 0` |

**There is one `setOutputs`, not two.** The empty-repos path calls it with `renderEmptyRun(config)` and a
zeroed `Summary`, so the eleven keys cannot drift between the two paths. That render also emits a real CSV
header rather than `''` — a consumer parsing `report-csv` used to get a header on one path and an empty
string on the other — and its message comes from `report.noRepositories` in the locale bundle like every
other user-facing string.

`new-stargazers` is `0` whenever `track-stargazers` is off, even though stargazers may still have been
fetched for chart reconstruction: the diff and the write are gated on `trackStargazers` alone, while the
fetch is gated on `includeCharts || trackStargazers`.

## Gotchas

- **`setOutputs` sets outputs and nothing else; the caller writes the HTML report.** `writeHtmlReport`
  targets `RUNNER_TEMP || cwd`, i.e. *outside* the worktree, so it happens on read-only runs and on the
  empty-repos path too, and the file survives `cleanup`. It used to run *inside* `setOutputs`, which put a
  filesystem write after `branch.publish` — a failing write then ended a run that had already committed,
  pushed and emailed, with `setFailed` and most outputs unset, and a re-run would append a second Snapshot
  for the same observation. It now runs **before** `publish`, and `tracker.test.ts` pins that order.
- `getEmailConfig` reads the SMTP inputs itself, inside `@infrastructure/notification/email`; the tracker
  never reads them. A missing `smtp-host` returns `null` and silently skips email.
- `withDataBranch` throws when the data branch is absent from the remote **and** the run is read-only. That
  surfaces as a `setFailed` before the body ever runs.
- **`branch.publish` is called once, at the end, with everything.** The Stargazer map is handed to it rather
  than written when it is computed, because `add -A` is what stages the writes and it runs inside `publish`.
  Splitting the call would put a write after the commit.
- The `else if (emailConfig)` branch names the actual reason: `notify` needs both `summary.changed` and
  `thresholdReached`, so it logs `'No stars changed since the baseline, skipping email'` when nothing moved
  and `'Notification threshold not reached, skipping email'` otherwise. Both strings are pinned verbatim by
  `tracker.test.ts` — change the wording and the test together or not at all.
- `tracker.test.ts` mocks most of the tree but deliberately **not** `@presentation/run`,
  `@presentation/charts` or `@domain/star-history`, so `renderRun`, `buildChartFiles` and `buildStarHistory`
  execute for real and the four renderer mocks still apply underneath. Mocking `@presentation/run` instead
  would cut four mocks and also stop `buildChartFiles` running, which is what the chart-request assertions
  pinning #148 and the per-repo timelines depend on — so the mock count stays at 17 on purpose.
- `tracker.test.ts` mocks `@presentation/svg-chart` down to its single `renderSvgChart`, so "which chart was
  drawn" is read off the `request.kind` of each call — the local `chartRequests(kind)` and `mockCharts({
  [kind]: svg })` helpers exist for exactly that. There is no per-kind mock to assert on any more.
- `tracker.test.ts` fakes the `DataBranch` rather than the filesystem: assertions about what was persisted
  read `branch.publish.mock.calls[0][0]`, not `writeHistory`. Anything about *how* the worktree is written
  belongs in `data-branch.test.ts`.
