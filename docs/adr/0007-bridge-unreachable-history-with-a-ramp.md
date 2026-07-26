# Unreachable star history is bridged with a ramp, not left flat

Reachable Stargazers stop at a fixed ceiling and are listed oldest first, so for a heavily starred Repository the timestamps run out years before today. Drawn literally, such a chart climbs and then goes flat at the cutoff date despite the repository still gaining Stars — which reads as a bug. We scale the reachable portion to the count it genuinely covers and then draw a Ramped Tail from there to the true present-day Star Count.

## Consequences

The recent segment of a large Repository's chart is an admitted approximation rather than observed data, and its shape carries no information — only its endpoints do. The final point is always the exact current Star Count, so the number a reader takes away is correct even where the curve leading to it is invented.

The ramp is triggered whenever coverage fell short of the true Star Count — from the ceiling, but equally from a fetch that was cut short by an error or by Smart Sampling — so a small Repository can get a ramped tail too. A Repository whose Stargazers were fully enumerated is untouched. Someone who notices the straight segment and "fixes" it by removing the ramp will reintroduce the flat-line bug this replaced.
