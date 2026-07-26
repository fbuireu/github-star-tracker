# 11. The notification baseline advances only when a notification was actually delivered

Date: 2026-07-26

## Status

Accepted.

## Context

The Notification Threshold accumulates against a star total stored on the Data Branch, and that baseline used to move as soon as the threshold was crossed — before the email was handed to the SMTP server. A failed send was logged as a warning and the run continued, so the accumulated change had already been reset and was never retried: with a threshold of 500, one flaky SMTP night silently cost the user the next several weeks of accumulation. Two other orderings were on the table:

- **Keep persisting first and accept the loss** — the safest ordering for the historical record, and the reason it was written that way. Rejected because the loss is silent, unrecoverable and grows with the threshold: the users who lose the most are the ones who configured the feature most deliberately.
- **Retry the send** — treats a symptom. The baseline would still be wrong if every retry failed.

## Decision

The run sends the notification *before* persisting, and advances the baseline only if delivery actually happened. Delivery is defined per channel: when no SMTP transport is configured the `should-notify` output *is* the notification, so the baseline advances immediately. Only a configured send that did not deliver withholds the advance.

## Consequences

- Notifications can now be **duplicated** rather than lost: if the send succeeds but the subsequent commit or push fails, the next run re-evaluates against the old baseline and notifies again. This is the deliberate trade — a duplicate email is visible and self-correcting, a lost one is neither.
- The per-channel definition matters for `should-notify`: gating it on a send that never happened would leave the output stuck true forever after the first trip.
- A withheld advance covers both an SMTP rejection and the quieter case of `smtp-host` set with an empty `email-to`, where `sendEmail` returns `false` without throwing. Treating a non-null `EmailConfig` as proof that mail went out is the trap this decision exists to avoid.
- Moving the send before persistence costs nothing in durability: `sendEmail` was already wrapped in `try`/`catch`, so a throw does not skip the write. The only new exposure is a hung SMTP connection, which is bounded by the transport's own timeout.
