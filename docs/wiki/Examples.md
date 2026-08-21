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

Gate on `should-notify`, never on `new-stars >= 500`: the latter demands 500 stars inside one run and
therefore almost never fires. Why the two behave so differently, what `notification-mode` measures, and
whether raising the threshold fires immediately are all in
**[Email Notifications](Email-Notifications#notification-threshold)**.

### Weekly Digest

Track daily so the history stays dense for velocity, but compare against a snapshot at least seven days old and email only on Mondays.

> [!NOTE]
> Unlike the digest in [Email Notifications](Email-Notifications#weekly-digest), **this workflow owns the
> data branch**: it is the one writing the snapshots, which is why it has `contents: write` and no
> `read-only`. Use that version instead if a separate workflow is already maintaining the branch.

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

### Read-Only Digest on a Shared Data Branch

The counterpart of the workflow above: this one **reads** a data branch another workflow maintains. It
builds the report, sets every output and sends the email, but never commits, so the two cannot race to push.

```yaml
- uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6.0.3
- name: Build the digest
  id: tracker
  uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    data-branch: star-tracker-data   # the branch your tracking workflow writes
    read-only: true
    compare-against: '7d'
```

Three things to get right:

- The job needs only `permissions: contents: read`. Nothing is pushed.
- **The branch must already exist.** A read-only run refuses to create one and fails the job.
- Leave `notification-threshold` at `0` and gate the mailer on `stars-changed`. The threshold's counter
  lives on the data branch, which this run never writes, so any other value would either fire every time or
  never fire. The action warns when both are set.

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
    SLACK_WEBHOOK_TYPE: INCOMING_WEBHOOK
```

`SLACK_WEBHOOK_TYPE` is required alongside `SLACK_WEBHOOK_URL`; without it the step fails before it posts
anything. Use `INCOMING_WEBHOOK` for a classic incoming webhook URL.

### Create Issue on Star Loss

This one calls the issues API, so the job needs `issues: write` on top of whatever the tracker itself needs:

```yaml
permissions:
  contents: write
  issues: write

# ...

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

## Advanced Examples

### Growth Velocity in the Report

`velocity-metrics` is off by default. Turning it on adds a section giving the current stars-per-day rate,
the growth percentage behind it and a projected number of days to the next milestone:

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    velocity-metrics: true
```

Velocity is computed from the **stored** snapshots, not from the reconstructed chart curve, so it needs at
least two runs at least six hours apart before it appears. A denser schedule gives a more responsive rate;
it does not add chart detail.

### Large Repositories Without Exhausting the Rate Limit

A repository with 50,000 stars costs 400 stargazer requests per run. `smart-sampling` reads an evenly spread
subset of pages instead of all of them, for repositories above a threshold:

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    smart-sampling: true
    smart-sampling-threshold: '1500'  # only repos strictly above this are sampled
    smart-sampling-pages: '30'        # pages to read from each sampled repo
```

The trade-off is a coarser curve for those repositories and **no new-stargazer detection** for them, since
absence from a sample is not evidence. Repositories below the threshold are unaffected. See
[Known Limitations](Known-Limitations#-stargazer-api-rate-limits).

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
    velocity-metrics: true
    send-on-no-changes: false
    # Plus the SMTP block for the built-in mailer:
    # https://github.com/fbuireu/github-star-tracker/wiki/Email-Notifications#option-b-built-in-smtp
```

### Save a Report as a Workflow Artifact

The same shape works for `report` (Markdown), `report-csv` and `report-html`. Swap the output name and the
filename:

```yaml
- name: Track stars
  id: tracker
  uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}

- name: Save report
  env:
    REPORT: ${{ steps.tracker.outputs.report-csv }}
  run: printf '%s' "$REPORT" > star-data.csv

- name: Upload artifact
  uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2
  with:
    name: star-data-csv
    path: star-data.csv
```

> [!NOTE]
> Passing the report through `env:` rather than interpolating it into the `run:` line keeps repository names
> out of the shell as code. It does **not** raise the size ceiling: argv and the environment share one
> limit, so a very large report can still fail with `Argument list too long`. Only the HTML report has a
> path output (`report-html-path`) that sidesteps this entirely; the CSV and Markdown reports do not.

---

## Next Steps

- **[Configuration](Configuration)** - All available options
- **[API Reference](API-Reference)** - Complete inputs/outputs
- **[Troubleshooting](Troubleshooting)** - Common issues
