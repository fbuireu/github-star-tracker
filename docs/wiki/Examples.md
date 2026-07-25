Real-world workflow configurations for common use cases. For rendered chart outputs and a side-by-side comparison of every chart option, see the **[examples gallery](https://github.com/fbuireu/github-star-tracker/blob/main/examples/README.md)**.

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
      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6.0.3
      - uses: fbuireu/github-star-tracker@v1
        with:
          github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
```

### Public Repositories Only

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    visibility: 'public'
```

### Only Repos You Own

Excludes repos where you're a collaborator:

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    visibility: 'owned'
```

### Spanish Reports with Charts

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    locale: 'es'
    include-charts: true
```

---

## Filtering Examples

### Filter by Minimum Stars

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    min-stars: '10'
```

### Exclude Specific Repos

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    exclude-repos: 'archived-repo,test-project'
```

### Exclude by Regex Pattern

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    exclude-repos: '/^test-.*/, /^demo-.*/, old-project'
```

### Track Specific Repos Only

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    only-repos: 'my-awesome-project,another-repo'
```

### Include Archived and Forks

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
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

When the workflow runs on a GHES runner, the API URL is auto-detected from the `GITHUB_API_URL` environment variable - no extra input needed:

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
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
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    smtp-host: smtp.gmail.com
    smtp-port: '587'
    smtp-username: ${{ secrets.EMAIL_FROM }}
    smtp-password: ${{ secrets.EMAIL_PASSWORD }}
    email-from: ${{ secrets.EMAIL_FROM }}
    email-to: ${{ secrets.EMAIL_TO }}
```

### External Email with Threshold

`notification-threshold` defaults to `0` (notify on every run that has changes). Any other value accumulates across runs until it trips - here, five stars of net movement since the last email:

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
    # Use report-html-path (file) instead of report-html (string) to avoid
    # "Argument list too long" errors when reports are large.
    html_body_file: ${{ steps.tracker.outputs.report-html-path }}
```

### Notify Every N Stars

Email once per 500 stars gained, not once per day. `notification-threshold` accumulates across runs until it trips, and `notification-mode: 'gains'` counts only upward movement, so a drop never triggers the email.

> [!IMPORTANT]
> The threshold decides **when** the email fires; it does not widen the report. With the default `compare-against: 'last-run'` the attached report still covers a single run, so a "+500 milestone" subject would sit above a one-day table. This example therefore drives its subject from `total-stars` and pairs the threshold with `compare-against: '30d'` so the body covers a period comparable to what the threshold accumulates. If you only care about the subject line, drop `compare-against` and ignore the body.

```yaml
- name: Track stars
  id: tracker
  uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    notification-threshold: '500'
    notification-mode: 'gains'
    compare-against: '30d'

- name: Send email every 500 stars
  if: steps.tracker.outputs.should-notify == 'true'
  uses: dawidd6/action-send-mail@62a2d05b79935ad4fb90ce9079928099579c14ac # v9
  with:
    server_address: smtp.gmail.com
    server_port: 587
    username: ${{ secrets.EMAIL_FROM }}
    password: ${{ secrets.EMAIL_PASSWORD }}
    subject: '⭐ Milestone reached: ${{ steps.tracker.outputs.total-stars }} stars'
    to: ${{ secrets.EMAIL_TO }}
    from: GitHub Star Tracker
    html_body_file: ${{ steps.tracker.outputs.report-html-path }}
```

Use `should-notify`, not `new-stars`. They answer different questions:

- **`new-stars` / `lost-stars`** - per-run figures measured against the comparison baseline. They are not cumulative and carry no memory of whether an email was sent. On a daily cron with `compare-against: 'last-run'` they mean "gained in the last 24 hours".
- **`should-notify`** - the cumulative one. Driven by `notification-threshold` plus `notification-mode` against `starsAtLastNotification`, which is only updated when a notification actually fires, so the counter keeps accumulating across runs until it trips. It also requires that something actually changed.

`if: steps.tracker.outputs.new-stars >= 500` would demand 500 stars inside a single run and would almost never fire on a daily schedule.

`notification-mode` picks how that accumulated change is measured: `net` (default) uses the absolute change in total stars since the last notification, so gains and losses across repos cancel out and a large drop also reaches the threshold; `gains` only counts upward movement.

Whether the threshold fires an email straight away depends on the data branch. If no notification has ever fired there, `starsAtLastNotification` is absent and treated as `0`, so the first run fires once immediately and then settles into the configured cadence. If you have been running with the default `notification-threshold: '0'`, every changed run has already been notifying, so `starsAtLastNotification` is stored at your current total - raising the threshold does **not** fire immediately, and the next email only arrives once the full threshold has accumulated from that total.

### Weekly Digest

Track daily so the history stays dense for charts and velocity, but compare against a snapshot at least seven days old and email only on Mondays:

```yaml
name: Weekly Star Digest
on:
  schedule:
    - cron: '0 9 * * 1'      # Monday - track and send the digest
    - cron: '0 9 * * 0,2-6'  # other days - track only
  workflow_dispatch:

permissions:
  contents: write

jobs:
  digest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6.0.3
      - name: Track stars
        id: tracker
        uses: fbuireu/github-star-tracker@v1
        with:
          github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
          compare-against: '7d'
          include-charts: true

      - name: Send weekly digest
        if: github.event.schedule == '0 9 * * 1' && steps.tracker.outputs.stars-changed == 'true'
        uses: dawidd6/action-send-mail@62a2d05b79935ad4fb90ce9079928099579c14ac # v9
        with:
          server_address: smtp.gmail.com
          server_port: 587
          username: ${{ secrets.EMAIL_FROM }}
          password: ${{ secrets.EMAIL_PASSWORD }}
          subject: '⭐ This week: ${{ steps.tracker.outputs.total-stars }} stars (+${{ steps.tracker.outputs.new-stars }})'
          to: ${{ secrets.EMAIL_TO }}
          from: GitHub Star Tracker
          html_body_file: ${{ steps.tracker.outputs.report-html-path }}
```

`compare-against` only changes the comparison baseline - the one used for `new-stars`, `lost-stars`, `stars-changed`, the total delta and the "Compared to snapshot from ..." line. Every run still appends its own snapshot, and charts, forecast and velocity are unaffected. If the stored history is shorter than the requested window, the oldest available snapshot is used instead, so the period covered is shorter than requested and the report's date shows how far back it really goes.

### Adaptive Notification Threshold

`auto` is opt-in, not the default - set it explicitly to let the action derive the threshold instead of picking a fixed number:

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
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
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}

