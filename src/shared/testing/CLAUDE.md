# src/shared/testing — fixture factories for the test suite

A single barrel of pure factory functions that build `Config`, `RepoInfo`, `Stargazer`, `Snapshot`,
`History`, `RepoResult` and `ComparisonResults` values with sensible defaults, so tests only spell out the
fields they are actually asserting on. It contains no assertions, no mocks, no `vi.*` helpers and no test
setup — mocking (`vi.mock('@actions/core')`, octokit stubs, fs stubs) stays in the test files that need it.
It is production-adjacent but never shipped: nothing outside a `*.test.ts` may import it.

## Files
| File | Responsibility |
| --- | --- |
| `index.ts` | Every factory listed below, plus the private constants `MS_PER_DAY` (`86_400_000`), `DEFAULT_SERIES_START` (`Date.UTC(2026, 0, 1)`) and `DEFAULT_HISTORY_STEP_DAYS` (`7`). |

## Public API

All of the following are imported from `@shared/testing`.

### `makeConfig`
```ts
function makeConfig(overrides: Partial<Config> = {}): Config
```
`{ ...DEFAULTS, ...overrides }`. Use whenever a unit under test needs a whole `Config` but cares about two
fields.
```ts
const defaultConfig = makeConfig({ dataBranch: 'star-data', notificationThreshold: 0 });
```
(`src/application/tracker.test.ts`)

### `makeRepoInfo`
```ts
function makeRepoInfo(name: string, stars = 10, overrides: Partial<RepoInfo> = {}): RepoInfo
```
Defaults to `owner: 'user'`, `fullName: 'user/<name>'`, `private/archived/fork: false`.
```ts
const repos = [makeRepoInfo('repo-a', 10), makeRepoInfo('repo-b', 20)];
```
(`src/domain/comparison.test.ts`)

### `makeStargazer`
```ts
function makeStargazer(overrides: Partial<Stargazer> = {}): Stargazer
```
Defaults: `starredAt: '2026-01-15T00:00:00Z'`, `login: 'u-<starredAt>'`, empty `avatarUrl` / `profileUrl`.
```ts
stargazers: dates.map((starredAt) => makeStargazer({ starredAt })),
```
(`src/domain/star-history.test.ts`)

### `makeStargazerSeries`
```ts
interface MakeStargazerSeriesParams {
  count: number;
  startMs?: number;   // default Date.UTC(2026, 0, 1)
  stepDays?: number;  // default 1
  prefix?: string;    // default 'u'
}
function makeStargazerSeries(params: MakeStargazerSeriesParams): Stargazer[]
```
`count` stargazers named `<prefix>0…<prefix>N-1`, starred `stepDays` apart starting at `startMs`.
```ts
stargazers: makeStargazerSeries({ count: 30, startMs: Date.UTC(2026, 4, 25) }),
```
(`src/application/tracker.test.ts`)

### `makeSnapshot`
```ts
function makeSnapshot(timestamp: string, totalStars: number, repos: SnapshotRepo[] = []): Snapshot
```
Exported, but currently used only inside this folder (by `makeHistory`).

### `makeMultiRepoSnapshot`
```ts
function makeMultiRepoSnapshot(timestamp: string, repoStars: Record<string, number>): Snapshot
```
Splits each `'owner/name'` key into `owner` / `name` and sums the values into `totalStars`. Exported, but
currently used only inside this folder (by `makeMultiRepoHistory`).

### `makeHistory`
```ts
interface MakeHistoryParams { startMs?: number; stepDays?: number }
function makeHistory(starCounts: number[], params: MakeHistoryParams = {}): History
```
One snapshot per entry of `starCounts`, `stepDays` apart (default `7`) from `startMs`
(default `Date.UTC(2026, 0, 1)`). Every snapshot has `repos: []`.
```ts
const velocityHistory = makeHistory([100, 200], { startMs: Date.UTC(2025, 0, 1), stepDays: 10 });
```
(`src/presentation/markdown.test.ts`)

### `makeMultiRepoHistory`
```ts
function makeMultiRepoHistory(snapshots: Record<string, number>[], params: MakeHistoryParams = {}): History
```
Same spacing rules, but each entry is a `{ 'owner/repo': stars }` map, so the snapshots carry populated
`repos`. Use this for anything that reads per-repo series (charts, forecasts).
```ts
const history = makeMultiRepoHistory([{ 'user/repo-a': 20 }, { 'user/repo-a': 23 }], { stepDays: 1 });
```
(`src/presentation/markdown.test.ts`)

### `makeRepoResult`
```ts
function makeRepoResult(name: string, overrides: Partial<RepoResult> = {}): RepoResult
```
Defaults: `fullName: 'user/<name>'`, `owner: 'user'`, `current: 10`, `previous: 10`, `delta: 0`,
`isNew: false`, `isRemoved: false`.

### `makeComparisonResults`
```ts
function makeComparisonResults(overrides: Partial<ComparisonResults> = {}): ComparisonResults
```
Two repos out of the box (`repo-a` 10→15, `repo-b` 10→8) and a matching summary
(`totalStars: 23`, `totalPrevious: 20`, `totalDelta: 3`, `newStars: 5`, `lostStars: 2`, `changed: true`).
```ts
return makeComparisonResults({
  repos: [
    makeRepoResult('repo-a', { current: 15, previous: 10, delta: 5 }),
    makeRepoResult('repo-b', { current: 8, previous: 10, delta: -2 }),
    makeRepoResult('repo-c', { current: 0, previous: 3, delta: -3, isRemoved: true }),
    makeRepoResult('repo-d', { current: 5, previous: null, delta: 5, isNew: true }),
  ],
  summary: { totalStars: 28, totalPrevious: 23, totalDelta: 5, /* … */ },
});
```
(`src/presentation/shared.test.ts`)

