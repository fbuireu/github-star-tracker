Real-world workflow configurations for common use cases.

---

## Basic Examples

### Minimal Setup

```yaml
name: Track Stars
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
      - uses: fbuireu/github-star-tracker@v1
        with:
          github-token: ${{ secrets.GITHUB_STAR_TRACKER_TOKEN }}
```

### Public Repositories Only

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.GITHUB_STAR_TRACKER_TOKEN }}
    visibility: 'public'
```

### Only Repos You Own

Excludes repos where you're a collaborator:

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.GITHUB_STAR_TRACKER_TOKEN }}
    visibility: 'owned'
```

### Spanish Reports with Charts

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.GITHUB_STAR_TRACKER_TOKEN }}
    locale: 'es'
    include-charts: true
```

---

## Filtering Examples

### Filter by Minimum Stars

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.GITHUB_STAR_TRACKER_TOKEN }}
    min-stars: '10'
```

### Exclude Specific Repos

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.GITHUB_STAR_TRACKER_TOKEN }}
    exclude-repos: 'archived-repo,test-project'
```

### Exclude by Regex Pattern

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.GITHUB_STAR_TRACKER_TOKEN }}
    exclude-repos: '/^test-.*/, /^demo-.*/, old-project'
```

### Track Specific Repos Only

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.GITHUB_STAR_TRACKER_TOKEN }}
    only-repos: 'my-awesome-project,another-repo'
```

### Include Archived and Forks

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.GITHUB_STAR_TRACKER_TOKEN }}
    include-archived: true
    include-forks: true
```

---

## GitHub Enterprise Server (GHES)

### Explicit API URL

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.GHES_TOKEN }}
    github-api-url: 'https://github.example.com/api/v3'
```

### Auto-detected on GHES Runner

When the workflow runs on a GHES runner, the API URL is auto-detected from the `GITHUB_API_URL` environment variable — no extra input needed:

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.GITHUB_STAR_TRACKER_TOKEN }}
```

### GHES with Email Notifications

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.GHES_TOKEN }}
    github-api-url: 'https://github.example.com/api/v3'
    smtp-host: smtp.example.com
    smtp-port: '587'
    smtp-username: ${{ secrets.EMAIL_FROM }}
    smtp-password: ${{ secrets.EMAIL_PASSWORD }}
    email-from: ${{ secrets.EMAIL_FROM }}
    email-to: ${{ secrets.EMAIL_TO }}
```

---

## Email Examples

### Built-in Email (Gmail)

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.GITHUB_STAR_TRACKER_TOKEN }}
    smtp-host: smtp.gmail.com
    smtp-port: '587'
    smtp-username: ${{ secrets.EMAIL_FROM }}
    smtp-password: ${{ secrets.EMAIL_PASSWORD }}
    email-from: ${{ secrets.EMAIL_FROM }}
    email-to: ${{ secrets.EMAIL_TO }}
```

### External Email with Threshold

```yaml
- name: Track stars
  id: tracker
  uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.GITHUB_STAR_TRACKER_TOKEN }}
    notification-threshold: '5'

- name: Send email when threshold reached
  if: steps.tracker.outputs.should-notify == 'true'
  uses: dawidd6/action-send-mail@v9
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

### Adaptive Notification Threshold

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.GITHUB_STAR_TRACKER_TOKEN }}
    notification-threshold: 'auto'
    smtp-host: smtp.gmail.com
    smtp-port: '587'
    smtp-username: ${{ secrets.EMAIL_FROM }}
    smtp-password: ${{ secrets.EMAIL_PASSWORD }}
    email-from: ${{ secrets.EMAIL_FROM }}
    email-to: ${{ secrets.EMAIL_TO }}
```

---

## Notification Examples

### Slack Notification

```yaml
- name: Track stars
  id: tracker
  uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.GITHUB_STAR_TRACKER_TOKEN }}

- name: Post to Slack
  if: steps.tracker.outputs.stars-changed == 'true'
  uses: slackapi/slack-github-action@v1
  with:
    payload: |
      {
        "text": "⭐ Stars changed! Total: ${{ steps.tracker.outputs.total-stars }} (+${{ steps.tracker.outputs.new-stars }})"
      }
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

### Create Issue on Star Loss

```yaml
- name: Track stars
  id: tracker
  uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.GITHUB_STAR_TRACKER_TOKEN }}

- name: Create issue on star loss
  if: steps.tracker.outputs.lost-stars > 0
  uses: actions/github-script@v7
  with:
    script: |
      await github.rest.issues.create({
        owner: context.repo.owner,
        repo: context.repo.repo,
        title: `⚠️ Lost ${{ steps.tracker.outputs.lost-stars }} stars`,
        body: `Total stars: ${{ steps.tracker.outputs.total-stars }}\nLost: ${{ steps.tracker.outputs.lost-stars }}`
      });
