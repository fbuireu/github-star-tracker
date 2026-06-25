This guide walks you through setting up GitHub Star Tracker from scratch.

## Prerequisites

- A GitHub account with at least one repository
- GitHub Actions enabled in your repository

---

## Step 1: Create a Personal Access Token

GitHub Star Tracker requires a **Personal Access Token (PAT)** because the default `GITHUB_TOKEN` cannot list repositories across your account.

1. Go to **[GitHub Settings > Tokens (classic)](https://github.com/settings/tokens)**
2. Click **"Generate new token (classic)"**
3. Configure:
   - **Note:** `GitHub Star Tracker`
   - **Expiration:** 90 days (recommended)
   - **Scopes:** `repo` (private + public) or `public_repo` (public only)
4. Click **"Generate token"** and **copy it immediately**
5. In your repository, go to **Settings > Secrets and variables > Actions**
6. Click **"New repository secret"**:
   - **Name:** `STAR_TRACKER_TOKEN`
   - **Value:** paste your PAT

> For detailed instructions (including fine-grained tokens), see **[Personal Access Token (PAT)](<Personal-Access-Token-(PAT)>)**.

---

## Step 2: Create the Workflow

Create `.github/workflows/star-tracker.yml` in your repository:

```yaml
name: Track Stars

on:
  schedule:
    - cron: '0 0 * * *' # Daily at midnight UTC
  workflow_dispatch: # Allow manual triggers

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

That's the minimal setup. The action will track all your repositories with default settings.

---

## Step 3: Run the Action

### First Run (Manual)

1. Go to your repository's **Actions** tab
2. Select **"Track Stars"** from the workflow list
3. Click **"Run workflow"** > **"Run workflow"**
4. Wait for completion (~10-30 seconds)

### Verify It Worked

After the first run:

1. Go to your repository's branch selector and look for `star-tracker-data`
2. Navigate to `https://github.com/YOUR_USER/YOUR_REPO/tree/star-tracker-data`
3. You should see:
   - `README.md` — Full Markdown report
   - `stars-data.json` — Historical data (JSON)
   - `stars-badge.svg` — Star count badge

> Charts and forecasts appear on the first run: when charts are enabled (the default), the action reconstructs the real star-history curve from your stargazers' starred dates.

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

- The action runs on your configured schedule (daily by default)
- Each run compares current stars with the previous snapshot
- Reports and charts are updated on the `star-tracker-data` branch
- Animated SVG charts appear in the `charts/` directory from the first run, reconstructed from your stargazers' real starred dates
- Growth forecasts are computed from the first run, once the reconstructed history has at least 3 points

---

## Next Steps

- **[Configuration](Configuration)** — Customize filters, charts, locale, and more
- **[Email Notifications](Email-Notifications)** — Get reports sent to your inbox
- **[Star Trend Charts](Star-Trend-Charts)** — Understand the chart types
- **[Examples](Examples)** — Advanced workflow configurations
- **[Troubleshooting](Troubleshooting)** — If something doesn't work
