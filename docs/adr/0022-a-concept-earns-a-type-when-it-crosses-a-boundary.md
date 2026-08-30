# 22. A concept earns a type when it crosses a boundary

Date: 2026-08-29

## Status

Accepted

## Context

DDD splits cleanly in two here, and only one half is negotiable. The **strategic** half, one ubiquitous
language and a domain that owes nothing to its host, is load-bearing and settled in
[ADR 0004](./0004-layered-source-structure.md). The **tactical** half, the catalogue of value objects,
aggregates, repositories and events, is where the method asks for an abstraction *before the code has earned
it*. Taken on faith it produces boilerplate that ends up hiding the rules it was supposed to protect: a
wrapper per primitive, a parse and an unwrap at every reader, and a rule that is now spread across a type, a
guard and a test instead of stated once where someone will read it.

So the tactical half needs a test of its own, and the question it has to answer keeps coming up during
review: this value is a bare `string` or a bare `number`, should it be a type?

Answering "yes" by reflex is expensive here in a way it is not in a larger codebase. Every layer boundary a
new type crosses is an import the layer table has to allow, a field on the persisted `stars-data.json` or
`stargazers.json` that `DATA_FORMAT_VERSION` then has to account for, and a fixture in
[`src/shared/tests`](../../src/shared/tests) that every test copies from. The action has one use case, so
there is no second consumer to amortise it against. The tree's own history shows what the reflex produces:
`getAdaptiveThreshold`, `getLastSnapshot`, `linearRegression` and `weightedMovingAverage` were all exported
purely so a test could reach them, and their only reader was that test.

Answering "no" by reflex is what left `fetchRepoStargazers` reporting a list truncated at GitHub's page
ceiling as a complete enumeration, and `readStargazers` handing back whatever `JSON.parse` produced under the
`StargazerMap` type until an entry holding a number failed a whole Run inside `diffStargazers`.

[ADR 0004](./0004-layered-source-structure.md) settles the shape at the level of layers, and drops the DDD
tactical patterns one by one with a reason for each. It leaves exactly one of them undecided, because it
cannot be decided once for the whole tree: value objects. This file is that decision, taken per concept.

What was missing was not an opinion. It was a written order of questions, so that two reviews of the same
finding reach the same answer, and so that a finding which was deliberately *not* modelled leaves a trace
instead of being re-raised every six months.

## Decision

**Three questions, asked in order. A concept earns a type only when the answers carry it there.**

1. **Is the illegal state reachable?** A shape the type permits but no code path produces is a guard, not a
   bug. Protect it the cheapest way that turns it into a compile error or a loud failure, and say in the
   commit message that it is a guard, so the next reader does not mistake the test for a reproduction.
2. **Does anyone read it?** Modelling a concept nothing consumes invents a type whose only reader is its own
   test. This tree already deleted four such exports and says so in
   [`src/domain/CLAUDE.md`](../../src/domain/CLAUDE.md).
3. **Does it cross a boundary?** A concept that leaves `@domain`, reaches an action output, is written to the
   Data Branch, or is spelled twice in two dialects has earned a real type. One that lives inside a single
   function has not.

**Three "no" answers mean writing the rule rather than coding it**: a bullet in the folder's `CLAUDE.md`, a
sentence in [CONTEXT.md](../../CONTEXT.md), an assertion in
[`docs-consistency.test.ts`](../docs-consistency.test.ts), or an ADR. A divergence that is *named* is
finished work rather than a debt, and the maintenance contract in [CLAUDE.md](../../CLAUDE.md) is what keeps
the name true.

The rejected alternative is the one this file exists to stop being re-proposed: turning the primitives
`fullName`, `starredAt` and `timestamp` into branded types across the tree. Each of them is genuinely doing
several jobs and each would pass question 3, which is exactly why it is worth recording that they were
weighed and left alone. The worked cases below are that record.

### Worked cases

Every one is real, from this repository, and each names where it ended up.

**Fixed, because all three answers were yes: a stargazer fetch stopped by the page ceiling.**
`fetchRepoStargazers` ends either on a page shorter than `STARGAZER_PAGE_SIZE` or on exhausting
`MAX_REACHABLE_PAGE`, and it reported both as a clean enumeration. Reachable on any repository above 40,000
Stars, which is the number `MAX_REACHABLE_STARGAZERS` is named after. Read by `diffStargazers` and
`buildStargazerMap`. Crosses into the Data Branch. The concept already had a name, `incomplete`; the fetch
was simply not setting it. The user-facing half is in
[Known Limitations](../wiki/Known-Limitations.md).

