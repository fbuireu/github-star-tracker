GitHub Star Tracker can send HTML email reports with charts and star data. This guide covers both built-in SMTP and external email action setups.

---

## Email Report Features

- HTML formatted report with inline CSS
- Embedded charts (via QuickChart.io URLs)
- Repository table with star counts and deltas
- Stargazer section (if `track-stargazers` enabled)
- Forecast tables (if enough history)
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
          html_body: ${{ steps.tracker.outputs.report-html }}
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

Only send email when accumulated changes reach a threshold:

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
    html_body: ${{ steps.tracker.outputs.report-html }}
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

- Email is sent when `stars-changed == true` AND the notification threshold is reached
- If `send-on-no-changes: true`, email is sent even with no star changes
- Email failures are **non-fatal** - the action logs a warning and completes successfully
- Subject line is auto-generated and localized

### Notification Threshold

Control when the built-in email fires:

```yaml
with:
  notification-threshold: '0'     # Every run with changes (default)
  notification-threshold: '10'    # After 10 stars accumulated change
  notification-threshold: 'auto'  # Adaptive based on total stars
```

See **[Configuration > notification-threshold](Configuration)** for details on adaptive thresholds.

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

```yaml
on:
  schedule:
    - cron: '0 9 * * 1'  # Every Monday at 9 AM UTC
```

### On Significant Changes

```yaml
- name: Send email for big changes
  if: steps.tracker.outputs.new-stars >= 10 || steps.tracker.outputs.lost-stars >= 5
  uses: dawidd6/action-send-mail@62a2d05b79935ad4fb90ce9079928099579c14ac # v9
```

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
- Maximum 30 data points per chart
- If QuickChart.io is unreachable, charts appear as broken images; report text is unaffected

---

## Localized Subject Lines

The built-in email auto-generates localized subject lines:

| Locale | Example Subject |
|---|---|
| `en` | `GitHub Stars Report: 523 total stars (+15)` |
| `es` | `Informe de estrellas de GitHub: 523 estrellas totales (+15)` |
| `ca` | `Informe d'estrelles de GitHub: 523 estrelles totals (+15)` |
| `it` | `Rapporto stelle GitHub: 523 stelle totali (+15)` |

---

## Troubleshooting

| Issue | Solution |
|---|---|
| Email not received | Check spam folder; verify SMTP credentials; ensure app password for Gmail |
| Authentication failed | Gmail requires app password (not account password); enable 2FA first |
| Log shows `Email sent to <address> (message ID: …@localhost)` | The message ID is informational, not the recipient - the email is sent to the `email-to` address shown before it. A `@localhost` message ID means `email-from` had no email address; set `email-from` to a real address (or an `smtp-username` that is one) so it reads e.g. `…@gmail.com` |
| Custom mailer fails with `Argument list too long` | The report is too large to pass through a shell variable; use the `report-html-path` output with your mailer's file input (e.g. `html_body_file`) instead of `report-html` |
| Charts missing in email | Ensure `include-charts: true`; check that tracked repos have stargazers; check if the email client blocks external images |
| Multiple emails | Check for duplicate workflows; add `if: stars-changed == 'true'` condition |
| Email sent on no changes | Set `send-on-no-changes: false` or add conditional `if` step |

---

## Next Steps

- **[Star Trend Charts](Star-Trend-Charts)** - Chart types and customization
- **[Configuration](Configuration)** - All email-related inputs
- **[Examples](Examples)** - Advanced email workflows
- **[Troubleshooting](Troubleshooting)** - Detailed email issue resolution
