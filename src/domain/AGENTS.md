# src/domain

The pure business core: what the numbers *mean*. How a current repo list is diffed against a stored
snapshot, which Snapshot is the Baseline Snapshot, how a star curve is reconstructed and projected, when a
notification is due, and how numbers and dates become short strings. No I/O of any kind. It does not build
reports (`@presentation/*`) and does not sequence anything (`@application/tracker`).

One module per concept, each with a colocated `*.test.ts`: `measurement`, `comparison`, `snapshot`,
`forecast`, `velocity`, `growth`, `stargazers`, `star-history`, `tracked-set`, `sampling`, `formatting`,
`notification`, `time`, plus [`types.ts`](./types.ts) and [`constants.ts`](./constants.ts).

[`tracked-set.ts`](./tracked-set.ts) and [`sampling.ts`](./sampling.ts) are the two modules `@infrastructure` calls rather than `@application`.

`resolveTrackedSet` answers *which repositories a Run measures*: it applies the `only`/`exclude` lists, the
archived/fork/min-stars rules and the `onlyRepos` short-circuit over `RepoInfo`, and reports
`afterOnlyOrgs`, `afterOnlyRepos` and the patterns it could not compile. `sampling.ts` plans a Stargazer
fetch without performing one. `shouldSample` applies the strict threshold, `reachablePages` clamps to
GitHub's paging ceiling, `sampledPages` picks the evenly-spread pages Smart Sampling reads, the first and the
last always among them and the whole budget spent on distinct pages even when the range is barely wider than it
(before rounding, consecutive picks are more than a page apart), and `coveredStars` says how many Stars those pages
account for, the figure [`star-history.ts`](./star-history.ts) reads to decide whether to draw a Ramped Tail.

## The Run Measurement is the layer's front door

`measureRun` ([`src/domain/measurement.ts`](./measurement.ts)) turns one observation into a Run Measurement
([ADR 0013](../../docs/adr/0013-a-run-is-measured-in-one-place.md)). It composes `getBaselineSnapshot`,
`compareStars`, `createSnapshot`, `addSnapshot` and `shouldNotify` in the one order that is correct, and returns
`baselineSnapshotTimestamp`, `results`, `summary`, `updatedHistory`, `droppedSnapshots` and `thresholdReached`.

- `measureRun` never advances the Notification Baseline: it reports `thresholdReached` and stops there.
  `settleNotification` in [`notification.ts`](./notification.ts) is what turns that plus a `Delivery` into the History to persist,
  and it calls `recordNotification`, which returns a **new** History rather than mutating the one it was
  handed. That split is [ADR 0011](../../docs/adr/0011-the-notification-baseline-advances-only-on-delivery.md).
- In `settleNotification`, `shouldNotify` is `changed && thresholdReached`, the decision; `notificationSent` is
  `delivery === SENT`, a fact about the transport; and the Notification Baseline advances only when the decision
  held *and* the delivery did not fail, which is why an unconfigured transport (`NOT_ATTEMPTED`) still advances it
  while a configured-and-failed one does not.
- `droppedSnapshots` is a count rather than a warning. This layer is pure and cannot log; the shell raises the
  `max-history` warning from it.

## Time

- `toEpochMs` ([`src/domain/time.ts`](./time.ts)) reads a timestamp as a finite number or `null`, never `NaN`.
- Timestamps are compared in **milliseconds**; rate arithmetic and anything user-facing is in **days**
  (`MS_PER_DAY`). `MS_PER_YEAR` is a flat `365 * MS_PER_DAY`, with no leap-year correction.
- `history.snapshots` is assumed **chronologically ascending**; nothing here sorts it. `getBaselineSnapshot`,
  `computeVelocity`, `calendarDays` and `buildAxisLabels` all break silently on unsorted input.

## Comparison semantics

- A repo absent from the Baseline Snapshot is `isNew: true`, `previous: null` and **`delta: 0`**, so new
  repos never inflate `newStars`.
- A repo missing from the current list is `isRemoved: true`, `current: 0`, `delta: -previous`, **excluded
  from `summary.totalStars`** but counted in `lostStars`.
- Removed means absent rather than deleted. A filter edit, an archived repo under `include-archived: false`, a
  `min-stars` rise and a rename reach `compareStars` as the same missing full name, so they all charge their
  whole Star Count to `lostStars`; a rename pairs it with a New Repository carrying `delta: 0`, which is why
  a run can report a large `lostStars` against `totalDelta: 0`. Dedicated cases in `comparison.test.ts` fix
  that arithmetic, including a removal of a repo with no stars, whose `delta` is `-0` and so counts as a
  change that loses nothing. The user-facing half is *Repository Identity* in `docs/wiki/Known-Limitations.md`.
- `summary.totalPrevious` is read from `baselineSnapshot.totalStars`, not re-summed, so `totalDelta` need not
  equal `newStars - lostStars`.
- `summary.changed` is true if any repo has a non-zero delta **or** is new/removed, so a first run with repos
  always reports `changed: true`.
