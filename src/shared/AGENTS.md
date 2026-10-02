# src/shared

The escape hatch for code that more than one layer, or two `@infrastructure` adapters, needs and that is not
domain logic, configuration, rendering or I/O. It holds [`errors.ts`](./errors.ts) and `tests/`, a barrel of
fixture factories.

## errors.ts

Three exports. `errorMessage(error: unknown): string` reads `message` through a `zod/mini` schema only when it
is a non-blank string and returns `String(error)` otherwise, so an `Error` with a blank message reads `Error`
and `undefined` reads `undefined`; an object with no prototype, which `String()` cannot convert, reads by its tag
(`[object Object]`), so the `catch` in `trackStars` that calls it can never throw itself. It lives here because no layer owns it: its callers are
`@application/tracker`, `@config/loader` and `@infrastructure/persistence/storage`, and `config` may not import
`infrastructure`, so there is no lower layer they all share.

`describeIssue(issue)` turns a schema issue into its path and what was found there,
`snapshots[3].repos[0].stars (expected number, found "7")`, and `describeFound(value)` names a found value the
same way (`an array`, `an object`, `nothing`, or the JSON of anything else), which the stored-history messages
for the root and the `snapshots` key read directly. Their callers are `@infrastructure/persistence/storage` and
`@infrastructure/github`: one layer, but two adapters that may not import each other
([`src/infrastructure/`](../infrastructure/AGENTS.md)), so no adapter holds them and both word a rejected
value alike. `zod` records the value an issue found only under `safeParse(value, { reportInput: true })`, and
without it `describeIssue` reads `found nothing` for every issue.

- [`describeFetchError`](../infrastructure/github/errors.ts) prefixes an octokit `status` and treats a blank
  message as *absent*, so a status-only failure reads `HTTP 500` rather than `HTTP 500 Error`; `errorMessage`
  has no status to fall back on, so a blank message becomes `String(error)`. Folding one into the other breaks
  `describeFetchError`'s tests.

## tests/

Pure factories, all exported from [`src/shared/tests/index.ts`](./tests/index.ts): `makeConfig`, `makeRepoInfo`,
`makeStargazer`, `makeStargazerSeries`, `makeSnapshot`, `makeHistory`, `makeMultiRepoSnapshot`,
`makeMultiRepoHistory`, `makeRepoResult` and `makeComparisonResults`. Each builds a value with sensible
defaults so a test only spells out the fields it actually asserts on; mocking stays in the test files that
need it.

- **All timestamps are UTC ISO-8601 strings**, and `startMs` is epoch milliseconds (`Date.UTC(...)`). The
  default epoch is in 2026; tests that also build dates by hand must stay in the same era or comparisons
  silently fall outside chart and forecast windows.
- `stepDays` defaults differ: 1 in `makeStargazerSeries`, 7 in `makeHistory` and `makeMultiRepoHistory`.
  Velocity and forecast maths are per-day, so changing the spacing changes the expected numbers.
- Snapshots come out chronologically ascending, index 0 oldest, which is what the domain layer assumes.
- `makeHistory` snapshots have empty `repos`. Anything reading per-repo series gets nothing from it; reach
  for `makeMultiRepoHistory` instead. Its keys must be `owner/name`, since `name` is taken from the second
  segment: a bare `'repo-a'` key yields `name: undefined` and a broken fixture.
- Overrides are a shallow merge. Replacing `summary` replaces the whole object, so every field must be
  supplied, and nothing is recomputed from `repos`. Keeping the two consistent is the test's job.
- `makeConfig` shares `DEFAULTS`' array instances. The spread is shallow, so the list fields are the
  *same arrays* on every config the factory ever returns. It follows `Config` through `DEFAULTS`, so a new
  key needs no edit here.
- **No factory sets `History.starsAtLastNotification`.** Notification-threshold tests must set it explicitly.
- The default stargazer `login` is derived from `starredAt`, so two stargazers built for the same date collide
  unless you pass distinct logins.

## Gotchas

- Every factory takes one argument: either a destructured `Make*Params` object, as in
  `makeHistory({ starCounts, startMs, stepDays })` and `makeMultiRepoHistory({ snapshots, stepDays })`, or a
  single `overrides` object (`makeConfig`, `makeStargazer`, `makeComparisonResults`).
- Three test files define local factories under the shared names: `makeHistory` in
  [`velocity.test.ts`](../domain/velocity.test.ts) and [`growth.test.ts`](../domain/growth.test.ts), and `makeSnapshot`, `makeHistory`,
  `makeMultiRepoSnapshot` and `makeMultiRepoHistory` in [`svg-chart.test.ts`](../presentation/svg-chart.test.ts). None imports
  `@shared/tests`, and all but that `makeMultiRepoSnapshot` differ from the shared factory in signature or
  defaults, so do not assume the name means the shared factory.
- `src/shared/tests/**` is excluded from coverage, so a broken factory shows up as failing assertions
  elsewhere, never as an uncovered-lines failure, and an unused one shows up nowhere. After changing a
  default, run the whole suite: the blast radius crosses layers.
- `tests/index.ts` redeclares `MS_PER_DAY` rather than importing it, because `shared` may import `@domain` for
  types only ([ADR 0022](../../docs/adr/0022-a-concept-earns-a-type-when-it-crosses-a-boundary.md)).
