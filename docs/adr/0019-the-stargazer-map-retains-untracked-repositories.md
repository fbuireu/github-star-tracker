# 19. The Stargazer map retains repositories that leave the Tracked Set

Date: 2026-08-18

## Status

Accepted. Extends [ADR 0012](./0012-unreadable-stargazer-lists-keep-their-previous-logins.md), which kept the
previous logins of a Repository whose Stargazer list could not be *read*; this keeps them for a Repository
that was not *observed at all*.

## Context

`buildStargazerMap` used to build `stargazers.json` from the Repositories observed on the current Run, with
two carry-forward branches for Sampled and `incomplete` ones. `writeStargazers` rewrites the file whole, so
any key absent from that build was erased.

A Repository leaves the Tracked Set for reasons that have nothing to do with whether it still exists: it
crosses `min-stars` in the wrong direction, a filter is edited, it spends a day archived, or GitHub's listing
transiently omits it. On its return `diffStargazers` compared its full Stargazer list against nothing and
reported every existing Stargazer as new: the fabricated spike ADR 0012 exists to prevent, reached by a
route ADR 0012 did not cover. A Repository sitting on exactly `min-stars` produces it from a single unstar
followed by a re-star.

Seeding the map from the previous one closes that, and collapses the two carry-forward branches into the
seed. The cost is that **nothing prunes the file**. `pruneCharts` solves precisely this for Charts, so the
asymmetry is deliberate and needs recording.

A grace period, keeping an entry for N Runs after it was last seen, would bound retention. It is not
available: `stargazers.json` is deliberately a flat, unversioned map keyed by Repository full name, chosen so
that no reserved key can collide with the data, so there is nowhere to record a last-seen marker without
changing the on-disk contract for every user.

## Decision

The Stargazer map retains an entry for a Repository that was not observed. Entries are only ever added or
overwritten, never removed by a Run.

## Consequences

- **The file grows monotonically with the number of Repositories ever tracked.** Logins are ~15 bytes each at
  the stored indentation and a Repository can reach the ~40,000 Stargazer ceiling, so a churned Tracked Set
  can accumulate real weight, and `writeStargazers` rewrites the whole file every Run, so each Run commits a
  fresh blob of it to the Data Branch.
- **Untracking a Repository no longer withdraws its published logins.** The remedies
  [`docs/wiki/Known-Limitations.md`](../wiki/Known-Limitations.md) offers for the privacy exposure, keeping the Data Branch in a private
  repository or leaving `track-stargazers` off, are unaffected and remain the supported ones. Removing an
  entry is now a manual edit of `stargazers.json` on the Data Branch.
- **A run that publishes nothing still cannot lose data**, because the seed means a partial or failed
  observation is additive rather than destructive.
- Anyone tempted to reintroduce pruning should note that "not observed this Run" and "gone for good" are
  indistinguishable from inside a single Run, which is the whole reason this decision exists.