- `rankByStars` drops Removed Repositories and orders a **copy** descending by current Star Count;
  `topRepositories({ repos, limit })` cuts that ranking and returns the full names of the Top Repositories, which
  `@application/tracker` reads for the Forecast, `@presentation/run` for the Charts and
  `@presentation/report-model` for the Report.

## Snapshot store

`getBaselineSnapshot` resolves the **Comparison Window**, the `compare-against` input, to the single
snapshot everything else is diffed against.

- Every mode ignores snapshots whose timestamp does not parse, including `last-run`, which walks back to the
  newest one that does. Empty history yields `null`.
- Windowed modes pick the **newest** snapshot at or before `now - windowDays + 6h`. That 6-hour slack exists
  so cron jitter does not push a run just under the window.
- With no snapshot old enough it falls back to the **oldest parseable** one; with none parseable it returns
  `null`.
- `addSnapshot` trims with `.slice(-maxHistory)`. `maxHistory: 0` keeps the whole array
  (`slice(-0) === slice(0)`), which is why `@config/loader` rejects a non-positive `max-history` upstream.
  `measureRun` reports `droppedSnapshots: 0` for that case rather than a fabricated count, because it counts
  the difference rather than restating the rule.
- `repoStarSeries` yields `0` for snapshots where the repo is absent, so a gap reads as a drop to zero on a
  Chart; `computeForecast` hands it only the Snapshots that hold the repository. The returned array always
  matches `snapshots` in length.

## Forecast, velocity, notifications

- `computeForecast` returns `null` below 3 snapshots; otherwise always one `ForecastResult` per
  **Forecast Method** (`ForecastMethod`: linear regression, then weighted moving average), each with 4 weekly
  points.
- Every Forecast anchors on the **last observed value**, not the fitted one:
  `predicted = last.value + rate * weekOffset * 7`. Changing this changes every chart. Every prediction is
  clamped to a non-negative integer.
- **Each Top Repository is fitted only to Snapshots that hold it: those of its own *reconstruction*, or else
  those of the aggregate.** `historyForRepo` is the optional hook `@application` fills with
  `chartHistories.reconstructedForRepo`, which returns `null` rather than falling back. A repository that
  returns `null`, or whose own History is shorter than `MIN_SNAPSHOTS_FOR_FORECAST`, is fitted to the Snapshots
  of the aggregate, `chartHistories.aggregate`, that hold it (`snapshotsHolding`), so a Snapshot taken before it
  joined the Tracked Set, or while it was out of it, never reaches the fit as the `0` `repoStarSeries` reads
  there: the `0 → total` ramp issue #148 guards against. Held by fewer than `MIN_SNAPSHOTS_FOR_FORECAST`
  Snapshots, it gets no `RepoForecast`, so neither Report shows a Forecast table for it.
