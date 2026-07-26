# src/domain — pure business core: star deltas, snapshot history, forecasting, velocity, stargazer diffing

This folder holds every rule that decides *what the numbers mean*: how a current repo list is compared to a
stored snapshot, which snapshot is the baseline, how a star curve is reconstructed and projected, when a
notification is due, and how numbers/dates are rendered as short strings. It performs **no I/O**: no
`@actions/*`, no octokit, no `fs`, no git, no network. It also does **not** build reports — assembling
markdown/HTML/SVG belongs to `@presentation/*`, and orchestration belongs to `@application/tracker`.

## Files
| File | Responsibility |
| --- | --- |
| `types.ts` | Core data shapes (`RepoInfo`, `Snapshot`, `History`, `RepoResult`, `Summary`, `ComparisonResults`) plus the `CompareAgainst` and `NotificationMode` `as const` object + type pairs (not TS `const enum`, which `isolatedModules` forbids). |
| `constants.ts` | Numeric constants shared across the layer: time units, forecast sizing, adaptive notification thresholds, the 40k stargazer reachability cap, and `STAR_MILESTONES` — the single star-milestone ladder, consumed by both `velocity.ts` and `@presentation/*`. |
| `time.ts` | `toEpochMs` — the single timestamp-parsing helper; converts a timestamp string to epoch ms or `null`. |
| `comparison.ts` | Diffs current repos against a baseline snapshot into `ComparisonResults`; builds the snapshot to persist. |
| `snapshot.ts` | Selects the baseline snapshot for a `compare-against` window, extracts a per-repo star series, appends+trims history. |
| `forecast.ts` | Linear regression and weighted-moving-average maths, and the 4-week projection for the aggregate and top repos. |
| `velocity.ts` | Stars/day, growth %, next star milestone and days-to-milestone from the last two snapshots. |
| `stargazers.ts` | Stargazer value types, set-difference of current vs. previously seen logins, and the persisted login map. |
| `star-history.ts` | Reconstructs a synthetic `History` (cumulative star curve) from raw `starred_at` timestamps, scaled to true totals. |
| `formatting.ts` | Compact counts, signed deltas/percentages, trend icons, localized short dates and chart x-axis labels. |
| `notification.ts` | Adaptive threshold table lookup and the `shouldNotify` decision. |

## Public API

### `@domain/comparison`
- `compareStars({ currentRepos, previousSnapshot }: { currentRepos: RepoInfo[]; previousSnapshot: Snapshot | null }): ComparisonResults` — the one diff entry point; consumed by `@application/tracker`.
- `createSnapshot({ currentRepos, summary }: { currentRepos: RepoInfo[]; summary: Summary }): Snapshot` — builds the snapshot appended to the data branch each run.

### `@domain/snapshot`
- `getBaselineSnapshot({ history, compareAgainst, now? }: { history: History; compareAgainst: CompareAgainst; now?: Date }): Snapshot | null` — resolves the `compare-against` input to the snapshot `compareStars` diffs against.
- `addSnapshot({ history, snapshot, maxHistory }: { history: History; snapshot: Snapshot; maxHistory: number }): History` — returns a new history with the snapshot appended and trimmed.
- `repoStarSeries({ snapshots, repoFullName }: { snapshots: Snapshot[]; repoFullName: string }): number[]` — per-repo star values aligned to `snapshots`; used by `@presentation/chart` and `@presentation/svg-chart`.
- `getLastSnapshot(history: History): Snapshot | null` — newest snapshot with a parseable timestamp; exported but only consumed inside this folder (by `getBaselineSnapshot`) and its test.

### `@domain/forecast`
- `computeForecast({ history, topRepoNames }: { history: History; topRepoNames: string[] }): ForecastData | null` — the only forecast entry point used outside this folder.
- `ForecastMethod` (const object + type) — read by `@presentation/shared` to map a method to a translation key.
- `linearRegression(points: SeriesPoint[]): { slope: number; intercept: number }` and `weightedMovingAverage(points: SeriesPoint[]): number` — exported for tests; nothing outside `src/domain` imports them.

