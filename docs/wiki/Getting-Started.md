This guide walks you through setting up GitHub Star Tracker from scratch.

## Prerequisites

- A GitHub account with at least one repository
- GitHub Actions enabled in that repository

---

## Step 1: Create a Personal Access Token

GitHub Star Tracker needs a **Personal Access Token (PAT)**, because the default `GITHUB_TOKEN` cannot list repositories across your account.

Create one (classic, with `repo` or `public_repo` scope) and store it in your repository under **Settings > Secrets and variables > Actions** as a secret named `STAR_TRACKER_TOKEN`.

> **[Personal Access Token (PAT)](<Personal-Access-Token-(PAT)>)** is the full walkthrough: classic tokens, fine-grained tokens, which permissions each one needs, and what breaks when they are missing.

---

## Step 2: Create the Workflow

Create `.github/workflows/star-tracker.yml` in your repository:

```yaml
name: Track Stars

on:
  schedule:
    - cron: '0 0 * * *' # Daily at midnight UTC
  workflow_dispatch: # Allow manual triggers

jobs:
  track:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6.0.3
      - uses: fbuireu/github-star-tracker@v1
        with:
          github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
```

That is the minimal setup: the action tracks every repository your token can see, with default settings.

> [!NOTE]
> The workflow needs no `permissions:` block. The action pushes to the data branch with `github-token` (your PAT), never with the workflow's `GITHUB_TOKEN`, so granting `contents: write` to the job changes nothing. The `actions/checkout` step only reads.

---

## Step 3: Run the Action

### First Run (Manual)

1. Go to your repository's **Actions** tab
2. Select **"Track Stars"** from the workflow list
3. Click **"Run workflow"** > **"Run workflow"**

Give the first run time. With `include-charts` on (the default) the action walks every page of stargazers for every tracked repo, so it can reconstruct the real star-history curve from their starred dates. A handful of small repos finish in well under a minute; an account with tens of thousands of stars can take several minutes. Later runs do the same work, so the duration tracks your total star count rather than settling down over time. Turn on [`smart-sampling`](Configuration#smart-sampling) if that becomes a problem.

### Verify It Worked

After the first run:

1. Go to your repository's branch selector and look for `star-tracker-data`
2. Navigate to `https://github.com/YOUR_USER/YOUR_REPO/tree/star-tracker-data`
3. You should see:
   - [`README.md`](https://github.com/fbuireu/github-star-tracker/blob/main/README.md), the full Markdown report
   - `stars-data.json`, the historical data
   - `stars-data.csv`, the same run as a flat CSV
   - [`stars-badge.svg`](https://github.com/fbuireu/github-star-tracker/blob/main/examples/stars-badge.svg), the star count badge
   - `charts/`, the SVG charts the report embeds

### If the Branch Never Appears

If the run finishes green but no `star-tracker-data` branch exists, check the log for `No repositories matched the configured filters`. When nothing matches, the action reports an empty run: every output is set from an empty summary, the HTML report is still written, and the data branch is never touched, so none of the files above are created.

The usual causes are a `visibility` filter with nothing behind it (`private` on an account with no private repos), a `min-stars` floor above every repo you own, or an `only-repos` / `only-orgs` list that matches nothing. Relax the filter and run again. See **[Configuration](Configuration#filtering-options)**.

---

## Step 4: Add Badge to Your README (Optional)

Display your total star count in your main README:

```markdown
![Total Stars](https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/star-tracker-data/stars-badge.svg)
```

Link to the full report:

```markdown
[![Total Stars](https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/star-tracker-data/stars-badge.svg)](https://github.com/YOUR_USER/YOUR_REPO/tree/star-tracker-data)
```

Embed the star history chart:

```markdown
![Star History](https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/star-tracker-data/charts/star-history.svg)
```

---

## What Happens Next

- The action runs on your configured schedule (daily, with the workflow above)
- Each run compares current stars with the previous snapshot
- Reports and charts are updated on the `star-tracker-data` branch
- Animated SVG charts appear in the `charts/` directory from the first run, reconstructed from your stargazers' real starred dates
- Growth forecasts are computed from the first run too, once the reconstructed history has at least 3 points

---

## Next Steps

- **[Configuration](Configuration)**: customize filters, charts, locale, and more
- **[Email Notifications](Email-Notifications)**: get reports sent to your inbox
- **[Star Trend Charts](Star-Trend-Charts)**: understand the chart types
- **[Examples](Examples)**: advanced workflow configurations
- **[Troubleshooting](Troubleshooting)**: if something doesn't work
