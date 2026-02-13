# Examples

Real-world configuration examples for GitHub Star Tracker.

## 🚀 Basic Examples

### Minimal Setup

Track all repositories with default settings:

```yaml
name: Track Stars

on:
  schedule:
    - cron: '0 0 * * *'  # Daily at midnight
  workflow_dispatch:

jobs:
  track:
    runs-on: ubuntu-latest
    steps:
      - uses: fbuireu/github-star-tracker@v1
        with:
          github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
```

**What it does:**
- Tracks all repositories (public and private)
- Generates reports with charts
- Saves to `star-tracker-data` branch
- Uses English locale
- No email notifications

---

### Public Repositories Only

Track only your public repositories:

```yaml
name: Track Public Stars

on:
  schedule:
    - cron: '0 3 * * *'  # Daily at 3 AM UTC
  workflow_dispatch:

jobs:
  track:
    runs-on: ubuntu-latest
    steps:
      - uses: fbuireu/github-star-tracker@v1
        with:
          github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
          visibility: 'public'
```

**Use case:** Track open-source projects only.

---

### With Custom Locale

Generate reports in Spanish:

```yaml
name: Seguimiento de Estrellas

on:
  schedule:
    - cron: '0 0 * * *'
  workflow_dispatch:

jobs:
  track:
    runs-on: ubuntu-latest
    steps:
      - uses: fbuireu/github-star-tracker@v1
        with:
          github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
          locale: 'es'
```

**Languages available:**
- `en` — English
- `es` — Spanish
- `ca` — Catalan
- `it` — Italian

---

## 📧 Email Examples

### Built-in Email (Gmail)

```yaml
name: Track Stars with Email

on:
  schedule:
    - cron: '0 9 * * 1'  # Monday at 9 AM
  workflow_dispatch:

jobs:
  track:
    runs-on: ubuntu-latest
    steps:
      - uses: fbuireu/github-star-tracker@v1
        with:
          github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
          include-charts: true
          smtp-host: 'smtp.gmail.com'
          smtp-port: '587'
          smtp-username: ${{ secrets.EMAIL_FROM }}
          smtp-password: ${{ secrets.EMAIL_PASSWORD }}
          email-from: ${{ secrets.EMAIL_FROM }}
          email-to: ${{ secrets.EMAIL_TO }}
```

**Required secrets:**
- `STAR_TRACKER_TOKEN` — PAT with repo access
- `EMAIL_FROM` — Gmail address
- `EMAIL_PASSWORD` — App-specific password
- `EMAIL_TO` — Recipient(s)

---

### External Email Action (Recommended)

```yaml
name: Track Stars with External Email

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
          subject: "⭐ Star Update: ${{ steps.tracker.outputs.total-stars }} total (+${{ steps.tracker.outputs.new-stars }})"
          to: ${{ secrets.EMAIL_TO }}
          from: GitHub Star Tracker
          html_body: ${{ steps.tracker.outputs.report-html }}
```

**Benefits:**
- Only send emails when stars change
- Custom subject line with star counts
- Better reliability

---

### Multiple Recipients

Send to multiple email addresses:

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    smtp-host: 'smtp.gmail.com'
    smtp-port: '587'
    smtp-username: ${{ secrets.EMAIL_FROM }}
    smtp-password: ${{ secrets.EMAIL_PASSWORD }}
    email-from: ${{ secrets.EMAIL_FROM }}
    email-to: 'user1@example.com,user2@example.com,team@company.com'
```

**Alternative using secrets:**
```yaml
email-to: ${{ secrets.EMAIL_RECIPIENTS }}
```

Where `EMAIL_RECIPIENTS` secret contains:
```
user1@example.com,user2@example.com,team@company.com
```

---

## 📊 Chart Examples

### Charts Disabled

Generate text-only reports:

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    include-charts: false
```

**Use cases:**
- Reduce QuickChart API calls
- Faster workflow execution
- Smaller email size
- Only need JSON data

---

### Charts with Email

```yaml
- name: Track stars
  id: tracker
  uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    include-charts: true
    locale: 'en'

- name: Send email with charts
  uses: dawidd6/action-send-mail@v9
  with:
    server_address: smtp.gmail.com
    server_port: 587
    username: ${{ secrets.EMAIL_FROM }}
    password: ${{ secrets.EMAIL_PASSWORD }}
    subject: 📊 Star Report with Charts
    to: ${{ secrets.EMAIL_TO }}
    from: Star Tracker
    html_body: ${{ steps.tracker.outputs.report-html }}
```

