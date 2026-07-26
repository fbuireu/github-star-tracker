# 9. AGPL-3.0-only licence

Date: 2026-07-26

## Status

Accepted.

## Context

The ecosystem norm for a GitHub Action is MIT or Apache-2.0, and the choice is close to irreversible: relicensing would require the agreement of every contributor. The intent is to stop third parties from profiting from the project, and a plain GPL does not reach a hosted derivative that is never distributed.

## Decision

The project is licensed AGPL-3.0-only, chosen over the permissive norm precisely for its network clause.

## Consequences

- Anyone who redistributes a modified version, or offers one as a hosted service over a network, must release their complete corresponding source under the same terms. Derivative works cannot be relicensed under more permissive terms, and combining this code into a proprietary product is not possible.
- Consumers merely *running* the action in their own workflows are unaffected — using it in CI is not distribution and triggers no obligation.
- The cost is contribution reach: some employers restrict staff from contributing to AGPL projects, and some ecosystems and vendors avoid AGPL dependencies by policy.