### `@domain/velocity`
- `computeVelocity({ history }: { history: History }): VelocityMetrics | null` — used by `@presentation/markdown` and `@presentation/html` for the velocity section.

### `@domain/star-history`
- `buildStarHistory({ repoStargazers, repos, maxPoints, now? }: { repoStargazers: RepoStargazers[]; repos: RepoTotal[]; maxPoints: number; now?: Date }): History` — used by `@application/tracker` and `@presentation/charts` to get a chartable history from raw stargazer dates.

### `@domain/stargazers`
- `diffStargazers({ current, previousMap }: { current: RepoStargazers[]; previousMap: StargazerMap }): StargazerDiffResult` — new-stargazer detection for the report.
- `buildStargazerMap({ repoStargazers, previousMap }: { repoStargazers: RepoStargazers[]; previousMap: StargazerMap }): StargazerMap` — the shape persisted to disk by `@infrastructure/persistence/storage`. Sampled and `incomplete` repos carry their previous logins forward instead of being dropped, so a failed fetch cannot wipe an entry and fabricate a spike on the next run ([ADR 0012](../../docs/adr/0012-unreadable-stargazer-lists-keep-their-previous-logins.md)). The matching exclusion in `diffStargazers` — a Sampled repo is never diffed, because absence from a sample is not evidence — is [ADR 0008](../../docs/adr/0008-sampled-repositories-are-excluded-from-stargazer-diffing.md).

### `@domain/notification`
- `shouldNotify({ totalStars, starsAtLastNotification, threshold, mode? }: { totalStars: number; starsAtLastNotification: number | undefined; threshold: number | 'auto'; mode?: NotificationMode }): boolean` — drives the `should-notify` action output and email dispatch.
- `getAdaptiveThreshold(totalStars: number): number` — exported but only called by `shouldNotify` and its test.

### `@domain/formatting`
- `formatCount({ count, locale }: { count: number; locale: Locale }): string` — compact `1.5K` / `2.5M` form, rendered in the report locale (`@presentation/badge`, `@presentation/svg-chart`). Formatters are cached per locale.
- `deltaIndicator(delta: number): string`, `formatSignedPercent(value: number): string`, `trendIcon(delta: number): string` — inline report cells.
- `formatDate({ timestamp, locale }: { timestamp: string; locale: Locale }): string` — short `MMM D` date.
- `buildAxisLabels({ timestamps, locale }: { timestamps: string[]; locale: Locale }): string[]` — chart x-axis tick labels.
- `UP_ARROW` / `DOWN_ARROW` / `DASH` — the emoji `trendIcon` returns; only re-used by tests.

### `@domain/time`
- `toEpochMs(timestamp: string): number | null` — also imported by `@presentation/shared` for chart-range filtering.

### `@domain/constants`
`MS_PER_DAY` and `FORECAST_WEEKS` are consumed by `@presentation/shared`; `STAR_MILESTONES` by
`velocity.ts`, `@presentation/chart` and `@presentation/svg-chart`; `MAX_REACHABLE_STARGAZERS` by
`@infrastructure/github/stargazers`. `MS_PER_YEAR`, `MIN_SNAPSHOTS_FOR_FORECAST`,
`NOTIFICATION_THRESHOLDS` and `NOTIFICATION_THRESHOLD_MAX_PACE` are folder-internal.

