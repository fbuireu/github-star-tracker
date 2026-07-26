# 5. Charts are reconstructed from stargazer timestamps, not from stored snapshots

Date: 2026-07-26

## Status

Accepted.

## Context

Stored History only begins on the day a user installs the action, so charts built from it opened as a flat line and stayed nearly empty for weeks — the least impressive possible first impression for a star tracker. The data that would fill them in exists, but only behind the stargazer listing endpoint, which is permission-sensitive, rate-limit-intensive and cannot enumerate past a fixed ceiling.

## Decision

Charts are built from a Reconstructed History derived from when each Stargazer actually starred, which yields the repository's full curve on the very first Run. When that source yields too little to work with, charts fall back to the Stored History.

## Consequences

- Charts depend on a completely different data source from the rest of the product, with its own failure modes. A chart being sparse is therefore a symptom to diagnose at the API level, not in the rendering code.
- The non-obvious consequence is on cost. Because charts are on by default, Stargazers are fetched on virtually every Run, not only when New Stargazer tracking is explicitly enabled. The stargazer API budget applies to almost every user, and switching charts off is the only way to avoid it entirely.
- Reconstructed History is rebuilt from scratch on every Run and never stored, so a Run during an API outage degrades that Run's charts only, and the next healthy Run repairs them.
