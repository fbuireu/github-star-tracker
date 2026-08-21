GitHub Star Tracker can send HTML email reports with charts and star data. This guide covers both built-in SMTP and external email action setups.

---

## Email Report Features

- HTML formatted report with inline CSS
- Embedded charts (via QuickChart.io URLs)
- Repository table with star counts, deltas and a trend column
- New and removed repository lists, each with the star count that entered or left
- Per-repo charts headed by that repo's star count and delta, so a curve never has to be read against the table
- Stargazer section (if `track-stargazers` enabled)
- Forecast tables (if enough history), aggregate first and then one per repository
- Localized content based on `locale` setting
- Responsive design for desktop and mobile

---

## Option A: External Email Action (Recommended)

Use [dawidd6/action-send-mail](https://github.com/marketplace/actions/send-email) for maximum flexibility.

### Advantages

- Well-maintained and battle-tested
- Better error handling and logging
- Supports attachments
- Full control over send conditions

### Setup

```yaml
name: Track Stars with Email

on:
  schedule:
    - cron: '0 0 * * *'
  workflow_dispatch:

permissions:
  contents: write

jobs:
  track:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6.0.3
      - name: Track stars
        id: tracker
        uses: fbuireu/github-star-tracker@v1
        with:
          github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
          include-charts: true

      - name: Send email
        if: steps.tracker.outputs.stars-changed == 'true'
        uses: dawidd6/action-send-mail@62a2d05b79935ad4fb90ce9079928099579c14ac # v9
        with:
          server_address: smtp.gmail.com
          server_port: 587
          username: ${{ secrets.EMAIL_FROM }}
          password: ${{ secrets.EMAIL_PASSWORD }}
          subject: '⭐ Star Update: ${{ steps.tracker.outputs.total-stars }} total (+${{ steps.tracker.outputs.new-stars }})'
          to: ${{ secrets.EMAIL_TO }}
          from: GitHub Star Tracker
          html_body_file: ${{ steps.tracker.outputs.report-html-path }}
```

> [!IMPORTANT]
> Reports with charts and many repositories can be large. Passing `report-html` directly through `html_body` routes the whole report through a shell environment variable, which can fail with `Argument list too long` for big reports. Use the `report-html-path` output instead - the action writes the HTML to a file and exposes its path, which mailers can read directly:
>
> ```yaml
>       - name: Send email
>         if: steps.tracker.outputs.stars-changed == 'true'
>         uses: dawidd6/action-send-mail@62a2d05b79935ad4fb90ce9079928099579c14ac # v9
>         with:
>           server_address: smtp.gmail.com
>           server_port: 587
>           username: ${{ secrets.EMAIL_FROM }}
>           password: ${{ secrets.EMAIL_PASSWORD }}
>           subject: '⭐ Star Update: ${{ steps.tracker.outputs.total-stars }} total'
>           to: ${{ secrets.EMAIL_TO }}
>           from: GitHub Star Tracker
>           html_body_file: ${{ steps.tracker.outputs.report-html-path }}
> ```

### With Notification Threshold

Only send email when accumulated changes reach a threshold. `should-notify` accumulates across runs; see **[Notification Threshold](#notification-threshold)** below for the details and for `notification-mode`:

```yaml
- name: Track stars
  id: tracker
  uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    notification-threshold: '5'

- name: Send email when threshold reached
  if: steps.tracker.outputs.should-notify == 'true'
  uses: dawidd6/action-send-mail@62a2d05b79935ad4fb90ce9079928099579c14ac # v9
  with:
    server_address: smtp.gmail.com
    server_port: 587
    username: ${{ secrets.EMAIL_FROM }}
    password: ${{ secrets.EMAIL_PASSWORD }}
    subject: '⭐ Stars changed: ${{ steps.tracker.outputs.total-stars }} total'
    to: ${{ secrets.EMAIL_TO }}
    from: GitHub Star Tracker
    html_body_file: ${{ steps.tracker.outputs.report-html-path }}
```

---

## Option B: Built-in SMTP

Use the action's integrated email functionality by providing SMTP inputs.

### Setup

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    include-charts: true
    smtp-host: smtp.gmail.com
    smtp-port: '587'
    smtp-username: ${{ secrets.EMAIL_FROM }}
    smtp-password: ${{ secrets.EMAIL_PASSWORD }}
    email-from: ${{ secrets.EMAIL_FROM }}
    email-to: ${{ secrets.EMAIL_TO }}
```

### Behavior

- `smtp-host` is the master switch. Leave it unset and no other SMTP input is even read
- Email is sent when `stars-changed == true` AND the notification threshold is reached
- If `send-on-no-changes: true`, email is sent even with no star changes
- Email failures are **non-fatal**: the action logs a warning and completes successfully
- Subject line is auto-generated and localized
- `smtp-port` decides the transport security on its own. Port `465` means implicit SSL, anything else means
  STARTTLS. There is no `smtp-secure` input
- Authentication is all-or-nothing: credentials are sent only when `smtp-username` **and** `smtp-password`
  are both present

### What the sender address ends up as

`email-from` is not always the address the recipient sees. Resolution runs in this order:

1. `email-from` contains an `@`, so it is used verbatim
2. Otherwise, if `smtp-username` contains an `@`, the two are combined into `Display Name <user@host>`
3. Otherwise the bare `email-from` is used as a display name with no address behind it

Case 3 is the one that surprises people: with `email-from: 'Star Tracker'` and an `smtp-username` that is not
an email address, the message goes out with no real sender address and the run log shows a `@localhost`
message ID. Set `email-from` to a real address, or use one as `smtp-username`.

### Log lines worth knowing

| Line | Level | Means |
|---|---|---|
| `Invalid smtp-port "<value>". Falling back to 587.` | warning | The port was not an integer in `1..65535`. The run continues on 587, which is STARTTLS, so a `465` typo silently changes the transport |
| `SMTP configured but no email-to address provided, skipping email` | warning | Nothing was sent, and this counts as a **failed** delivery, so the notification baseline is held back |
| `Email rejected for: <addresses>` | warning | The server accepted the message but refused those recipients. The run still reports the send as successful, so this is the usual answer to "the log says sent but it never arrived" |
| `Email sent to <address> (message ID: ...)` | info | Delivered. The address shown is `email-to`, not the message ID's domain |
| `Notification threshold not reached, skipping email` | info | SMTP is configured and stars moved, but the accumulated change has not tripped the threshold yet |
| `No stars changed since the baseline, skipping email` | info | SMTP is configured and nothing moved |

### Notification Threshold

Control when the built-in email fires:

```yaml
with:
  notification-threshold: '0' # Every run with changes (default)
  # '10'   - after 10 stars of accumulated change
  # 'auto' - adaptive, based on total stars
```

**What the counter is.** The threshold is measured against `starsAtLastNotification`, a single number
persisted in `stars-data.json` on the data branch: the star total as of the last time the notification
baseline advanced. The accumulated change is today's total minus that number, not the change since the last
run.

**When it advances.** A run that decides to notify moves it up to the current total, *unless* a configured
send failed. A failed SMTP send, or an `smtp-host` set with an empty `email-to`, leaves it where it was so
the accumulated change is not lost and the next run tries again with a larger figure.

**When there is no SMTP at all.** With no transport configured the `should-notify` output *is* the
notification, so the baseline advances as soon as the threshold trips. Otherwise a workflow gating an
external mailer on `should-notify` would see it stay `true` forever. The `notification-sent` output is what
tells the two situations apart: it is `true` only when an email actually left the runner.

**Why `should-notify` is cumulative.** Runs that do not notify never touch the counter, so the accumulated
change keeps growing until it trips. That is the difference from `new-stars` and `lost-stars`, which are
per-run figures measured against the comparison baseline and reset every run by construction.

The send happens **before** the baseline is persisted, deliberately: it trades a possible duplicate email
for never losing accumulated change ([ADR 0011](https://github.com/fbuireu/github-star-tracker/blob/main/docs/adr/0011-the-notification-baseline-advances-only-on-delivery.md)).

#### Notification Mode

`notification-mode` chooses how that accumulated change is measured:

| Mode | Behavior |
|---|---|
| `net` (default) | The absolute value of the change in total stars since the last notification. Gains and losses across repositories cancel out, and a large **drop** also reaches the threshold |
| `gains` | Only upward movement counts. The threshold is reached when the total has risen by at least N since the last notification; a drop never triggers a notification |

```yaml
with:
  notification-threshold: '500'
  notification-mode: 'gains'
```

Both inputs can also be set in `star-tracker.yml` as `notification_threshold` and `notification_mode`.

#### Example: email me every 500 stars

Both inputs drive the built-in email and the `should-notify` output, so the same pair works with an external mailer:

```yaml
- name: Track stars
  id: tracker
  uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    notification-threshold: '500'
    notification-mode: 'gains'

- name: Send email every 500 stars
  if: steps.tracker.outputs.should-notify == 'true'
  uses: dawidd6/action-send-mail@62a2d05b79935ad4fb90ce9079928099579c14ac # v9
  with:
    server_address: smtp.gmail.com
    server_port: 587
    username: ${{ secrets.EMAIL_FROM }}
    password: ${{ secrets.EMAIL_PASSWORD }}
    subject: '⭐ Milestone: ${{ steps.tracker.outputs.total-stars }} total stars'
    to: ${{ secrets.EMAIL_TO }}
    from: GitHub Star Tracker
    html_body_file: ${{ steps.tracker.outputs.report-html-path }}
```

Notes:

- `notification-threshold: '0'` still means "notify on every run that has changes", in both modes. `should-notify` also requires that something actually changed.
- Whether raising the threshold fires an email straight away depends on whether a notification has ever fired on the data branch. If none has, `starsAtLastNotification` is absent and treated as `0`, so the first run fires once immediately and then settles into the threshold rhythm. If you have been running with the default `notification-threshold: '0'`, every changed run has already been notifying, so `starsAtLastNotification` is stored at your current total - raising the threshold does **not** fire immediately, and the next email waits for the full threshold to accumulate from that total.
- In `net` mode a large **loss** of stars also reaches the threshold, because the absolute change is what is measured. Use `gains` if you only want to hear about growth.

See **[Configuration > notification-threshold](Configuration#notification-threshold)** for details on adaptive thresholds.

---

## Required Secrets

| Secret | Description | Example |
|---|---|---|
| `EMAIL_FROM` | Sender email address | `your.email@gmail.com` |
| `EMAIL_PASSWORD` | App-specific password or API key | `abcd efgh ijkl mnop` |
| `EMAIL_TO` | Recipient address | `recipient@example.com` |

---

## SMTP Provider Setup

### Gmail

1. Enable 2-factor authentication on your Google Account
2. Generate an app-specific password:
   - Go to **[Google Account > Security > 2-Step Verification > App passwords](https://myaccount.google.com/apppasswords)**
   - Select **"Mail"** and generate
   - Copy the 16-character password

```yaml
smtp-host: smtp.gmail.com
smtp-port: '587'
smtp-username: your.email@gmail.com
smtp-password: ${{ secrets.EMAIL_PASSWORD }}  # App password
```

### Outlook / Hotmail

```yaml
smtp-host: smtp-mail.outlook.com
smtp-port: '587'
smtp-username: your.email@outlook.com
smtp-password: ${{ secrets.EMAIL_PASSWORD }}
```

### Office 365

```yaml
smtp-host: smtp.office365.com
smtp-port: '587'
smtp-username: your.email@company.com
smtp-password: ${{ secrets.EMAIL_PASSWORD }}
```

### SendGrid

1. Create an API key at [SendGrid Dashboard](https://app.sendgrid.com/settings/api_keys)
2. Verify your sender email

```yaml
smtp-host: smtp.sendgrid.net
smtp-port: '587'
smtp-username: apikey              # Literal string "apikey"
smtp-password: ${{ secrets.SENDGRID_API_KEY }}
```

---

## Email Frequency Patterns

### Only on Changes (Default)

```yaml
- name: Send email
  if: steps.tracker.outputs.stars-changed == 'true'
  uses: dawidd6/action-send-mail@62a2d05b79935ad4fb90ce9079928099579c14ac # v9
```

### Weekly Digest

> [!IMPORTANT]
> A weekly cron alone does **not** make the report cover a week. With the default `compare-against: 'last-run'` the report compares the current counts against the most recent stored snapshot, so a weekly workflow that shares a data branch with a daily one produces a Monday email covering only what changed since Sunday. Use `compare-against: '7d'` to pin the baseline to a snapshot at least seven days old, whatever the run cadence.
>
> Pair it with `read-only: true`. This workflow reads the same `star-tracker-data` branch that your tracking workflow maintains, and without `read-only` it would append its own snapshot to that branch and could race the run that writes it. A read-only run still builds the report, sets every output and sends the email - it just never commits or pushes.
>
> Because of that, leave `notification-threshold` at its default `0` here and gate the digest on `stars-changed`, as the example below does. A threshold other than `0` accumulates against `starsAtLastNotification`, which lives on the data branch a read-only run never writes, so it would either fire on every run or never fire. The action logs a warning if you set both.

```yaml
name: Weekly Star Digest

on:
  schedule:
    - cron: '0 9 * * 1'  # Every Monday at 9 AM UTC
  workflow_dispatch:

permissions:
  contents: read

jobs:
  digest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6.0.3
      - name: Build the digest
        id: tracker
        uses: fbuireu/github-star-tracker@v1
        with:
          github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
          compare-against: '7d'
          read-only: true
          include-charts: true

      - name: Send digest
        if: steps.tracker.outputs.stars-changed == 'true'
        uses: dawidd6/action-send-mail@62a2d05b79935ad4fb90ce9079928099579c14ac # v9
        with:
          server_address: smtp.gmail.com
          server_port: 587
          username: ${{ secrets.EMAIL_FROM }}
          password: ${{ secrets.EMAIL_PASSWORD }}
          subject: '⭐ Weekly digest: ${{ steps.tracker.outputs.total-stars }} total (+${{ steps.tracker.outputs.new-stars }})'
          to: ${{ secrets.EMAIL_TO }}
          from: GitHub Star Tracker
          html_body_file: ${{ steps.tracker.outputs.report-html-path }}
```

What `compare-against` does to the figures in that digest, including what happens when the stored history is
shorter than the window you asked for, is in
**[Configuration > compare-against](Configuration#compare-against)**. The part that matters for a mailer is
that it moves the baseline behind `new-stars`, `lost-stars` and `stars-changed`, so a subject line built from
those covers the window you chose rather than the last run.

#### Fully Independent Weekly Digest

If you prefer the weekly digest to keep its own history rather than read the tracking workflow's, give it its own `data-branch` and let it write. Its history then advances once a week, so the default `compare-against: 'last-run'` already means "since last Monday", and `read-only` is unnecessary because nothing else touches that branch. Disable the expensive extras to keep the API cost down:

```yaml
- name: Track stars
  id: tracker
  uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    data-branch: star-tracker-weekly
    include-charts: false
    track-stargazers: false
```

Prefer `compare-against` with `read-only` when you can: it reuses the history you already have, needs no second data branch, and re-uses the snapshots your tracking workflow is already paying for.

### On Significant Changes

Set a `notification-threshold`, pick a `notification-mode` and gate the mailer on `should-notify`:

```yaml
- name: Track stars
  id: tracker
  uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    notification-threshold: '10'
    notification-mode: 'gains'

- name: Send email for big changes
  if: steps.tracker.outputs.should-notify == 'true'
  uses: dawidd6/action-send-mail@62a2d05b79935ad4fb90ce9079928099579c14ac # v9
```

> [!WARNING]
> Do **not** gate on `if: steps.tracker.outputs.new-stars >= 10`. `new-stars` and `lost-stars` are **per-run** figures measured against the comparison baseline - with a daily cron and `compare-against: 'last-run'` they mean "stars gained in the last 24 hours". They are not cumulative and carry no memory of whether an email was already sent, so a `>=` comparison either fires almost every day (low number) or never fires at all (high number, because that many stars rarely arrive within a single run). `should-notify` is the cumulative one: it accumulates across runs against `starsAtLastNotification` and only resets when the threshold trips ([the full rule](Configuration#notification-threshold)).

### Always (Including No Changes)

With built-in SMTP:

```yaml
with:
  send-on-no-changes: true
```

---

## Charts in Emails

When `include-charts: true`, the HTML email includes chart images via QuickChart.io URLs. These are static PNG images (not the animated SVGs used in the data branch).

### Chart Types in Email

- **Total stars chart** - star trend over time
- **Comparison chart** - top N repos overlaid
- **Per-repo charts** - individual repo trends
- **Forecast chart** - projected growth

### Limitations

- Some email clients block external images by default (user must click "Show images")
- Maximum 30 points per chart (email charts ignore `chart-max-points` above 30)
- QuickChart cannot draw every [`chart-curve`](Configuration#chart-curve) natively, so some curves are approximated; **[Star Trend Charts](Star-Trend-Charts#curve-fidelity)** lists which
- If QuickChart.io is unreachable, charts appear as broken images; report text is unaffected
- A PNG carries its background as pixels, so the email charts cannot follow the reader's `prefers-color-scheme` the way the SVG charts do. Use [`email-theme`](Configuration#email-theme) to pick the palette baked into them

---

## Dark Mode

The HTML email and its charts are themed by [`email-theme`](Configuration#email-theme), which defaults to `auto`, meaning "whatever [`chart-theme`](Configuration#chart-theme) is". Under `auto` both resolve to the light palette, because the SVG trick that follows each viewer's system theme (a `prefers-color-scheme` media query inside the file) cannot work here: the email charts are PNG images with the background baked in, and mail clients do not recolour images.

The visible symptom is a **white rectangle behind every chart** for a recipient reading in dark mode: the client darkened the surrounding HTML and left the images alone. Force the palette to fix it:

```yaml
with:
  chart-theme: auto      # data-branch SVGs still follow each viewer's system theme
  email-theme: dark      # every recipient gets a dark digest, charts included
```

Because the images are rasterised once per run, this is one choice for the whole recipient list. `email-theme: dark` looks wrong to someone reading in light mode, and vice versa; there is no per-reader option. See [ADR 0010](https://github.com/fbuireu/github-star-tracker/blob/main/docs/adr/0010-quickchart-renders-the-email-charts.md).

---

## Localized Subject Lines

The subject is always `<localized subject>: <total stars> (<delta>)`, for example
`GitHub Star Tracker Report: 523 (+15)`. The per-locale wording is listed once, in
[Internationalization (i18n)](Internationalization-(i18n)#localized-email-subjects).

---

## Troubleshooting

| Issue | Solution |
|---|---|
| Email not received | Check spam folder; verify SMTP credentials; ensure app password for Gmail |
| Authentication failed | Gmail requires app password (not account password); enable 2FA first |
| Log shows `Email sent to <address> (message ID: …@localhost)` | The message ID is informational, not the recipient - the email is sent to the `email-to` address shown before it. A `@localhost` message ID means `email-from` had no email address; set `email-from` to a real address (or an `smtp-username` that is one) so it reads e.g. `…@gmail.com` |
| Custom mailer fails with `Argument list too long` | The report is too large to pass through a shell variable; use the `report-html-path` output with your mailer's file input (e.g. `html_body_file`) instead of `report-html` |
| Charts missing in email | Ensure `include-charts: true`; check that tracked repos have stargazers; check if the email client blocks external images |
| Charts have a white background in dark mode | The email charts are PNG images, so `prefers-color-scheme` cannot reach them and the mail client darkens everything around them instead. Set `email-theme: dark` (it defaults to following `chart-theme`) |
| Multiple emails | Check for duplicate workflows; add `if: stars-changed == 'true'` condition |
| Email arrives almost every day | The mailer is probably gated on `new-stars`/`lost-stars`, which are per-run values, or `notification-threshold` is still `0` (the default). Set a `notification-threshold`, add `notification-mode: 'gains'` and gate the step on `should-notify == 'true'` |
| Weekly digest workflow fights the daily one over the data branch | Add `read-only: true` to the digest workflow. It then reads the branch and reports from it without committing a snapshot of its own |
| No email at all after raising `notification-threshold` | `should-notify` accumulates against `starsAtLastNotification` and only resets when the threshold trips (and not even then if a configured send failed), so a high threshold simply takes longer. If you were previously on the default `notification-threshold: '0'`, that value is already stored at your current total, so the counter restarts from there rather than firing once immediately. Make sure the step is gated on `should-notify == 'true'` and not on `new-stars >= N`, which would need the whole threshold to arrive within a single run |
| `notification-threshold` ignored on a `read-only` run | A threshold other than `0` cannot work with `read-only: true` - its counter (`starsAtLastNotification`) lives on the data branch, which a read-only run never writes, so it either fires on every run or never fires. The action logs a warning when both are set. Keep `notification-threshold: '0'` there and gate the mailer on `stars-changed == 'true'` instead |
| Email sent on no changes | Set `send-on-no-changes: false` or add conditional `if` step |

---

## Next Steps

- **[Star Trend Charts](Star-Trend-Charts)** - Chart types and customization
- **[Configuration](Configuration)** - All email-related inputs
- **[Examples](Examples)** - Advanced email workflows
- **[Troubleshooting](Troubleshooting)** - Detailed email issue resolution
