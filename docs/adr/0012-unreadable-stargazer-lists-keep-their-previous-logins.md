# 12. A repository whose stargazers cannot be read keeps its previously stored logins

Date: 2026-07-26

## Status

Accepted. Amends [ADR 0008](./0008-sampled-repositories-are-excluded-from-stargazer-diffing.md), which had a
Sampled Repository contribute nothing to the remembered Stargazer set; it now keeps its previous logins..

## Context

New Stargazer detection diffs the current login list against the one stored on the Data Branch, and that store is rewritten wholesale on every Run. A Repository whose stargazers came back empty or errored was therefore written as an empty list, so the next successful Run diffed its full list against nothing and reported every existing Stargazer as new — a fabricated spike equal to the Repository's entire stargazer list, on every recovery.

## Decision

Such a Repository keeps whatever logins were last stored for it, and is skipped by the diff rather than compared against a list known to be incomplete. The same rule covers Smart Sampling ([ADR 0008](./0008-sampled-repositories-are-excluded-from-stargazer-diffing.md)) for the same reason, which closes a matching defect: enabling sampling and later disabling it used to produce the identical false spike.

## Consequences

- An entry in the store is no longer guaranteed to reflect the most recent Run — it reflects the most recent Run that could actually read that Repository. Nothing in the file records which, so anything reading it must not assume freshness.
- The sharp edge is permanence. GitHub restricts the stargazer listing endpoint to repository admins and collaborators ([ADR 0002](./0002-require-a-personal-access-token.md)), so a Repository the token cannot read is usually not a transient failure but a standing one. Its entry then freezes at its last good value indefinitely and it will never report a New Stargazer again — quietly, because the per-Run warning naming the Repository is the only signal.
- That is the accepted cost of not fabricating a spike equal to the Repository's entire stargazer list on every recovery.
