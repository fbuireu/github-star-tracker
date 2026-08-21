# 8. Sampled repositories are excluded from stargazer diffing

Date: 2026-07-26

## Status

Accepted. Amended by [ADR 0012](./0012-unreadable-stargazer-lists-keep-their-previous-logins.md): this ADR
originally had a Sampled Repository contribute *nothing* to the remembered set, which meant its stored logins
were dropped and every one of them resurfaced as new on the next unsampled Run. What happens to those stored
logins is now 0012's decision, not this one's.

## Context

Smart Sampling reads a spread of a Repository's Stargazers rather than all of them, so a Stargazer's absence from the sample says nothing about whether they are new. Diffing a sample against a previous observation would manufacture New Stargazers out of sampling gaps.

## Decision

A Sampled Repository is skipped by New Stargazer detection entirely. It still gets a Reconstructed History and a Chart, because the sample is adequate for a curve, just not for identity. What it loses is the New Stargazer list.

What happens to the entry already stored for it is decided by
[ADR 0012](./0012-unreadable-stargazer-lists-keep-their-previous-logins.md), which covers sampling as one
case of a list that cannot be trusted: it keeps its previous logins rather than being rewritten from the
sample. That rule lives there and is not restated here.

## Consequences

- This is a silent, per-Repository degradation triggered by a global setting: enabling Smart Sampling switches off New Stargazer reporting for precisely the busiest repositories, which are the ones most likely to have gained Stars and the ones a reader would most expect to see listed.
- Reports name the affected repositories rather than quietly omitting them. That reporting is load-bearing: it is the only thing standing between this decision and a silent data-quality bug.