- name: Post to Slack
  if: steps.tracker.outputs.stars-changed == 'true'
  uses: slackapi/slack-github-action@fcfb566f8b0aab22203f066d80ca1d7e4b5d05b3 # v1.27.1
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
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}

- name: Create issue on star loss
  if: steps.tracker.outputs.lost-stars > 0
  uses: actions/github-script@f28e40c7f34bde8b3046d885e986cb6290c5673b # v7.1.0
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
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    track-stargazers: true
```

New stargazers appear in reports with avatar, profile link, and starred date.

### Notify on New Stargazers

```yaml
- name: Track stars
  id: tracker
  uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
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
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    data-branch: 'my-star-data'
```

### Extended History (2 Years)

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    max-history: '104'
```

### Top 5 Repos in Charts

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    top-repos: '5'
```

### Customized Charts

Tune the chart appearance: the curve style, theme, colors, milestones, trend line and time window. To see what each option looks like, browse the rendered side-by-side comparisons in the **[examples gallery](https://github.com/fbuireu/github-star-tracker/blob/main/examples/README.md)**.

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    include-charts: true
    chart-curve: monotone              # monotone | catmull-rom | cubic-bezier | rounded-step
    chart-theme: dark                  # auto | light | dark
    chart-line-color: '6b63ff'         # drop the # (a bare # starts a YAML comment) or quote it
    chart-line-width: '3'
    chart-milestones: true
    chart-custom-milestones: '250, 750, 2500'
    chart-trend-line: true
    chart-range: 1y                    # 30d | 90d | 1y | all
    chart-begin-at-zero: false
```

### YAML Configuration File

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
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
chart_curve: monotone
track_stargazers: true
top_repos: 5
notification_threshold: auto
notification_mode: gains
compare_against: 7d
```

### Complete Setup with All Features

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    visibility: 'public'
    include-archived: false
    include-forks: false
    min-stars: '5'
    locale: 'en'
    include-charts: true
    chart-curve: monotone
    chart-theme: auto
    chart-trend-line: true
    track-stargazers: true
    top-repos: '5'
    max-history: '52'
    notification-threshold: 'auto'
    notification-mode: 'gains'
    compare-against: 'last-run'
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
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}

- name: Save CSV report
  run: echo "${{ steps.tracker.outputs.report-csv }}" > star-data.csv

- name: Upload CSV
  uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2
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
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}

- name: Save report
  run: echo "${{ steps.tracker.outputs.report }}" > star-report.md

- name: Upload artifact
  uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2
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
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}

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

- **[Configuration](Configuration)** - All available options
- **[API Reference](API-Reference)** - Complete inputs/outputs
- **[Troubleshooting](Troubleshooting)** - Common issues