```

---

## Stargazer Tracking

### Track Who Starred Your Repos

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.GITHUB_STAR_TRACKER_TOKEN }}
    track-stargazers: true
```

New stargazers appear in reports with avatar, profile link, and starred date.

### Notify on New Stargazers

```yaml
- name: Track stars
  id: tracker
  uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.GITHUB_STAR_TRACKER_TOKEN }}
    track-stargazers: true

- name: Log new stargazers
  if: steps.tracker.outputs.new-stargazers > 0
  run: echo "🌟 ${{ steps.tracker.outputs.new-stargazers }} new stargazers!"
```

---

## Schedule Examples

### Daily at Midnight UTC

```yaml
on:
  schedule:
    - cron: '0 0 * * *'
```

### Weekly on Monday at 9 AM UTC

```yaml
on:
  schedule:
    - cron: '0 9 * * 1'
```

### Every 6 Hours

```yaml
on:
  schedule:
    - cron: '0 */6 * * *'
```

### First Day of Every Month

```yaml
on:
  schedule:
    - cron: '0 0 1 * *'
```

---

## Advanced Examples

### Custom Data Branch

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.GITHUB_STAR_TRACKER_TOKEN }}
    data-branch: 'my-star-data'
```

### Extended History (2 Years)

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.GITHUB_STAR_TRACKER_TOKEN }}
    max-history: '104'
```

### Top 5 Repos in Charts

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.GITHUB_STAR_TRACKER_TOKEN }}
    top-repos: '5'
```

### YAML Configuration File

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.GITHUB_STAR_TRACKER_TOKEN }}
    config-path: '.github/star-tracker.yml'
```

With `.github/star-tracker.yml`:

```yaml
visibility: public
include_archived: false
include_forks: false
min_stars: 5
exclude_repos:
  - /^test-.*/
  - deprecated-project
locale: en
include_charts: true
track_stargazers: true
top_repos: 5
notification_threshold: auto
```

### Complete Setup with All Features

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.GITHUB_STAR_TRACKER_TOKEN }}
    visibility: 'public'
    include-archived: false
    include-forks: false
    min-stars: '5'
    locale: 'en'
    include-charts: true
    track-stargazers: true
    top-repos: '5'
    max-history: '52'
    notification-threshold: 'auto'
    smtp-host: smtp.gmail.com
    smtp-port: '587'
    smtp-username: ${{ secrets.EMAIL_FROM }}
    smtp-password: ${{ secrets.EMAIL_PASSWORD }}
    email-from: ${{ secrets.EMAIL_FROM }}
    email-to: ${{ secrets.EMAIL_TO }}
    send-on-no-changes: false
```

### Export CSV Report

```yaml
- name: Track stars
  id: tracker
  uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.GITHUB_STAR_TRACKER_TOKEN }}

- name: Save CSV report
  run: echo "${{ steps.tracker.outputs.report-csv }}" > star-data.csv

- name: Upload CSV
  uses: actions/upload-artifact@v4
  with:
    name: star-data-csv
    path: star-data.csv
```

### Save Report as Artifact

```yaml
- name: Track stars
  id: tracker
  uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.GITHUB_STAR_TRACKER_TOKEN }}

- name: Save report
  run: echo "${{ steps.tracker.outputs.report }}" > star-report.md

- name: Upload artifact
  uses: actions/upload-artifact@v4
  with:
    name: star-report
    path: star-report.md
```

### Debug Outputs

```yaml
- name: Track stars
  id: tracker
  uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.GITHUB_STAR_TRACKER_TOKEN }}

- name: Debug outputs
  run: |
    echo "Total stars: ${{ steps.tracker.outputs.total-stars }}"
    echo "Stars changed: ${{ steps.tracker.outputs.stars-changed }}"
    echo "New stars: ${{ steps.tracker.outputs.new-stars }}"
    echo "Lost stars: ${{ steps.tracker.outputs.lost-stars }}"
    echo "Should notify: ${{ steps.tracker.outputs.should-notify }}"
    echo "New stargazers: ${{ steps.tracker.outputs.new-stargazers }}"
    echo "CSV report: ${{ steps.tracker.outputs.report-csv }}"
```

---

## Next Steps

- **[Configuration](Configuration)** — All available options
- **[API Reference](API-Reference)** — Complete inputs/outputs
- **[Troubleshooting](Troubleshooting)** — Common issues
