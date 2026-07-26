# src/infrastructure/notification — SMTP configuration and outbound email

This folder turns the SMTP-related Action inputs into an `EmailConfig` and sends the pre-rendered HTML report
through nodemailer. It does not render the email body or the subject (those come from `@presentation/html` and
`@i18n` via `@application/tracker`), and it does not decide *whether* a notification is warranted — the
threshold logic lives in `@domain/notification`. It only decides whether email is *configured* well enough to
attempt a send.

## Files
| File | Responsibility |
| --- | --- |
| `email.ts` | `getEmailConfig` (read SMTP inputs → `EmailConfig \| null`) and `sendEmail` (build a transport, send, report outcome). |

## Public API

### `email.ts`
```ts
export interface EmailConfig {
  host: string; port: number; username: string; password: string; to: string; from: string;
}

export function getEmailConfig(locale: Locale): EmailConfig | null

interface SendEmailParams { emailConfig: EmailConfig | null; subject: string; htmlBody: string }
export async function sendEmail({ emailConfig, subject, htmlBody }: SendEmailParams): Promise<boolean>
```
- `getEmailConfig` — call once per run; a `null` result means "the user did not configure email", which
  `@application/tracker` uses as the master on/off switch (it skips subject building entirely when `null`).
- `sendEmail` — awaits the send and resolves `true` only when a message was handed to the SMTP server.
- `resolveFromAddress` is module-private.

Both symbols are consumed only by `@application/tracker`. `EmailConfig` is also imported by
`email.test.ts` and is the type of the value threaded from `getEmailConfig` to `sendEmail`.

## Inputs consumed (from `action.yml`)
| Input | Required for email | Notes |
| --- | --- | --- |
| `smtp-host` | **yes** — the enable switch | Empty → `getEmailConfig` returns `null`, email is off. |
| `email-to` | **yes** at send time | Empty → `sendEmail` warns and returns `false`. |
| `smtp-port` | no | `action.yml` default `'587'`; module fallback `DEFAULT_SMTP_PORT = '587'`. |
| `smtp-username` | no | Also doubles as the sender address, see `resolveFromAddress`. |
| `smtp-password` | no | Auth is attempted only when username **and** password are both non-empty. |
| `email-from` | no | Falls back to the localized `t.email.defaultFrom` (`'GitHub Star Tracker'` for `en`). |
| `send-on-no-changes` | no | Read by `@application/tracker`, **not** here. |

## Invariants & rules
- **`smtp-host` is the only mandatory switch.** `getEmailConfig` returns `null` on an empty host *before*
  reading any other input or loading translations.
- `port` is `Number.parseInt(core.getInput('smtp-port') || '587', 10)`. There is **no validation**: a
  non-numeric input yields `NaN`, which silently makes `secure` false and hands `NaN` to nodemailer.
- **`secure` is derived purely from the port**: `secure = port === 465` (`SECURE_SMTP_PORT`). 587 and every
  other port go out as STARTTLS/plain. There is no separate `smtp-secure` input.
- **Auth is all-or-nothing**: `auth` is `{ user, pass }` only when both `username` and `password` are truthy,
  otherwise literally `undefined` (pinned by a test asserting `auth: undefined`, not an absent key).
- **From-address resolution** (`resolveFromAddress`), in order:
  1. `from` contains `@` → used verbatim (covers both `a@b.com` and `Name <a@b.com>`);
  2. otherwise, `username` contains `@` → `` `${from} <${username}>` ``;
  3. otherwise → bare `from` (a display name with no address; whether that is accepted is up to the SMTP server).
- **Two silent skips, distinguished by log level**: `emailConfig === null` → `core.info('No SMTP configuration
  provided, skipping email')`; configured host but empty `to` → `core.warning(...)`, because that is almost
  certainly a misconfiguration. Both return `false` and neither creates a transport.
- **Rejected recipients do not fail the send.** A non-empty `info.rejected` produces a `core.warning` listing
  the addresses, then the function still logs success and returns `true`. `info.rejected ?? []` guards
  transports that omit the field.
- **Failures propagate as rejections, not as warnings, from this module.** `sendEmail` does not wrap
  `transporter.sendMail` in a try/catch. `@application/tracker` catches it and calls
  `core.warning(\`Failed to send email: ...\`)`, so a broken SMTP server never fails the action. Do not add a
  local catch: it would swallow the error before the caller can report it, and do not let it escape the
  caller's try — that would turn a mail outage into a red run.
- `getEmailConfig` is one of the few infrastructure functions that reads `@actions/core` inputs directly rather
  than receiving a parsed `Config`. Only `locale` is passed in, purely to resolve `t.email.defaultFrom`.
- `getEmailConfig` takes a single positional argument, which is why it is not a named-params object — the
  2+-argument rule does not apply.
- A fresh transport is created on every `sendEmail` call and is never closed or pooled; the function is called
  at most once per run.
- No `transporter.verify()` is performed — configuration errors surface as a `sendMail` rejection.

## When email is actually sent
`@application/tracker` gates the call:
`emailConfig && (notify || config.sendOnNoChanges)`, where `notify = summary.changed && thresholdReached`.
When `emailConfig` exists but the gate is false it logs `No star changes detected, skipping email` and never
enters this folder. So there are three distinct "no email" outcomes: not configured (info, here), configured
but nothing to say (info, in the caller), configured but no recipient (warning, here).

The caller also consumes the `boolean` return, not just the absence of a throw: a `false` — the empty
`email-to` case — leaves the notification baseline untouched exactly like a thrown SMTP error would.

## Dependencies
- Allowed: `@actions/core`, `nodemailer`, and `@i18n` (for `Locale` and `getTranslations`).
- Must never import `@domain/*` (notification thresholds are domain logic and stay there),
  `@presentation/*` (the body arrives as a string) or `@application/*`.

## Gotchas
- **`smtp-password` is never passed to `core.setSecret`.** Masking relies entirely on the user supplying it via
  `${{ secrets.* }}`, which GitHub masks on its own. A password hardcoded in a workflow would appear unmasked
  in any nodemailer error text.
- `getEmailConfig` returning a non-null value does **not** mean email will be sent — `to` is only checked
  inside `sendEmail`. Code that treats a non-null `EmailConfig` as "email will go out" is wrong.
- The `email-from` default is locale-dependent (`t.email.defaultFrom`), so changing `locale` changes the
  visible sender name.
- `action.yml` gives `smtp-port` a default of `'587'`, so `core.getInput('smtp-port')` is rarely empty and the
  `DEFAULT_SMTP_PORT` fallback is mostly a belt-and-braces for direct programmatic use.

## Testing
`email.test.ts` mocks `@actions/core` (`getInput`/`info`/`warning`) and the nodemailer default export. It pins:
`null` when `smtp-host` is empty; the full `EmailConfig` mapping including `port: 465` parsed from a string;
the `'GitHub Star Tracker'` default sender for `en`; `false` + no transport when `emailConfig` is `null`;
`false` + a warning containing `no email-to`; the exact `createTransport` and `sendMail` argument objects;
`secure: true` at port 465; `auth: undefined` with missing credentials; all three `resolveFromAddress` branches;
and the warning on rejected recipients.

Run just this folder: `pnpm vitest run src/infrastructure/notification`
