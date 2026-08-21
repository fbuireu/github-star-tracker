# 12. A repository whose stargazers cannot be read keeps its previously stored logins

Date: 2026-07-26

## Status

Accepted. Amends [ADR 0008](./0008-sampled-repositories-are-excluded-from-stargazer-diffing.md), which had a
Sampled Repository contribute nothing to the remembered Stargazer set. This ADR is the single home for the
carry-forward rule: an untrustworthy list keeps its previous logins, and sampling is one case of that.
Extended by [ADR 0019](./0019-the-stargazer-map-retains-untracked-repositories.md) to a Repository that was
not observed at all.

## Context

New Stargazer detection diffs the current login list against the one stored on the Data Branch, and that store is rewritten wholesale on every Run. A Repository whose stargazers came back empty or errored was therefore written as an empty list, so the next successful Run diffed its full list against nothing and reported every existing Stargazer as new: a fabricated spike equal to the Repository's entire stargazer list, on every recovery.

Smart Sampling produced the identical defect by a different route. A sample is not a failure, but it is equally untrustworthy as an identity list, and [ADR 0008](./0008-sampled-repositories-are-excluded-from-stargazer-diffing.md) had already established that it must not be diffed. What it had not settled was what to store, and storing the sample meant enabling sampling and later disabling it produced the same false spike.

## Decision

**A Repository whose current Stargazer list cannot be trusted keeps whatever logins were last stored for it, and is skipped by the diff rather than compared against a list known to be incomplete.**

"Cannot be trusted" is carried on a `RepoStargazers` as two flags, and `diffStargazers` and
`buildStargazerMap` in `src/domain/stargazers.ts` both skip a Repository carrying either. `sampled` marks a
Repository read by Smart Sampling ([ADR 0008](./0008-sampled-repositories-are-excluded-from-stargazer-diffing.md)).
`incomplete` marks the three ways a full read can fail to be one: the fetch threw, the fetch was truncated at
the reachable ceiling, or it returned no Stargazers for a Repository that has Stars. One rule, not four:
`buildStargazerMap` seeds itself from the previous map and only overwrites the entries it read in full.

## Consequences

- An entry in the store is no longer guaranteed to reflect the most recent Run. It reflects the most recent Run that could actually read that Repository, and nothing in the file records which, so anything reading it must not assume freshness.
- The sharp edge is permanence. GitHub restricts the stargazer listing endpoint to repository admins and collaborators ([ADR 0002](./0002-require-a-personal-access-token.md)), so a Repository the token cannot read is usually not a transient failure but a standing one. Its entry then freezes at its last good value indefinitely and it will never report a New Stargazer again, quietly, because the per-Run warning naming the Repository is the only signal.
- That is the accepted cost of not fabricating a spike equal to the Repository's entire stargazer list on every recovery.
