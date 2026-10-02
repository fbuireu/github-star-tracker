# src/application

The single use case: `trackStars()` in [`src/application/tracker.ts`](./tracker.ts), the only export and the only thing
[`src/index.ts`](../index.ts) imports. It wires config, GitHub I/O, domain computation, rendering and persistence into one
ordered run and owns sequencing, the output contract and top-level error handling. It reads `github-token` and
`github-api-url` itself, through `core.getInput`, to build the client with `github.getOctokit`. It sets the outputs
and the failed status, which no other layer does; `@config` and `@infrastructure` write to the Action log as well.

The run, step by step, is the end-to-end table in [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md) rather
than here, and what follows is what that table cannot express.

## Invariants & rules

- The top-level `catch` turns every error that reaches it into `core.setFailed`, prefixed literally
  `Star Tracker failed: ` (asserted verbatim in [`tracker.test.ts`](./tracker.test.ts)), plus `core.debug(stack)` when
  there is one.
- The worktree lifecycle is not this layer's job. `withDataBranch` owns it: it opens the
  worktree, hands the body a `DataBranch` and removes the worktree in a `finally`, so a throw inside the body
  still reaches the outer catch with the worktree gone. `dataDir` is never visible here.
- The empty-repos branch returns before `withDataBranch`, so no worktree is created and no email is
  attempted.
- `starsAtLastNotification`, the Notification Baseline, advances only on delivery. A configured-and-failed
  send leaves it alone so the accumulated change is not lost, while an unconfigured transport advances it
  because the `should-notify` output *is* the notification
  ([ADR 0011](../../docs/adr/0011-the-notification-baseline-advances-only-on-delivery.md)).
- **A `sendEmail` that resolves `false` is a `FAILED` delivery, not an unattempted one.** That is the empty
  `email-to` case, which returns `false` without throwing: the transport was configured and did not deliver, so
  the Notification Baseline must not advance.
- `renderRun` takes `chartHistories` and the **stored** History under separate names, and derives the chart
  history from the first and hands Velocity the second. What gets persisted is always the stored History.
- Chart histories are resolved once, by `resolveChartHistories`, which returns `.aggregate`, `.forRepo(name)` and
  `.reconstructedForRepo(name)`. This layer reads `.aggregate` for the Forecast, passes `.reconstructedForRepo` to
  `computeForecast` as its `historyForRepo` hook (never `.forRepo`, for the reason
  [`../domain/AGENTS.md`](../domain/AGENTS.md) gives), and hands the whole thing to `renderRun`.
- `github-api-url` takes precedence over the `GITHUB_API_URL` env var; when both are empty `getOctokit` is
  called with `undefined` options, not `{ baseUrl: '' }`. A non-empty value must pass `ApiUrlSchema`, an
  absolute URL written with `https://`, or `resolveApiUrl` throws before Octokit is built, naming the input
  rather than failing later as a repository fetch whose hint blames the token.

## Outputs

Every key of the `outputs:` block of [`action.yml`](../../action.yml) exactly, listed here alphabetically as every
surface that lists them must be. The report values pass through as-is; the rest are wrapped in
`String()`.

| Key | Value |
| --- | --- |
| `lost-stars` | the matching `Summary` field |
| `new-stargazers` | `stargazerDiff?.totalNew ?? 0` |
| `new-stars` | the matching `Summary` field |
| `notification-sent` | `notification.notificationSent`, meaning an email actually left the runner |
| `report` | the rendered markdown report |
| `report-csv` | the rendered CSV report |
| `report-html` | the rendered HTML report |
| `report-html-path` | return value of `writeHtmlReport`, a filesystem path |
| `should-notify` | `notification.shouldNotify`, the *decision* |
| `stars-changed` | the matching `Summary` field |
| `total-stars` | the matching `Summary` field |

The empty-repos path calls `setOutputs` with `renderEmptyRun(config)` and `EMPTY_SUMMARY`. That render also emits a
real CSV header, so a consumer parsing `report-csv` gets one on both paths, and its message comes from
`report.noRepositories` in the locale bundle like every other user-facing string.

`new-stargazers` is `0` whenever `track-stargazers` is off, even though stargazers may still have been
fetched for chart reconstruction: the diff and the write are gated on `trackStargazers` alone, while the
fetch is gated on `includeCharts || trackStargazers`.

## Gotchas

- **`setOutputs` sets outputs and nothing else; the caller writes the HTML report, before `publish`.**
  `tracker.test.ts` pins that order. A write after `branch.publish` that failed would end a Run that had
  already committed, pushed and emailed, with `setFailed` and most outputs unset, and a re-run would append a
  second Snapshot for the same observation. Where `writeHtmlReport` puts the file, and why that location is
  outside the worktree, is in [`../infrastructure/AGENTS.md`](../infrastructure/AGENTS.md).
- `ApiUrlSchema` pairs `z.url({ protocol: /^https$/ })` with a `z.regex` on the `https://` prefix, because zod
  insists on the `//` only when the protocol pattern is its own `^https?$`: the protocol check alone accepts
  `https:/ghes.corp.com`, which the URL parser reads as the host `ghes.corp.com`. `tracker.test.ts` pins that row.
- `getEmailConfig` reads the SMTP inputs itself, inside `@infrastructure/notification/email`; the tracker
  never reads them. A missing `smtp-host` returns `null` and silently skips email.
- `withDataBranch` throws when the data branch is absent from the remote **and** the run is read-only. That
  surfaces as a `setFailed` before the body ever runs.
- **`branch.publish` is called once, at the end, with everything.** The Stargazer map is handed to it rather
  than written when it is computed, because `add -A` is what stages the writes and it runs inside `publish`.
  Splitting the call would put a write after the commit.
- The `else if (emailConfig)` branch names the actual reason: `notify` needs both `summary.changed` and
  `thresholdReached`, so it logs `'No stars changed since the Baseline Snapshot, skipping email'` when nothing
  moved and `'Notification threshold not reached, skipping email'` otherwise. Both strings are pinned verbatim
  by `tracker.test.ts`, so change the wording and the test together or not at all.
- `tracker.test.ts` mocks `@presentation/svg-chart` down to its single `renderSvgChart`, so "which chart was
  drawn" is read off the `request.kind` of each call. The local `chartRequests(kind)` and `mockCharts({
  [kind]: svg })` helpers exist for exactly that.
- `tracker.test.ts` fakes the `DataBranch` rather than the filesystem: assertions about what was persisted
  read `branch.publish.mock.calls[0][0]`, not `writeHistory`.
