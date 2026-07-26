# 7. Unreachable star history is bridged with a ramp, not left flat

Date: 2026-07-26

## Status

Accepted.

## Context

Reachable Stargazers stop at a fixed ceiling and are listed oldest first, so for a heavily starred Repository the timestamps run out years before today. Drawn literally, such a chart climbs and then goes flat at the cutoff date despite the repository still gaining Stars — which reads as a bug.

## Decision

The reachable portion is scaled to the count it genuinely covers, and a Ramped Tail is drawn from there to the true present-day Star Count. The ramp is triggered whenever coverage fell short of the true Star Count — from the ceiling, but equally from a fetch that was cut short by an error or by Smart Sampling (ADR 0008) — so a small Repository can get a ramped tail too. A Repository whose Stargazers were fully enumerated is untouched.

## Consequences

- The recent segment of a large Repository's chart is an admitted approximation rather than observed data, and its shape carries no information — only its endpoints do.
- The final point is always the exact current Star Count, so the number a reader takes away is correct even where the curve leading to it is invented.
- Someone who notices the straight segment and "fixes" it by removing the ramp will reintroduce the flat-line bug this replaced.
