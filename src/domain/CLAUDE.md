# src/domain

The pure business core: what the numbers *mean*. How a current repo list is diffed against a stored
snapshot, which snapshot is the baseline, how a star curve is reconstructed and projected, when a
notification is due, and how numbers and dates become short strings. No I/O of any kind. It does not build
reports (`@presentation/*`) and does not sequence anything (`@application/tracker`).

One module per concept, each with a colocated `*.test.ts`: `measurement`, `comparison`, `snapshot`,
`forecast`, `velocity`, `growth`, `stargazers`, `star-history`, `formatting`, `notification`, `time`, plus
`types.ts` and `constants.ts`.

## The Run Measurement is the layer's front door

`measureRun` (`src/domain/measurement.ts`) is the only entry point `@application` uses to turn one
observation into a Run Measurement, and [ADR 0013](../../docs/adr/0013-a-run-is-measured-in-one-place.md)
records why. It composes `getBaselineSnapshot`, `compareStars`, `createSnapshot`, `addSnapshot` and
`shouldNotify` in the one order that is correct, and returns `baselineTimestamp`, `results`, `summary`,
`updatedHistory`, `droppedSnapshots` and `thresholdReached`.

- **The five it composes stay exported and stay tested.** They are internal seams within this layer, not a
  surface another layer crosses. Do not call them from outside `@domain` — the ordering rules they carry are
  what `measureRun` exists to make unreachable.
- **`measureRun` never advances the Notification baseline.** It reports `thresholdReached` and stops there.
  `settleNotification` in `notification.ts` is what turns that plus a `Delivery` into the History to persist,
  and it calls `recordNotification`, which returns a **new** History rather than mutating the one it was
  handed. That split is [ADR 0011](../../docs/adr/0011-the-notification-baseline-advances-only-on-delivery.md).
- **`settleNotification` is the only place the delivery rules live.** `shouldNotify` is `changed &&
  thresholdReached` — the decision; `notificationSent` is `delivery === SENT` — a fact about the transport;
  and the baseline advances only when the decision held *and* the delivery did not fail, which is why an
  unconfigured transport (`NOT_ATTEMPTED`) still advances it while a configured-and-failed one does not.
  `@application` supplies the `Delivery` and reads the outcome; it decides none of this.
- **`droppedSnapshots` is a count, not a warning.** This layer is pure and cannot log; the shell raises the
  `max-history` warning from it. It is **derived from the History `addSnapshot` actually returned**, not
  recomputed from `maxHistory` — the trimming rule is written once, in `addSnapshot`, so the count cannot
  disagree with the array it describes.
- `now` is injectable and reaches `getBaselineSnapshot` only. `createSnapshot` still reads the wall clock.

## Purity and time

- The only wall-clock reads are `createSnapshot` (`new Date().toISOString()`) and the *defaults* of
  `getBaselineSnapshot({ now })` and `buildStarHistory({ now })`. Never add a third — prefer an injectable
  `now`.
- **`toEpochMs` (`src/domain/time.ts`) is the single timestamp entry point** for the whole layer, and it
  guarantees a finite number or `null`, never `NaN`. Never reintroduce a raw `Date.parse` here.
- Internal arithmetic is in **milliseconds**; anything user-facing converts to **days** (`MS_PER_DAY`).
  `MS_PER_YEAR` is a flat `365 * MS_PER_DAY` — no leap-year correction.
- `history.snapshots` is assumed **chronologically ascending**; nothing here sorts it. `getBaselineSnapshot`,
  `computeVelocity`, `snapshotDays` and `buildAxisLabels` all break silently on unsorted input.
- Nothing mutates its arguments.

## Comparison semantics

- A repo absent from the baseline is `isNew: true`, `previous: null` and **`delta: 0`** — new repos never
  inflate `newStars`.
- A repo missing from the current list is `isRemoved: true`, `current: 0`, `delta: -previous`, **excluded
  from `summary.totalStars`** but counted in `lostStars`.
- `summary.totalPrevious` is read from `previousSnapshot.totalStars`, not re-summed, so `totalDelta` need not
  equal `newStars - lostStars`.
- `summary.changed` is true if any repo has a non-zero delta **or** is new/removed, so a first run with repos
  always reports `changed: true`.
- **Top Repositories is defined once, here.** `rankByStars` drops Removed Repositories and orders a **copy**
  descending by current Star Count; `topRepositories({ repos, limit })` cuts that ranking and returns full
  names. `@application/tracker` uses it for the charts and the Forecast and `@presentation/report-model` for
  the Report — neither re-derives the ordering, which is what stops a Chart and its Report disagreeing about
  which repositories are the top ones.

## Snapshot store

`getBaselineSnapshot` resolves the **Comparison Window** — the `compare-against` input — to the single
snapshot everything else is diffed against.

- Every mode ignores snapshots whose timestamp does not parse, including `last-run`, which walks back to the
  newest one that does. Empty history → `null`.
- Windowed modes pick the **newest** snapshot at or before `now - windowDays + 6h`. That 6-hour slack exists
  so cron jitter does not push a run just under the window.
- No snapshot old enough → falls back to the **oldest parseable** one; none parseable → `null`.
- `addSnapshot` trims with `.slice(-maxHistory)`. `maxHistory: 0` keeps the whole array
  (`slice(-0) === slice(0)`), which is why `@config/loader` rejects a non-positive `max-history` upstream.
  `measureRun` reports `droppedSnapshots: 0` for that case rather than a fabricated count, because it counts
  the difference rather than restating the rule.
- `repoStarSeries` yields `0` for snapshots where the repo is absent — a gap reads as a drop to zero. The
  returned array always matches `snapshots` in length.

## Forecast, velocity, notifications