## Invariants & rules
- **All timestamps are UTC ISO-8601 strings** produced by `new Date(ms).toISOString()`. `startMs` is
  epoch milliseconds — pass `Date.UTC(...)`, never `new Date(2026, 0, 1)` (which is local time and makes the
  suite timezone-dependent).
- **`stepDays` is days, and the defaults differ**: `1` in `makeStargazerSeries`, `7`
  (`DEFAULT_HISTORY_STEP_DAYS`) in `makeHistory` / `makeMultiRepoHistory`. Velocity and forecast maths are
  per-day, so a test that changes the spacing changes the expected numbers.
- **Snapshots come out in chronological ascending order**, index 0 oldest. Domain code
  (`getBaselineSnapshot`, `buildStarHistory`, forecasting) relies on that ordering.
- **`makeHistory` snapshots have empty `repos`.** Anything reading per-repo series gets nothing from it;
  reach for `makeMultiRepoHistory` instead.
- **`makeMultiRepoSnapshot` keys must be `owner/name`.** `name` is `fullName.split('/')[1]`, so a bare
  `'repo-a'` key yields `name: undefined` and a broken fixture.
- **`totalStars` is derived, not passed,** in `makeMultiRepoSnapshot` (sum of the map's values); in
  `makeHistory` it is exactly the number you passed.
- **No factory sets `History.starsAtLastNotification`.** Notification-threshold tests must set it explicitly.
- **Overrides are a shallow merge.** `makeComparisonResults({ summary: … })` replaces the whole summary —
  every `Summary` field must be supplied — and does not recompute totals from `repos`. Keeping the two
  consistent is the test's job.
- **`makeStargazer`'s default `login` is derived from `starredAt`**, so two stargazers created for the same
  date collide unless you pass distinct logins.
- **`makeConfig` shares `DEFAULTS`' array instances.** `{ ...DEFAULTS }` is shallow, so `excludeRepos`,
  `onlyRepos`, `excludeOrgs`, `onlyOrgs` and `chartCustomMilestones` are the *same arrays* on every config
  the factory ever returns. Pass a fresh array in `overrides`; never `push` into one.
- **`makeConfig` tracks `Config` automatically** because it spreads `DEFAULTS`. A new config key needs no
  edit here — but it does need one in `@config/defaults` and in `action.yml`.
- Factories are pure and allocate fresh objects per call; they read no clock, no env and no fs.

## Dependencies
May import `@config/defaults` (`DEFAULTS`), `@config/types` (`Config`), `@domain/stargazers` (`Stargazer`)
and `@domain/types` (`ComparisonResults`, `History`, `RepoInfo`, `RepoResult`, `Snapshot`, `SnapshotRepo`).
All but `DEFAULTS` are type-only imports. It must not import `vitest`, `@actions/*`, `node:*`,
`@infrastructure/*`, `@presentation/*` or `@application/*`: this module is loaded by suites across the whole
tree, and a side-effecting import here would leak into all of them.

## Gotchas
- This folder is the sanctioned exception to the **named-params-for-2+-arguments** rule stated in
  [`../../CLAUDE.md`](../../CLAUDE.md): `makeRepoInfo`, `makeSnapshot`, `makeMultiRepoSnapshot`,
  `makeHistory`, `makeMultiRepoHistory` and `makeRepoResult` all take positional arguments — three of them
  in `makeRepoInfo` and `makeSnapshot`, two positional payloads in `makeMultiRepoSnapshot`, and in the rest
  a positional payload followed by an overrides/options object. Follow the existing shape when adding a
  factory; do not "fix" the current ones.
- `src/domain/velocity.test.ts` defines its own local `makeHistory` (taking `{ day, totalStars }` points),
  and `src/presentation/svg-chart.test.ts` its own local `makeSnapshot` / `makeMultiRepoSnapshot`; neither
  file imports `@shared/testing`. Do not assume the name means the shared factory when reading them.
- The default epoch is in 2026 (`DEFAULT_SERIES_START`). Tests that also construct dates by hand must stay in
  the same era or comparisons against the fixture history silently fall outside chart/forecast windows.
- Excluded from coverage (`src/shared/testing/**` in `vitest.config.ts`), so an unused or broken factory will
  not show up as an uncovered-lines failure.

## Testing
No `*.test.ts` in this folder — it has none by design. It is exercised by
`src/application/tracker.test.ts`, `src/domain/comparison.test.ts`, `src/domain/stargazers.test.ts`,
`src/domain/star-history.test.ts`, `src/infrastructure/github/repos.test.ts`,
`src/infrastructure/github/stargazers.test.ts`, `src/presentation/chart.test.ts`,
`src/presentation/html.test.ts`, `src/presentation/markdown.test.ts` and `src/presentation/shared.test.ts`.
After changing a factory default, run the whole suite — the blast radius is every layer:

```
pnpm test
```
