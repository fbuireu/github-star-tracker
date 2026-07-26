# 4. Domain-Driven Design(ish) layering with a pure core

Date: 2026-07-26

## Status

Accepted.

## Context

Most Actions of this size are a single file, and that shape was available here. What it gives up is testability: with the star mathematics and the rendering interleaved with the GitHub API, git and SMTP calls that feed them, none of it can be exercised without mocking the world. The structure below is deliberately heavier than the norm for that reason alone.

## Decision

The source is split into layers — domain, config, infrastructure, presentation, application — following **Domain-Driven Design<sub>(ish)</sub>** with a **Functional Core, Imperative Shell** pattern: the star mathematics and all rendering are kept free of I/O, and every cross-layer import goes through a path alias so a violation of the direction is visible at the import line.

The `(ish)` is deliberate. These are layers that share a single vocabulary, not DDD bounded contexts — there is one ubiquitous language across the whole tree, recorded in the root [`CONTEXT.md`](../../CONTEXT.md). Adopting the tactical patterns (aggregates, repositories, domain events) was never the intent.

## Consequences

- The arithmetic that matters — Delta, Baseline Snapshot selection, Velocity, Forecast, Reconstructed History — and every rendered artefact can be exercised directly on plain values, with no GitHub API, git or SMTP anywhere near the test. That is the whole return on the extra structure.
- The purity of `domain` and `presentation` is load-bearing rather than stylistic: the moment a network call or a filesystem write appears in either, that property is gone and the tests start needing mocks.
- The cost is navigational. Following one feature end to end means crossing four or five files, and small changes touch more places than they would in a flat layout.