## Key types
| Type | Shape / notes |
| --- | --- |
| `RepoInfo` | `owner, name, fullName, private, archived, fork, stars` — what infrastructure hands in. |
| `SnapshotRepo` | `fullName, name, owner, stars` — the persisted subset of `RepoInfo`. |
| `Snapshot` | `timestamp` (ISO string), `totalStars`, `repos: SnapshotRepo[]`. |
| `History` | `snapshots: Snapshot[]`, optional `starsAtLastNotification`. |
| `RepoResult` | `name, fullName, owner, current, previous: number \| null, delta, isNew, isRemoved`. |
| `Summary` | `totalStars, totalPrevious, totalDelta, newStars, lostStars, changed`. |
| `CompareAgainst` | `'last-run' \| '24h' \| '7d' \| '30d'`. |
| `NotificationMode` | `'net' \| 'gains'`. |
| `ForecastData` | `{ aggregate: { forecasts: ForecastResult[] }; repos: RepoForecast[] }`; `ForecastPoint` is `{ weekOffset, predicted }`. |
| `SeriesPoint` | `{ day: number; value: number }` — `day` is **days since the first snapshot**, not an epoch. |
| `VelocityMetrics` | `starsPerDay, growthPercent: number \| null, nextMilestone: number \| null, daysToNextMilestone: number \| null`. |
| `RepoStargazers` | `repoFullName, stargazers: Stargazer[]`, optional `sampled`, `coveredStars`, `incomplete` (fetch failed or returned nothing for a starred repo). |
| `StargazerMap` | `Record<repoFullName, login[]>` — the on-disk format. |
| `RepoTotal` | `fullName, name, owner, stars` — `buildStarHistory` input, structurally equal to `SnapshotRepo`. |

## Invariants & rules

**Purity / time**
- Every function here must stay free of I/O and of `@actions/*`. The only wall-clock reads are
  `createSnapshot` (`new Date().toISOString()`) and the *defaults* of `getBaselineSnapshot({ now })` and
  `buildStarHistory({ now })`. Never add a third; prefer an injectable `now`.
- `toEpochMs` guarantees a **finite number or `null`** — never `NaN`. It is the single timestamp entry
  point for the whole layer: `snapshot.ts`, `velocity.ts`, `forecast.ts` (`snapshotDays`),
  `star-history.ts` and `formatting.ts` (`formatDate`, `buildAxisLabels`) all go through it. Never
  reintroduce a raw `Date.parse` here.
- All internal arithmetic is in **milliseconds**; anything user-facing is converted to **days**
  (`MS_PER_DAY`). `MS_PER_YEAR` is a flat `365 * MS_PER_DAY` — no leap-year correction.

**Ordering**
- `history.snapshots` is assumed **chronologically ascending**; nothing in this folder sorts it.
  `getBaselineSnapshot`, `getLastSnapshot`, `computeVelocity`, `snapshotDays` and `buildAxisLabels` all
  break silently on unsorted input.
- `compareStars` returns current repos first (input order), then removed repos (previous-snapshot order).
- `diffStargazers` sorts new stargazers **descending by `starredAt`** using `String.localeCompare` on the
  raw string — correct only while all values are same-format ISO strings.

**Mutation**
- Nothing here mutates its arguments. `addSnapshot` spreads (`{ ...history, snapshots }`), so
  `starsAtLastNotification` survives; `diffStargazers` sorts the array produced by `.filter()`, never
  `repo.stargazers`; `star-history` scaling functions mutate only their own local `scaled` array.

**Comparison semantics**
- A repo absent from the baseline is `isNew: true` with `previous: null` and **`delta: 0`** — new repos
  never inflate `newStars`.
- A repo present in the baseline but not in the current list is `isRemoved: true`, `current: 0`,
  `delta: -previous`, and is **excluded from `summary.totalStars`** but included in `lostStars`.
- Removed repos fall back to `fullName.split('/')` when the stored `name`/`owner` are empty.
- `summary.totalPrevious` is read from `previousSnapshot.totalStars`, **not** re-summed from its repos, so
  `totalDelta` need not equal `newStars - lostStars`.
- `summary.changed` is true if any repo has a non-zero delta **or** is new/removed — so a first run with
  repos always reports `changed: true`.

**Snapshot store (`snapshot.ts`)**
- Empty history → `null`. Every mode ignores snapshots whose timestamp does not parse, including
  `last-run`, which walks back to the newest snapshot that does.
- Windowed modes pick the **newest** snapshot at or before `now - windowDays + 6h`. The
  `COMPARE_WINDOW_TOLERANCE_MS = 6h` slack exists so cron jitter does not push a run just under the window.
