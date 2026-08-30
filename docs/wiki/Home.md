**Track star counts across every repository your token can see, on a schedule, with reports, charts and optional email alerts.**

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
| **[How It Works](How-It-Works)** | Execution flow, data pipeline, phase by phase |
| **[Architecture](Architecture)** | DDD(ish) layers, how much DDD and where it stops |
| **[Technical Stack](Technical-Stack)** | Why these tools and these dependencies |
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

## Minimal Setup

One step, one secret:

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
```

> [!NOTE]
> `STAR_TRACKER_TOKEN` must be a [Personal Access Token](<Personal-Access-Token-(PAT)>) with `repo` or `public_repo` scope. The default `GITHUB_TOKEN` is not sufficient: it cannot list repositories outside the repository that triggered the run.

The action pushes to the data branch with that same token, so the workflow itself needs no `permissions: contents: write` grant.

See **[Getting Started](Getting-Started)** for the full walkthrough: the complete workflow file, the first run, and what lands on the data branch.

---

## License

[AGPL-3.0](https://github.com/fbuireu/github-star-tracker/blob/main/LICENSE), made by [Ferran Buireu](https://github.com/fbuireu)
