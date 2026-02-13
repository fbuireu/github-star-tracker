# Email Notifications

GitHub Star Tracker can send HTML email reports with star trend charts. This guide covers both built-in SMTP and external email action setups.

## 📧 Email Report Features

When email notifications are enabled:

- ✅ **HTML formatted** report with full styling
- ✅ **Embedded charts** (if `include-charts: true`)
- ✅ **Total stars** summary and changes
- ✅ **Repository breakdown** with star counts
- ✅ **Responsive design** for desktop and mobile
- ✅ **Localized content** based on your locale setting

---

## Option A: External Email Action (Recommended)

Use [dawidd6/action-send-mail](https://github.com/marketplace/actions/send-email) for reliable email delivery.

### Advantages

- ✅ Well-maintained and battle-tested
- ✅ Better error handling
- ✅ Supports attachments
- ✅ More SMTP provider compatibility

### Setup

```yaml
name: Track Stars with Email

on:
  schedule:
    - cron: '0 0 * * *'
  workflow_dispatch:

jobs:
  track:
    runs-on: ubuntu-latest
    steps:
      - name: Track stars
        id: tracker
        uses: fbuireu/github-star-tracker@v1
        with:
          github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
          include-charts: true

      - name: Send email
        if: steps.tracker.outputs.stars-changed == 'true'
        uses: dawidd6/action-send-mail@v9
        with:
          server_address: smtp.gmail.com
          server_port: 587
          username: ${{ secrets.EMAIL_FROM }}
          password: ${{ secrets.EMAIL_PASSWORD }}
          subject: '⭐ Star Update: ${{ steps.tracker.outputs.total-stars }} total'
          to: ${{ secrets.EMAIL_TO }}
          from: GitHub Star Tracker
          html_body: ${{ steps.tracker.outputs.report-html }}
```

### Required Secrets

Create these secrets in **Settings → Secrets and variables → Actions**:

| Secret           | Description                   | Example                |
| ---------------- | ----------------------------- | ---------------------- |
| `EMAIL_FROM`     | Sender email address          | `your.email@gmail.com` |
| `EMAIL_PASSWORD` | App-specific password         | `abcd efgh ijkl mnop`  |
| `EMAIL_TO`       | Recipient(s), comma-separated | `user@example.com`     |

---

## Option B: Built-in SMTP

Use the action's built-in email functionality.

### Setup

```yaml
name: Track Stars with Built-in Email

on:
  schedule:
    - cron: '0 0 * * *'
  workflow_dispatch:

jobs:
  track:
    runs-on: ubuntu-latest
    steps:
      - name: Track stars with email
        uses: fbuireu/github-star-tracker@v1
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

### Required Secrets

Same as Option A — see table above.

> ⚠️ **IMPORTANT:** You must configure **ALL** email-related inputs if you use any of them. Partial configuration will cause errors.

---

## 🔐 SMTP Provider Setup

### Gmail

1. Enable 2-factor authentication
2. Generate app-specific password:
   - Go to [Google Account → Security → 2-Step Verification → App passwords](https://myaccount.google.com/apppasswords)
   - Generate password for "Mail"
   - Copy the 16-character password

**Configuration:**

```yaml
smtp-host: smtp.gmail.com
smtp-port: '587'
smtp-username: your.email@gmail.com
smtp-password: ${{ secrets.EMAIL_PASSWORD }} # App password
```

### Outlook / Hotmail

**Configuration:**

```yaml
smtp-host: smtp-mail.outlook.com
smtp-port: '587'
smtp-username: your.email@outlook.com
smtp-password: ${{ secrets.EMAIL_PASSWORD }}
```

### Office 365

**Configuration:**

```yaml
smtp-host: smtp.office365.com
smtp-port: '587'
smtp-username: your.email@company.com
smtp-password: ${{ secrets.EMAIL_PASSWORD }}
```

### SendGrid

1. Create API key at [SendGrid Dashboard](https://app.sendgrid.com/settings/api_keys)
2. Verify sender email

**Configuration:**

```yaml
smtp-host: smtp.sendgrid.net
smtp-port: '587'
smtp-username: apikey # Literal string "apikey"
smtp-password: ${{ secrets.SENDGRID_API_KEY }}
```

### Custom SMTP Server

**Configuration:**

```yaml
smtp-host: mail.example.com
smtp-port: '587' # Or 465 for SSL
smtp-username: ${{ secrets.SMTP_USER }}
smtp-password: ${{ secrets.SMTP_PASS }}
```

---

## 📬 Email Frequency

### Only Send on Changes

Send emails only when stars change:

```yaml
- name: Track stars
  id: tracker
  uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}

- name: Send email
  if: steps.tracker.outputs.stars-changed == 'true'
  uses: dawidd6/action-send-mail@v9
  with:
    # ... email config
```

### Always Send

Remove the `if` condition to send emails on every run:

```yaml
- name: Send email
  uses: dawidd6/action-send-mail@v9
  with:
    # ... email config
```

### Weekly Digest

Send emails weekly regardless of changes:

```yaml
on:
  schedule:
    - cron: '0 9 * * 1' # Monday at 9 AM
