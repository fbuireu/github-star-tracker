# 1. Star data lives on a dedicated data branch

Date: 2026-07-26

## Status

Accepted.

## Context

A GitHub Action gets a fresh workspace on every run, so anything the tracker needs to remember between runs has to be written somewhere durable. Each of the obvious places fails at something this product needs:

- **Workflow artifacts** — expire, and have no stable URL, so a Badge or Chart could not be embedded in a README.
- **The default branch** — would mix generated data into the code history and re-trigger CI on every Run.
- **An external database or gist** — another service to provision and another credential to manage, on top of the token the action already requires.

## Decision

The Stored History and every published artefact — Report, Charts, Badge — live on a separate branch in the same repository, checked out alongside the code for the duration of a Run. Nothing generated is written to the code branch, and no store outside the repository is involved.

## Consequences

- The branch is unrelated to the code branch and carries its own history, which is expected to be noisy — one commit per Run.
- Because a single branch is the write target, two workflows pointed at the same Data Branch will compete to write it; that is what a Read-Only Run exists to avoid.
- Raw URLs on this branch are the public interface of the artefacts, so renaming the files on it is a breaking change for anyone embedding them.
