# 13. A Run is measured in one place

Date: 2026-08-14

## Status

Accepted

## Context

Turning one observation into a Run's figures took five pure functions called in one exact order:
`getBaselineSnapshot` resolved the Comparison Window, `compareStars` diffed against it, `createSnapshot`
recorded the result, `addSnapshot` appended it, and `shouldNotify` decided whether the Notification Threshold
was cleared. Each was individually testable and individually harmless. The order was not.

Six rules held them together and none of them was expressible in a signature. `compareStars` had to receive
the *Baseline Snapshot*, not the newest one. `createSnapshot` had to receive the *same* repository array
`compareStars` was given, or the appended Snapshot's total and its repositories disagreed. `addSnapshot` had
to receive the *stored* History, not the updated one. `shouldNotify` had to read `starsAtLastNotification`
from the **pre-append** History, because that is what makes the Notification Threshold accumulate across
Runs. And `addSnapshot` silently keeps the whole array when `maxHistory` is `0`, which is why `@config`
rejects a non-positive `max-history` a layer away.

All six lived as prose in two `CLAUDE.md` files. `@application/tracker` was the only caller, so nothing ever
diverged — but nothing prevented it either, and the failure mode is a wrong Star Count rather than a crash.
Its test mocked all five functions, so it asserted the call sequence it was itself defining: a reordering
would have changed the numbers and kept the suite green.

Leaving the five exported and documenting the order harder was the obvious alternative. It had already been
tried; the prose is what exists today, and it did not stop the ordering from being invisible at the call
site.

## Decision

`measureRun` in `@domain/measurement` is the only way to measure a Run. It takes the Tracked Set, the Stored
History, the Comparison Window, `maxHistory` and the Notification Threshold and Mode, and returns the
Baseline's timestamp, the comparison results, the Summary, the appended History, how many Snapshots the
`max-history` trim dropped, and whether the threshold was reached.

The five functions it composes stay exported from their own modules and keep their own tests — they are
internal seams within `@domain`, not a surface `@application` crosses. What changed is that no caller can
reach them in the wrong order, because no caller reaches them at all.

The rejected alternative is folding the Notification baseline advance into `measureRun`. It must stay out:
the baseline advances only on delivery ([ADR 0011](./0011-the-notification-baseline-advances-only-on-delivery.md)),
and delivery happens in `@application` after the email is sent. `measureRun` therefore reports
`thresholdReached` and never writes `starsAtLastNotification`. `recordNotification` is the separate,
explicit step that advances it, and it returns a new History rather than mutating the one it was given. It
lives in `@domain/notification` alongside `settleNotification`, which is what decides *whether* to call it —
`measureRun` cannot import it without a cycle, and that is the right shape: measuring and notifying are two
acts, not one.

## Consequences

- **`measureRun` must stay free of the delivery decision.** It returns `thresholdReached`, not `notify`:
  `@application` combines it with `summary.changed` and with whether the send succeeded. Folding either in
  breaks [ADR 0011](./0011-the-notification-baseline-advances-only-on-delivery.md) and silently consumes an
  accumulated threshold on a courtesy send.
- **`droppedSnapshots` is reported, not logged.** The domain layer is pure and cannot warn; `@application`
  raises the `max-history` warning from that number.
- **The ordering rules are now tested against the real implementation**, in `measurement.test.ts`, rather
  than asserted as a call sequence against mocks. `tracker.test.ts` mocks one module where it used to mock
  three, and its remaining assertions are about wiring rather than about arithmetic.
- **The cost is one more indirection** between `@application` and the comparison maths, and a
  `RunMeasurement` shape that has to grow whenever a Run needs to report something new. That is the trade:
  a wider return type in exchange for an order that cannot be got wrong.
- The invariants this replaces are recorded in [`src/domain/CLAUDE.md`](../../src/domain/CLAUDE.md) and
  [`src/application/CLAUDE.md`](../../src/application/CLAUDE.md); the run sequence is the table in
  [`ARCHITECTURE.md`](../../ARCHITECTURE.md).
