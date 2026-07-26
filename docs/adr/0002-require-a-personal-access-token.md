# 2. Require a Personal Access Token rather than GITHUB_TOKEN

Date: 2026-07-26

## Status

Accepted.

## Context

The tracker enumerates every Repository the authenticated account owns, but the `GITHUB_TOKEN` that GitHub Actions injects automatically is scoped to the triggering repository alone and cannot list anything beyond it. There is no token GitHub issues automatically that can do the job, so the setup friction is not something a better default could remove — the only way around it would be to silently track the triggering repository and call that the product.

## Decision

The action requires a Personal Access Token supplied by the user, and does not fall back to `GITHUB_TOKEN`.

## Consequences

- This is the single largest barrier to adoption: every user must create, store and periodically rotate a token before the action works at all, and an expired token surfaces as a failed run rather than a warning.
- The choice of token also silently decides how much of the product works. Since GitHub restricted the stargazer listing endpoint to repository admins and collaborators, the caller's *role* on each Repository — not its token scopes — determines whether Reconstructed History and New Stargazer detection are available.
- A classic token carries its owner's full role, including implicit admin through organization ownership; a fine-grained token without an explicit grant on a Repository's organization can list that Repository and read its Star Count while still being unable to enumerate its Stargazers. Star Counts, Reports, Badges and Notifications are unaffected either way.