```

---

## 🎨 Email Customization

### Subject Line

**With External Action:**

```yaml
subject: '⭐ ${{ steps.tracker.outputs.total-stars }} GitHub stars (+${{ steps.tracker.outputs.new-stars }})'
```

**Built-in Email:**  
Subject is automatically generated based on locale:

- English: `GitHub Stars Report: X total stars`
- Spanish: `Informe de estrellas de GitHub: X estrellas totales`
- Catalan: `Informe d'estrelles de GitHub: X estrelles totals`
- Italian: `Rapporto stelle GitHub: X stelle totali`

### Multiple Recipients

```yaml
email-to: user1@example.com,user2@example.com,team@example.com
```

### Sender Name

**With External Action:**

```yaml
from: GitHub Star Tracker <noreply@example.com>
```

---

## 📊 Charts in Emails

Charts are automatically included in HTML emails when `include-charts: true`.

### Chart Types

1. **Total Stars Chart**
   - Line graph showing cumulative stars over time
   - All repositories combined

2. **Top 5 Repositories Chart**
   - Comparison chart with individual trend lines
   - Shows your 5 most-starred repositories

### Chart Limitations

- Maximum **30 data points** per chart (QuickChart limitation)
- If you have more snapshots, older ones are excluded
- Charts are rendered as **inline images** (no external links)

### Disabling Charts

To send text-only emails:

```yaml
with:
  include-charts: false
```

---

## 🔍 Testing Email Setup

### Manual Test

1. Go to **Actions** tab
2. Select your workflow
3. Click **Run workflow** → **Run workflow**
4. Check your inbox after ~1 minute
5. If no email arrives, check workflow logs for errors

### Debug Mode

Add logging to troubleshoot:

```yaml
- name: Track stars
  id: tracker
  uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}

- name: Debug outputs
  run: |
    echo "Total stars: ${{ steps.tracker.outputs.total-stars }}"
    echo "Changed: ${{ steps.tracker.outputs.stars-changed }}"
    echo "Report length: ${{ length(steps.tracker.outputs.report-html) }}"
```

---

## ⚠️ Common Issues

### Email Not Received

**Possible causes:**

1. **Wrong SMTP credentials** — Double-check username/password
2. **App password not used** — Gmail requires app-specific password
3. **Firewall blocking** — Some SMTP ports blocked by GitHub Actions
4. **Secrets not set** — Verify all required secrets exist
5. **Spam folder** — Check junk/spam folders

**Solutions:**

```yaml
# Add error handling
- name: Send email
  continue-on-error: true # Don't fail workflow if email fails
  uses: dawidd6/action-send-mail@v9
  # ...
```

### Authentication Failed

- Verify SMTP credentials are correct
- For Gmail: ensure 2FA is enabled and app password is used
- For Office 365: check if account requires modern auth

### Email Incomplete or Missing Charts

- Ensure `include-charts: true` is set
- Check that `report-html` output is not empty
- Verify QuickChart API is accessible (check workflow logs)

### Multiple Emails Sent

- Check you don't have duplicate workflows
- Verify cron schedule doesn't overlap
- Add `if: steps.tracker.outputs.stars-changed == 'true'` condition

---

## 📝 Email Template

The HTML email includes:

```html
<!DOCTYPE html>
<html>
  <head>
    <style>
      /* Responsive CSS */
    </style>
  </head>
  <body>
    <h1>GitHub Stars Report</h1>

    <div><strong>Total Stars:</strong> 123 <strong>Change:</strong> +5</div>

    <!-- Star Trend Chart -->
    <img src="https://quickchart.io/chart?..." />

    <!-- Repository List -->
    <table>
      <tr>
        <th>Repository</th>
        <th>Stars</th>
      </tr>
      <!-- ... -->
    </table>

    <!-- Top Repositories Chart -->
    <img src="https://quickchart.io/chart?..." />
  </body>
</html>
```

---

## 🚀 Advanced Usage

### Conditional Email by Change Amount

Only send emails if stars change significantly:

```yaml
- name: Track stars
  id: tracker
  uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}

- name: Send email for big changes
  if: |
    steps.tracker.outputs.new-stars >= 10 ||
    steps.tracker.outputs.lost-stars >= 5
  uses: dawidd6/action-send-mail@v9
  # ...
```

### Different Recipients by Day

```yaml
- name: Send email
  uses: dawidd6/action-send-mail@v9
  with:
    to: |
      ${{ github.event.schedule == '0 0 * * 1' && secrets.EMAIL_WEEKLY || secrets.EMAIL_DAILY }}
```

### Attach JSON Data

```yaml
- name: Track stars
  id: tracker
  uses: fbuireu/github-star-tracker@v1
  # ...

- name: Checkout data branch
  uses: actions/checkout@v4
  with:
    ref: star-tracker-data
    path: data

- name: Send email with attachment
  uses: dawidd6/action-send-mail@v9
  with:
    # ... smtp config
    html_body: ${{ steps.tracker.outputs.report-html }}
    attachments: data/stars-data.json
```

---

## Next Steps

- **[Star Trend Charts](Star-Trend-Charts)** — Customize chart appearance
- **[Configuration](Configuration)** — All email-related inputs
- **[Troubleshooting](Troubleshooting)** — Email delivery issues
