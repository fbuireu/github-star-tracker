# :star: GitHub Star Tracker

**Track star count changes across your repositories — automatically and get notified!**

GitHub Star Tracker is a GitHub Action that monitors star counts across all your repositories, generates historical reports with charts and forecasts, and optionally sends email notifications when activity is detected.

---

## What It Does

- Fetches star counts for your repos via the GitHub API
- Compares against the previous snapshot to compute deltas
- Generates a **Markdown report**, **SVG badge**, **animated SVG charts**, and an **HTML email digest**
- Commits everything to an isolated **data branch** (your `main` branch is never touched)
- Optionally tracks **individual stargazers** and produces **growth forecasts**
- Sends **email notifications** when thresholds are met

---

## Quick Navigation

| Page | Description |
|------|-------------|
| **[Getting Started](Getting-Started)** | Token setup, first workflow, first run |
| **[How It Works](How-It-Works)** | Execution flow, architecture, data pipeline |
| **[Technical Stack](Technical-Stack)** | Technologies, design decisions, DDD layers |
| **[Personal Access Token (PAT)](<Personal-Access-Token-(PAT)>)** | Classic & fine-grained token creation |
| **[Configuration](Configuration)** | All available options, file-based config, precedence |
| **[API Reference](API-Reference)** | Complete inputs, outputs, and data formats |
| **[Examples](Examples)** | Real-world workflows and advanced recipes |
| **[Star Trend Charts](Star-Trend-Charts)** | SVG charts, QuickChart URLs, chart types |
| **[Email Notifications](Email-Notifications)** | Built-in SMTP and external action setup |
| **[Viewing Reports](Viewing-Reports)** | Data branch, badges, action outputs |
| **[Data Management](Data-Management)** | Snapshots, history rotation, generated files |
| **[Internationalization (i18n)](<Internationalization-(i18n)>)** | Multi-language support (en, es, ca, it) |
| **[Known Limitations](Known-Limitations)** | Technical constraints and design trade-offs |
| **[Troubleshooting](Troubleshooting)** | Common issues and solutions |

---

## Key Features

### Tracking & Automation

- Automated scheduling (daily, weekly, or on-demand)
- Up to 52 weeks of historical star data (configurable)
- Smart filters: visibility, archived, forks, regex exclusions, min-stars, whitelist
- Individual stargazer tracking (opt-in)
- Growth forecasts using linear regression and weighted moving average

### Reports & Visualizations

- Animated SVG charts committed to the data branch (star history, per-repo, comparison, forecast)
- QuickChart.io URLs in HTML email reports
- SVG star count badge
- Markdown and HTML report formats

### Notifications

- Built-in SMTP email support
- Configurable notification thresholds: every run, every N stars, or adaptive (`auto`)
- Compatible with external notification actions (Slack, Discord, etc.)

### Developer Experience

- Multi-language: English, Spanish, Catalan, Italian
- Flexible config: action inputs, YAML file, or both
- Action outputs for downstream workflow steps
- 100% TypeScript with strict mode, 95%+ test coverage, zero runtime deps (bundled)

---

## Minimal Setup

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

> **Note:** `STAR_TRACKER_TOKEN` must be a [Personal Access Token](https://github.com/settings/tokens) with `repo` or `public_repo` scope. The default `GITHUB_TOKEN` is not sufficient.

See **[Getting Started](Getting-Started)** for the full setup walkthrough.

---

## License

[AGPL-3.0](https://github.com/fbuireu/github-star-tracker/blob/main/LICENSE) — Made by [Ferran Buireu](https://github.com/fbuireu)
