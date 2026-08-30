# 4. Layered source structure with a pure core

Date: 2026-07-26

## Status

Accepted

## Context

Most Actions of this size are a single file, and that shape was available here. What it gives up is testability: with the star mathematics and the rendering interleaved with the GitHub API, git and SMTP calls that feed them, none of it can be exercised without mocking the world. The structure below is deliberately heavier than the norm for that reason alone.

## Decision

The source is split into layers following **Domain-Driven Design<sub>(ish)</sub>** with a **Functional Core, Imperative Shell** pattern: the star mathematics and all rendering are kept free of I/O, and every cross-layer import goes through a path alias so a violation of the direction is visible at the import line.

There are seven layers, `application`, `config`, `domain`, `i18n`, `infrastructure`, `presentation` and `shared`, plus `assets`, which is not a layer at all but the brand files the README embeds. `index.ts` sits above all of them and calls `trackStars()` at module load.

**Each layer has an explicit set of layers and packages it may import, and everything else is forbidden.** The normative statement of that set is the layer-map table in [`ARCHITECTURE.md`](../../ARCHITECTURE.md); the diagram beside it is the same rules as a picture, and anything the table forbids is forbidden however convenient. This ADR records that the boundaries are enumerated rather than conventional; it does not restate them, because two copies of a dependency table drift.

Purity is the half of the rule that is not a matter of direction: `domain`, `presentation` and `i18n` perform no I/O at all, with no clock beyond an injectable `now`. Each impure layer owns exactly one kind of side effect and no other:

- **`config` reads the action inputs and one YAML file**, and nothing else. That is its whole sanctioned side effect, and it is why `@config` is allowed `@actions/core` and `node:fs` when `presentation` is not.
- **`infrastructure` owns everything outbound**: the GitHub REST API, the `git` CLI, the filesystem under the Data Branch worktree, and SMTP. It is the only layer that reaches the network, which is not the same as being the only layer that does I/O.
- **`application` writes the Action log and the action outputs**, and sequences the run.

`presentation` is permitted to import `@config/types`, which is a type-only edge from a pure layer to an impure one: the shape of `Config` is data, and reading it is not the side effect that makes `config` impure.

### What the `(ish)` means

**Domain-Driven Design applied where it pays, not by the book.** Two of its ideas carry the design and are adopted in full:

- **One ubiquitous language**, recorded in the root [`CONTEXT.md`](../../CONTEXT.md) and used by every layer. Snapshot, Baseline Snapshot, Delta, Tracked Set and Delivery mean the same thing in `domain`, in a chart title and in a log line, and the glossary lists the synonyms each word displaces so a near-miss cannot drift in.
- **A domain layer with no infrastructure in it**, which is the boundary set out above and the whole return on the extra structure.

The rest of the tactical catalogue is taken where it fits and left where it does not, one pattern at a time rather than as a package:

- **Bounded contexts.** None: there is one language and one use case, so a context map would have a single context in it.
- **Aggregates and entity lifecycles.** None, because nothing has a lifecycle to guard. `Snapshot`, `RepoResult` and `History` are each built once per Run by a pure function, out of a JSON file and an HTTP payload, and never updated in place; "nothing mutates a caller's arguments" is already a rule of [`src/domain/CLAUDE.md`](../../src/domain/CLAUDE.md). An aggregate root buys invariant enforcement across mutation, and there is no mutation here to enforce across.
- **Value objects.** Adopted per concept rather than by default. [ADR 0022](./0022-a-concept-earns-a-type-when-it-crosses-a-boundary.md) holds the criterion and the worked cases, including the primitives it decided to leave alone and why.
- **The Repository pattern.** Present in shape: `withDataBranch` in `@infrastructure/persistence` is a single facade over the one store, handing the caller `readHistory`, `readStargazers` and `publish`. What is not taken is the vocabulary and the interface-with-one-implementer that usually travels with it, and `@domain` sees neither, because the layer table does not let it.
- **Domain events.** None. A Run is one ordered sequence with no subscribers, enumerated end to end in the run table of [`ARCHITECTURE.md`](../../ARCHITECTURE.md); an event bus would trade a readable list of steps for indirection and decouple nothing.
- **Application services, factories, specifications.** One use case, `trackStars()`, so a service layer over it would be a naming ceremony.

That list is a record of what was weighed, not a policy against the patterns. A later change that genuinely needs one of them is not blocked by this ADR; it just has to say which of the forces above stopped holding.

## Consequences

- The arithmetic that matters (Delta, Baseline Snapshot selection, Velocity, Forecast, Reconstructed History) and every rendered artefact can be exercised directly on plain values, with no GitHub API, git or SMTP anywhere near the test. That is the whole return on the extra structure.
- The purity of `domain` and `presentation` is load-bearing rather than stylistic: the moment a network call or a filesystem write appears in either, that property is gone and the tests start needing mocks.
- **The per-layer side-effect statement is what other decisions cite.** [ADR 0018](./0018-loadconfig-reads-the-ambient-action-inputs.md) rests on `config`'s side effect being *defined* as reading the ambient inputs, and [ADR 0016](./0016-the-report-renderers-read-config-themselves.md) rests on `presentation` being allowed `@config/types`. Narrowing either here silently invalidates those.
- The cost is navigational. Following one feature end to end means crossing four or five files, and small changes touch more places than they would in a flat layout.
