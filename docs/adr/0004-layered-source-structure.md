# Domain-Driven Design(ish) layering with a pure core

The source is split into layers — domain, config, infrastructure, presentation, application — following **Domain-Driven Design<sub>(ish)</sub>** with a **Functional Core, Imperative Shell** pattern: the star mathematics and all rendering are kept free of I/O, and every cross-layer import goes through a path alias so a violation of the direction is visible at the import line. This is deliberately heavier than the single-file shape most Actions of this size use.

The `(ish)` is deliberate. These are layers that share a single vocabulary, not DDD bounded contexts — there is one ubiquitous language across the whole tree, recorded in the root `CONTEXT.md`. Adopting the tactical patterns (aggregates, repositories, domain events) was never the intent.

## Consequences

The arithmetic that matters — Delta, Baseline Snapshot selection, Velocity, Forecast, Reconstructed History — and every rendered artefact can be exercised directly on plain values, with no GitHub API, git or SMTP anywhere near the test. That is the whole return on the extra structure, and it is why the layering is worth defending: the moment a network call or a filesystem write appears in the domain or presentation layers, that property is gone and the tests start needing mocks.

The cost is navigational. Following one feature end to end means crossing four or five files, and small changes touch more places than they would in a flat layout.