**Result:** HTML email with embedded chart images.

---

## 🎯 Advanced Examples

### Conditional Email on Significant Changes

Only send email if 10+ stars gained:

```yaml
- name: Track stars
  id: tracker
  uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}

- name: Send email for big changes
  if: steps.tracker.outputs.new-stars >= 10
  uses: dawidd6/action-send-mail@v9
  with:
    server_address: smtp.gmail.com
    server_port: 587
    username: ${{ secrets.EMAIL_FROM }}
    password: ${{ secrets.EMAIL_PASSWORD }}
    subject: "🎉 Big milestone: +${{ steps.tracker.outputs.new-stars }} stars!"
    to: ${{ secrets.EMAIL_TO }}
    from: Star Tracker
    html_body: ${{ steps.tracker.outputs.report-html }}
```

---

### Post to Slack

Send notifications to Slack when stars change:

```yaml
- name: Track stars
  id: tracker
  uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}

- name: Post to Slack
  if: steps.tracker.outputs.stars-changed == 'true'
  uses: slackapi/slack-github-action@v1
  with:
    payload: |
      {
        "text": "⭐ GitHub Stars Update",
        "blocks": [
          {
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": "*Total Stars:* ${{ steps.tracker.outputs.total-stars }}\n*Change:* +${{ steps.tracker.outputs.new-stars }}"
            }
          },
          {
            "type": "actions",
            "elements": [
              {
                "type": "button",
                "text": {
                  "type": "plain_text",
                  "text": "View Report"
                },
                "url": "https://github.com/${{ github.repository }}/tree/star-tracker-data"
              }
            ]
          }
        ]
      }
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

---

### Save Report as Artifact

Archive the report for later download:

```yaml
- name: Track stars
  id: tracker
  uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}

- name: Save report
  run: |
    echo "${{ steps.tracker.outputs.report }}" > star-report.md
    echo "${{ steps.tracker.outputs.report-html }}" > star-report.html

- name: Upload artifact
  uses: actions/upload-artifact@v4
  with:
    name: star-reports
    path: |
      star-report.md
      star-report.html
```

**Access:** Go to workflow run → Artifacts → Download.

---

### Create GitHub Issue on Star Loss

Automatically create an issue when stars decrease:

```yaml
- name: Track stars
  id: tracker
  uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}

- name: Create issue on star loss
  if: steps.tracker.outputs.lost-stars > 0
  uses: actions/github-script@v7
  with:
    script: |
      github.rest.issues.create({
        owner: context.repo.owner,
        repo: context.repo.repo,
        title: `⚠️ Lost ${context.payload.steps.tracker.outputs.lost-stars} stars`,
        body: `We lost **${context.payload.steps.tracker.outputs.lost-stars}** stars since the last check.\n\nCurrent total: **${context.payload.steps.tracker.outputs.total-stars}** stars.\n\n[View detailed report](https://github.com/${context.repo.owner}/${context.repo.repo}/tree/star-tracker-data)`,
        labels: ['analytics', 'star-tracking']
      })
```

---

### Custom Schedule Examples

#### Weekly (Monday at 9 AM)

```yaml
on:
  schedule:
    - cron: '0 9 * * 1'
  workflow_dispatch:
```

#### Twice Daily (8 AM and 8 PM)

```yaml
on:
  schedule:
    - cron: '0 8,20 * * *'
  workflow_dispatch:
```

#### First Day of Month

```yaml
on:
  schedule:
    - cron: '0 0 1 * *'
  workflow_dispatch:
```

#### Every 6 Hours

```yaml
on:
  schedule:
    - cron: '0 */6 * * *'
  workflow_dispatch:
```

**Tip:** Use [Crontab Guru](https://crontab.guru/) to test cron expressions.

---

## 🔧 Configuration File Examples

### Using External Config File

**`.github/workflows/star-tracker.yml`:**
```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    config-path: '.github/star-config.json'
```

**`.github/star-config.json`:**
```json
{
  "visibility": "public",
  "locale": "es",
  "includeCharts": true
}
```

---

### Multiple Configurations

Track different repository sets separately:

**Track public repos daily:**
```yaml
name: Track Public Repos