- If no snapshot is old enough, it falls back to the **oldest parseable** snapshot; if none is parseable,
  `null`.
- `addSnapshot` trims with `.slice(-maxHistory)`. `maxHistory: 0` would yield `slice(-0) === slice(0)` and
  keep the whole array, which is why `@config/loader` rejects non-positive `max-history` before it ever
  reaches here.
- `repoStarSeries` yields `0` for snapshots where the repo is absent; a gap reads as a drop to zero, not a
  gap. The returned array always has the same length as `snapshots`.

**Forecast maths**
- `computeForecast` returns `null` below `MIN_SNAPSHOTS_FOR_FORECAST = 3` snapshots; otherwise it always
  returns exactly two `ForecastResult`s (LR then WMA), each with exactly `FORECAST_WEEKS = 4` points at
  `weekOffset` 1..4.
- Projections are anchored on the **last observed value**, not the fitted regression value:
  `predicted = last.value + rate * weekOffset * 7`. Changing this changes every chart.
- `linearRegression` returns `{ slope: 0, intercept: lastValue }` when the denominator is 0 (single point,
  or all points on the same day).
- `weightedMovingAverage` returns a **per-day rate**, weighting consecutive deltas linearly (`index + 1`,
  newest heaviest). It returns `0` for fewer than 2 points, and skips any interval shorter than
  `MIN_RATE_INTERVAL_DAYS` (0.25 d) so a burst of runs minutes apart cannot dominate the rate.
