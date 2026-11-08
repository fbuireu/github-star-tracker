# 1. Star data lives on a dedicated data branch

Date: 2026-07-26

## Status

Accepted

## Context

A GitHub Action gets a fresh workspace on every run, so anything the tracker needs to remember between runs has to be written somewhere durable. Each of the obvious places fails at something this product needs:

- **Workflow artifacts** expire, and have no stable URL, so a Badge or Chart could not be embedded in a README.
- **The default branch** would mix generated data into the code history and re-trigger CI on every Run.
- **An external database or gist** is another service to provision and another credential to manage, on top of the token the action already requires.

## Decision

The Stored History and every published artefact (Report, Charts, Badge) live on a separate branch in the same repository, checked out alongside the code for the duration of a Run. Nothing generated is written to the code branch, and no store outside the repository is involved.

`withDataBranch` in [`src/infrastructure/persistence/data-branch.ts`](../../src/infrastructure/persistence/data-branch.ts) is the only surface that touches that branch. It calls `initializeDataBranch` in [`src/infrastructure/git/worktree.ts`](../../src/infrastructure/git/worktree.ts) to open the worktree, hands the caller a handle over it, and closes it again afterwards; `dataDir` never leaves the layer.

## Consequences

- The branch is unrelated to the code branch and carries its own history, which is expected to be noisy: one commit per Run.
- Because a single branch is the write target, two workflows pointed at the same Data Branch will compete to write it; that is what a Read-Only Run exists to avoid.
- **The loser of that race loses its Snapshot, after it has already published.** `commitAndPush` in [`src/infrastructure/persistence/storage.ts`](../../src/infrastructure/persistence/storage.ts) matches the push failure against `PUSH_REJECTED_PATTERN` and, on a match, throws a message that says the run's snapshot was not recorded and that its report and any email have already gone out. The Run fails at the last step, having sent everything except the one thing it exists to keep. Re-running records it; a `concurrency` group on the workflow, or `read-only` on whichever workflow should not be the writer, stops the race happening at all.
- Raw URLs on this branch are the public interface of the artefacts, so renaming the files on it is a breaking change for anyone embedding them.