- The aggregate is a reconstruction only while one exists. A reconstructed aggregate holds every repository in
  every Snapshot, and one with nothing to reconstruct from **flat at `repo.stars`**
  (`edges.map(() => repo.stars)`, the issue #148 guard), because with nothing to reconstruct from a flat line is
  the only shape that claims nothing. When the reconstruction is shorter than `MIN_SNAPSHOTS_FOR_CHART` (charts
  off, or no parseable `starredAt`), `@presentation/charts` hands over the Stored History as
  `chartHistories.aggregate`, which holds a repository only from the Run that first observed it.
- Each `RepoForecast` says which it was, in `source` (`ForecastSource`: `OWN` or
  `AGGREGATE`). It is the one thing about a per-repo Forecast a caller cannot re-derive without repeating the
  fallback rule above, and `@presentation/charts` reads it to decide whether that repository gets a Forecast
  Chart of its own: only its own reconstruction holds the repository alone, and the aggregate's timeline would
  draw the stretch before it joined under its name, so a Forecast fitted to the aggregate is published as a
  table and not drawn as a curve.
- `forRepo` is the wrong hook to pass here. It falls back to the Stored History, so a repository with no
  reconstruction would come back fitted to that History and marked `ForecastSource.OWN`, which names its own
  reconstruction. Fitting every repository to the aggregate fails the other way, reporting a young repository
  as static while the Chart above it climbs, and the hook is what avoids that.
- Both consumers cross [`src/domain/growth.ts`](./growth.ts): `calendarDays` converts a History to day offsets,
  `latestRateInterval` finds the newest usable pair, `weightedDailyRate` is the Forecast Method that weights
  recent movement, and `fitTrend` is the least-squares one. The **Rate Interval** rule (skip any pair closer
  than `MIN_RATE_INTERVAL_DAYS`) lives in `latestRateInterval`, which `weightedDailyRate` calls on each
  consecutive pair.
- `calendarDays` normalizes by real calendar spacing, so the Forecast is in calendar weeks whatever the run
  cadence. If **any** timestamp is unparseable it falls back to a synthetic weekly cadence for *all* points.
  `computeVelocity` does **not** share that policy: it drops unparseable snapshots and returns `null` when
  the newest one does not parse. The two policies differ on purpose: read
  [ADR 0017](../../docs/adr/0017-velocity-and-forecast-read-unparseable-timestamps-differently.md) before
  making them agree, since routing `computeVelocity` through `calendarDays` would turn a `null` into a
  fabricated rate with no test failing.
- `computeVelocity` uses the last snapshot and the newest earlier one at least 0.25 days back, skipping
  closer pairs so a manual re-run minutes after a scheduled one cannot inflate the rate. It is a
  recent-period rate, never an all-time average. Callers must pass the **stored** history, not a
  reconstructed chart history, or `starsPerDay` becomes an average over a bucket whose width follows
  `chart-max-points`.
- `daysToNextMilestone` is `Math.ceil` over the **already-rounded** `starsPerDay`, and is `null` at or above
  the largest milestone: `nextMilestoneAbove` uses a strict `>`, so exactly 1,000,000 already yields `null`.
- `shouldNotify`: `threshold === 0` returns `true` **before** `mode` is considered. The delta is measured
  against the Notification Baseline, `starsAtLastNotification` (accumulating across runs), not the Baseline
  Snapshot. `net` compares `Math.abs(delta)` so a large loss also fires; `gains` compares the signed delta.
  `'auto'` resolves against the current total: `<=50 → 1`, `<=200 → 5`, `<=500 → 10`, else `20`.

## Star-history reconstruction

Charts are rebuilt from raw stargazer timestamps rather than from stored snapshots on purpose
([ADR 0005](../../docs/adr/0005-charts-are-reconstructed-from-stargazer-timestamps.md)).

- Returns `{ snapshots: [] }` when no repo has a single parseable `starred_at`.
- Bucket count is `clamp(maxPoints, 2, 365)`; `maxPoints: 0` means full history at weekly cadence. The final
  edge is forced to exactly `end`, so the last snapshot is "now".
- Every per-repo series is **monotonically non-decreasing** and its last value is **exactly `repo.stars`**.
- A repo with stars but zero fetched dates stays **flat at `repo.stars`**, never on a fabricated
  `0 → total` ramp (issue #148).
- `reachable = min(coveredStars ?? MAX_REACHABLE_STARGAZERS, repo.stars)`. When it falls short of the true
  total the tail is linearly ramped up to that total instead of flattening at the 40k cap
  ([ADR 0007](../../docs/adr/0007-bridge-unreachable-history-with-a-ramp.md)); otherwise counts are scaled
  proportionally, and an exact match uses the raw counts unrounded so no drift is introduced.
- Snapshot `totalStars` here is the **sum of the per-repo values at that edge**, unlike stored snapshots
  where it comes from `Summary`.

## Stargazer diffing

`incomplete` means **"this list is not the whole story"**, not "this list is empty". It covers a fetch that
returned nothing, one that was cut short mid-pagination, and one that ran out of pages at GitHub's
40,000-stargazer ceiling. `@infrastructure` sets it; nothing here recomputes it.

`buildStargazerMap` seeds from the previous map. A repository that was not observed at all, because it fell
out of the Tracked Set, keeps its entry too, and nothing prunes the file.
[ADR 0019](../../docs/adr/0019-the-stargazer-map-retains-untracked-repositories.md) records that trade-off and
why a grace period is not available. The same seed is what makes a sampled or `incomplete` repo keep its
previous logins, so a failed fetch cannot wipe an entry and fabricate a spike next run
([ADR 0012](../../docs/adr/0012-unreadable-stargazer-lists-keep-their-previous-logins.md)). The matching
exclusion in `diffStargazers`, that a sampled repo is never diffed because absence from a sample is not
evidence, is [ADR 0008](../../docs/adr/0008-sampled-repositories-are-excluded-from-stargazer-diffing.md).
New stargazers sort **descending by `starredAt`** via `localeCompare` on the raw string, correct only while
every value is a same-format ISO string.

## Gotchas

- `deltaIndicator(0)` is `'0'`, not `'+0'`; `formatSignedPercent(0)` is `'+0%'` and does **not** round, so
  the caller must.
- `formatDate` returns an **empty string** for an unparseable timestamp, matching `buildAxisLabels`, whose
  contract is "an empty label is a tick that must not render". Callers must not assume a non-empty date.
- `buildAxisLabels` always returns an array the same length as its input, and keeps `lastYear` as closure
  state across the `.map`; it only works because `map` runs in order on sorted input.
- `buildStarHistory` emits just two edges when even the earliest `starred_at` is at or after `now`, silently
  collapsing the chart to two points.
- `compareStars` keys the Baseline Snapshot by `fullName` in a `Map`; duplicate entries resolve last-wins
  without warning. [`comparison.test.ts`](./comparison.test.ts) pins that, so it is behaviour rather than an accident.
- `STAR_MILESTONES` lives in `src/domain/constants.ts` and is consumed by [`velocity.ts`](./velocity.ts) **and**
  `@presentation/*`. `constants.ts` and `types.ts` are coverage-excluded.