- `snapshotDays` normalizes by real calendar spacing so the projection is in calendar weeks regardless of
  snapshot cadence (issue #143). If **any** timestamp is unparseable it falls back to a synthetic weekly
  cadence (`index * 7`) for *all* points.
- Every prediction passes `clampPrediction`: `Math.max(0, Math.round(value))` — non-negative integers only.

**Velocity**
- Uses the last snapshot and the newest earlier snapshot at least `MIN_RATE_INTERVAL_DAYS` (0.25 d) back,
  skipping any closer pair so a manual re-run minutes after a scheduled one cannot inflate the rate.
  It is a recent-period rate, never an all-time average. Callers
  must pass the *stored* history (real runs), not a reconstructed chart history, or `starsPerDay` silently
  becomes an average over a chart bucket whose width depends on `chart-max-points`.
- Returns `null` for fewer than 2 snapshots, an unparseable newest timestamp, or when no earlier snapshot
  is at least `MIN_RATE_INTERVAL_DAYS` older.
- `starsPerDay` is rounded to 2 decimals, `growthPercent` to 1. `growthPercent` is `null` when the previous
  total is `0` (no division by zero). `starsPerDay` may be negative.
- `daysToNextMilestone` is `Math.ceil` over the **already-rounded** `starsPerDay`, and is `null` when
  `starsPerDay <= 0` or the total is **at or above** the largest milestone (1,000,000) — `nextMilestoneAbove`
  uses a strict `milestone > value`, so exactly 1,000,000 already yields `null`.

**Notifications**
- `threshold === 0` returns `true` immediately, **before** `mode` is considered.
- The delta is measured against `starsAtLastNotification` (accumulating across runs), not the previous
  snapshot; `undefined` is treated as `0`.
- `net` compares `Math.abs(delta)` so a large loss also fires; `gains` compares the signed delta so a loss
  never fires. Comparison is `>=`.
- `'auto'` resolves against the **current** total: `<=50 → 1`, `<=200 → 5`, `<=500 → 10`, else `20`.

**Star-history reconstruction** — charts are built from stargazer timestamps rather than from stored
snapshots on purpose ([ADR 0005](../../docs/adr/0005-charts-are-reconstructed-from-stargazer-timestamps.md)).
- Returns `{ snapshots: [] }` when no repo has a single parseable `starred_at`.
- Bucket count is `clamp(maxPoints, 2, 365)`; `maxPoints: 0` means full history at weekly cadence
  (`ceil(span / 7d) + 1`, still capped at 365). The final edge is forced to exactly `end` so the last
  snapshot is "now".
- Every per-repo series is **monotonically non-decreasing** and its last value is **exactly `repo.stars`**.
- A repo with stars but zero fetched dates stays **flat at `repo.stars`** across all edges — never a
  fabricated `0 → total` ramp (issue #148).
- `reachable = min(coveredStars ?? MAX_REACHABLE_STARGAZERS, repo.stars)`. When `reachable < repo.stars`
  the tail is linearly ramped from the last real data point up to the true total instead of flattening at
  the 40k cap (issue #114, [ADR 0007](../../docs/adr/0007-bridge-unreachable-history-with-a-ramp.md));
  otherwise counts are scaled proportionally, and when `fetchedTotal === trueTotal`
  the raw counts are used unrounded so no drift is introduced.
- Snapshot `totalStars` here is the **sum of the per-repo values at that edge**, unlike stored snapshots
  where it comes from `Summary`.

**Formatting**
- `deltaIndicator(0)` is `'0'`, not `'+0'`; `formatSignedPercent(0)` is `'+0%'`.
- `formatSignedPercent` does not round — the caller must.
- `buildAxisLabels` always returns an array of the **same length as `timestamps`**. It switches to
  year-only labels when there are ≥2 parseable timestamps spanning ≥`MS_PER_YEAR`, emitting the year once
  at its first occurrence and `''` elsewhere (and `''` for unparseable entries).

## Dependencies
- May import: `@i18n` (only `formatting.ts`, for `Locale` / `LOCALE_MAP`) and same-folder relative modules.
- Must never import: `@application/*`, `@config/*`, `@infrastructure/*`, `@presentation/*`, `@actions/*`,
  `@octokit/*`, `nodemailer`, `node:fs`, `node:child_process`. Domain sits at the bottom of the dependency
  graph; anything above it importing back would create a cycle and make the layer untestable in isolation.
- `@shared/testing` (`makeRepoInfo`, `makeStargazer`) appears in test files only.
- Same-folder imports stay relative (`./constants`, `./time`, `./types`), per the repo alias convention.

## Gotchas
- `buildAxisLabels` keeps `lastYear` as closure state across the `.map` callback; it only works because
  `Array.prototype.map` runs in order and the input is sorted.
- `formatDate` returns an **empty string** for an unparseable timestamp, matching `buildAxisLabels`, whose
  contract is already "an empty label is a tick that must not render". Callers must not assume a non-empty
  date.
- `buildStarHistory` handles a `starred_at` in the future relative to `now` by emitting just two edges
  (`earliest - 1 day`, `end`), which silently collapses the chart to two points.
- `compareStars` keys the previous snapshot by `fullName` in a `Map`; duplicate `fullName` entries in a
  stored snapshot resolve last-wins without warning.

## Testing
Colocated Vitest specs, one per module: `comparison.test.ts`, `forecast.test.ts`, `formatting.test.ts`,
`notification.test.ts`, `snapshot.test.ts`, `star-history.test.ts`, `stargazers.test.ts`, `time.test.ts`,
`velocity.test.ts`. `types.ts` and `constants.ts` have no tests and are excluded from coverage.

They pin down, in particular: the 6-hour cron-jitter tolerance and the unparseable-timestamp fallbacks
(`snapshot.test.ts`); calendar-week projection independent of snapshot spacing and non-negative integer
clamping (`forecast.test.ts`); monotonicity, the exact terminal total, the >40k ramp and the
`coveredStars` anchor (`star-history.test.ts`); descending stargazer order and the sampled-repo exclusions
(`stargazers.test.ts`); the adaptive threshold boundaries at 50/200/500 and `net` vs `gains`
(`notification.test.ts`); the year-label axis switch (`formatting.test.ts`).

Run just this layer with `pnpm vitest run src/domain`, or a single file with
`pnpm vitest run src/domain/forecast.test.ts`.
