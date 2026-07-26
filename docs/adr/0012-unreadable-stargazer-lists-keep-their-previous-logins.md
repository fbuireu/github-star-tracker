# A repository whose stargazers cannot be read keeps its previously stored logins

New Stargazer detection diffs the current login list against the one stored on the Data Branch, and that store is rewritten wholesale on every Run. A Repository whose stargazers came back empty or errored therefore used to be written as an empty list, so the next successful Run diffed its full list against nothing and reported every existing Stargazer as new. Such a Repository now keeps whatever logins were last stored for it, and is skipped by the diff rather than compared against a list known to be incomplete.

## Consequences

An entry in the store is no longer guaranteed to reflect the most recent Run — it reflects the most recent Run that could actually read that Repository. Nothing in the file records which, so anything reading it must not assume freshness.

The sharp edge is permanence. GitHub restricts the stargazer listing endpoint to repository admins and collaborators, so a Repository the token cannot read is usually not a transient failure but a standing one. Its entry then freezes at its last good value indefinitely, and it will never report a New Stargazer again — quietly, because the per-Run warning naming the Repository is the only signal. That is the accepted cost of not fabricating a spike equal to the Repository's entire stargazer list on every recovery.

The same rule covers Smart Sampling for the same reason, which closes a matching defect: enabling sampling and later disabling it used to produce the identical false spike.
