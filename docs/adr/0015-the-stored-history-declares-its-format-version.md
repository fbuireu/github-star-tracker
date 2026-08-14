# 15. The Stored History declares its format version

Date: 2026-08-15

## Status

Accepted

## Context

The Stored History is the only thing this action cannot rebuild. Everything else it publishes — the Report,
the Charts, the Badge, the CSV — is derived from one observation and regenerated on every Run. `stars-data.json`
is different: it accumulates one Snapshot per Run, up to `max-history`, and it lives on a branch inside the
**user's** repository. There is no migration step a release can run on their behalf, and no way to reach the
data at all.

Until now the file carried no marker saying what wrote it. `readHistory` checked two things: that the bytes
parse as JSON, and that `snapshots` is an array. Both are shape checks, not version checks, and the gap
between them is where the danger sits. Malformed JSON is caught and made fatal on purpose
([ADR 0001](./0001-star-data-lives-on-a-dedicated-data-branch.md) put the data on a branch precisely so it
would be diffable and recoverable, and silently resetting a user's tracking record is the one failure worth
being loud about). But a file written by a *different* version of this action would still be valid JSON and
would still have an array of `snapshots`. Renaming `totalStars`, or turning `repos` into a map, would make
every stored Snapshot read as `undefined` — the Report would show wrong totals, the Charts would flatten, and
nothing would raise a word. The tracker would confidently publish nonsense.

The alternative is to promise the shape never changes, which is roughly the position the code was in by
default. That promise is cheap to make and impossible to keep quietly: the moment someone does change it, the
cost lands on users as silent corruption rather than as an error. The second alternative — version the file
later, when the shape actually changes — does not work, because by then "no version field" is ambiguous
between *old format* and *this format*. A version marker is only unambiguous if it exists **before** the first
format change.

## Decision

`stars-data.json` carries a top-level `version` number, and `@infrastructure/persistence/storage` owns it
end to end.

`writeHistory` stamps `DATA_FORMAT_VERSION` as the first key on every write. `readHistory` reads it,
hands it to `assertReadableFormat`, and strips it before returning, so the `History` the domain sees is
unchanged and `@domain` stays unaware that a file format exists at all.

`assertReadableFormat` accepts exactly two things: **absent**, which means a file written before this ADR and
is therefore version 1, and a **number at or below** `DATA_FORMAT_VERSION`. Anything else — a higher number, a
string, `null` — throws with remediation text naming the version it found. Reading forward is refused rather
than attempted, because a newer writer is the one case where guessing would produce the silent nonsense this
ADR exists to prevent.

`stargazers.json` is deliberately **not** versioned. It is a flat map keyed by Repository full name, so a
reserved top-level key would collide with the data; it is also rewritten wholesale each Run and carries no
history, so a shape change there can be handled by changing the filename instead.

## Consequences

- **`DATA_FORMAT_VERSION` must be incremented in the same commit as any change to the shape of `History`,
  `Snapshot` or `SnapshotRepo`.** That is the whole point of the field, and it is the one thing nothing can
  check automatically — the shape lives in `@domain/types` and the version lives in `@infrastructure`, and
  that split is deliberate, because the domain must not own a persistence concern.
- **Absent means version 1, permanently.** Every data branch in existence predates this field, so the absent
  case can never be repurposed to mean anything else.
- **A forward-incompatible file fails the Run rather than degrading it.** A user who downgrades the action
  after a format bump gets an error naming both versions, not a report full of zeroes. The cost is that
  pinning an older major version against a newer data branch stops working, which is the honest outcome.
- Every user's `stars-data.json` gains one line on its next Run. The 2-space, no-trailing-newline formatting
  is otherwise untouched, so the diff is a single added key rather than a rewritten file.
- This does **not** make the format evolvable — there is still no migration path, and writing one would mean
  reading an old shape and rewriting it, which nothing does today. It makes the format's evolution *detectable*,
  which is the prerequisite.
- Where it bites is recorded in the persistence section of
  [`src/infrastructure/CLAUDE.md`](../../src/infrastructure/CLAUDE.md), and the field is shown in the file
  examples in [`docs/wiki/Data-Management.md`](../wiki/Data-Management.md) and
  [`docs/wiki/API-Reference.md`](../wiki/API-Reference.md).
