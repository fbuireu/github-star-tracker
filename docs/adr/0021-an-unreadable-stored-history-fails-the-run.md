# 21. An unreadable Stored History fails the Run

Date: 2026-08-21

## Status

Accepted

## Context

`stars-data.json` on the Data Branch is the only thing this action cannot rebuild. The Report, the Charts,
the Badge and the CSV are all derived from a single observation and regenerated every Run; the Stored History
accumulates one Snapshot per Run and exists nowhere else.

The reflexive way to read a file like that is `catch { return { snapshots: [] } }`, and the shape of
[`src/infrastructure/persistence/storage.ts`](../../src/infrastructure/persistence/storage.ts) invites it: `readJsonFile` takes a `fallback`, and both readers
pass one. For `readStargazers` the fallback is the whole answer, because an empty `StargazerMap` is exactly
what "no file yet" means and rebuilding it costs one Run. For `readHistory` the fallback is deliberately
scoped to *absence only*: it covers the first Run, when the file does not exist, and it is never reached by a
file that exists and cannot be read.

The difference matters because the two failures are indistinguishable from inside the Run and the outcomes
are not. A Run that treats a corrupt history as an empty one carries on cheerfully: it publishes a Report
saying every Repository gained its entire Star Count, resets the Notification baseline, writes one Snapshot,
and pushes the result over the file it could not read. The user's history is now gone, the commit that
destroyed it looks like every other commit on the branch, and nothing warned. Recovering it means finding the
last good blob in the Data Branch's history by hand.

Failing instead is loud, recoverable and cheap: the file is still sitting in a git branch the user can open,
edit or delete.

## Decision

**`readHistory` refuses to guess.** Three guards in `src/infrastructure/persistence/storage.ts` turn an
unreadable `stars-data.json` into a failed Run, and each throws its own message naming what it found and what
to do about it:

- **The parse catch in `readJsonFile`** fires when the bytes are not JSON. It names the file and the parser's
  own error, and says to fix or delete the file on that branch and re-run.
- **`assertJsonObject`** fires when the bytes are valid JSON but not an object: an array, `null`, or a bare
  scalar. Its message names what it found and states the reasoning outright, that reading it as an empty
  history would discard the tracking record, so the Run stops instead.
- **`assertReadableFormat`** fires when the file declares a `version` this build cannot read, meaning a number
  above `DATA_FORMAT_VERSION` or anything that is not a number and not absent. It names both versions and
  tells the reader to upgrade the action or point `data-branch` elsewhere. That guard is
  [ADR 0015](./0015-the-stored-history-declares-its-format-version.md); this ADR is why it throws rather than
  falling back.

All three propagate out of `withDataBranch` to `trackStars`, which fails the Action. Nothing is published and
nothing is pushed, so the unreadable file is left exactly as it was.

## Consequences

- **A broken `stars-data.json` blocks every subsequent Run until a human edits the Data Branch.** The action
  cannot self-heal, and there is no input to force it past a guard. That is the accepted cost, and it is
  accepted because the alternative silently discards the one artefact the action cannot rebuild. A user who
  genuinely wants to start over deletes the file, and the absence fallback gives them an empty history on the
  next Run.
- **The remediation text is part of the decision, not decoration.** Each message names the file, the branch,
  what was found and the action to take, because the reader is looking at a red Action log and has no reason
  to know a data branch exists. Shortening one of them to "invalid history" removes the only thing that makes
  loud failure better than silent reset.
- **There is one deliberate exception, and it is not an oversight.** A `snapshots` key that is not an array
  still normalizes quietly to `[]` rather than throwing. The surrounding object is intact in that case, so
  `starsAtLastNotification` is still readable and is spread through untouched; throwing would discard a
  Notification baseline that is perfectly good in order to complain about a sibling key. The rule is that the
  guards protect the *container*, and a single malformed key inside an otherwise sound container is repaired
  rather than fatal.
- **`readStargazers` deliberately does not get the same treatment.** It keeps a plain fallback because
  `stargazers.json` is rebuilt from the API on the next Run, so a silent reset there costs one Run's New
  Stargazer list rather than the whole record. Do not "make the two readers consistent"; the asymmetry is the
  decision.
- Where this bites is recorded in the persistence section of
  [`src/infrastructure/CLAUDE.md`](../../src/infrastructure/CLAUDE.md), and the recovery steps a user needs
  are in [`docs/wiki/Data-Management.md`](../wiki/Data-Management.md).