on:
  schedule:
    - cron: '0 0 * * *'

jobs:
  track-public:
    runs-on: ubuntu-latest
    steps:
      - uses: fbuireu/github-star-tracker@v1
        with:
          github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
          visibility: 'public'
          locale: 'en'
```

**Track private repos weekly:**
```yaml
name: Track Private Repos

on:
  schedule:
    - cron: '0 0 * * 1'

jobs:
  track-private:
    runs-on: ubuntu-latest
    steps:
      - uses: fbuireu/github-star-tracker@v1
        with:
          github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
          visibility: 'private'
          locale: 'en'
```

> ⚠️ **Note:** Both will use the same `star-tracker-data` branch, potentially overwriting each other's data.

---

## 🌍 Multi-Language Setup

### Team with Different Languages

Send different language reports to different teams:

```yaml
- name: Track stars (English)
  id: tracker-en
  uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    locale: 'en'

- name: Email English team
  uses: dawidd6/action-send-mail@v9
  with:
    server_address: smtp.gmail.com
    server_port: 587
    username: ${{ secrets.EMAIL_FROM }}
    password: ${{ secrets.EMAIL_PASSWORD }}
    subject: "Star Report (English)"
    to: team-en@company.com
    from: Star Tracker
    html_body: ${{ steps.tracker-en.outputs.report-html }}

- name: Track stars (Spanish)
  id: tracker-es
  uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    locale: 'es'

- name: Email Spanish team
  uses: dawidd6/action-send-mail@v9
  with:
    server_address: smtp.gmail.com
    server_port: 587
    username: ${{ secrets.EMAIL_FROM }}
    password: ${{ secrets.EMAIL_PASSWORD }}
    subject: "Informe de Estrellas"
    to: team-es@company.com
    from: Star Tracker
    html_body: ${{ steps.tracker-es.outputs.report-html }}
```

---

## 📱 Display Badge Examples

### Basic Badge in README

**Your repository `README.md`:**
```markdown
# My Project

![GitHub Stars](https://raw.githubusercontent.com/USERNAME/REPO/star-tracker-data/stars-badge.svg)

Track all my GitHub stars: [View Report](https://github.com/USERNAME/REPO/tree/star-tracker-data)
```

---

### Badge with Link

Make the badge clickable:

```markdown
[![GitHub Stars](https://raw.githubusercontent.com/USERNAME/REPO/star-tracker-data/stars-badge.svg)](https://github.com/USERNAME/REPO/tree/star-tracker-data)
```

---

### Multiple Badges

Show badge with other metrics:

```markdown
![Build Status](https://github.com/USERNAME/REPO/workflows/CI/badge.svg)
![GitHub Stars](https://raw.githubusercontent.com/USERNAME/REPO/star-tracker-data/stars-badge.svg)
![License](https://img.shields.io/github/license/USERNAME/REPO)
```

---

## 🔐 Organization Examples

### Organization-Wide Tracking

Track all repositories in a GitHub organization:

> ⚠️ **Note:** Action currently tracks repositories **owned by the PAT user**, not organization repositories. This is a planned feature.

**Workaround:** Use a bot account with access to all org repos.

---

## 🐛 Debug Examples

### Debug Output

Print all outputs for troubleshooting:

```yaml
- name: Track stars
  id: tracker
  uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}

- name: Debug outputs
  run: |
    echo "Total stars: ${{ steps.tracker.outputs.total-stars }}"
    echo "Stars changed: ${{ steps.tracker.outputs.stars-changed }}"
    echo "New stars: ${{ steps.tracker.outputs.new-stars }}"
    echo "Lost stars: ${{ steps.tracker.outputs.lost-stars }}"
    echo "Report length: ${{ length(steps.tracker.outputs.report) }}"
    echo "HTML report length: ${{ length(steps.tracker.outputs.report-html) }}"
```

---

### Verbose Logging

Enable detailed logs:

```yaml
- name: Track stars
  uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
  env:
    ACTIONS_STEP_DEBUG: true
```

---

## 📚 More Examples

Need help with a specific use case? Check:

- **[Configuration](Configuration)** — All available options
- **[API Reference](API-Reference)** — Complete input/output reference
- **[Troubleshooting](Troubleshooting)** — Common issues and solutions

Or [ask in discussions](https://github.com/fbuireu/github-star-tracker/discussions)!
