# 17. Velocity and Forecast read unparseable timestamps differently

Date: 2026-08-17

## Status

Accepted

## Context

Both **Velocity** and **Forecast** turn the Stored History into a series of `(day, value)` points, and both
cross `@domain/growth` to do it. The **Rate Interval** rule — never measure a pair closer together than
`MIN_RATE_INTERVAL_DAYS` — lives there once, so the two cannot disagree about it.

They *do* disagree about what to do when a Snapshot's timestamp does not parse, and the disagreement is
total:

- `calendarDays`, which Forecast uses, checks every timestamp first. If **any one** of them fails to parse it
  abandons real spacing entirely and returns a synthetic weekly cadence — `index * 7` — for **all** points.
- `computeVelocity` builds its own points instead, **dropping** the Snapshots that do not parse, and returns
  `null` outright when the newest one does not parse.

This reads like drift. It is the kind of asymmetry a reviewer finds, calls duplication, and unifies — and
unifying it in either direction produces a wrong number rather than a crash, which is the failure mode this
codebase is least able to detect. That is precisely why it is being written down instead of tidied away.

The two readings are not arbitrary, because the two figures need different things from the x-axis:

- A **Forecast** fits a line through many points and extrapolates its *slope*. What it needs is a plausible
  relative spacing across the whole series; it does not care where the origin is, and a slope is unchanged by
  shifting it. Dropping the unparseable points would leave the surviving ones at their true offsets but
  silently change how many observations the fit saw, and mixing real offsets with dropped ones distorts the
  spacing the fit is measuring. A uniform cadence is a stated approximation that keeps the shape honest, and
  the Forecast is already an admitted extrapolation.
- **Velocity** is a rate: `stars gained ÷ days elapsed`. Its denominator *is* the timestamp difference. A
  synthetic cadence would not approximate that denominator, it would **fabricate** it — a run whose newest
  timestamp is unreadable would report a stars-per-day figure derived from a week that never happened. There
  is no honest number to return, so it returns none.

The alternative considered was giving `growth.ts` one policy and a parameter to select it. That moves the
choice into a signature but does not remove it, and it invites a caller to pass the wrong one — which is the
same class of mistake [ADR 0013](./0013-a-run-is-measured-in-one-place.md) removed by making the wrong order
unreachable rather than documented.

## Decision

The two policies stay different, and each stays inside the module whose figure depends on it.

`calendarDays` in `@domain/growth` keeps the all-or-nothing weekly fallback and is used by `computeForecast`
only. `computeVelocity` keeps building its own points, dropping unparseable Snapshots and returning `null`
when the newest one fails.

What `growth.ts` owns is the rate arithmetic, and only one piece of it is reached by both: Velocity imports
`latestRateInterval`, which carries the Rate Interval minimum, and nothing else. `weightedDailyRate` and
`fitTrend` are Forecast's alone, and `calendarDays` is the day-axis policy this ADR is about. What the module
does **not** own is "how a History becomes a day axis", because that is not one question.

## Consequences

- **A Run can report a Forecast and no Velocity**, from the same History, and that is correct rather than a
  bug. `velocityMetrics` renders nothing while the forecast tables render normally.
- **Do not route `computeVelocity` through `calendarDays`.** It would replace a `null` with a fabricated
  rate, and no test would fail — the numbers would simply become wrong. This is the single most important
  consequence of this ADR.
- **Do not make `calendarDays` drop points instead.** A Forecast fit over a series whose spacing silently
  changed is worse than one over a stated approximation, and the `< 3 snapshots` guard is the only thing
  standing between the fit and a degenerate one.
- `growth.test.ts` and `velocity.test.ts` both exercise the `MIN_RATE_INTERVAL_DAYS` skip, which is
  redundant but harmless: one asserts the shared rule, the other asserts that Velocity crosses it.
- The rule was previously prose in [`src/domain/CLAUDE.md`](../../src/domain/CLAUDE.md) marked "deliberately
  different" with no reason attached. The prose stays; this ADR is the reason it pointed at nothing.