- `computeForecast` returns `null` below 3 snapshots; otherwise always exactly two `ForecastResult`s, one per
  **Forecast Method** (`ForecastMethod`: linear regression, then weighted moving average), each with 4 weekly
  points.
- Projections anchor on the **last observed value**, not the fitted one:
  `predicted = last.value + rate * weekOffset * 7`. Changing this changes every chart. Every prediction is
  clamped to a non-negative integer.
- **All rate arithmetic lives in `src/domain/growth.ts`**, and both consumers cross it: `calendarDays`
  converts a History to day offsets, `latestRateInterval` finds the newest usable pair, `weightedDailyRate`
  is the Forecast Method that weights recent movement, and `fitTrend` is the least-squares one. The
  **Rate Interval** rule — skip any pair closer than `MIN_RATE_INTERVAL_DAYS` — is now written once, so
  Velocity and Forecast cannot disagree about it.
- `calendarDays` normalizes by real calendar spacing, so the projection is in calendar weeks whatever the run
  cadence. If **any** timestamp is unparseable it falls back to a synthetic weekly cadence for *all* points.
  `computeVelocity` does **not** share that policy: it drops unparseable snapshots and returns `null` when
  the newest one does not parse. The two policies are deliberately different and both are stated here
  because neither signature says so.
- `computeVelocity` uses the last snapshot and the newest earlier one at least 0.25 days back, skipping
  closer pairs so a manual re-run minutes after a scheduled one cannot inflate the rate. It is a
  recent-period rate, never an all-time average. Callers must pass the **stored** history, not a
  reconstructed chart history, or `starsPerDay` becomes an average over a bucket whose width follows
  `chart-max-points`.
- `daysToNextMilestone` is `Math.ceil` over the **already-rounded** `starsPerDay`, and is `null` at or above
  the largest milestone — `nextMilestoneAbove` uses a strict `>`, so exactly 1,000,000 already yields `null`.
- `shouldNotify`: `threshold === 0` returns `true` **before** `mode` is considered. The delta is measured
  against `starsAtLastNotification` (accumulating across runs), not the previous snapshot. `net` compares
  `Math.abs(delta)` so a large loss also fires; `gains` compares the signed delta. `'auto'` resolves against
  the current total: `<=50 → 1`, `<=200 → 5`, `<=500 → 10`, else `20`.

## Star-history reconstruction

Charts are rebuilt from raw stargazer timestamps rather than from stored snapshots on purpose
([ADR 0005](../../docs/adr/0005-charts-are-reconstructed-from-stargazer-timestamps.md)).

- Returns `{ snapshots: [] }` when no repo has a single parseable `starred_at`.
- Bucket count is `clamp(maxPoints, 2, 365)`; `maxPoints: 0` means full history at weekly cadence. The final
  edge is forced to exactly `end`, so the last snapshot is "now".
- Every per-repo series is **monotonically non-decreasing** and its last value is **exactly `repo.stars`**.
- A repo with stars but zero fetched dates stays **flat at `repo.stars`** — never a fabricated `0 → total`
  ramp (issue #148).
- `reachable = min(coveredStars ?? MAX_REACHABLE_STARGAZERS, repo.stars)`. When it falls short of the true
  total the tail is linearly ramped up to that total instead of flattening at the 40k cap
  ([ADR 0007](../../docs/adr/0007-bridge-unreachable-history-with-a-ramp.md)); otherwise counts are scaled
  proportionally, and an exact match uses the raw counts unrounded so no drift is introduced.
- Snapshot `totalStars` here is the **sum of the per-repo values at that edge**, unlike stored snapshots
  where it comes from `Summary`.

## Stargazer diffing

`buildStargazerMap` carries a sampled or `incomplete` repo's previous logins forward instead of dropping
them, so a failed fetch cannot wipe an entry and fabricate a spike next run
([ADR 0012](../../docs/adr/0012-unreadable-stargazer-lists-keep-their-previous-logins.md)). The matching
exclusion in `diffStargazers` — a sampled repo is never diffed, because absence from a sample is not
evidence — is [ADR 0008](../../docs/adr/0008-sampled-repositories-are-excluded-from-stargazer-diffing.md).
New stargazers sort **descending by `starredAt`** via `localeCompare` on the raw string, correct only while
every value is a same-format ISO string.

## Gotchas

- `deltaIndicator(0)` is `'0'`, not `'+0'`; `formatSignedPercent(0)` is `'+0%'` and does **not** round — the
  caller must.
- `formatDate` returns an **empty string** for an unparseable timestamp, matching `buildAxisLabels`, whose
  contract is "an empty label is a tick that must not render". Callers must not assume a non-empty date.
- `buildAxisLabels` always returns an array the same length as its input, and keeps `lastYear` as closure
  state across the `.map` — it only works because `map` runs in order on sorted input.
- `buildStarHistory` handles a `starred_at` in the future relative to `now` by emitting just two edges,
  silently collapsing the chart to two points.
- `compareStars` keys the previous snapshot by `fullName` in a `Map`; duplicate entries resolve last-wins
  without warning. `comparison.test.ts` pins that, so it is behaviour rather than an accident.
- **Nothing here is exported only so a test can reach it.** `getAdaptiveThreshold`, `getLastSnapshot`,
  `linearRegression` and `weightedMovingAverage` used to be, and their cases now run through `shouldNotify`,
  `getBaselineSnapshot` and `growth.ts`'s own interface instead. Adding an export purely to test an internal
  is the smell that says the module is the wrong shape.
- `STAR_MILESTONES` lives in `src/domain/constants.ts` and is consumed by `velocity.ts` **and**
  `@presentation/*`. `constants.ts` and `types.ts` are coverage-excluded.