**Fixed as a guard, because question 1 was no: a malformed `stargazers.json` entry.** Nothing this action
writes produces `{"user/repo": 5}`, so the way in is a hand-edited Data Branch, which
[ADR 0021](./0021-an-unreadable-stored-history-fails-the-run.md) expects a user to do. But the outcome was a
`TypeError` out of `new Set(5)` that failed the Run, which is neither of the two behaviours that ADR weighs.
`readStargazers` now applies the container rule ADR 0021 already states for `readHistory`. No new type: the
repair is six lines in the reader.

**Fixed as a guard, because question 3 was no: the first-run flag.** `buildReportModel` recovered
`isFirstRun` by comparing the rendered baseline date against the locale bundle's `report.firstRun` label. It
does not cross a layer, is not persisted, and no Snapshot timestamp can collide with any of the four labels.
So no `FirstRun` value object; `prepareReportData` returns the boolean beside the string it already derives
from the same input, and the illegal state stops being representable.

**Rejected: a `Timestamp` type for `starredAt`.** It is compared with `localeCompare` in `diffStargazers`
and parsed with `toEpochMs` in `buildStarHistory`, so the same primitive is read two ways. Question 3 says
yes, and a branded type would still have to be unwrapped at both readers. The rule is already named where a
reader meets it: the stargazer-diffing section of `src/domain/CLAUDE.md` states that the sort is correct
only while every value is a same-format ISO string, and the `github/` section of
[`src/infrastructure/CLAUDE.md`](../../src/infrastructure/CLAUDE.md) states that the layer never parses or
normalizes it. Two sentences beat a type that crosses five layers.

**Rejected: a `RepoFullName` type.** `fullName` is a `Map` key in `compareStars`, split on `/` for a removed
repository's owner, split again for the comparison chart's short labels, interpolated into GitHub URLs by
both report dialects, and turned into a filename by `perRepoChartFile`. Five jobs, and it is persisted in
every Snapshot. It passes all three questions, and it was still rejected: each of its hazards is already
named at the place it bites, `perRepoChartFile` replacing only the first `/` and `compareStars` resolving
duplicate keys last-wins, and a type would have prevented neither. It would, however, appear in `Snapshot`,
`SnapshotRepo`, `RepoInfo`, `RepoResult` and `StargazerMap`, and so in the persisted format and its version.
Revisit it only alongside a `DATA_FORMAT_VERSION` bump that is happening anyway.

**Rejected: unifying the two chart style projections.** `charts.ts` and `emailChartStyle` both project
`Config` onto an adapter style, and six options appear in both. The parity a shared type would assert is
false, which [ADR 0014](./0014-charts-are-built-as-a-spec-and-rendered-by-adapters.md) and
[`src/presentation/CLAUDE.md`](../../src/presentation/CLAUDE.md) both already say: `chart.ts` collapses two
curves onto one, reads `emailTheme` rather than `chartTheme`, and never receives `maxPoints`. The drift is
guarded instead by a test that renders a run twice per shared option, which is the written rule doing the
work a type would do badly.

**Rejected: importing `MS_PER_DAY` into the fixtures.** [`src/shared/tests`](../../src/shared/tests)
redeclares the constant `@domain/constants` owns. The layer table allows `@shared` only a type-only import
from `@domain`, so the obvious fix is the thing the boundary forbids, and the duplicate is one line of
arithmetic that cannot drift silently, because every fixture asserting a date would move with it. Left as it
is, and named here so it is not re-raised as an oversight.

## Consequences

- **A finding closed by a written rule is closed.** Reopening one means showing that an answer to one of the
  three questions changed, not that the primitive still looks untyped. The `starredAt`, `fullName`, chart
  style and `MS_PER_DAY` cases above are closed on that basis.
- **The commit message has to say which answer applied.** "This is a guard" is load-bearing: it tells the
  next reader that the accompanying test constructs an unreachable state deliberately, so they do not go
  looking for the user report behind it. A guard whose commit does not say so reads as a fixed bug and
  attracts a second, redundant fix later.
- **This makes some real defects slower to reach.** Question 1 asks for a reachability argument before any
  code moves, and a wrong "not reachable" leaves a live bug in place. The page-ceiling case is exactly that
  shape: it looked like a guard until the direction of GitHub's pagination made it reachable on every Run
  for the repositories the feature exists for. When the argument is not conclusive, treat it as reachable.
- **It does not license leaving primitives untyped by default.** All three questions have to fail. A concept
  that reaches an action output or the Data Branch has already answered the third one.
- **Where it bites:** the *Conventions* section of [CLAUDE.md](../../CLAUDE.md) points here, and each
  rejected case above is also named in the folder guide that owns it, so a reader meets the rule before they
  meet this file.
