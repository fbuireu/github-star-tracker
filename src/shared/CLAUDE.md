# src/shared

The escape hatch for code every layer may reach for but that is not domain logic, configuration, rendering or
I/O. It is deliberately almost empty: putting something here is a statement that no layer owns it, and that
claim is usually wrong. Today it holds only `tests/`, a barrel of fixture factories.

**Anything added here needs a reason why no existing layer owns it.** Formatting goes to
`@domain/formatting`, config parsing to `@config/parsers`, rendering primitives to `@presentation/shared`,
and git, fs or HTTP to `@infrastructure`. If one of those fits, use it. In particular, `shared` must never
accumulate domain logic: a helper that reasons about stars, snapshots, deltas, forecasts or dates-as-business-data
belongs in `@domain`.

## tests/

Ten pure factories, all exported from [`src/shared/tests/index.ts`](./tests/index.ts): `makeConfig`, `makeRepoInfo`,
`makeStargazer`, `makeStargazerSeries`, `makeSnapshot`, `makeHistory`, `makeMultiRepoSnapshot`,
`makeMultiRepoHistory`, `makeRepoResult` and `makeComparisonResults`. Each builds a value with sensible
defaults so a test only spells out the fields it actually asserts on. No assertions, no mocks, no `vi.*`
helpers, no setup; mocking stays in the test files that need it. Nothing outside a `*.test.ts` may import it.

- **All timestamps are UTC ISO-8601 strings.** `startMs` is epoch milliseconds, so pass `Date.UTC(...)` and
  never `new Date(2026, 0, 1)`, which is local time and makes the suite timezone-dependent. The default epoch
  is in 2026; tests that also build dates by hand must stay in the same era or comparisons silently fall
  outside chart and forecast windows.
- **`stepDays` defaults differ**: 1 in `makeStargazerSeries`, 7 in `makeHistory` and `makeMultiRepoHistory`.
  Velocity and forecast maths are per-day, so changing the spacing changes the expected numbers.
- **Snapshots come out chronologically ascending**, index 0 oldest, which is what the domain layer assumes.
- **`makeHistory` snapshots have empty `repos`.** Anything reading per-repo series gets nothing from it; reach
  for `makeMultiRepoHistory` instead. Its keys must be `owner/name`, since `name` is taken from the second
  segment: a bare `'repo-a'` key yields `name: undefined` and a broken fixture.
- **Overrides are a shallow merge.** Replacing `summary` replaces the whole object, so every field must be
  supplied, and nothing is recomputed from `repos`. Keeping the two consistent is the test's job.
- **`makeConfig` shares `DEFAULTS`' array instances.** The spread is shallow, so the list fields are the
  *same arrays* on every config the factory ever returns. Pass a fresh array in the overrides; never `push`
  into one. It does track `Config` automatically, so a new key needs no edit here, only in `@config/defaults`
  and [`action.yml`](../../action.yml).
- **No factory sets `History.starsAtLastNotification`.** Notification-threshold tests must set it explicitly.
- The default stargazer `login` is derived from `starredAt`, so two stargazers built for the same date collide
  unless you pass distinct logins.

## Gotchas

- This folder is the sanctioned exception to the **named-params-for-2+-arguments** rule, but only partly:
  some factories take up to three positional arguments, while the rest already take a destructured params or
  options object. Follow the shape of the factory you are extending; do not "fix" the positional ones.
- **Some test files define their own local factories** with the same names but different signatures:
  [`velocity.test.ts`](../domain/velocity.test.ts) has its own `makeHistory` and [`svg-chart.test.ts`](../presentation/svg-chart.test.ts) its own `makeSnapshot` /
  `makeMultiRepoSnapshot`. Neither imports `@shared/tests`, so do not assume the name means the shared
  factory.
- `src/shared/tests/**` is excluded from coverage, so a broken or unused factory shows up as failing
  assertions elsewhere, never as an uncovered-lines failure. After changing a default, run the whole suite:
  the blast radius is every layer.
- Nothing in `shared` may import `@application/*`, `@infrastructure/*` or `@presentation/*`. It sits below
  them, and a side-effecting import here would leak into every suite that loads a factory.
