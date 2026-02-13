# Getting Started

This guide will walk you through setting up GitHub Star Tracker in your repository.

## Prerequisites

- A GitHub account
- At least one public or private repository
- GitHub Actions enabled in your repository

## Step 1: Create a Personal Access Token

GitHub Star Tracker requires a **Personal Access Token (PAT)** to access your repository list.

> ⚠️ **IMPORTANT:** The default `GITHUB_TOKEN` provided by GitHub Actions **does not** have sufficient permissions to list all your repositories. You must create a PAT.

### Creating the PAT

1. Go to [GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)](https://github.com/settings/tokens)
2. Click **"Generate new token (classic)"**
3. Configure the token:
   - **Note:** `GitHub Star Tracker`
   - **Expiration:** Choose your preferred expiration
   - **Scopes:**
     - ✅ `repo` (for private repositories)
     - OR ✅ `public_repo` (for public repositories only)
4. Click **"Generate token"**
5. **Copy the token immediately** (you won't be able to see it again)

### Adding the Token to Your Repository

1. Go to your repository **Settings → Secrets and variables → Actions**
2. Click **"New repository secret"**
3. Create the secret:
   - **Name:** `STAR_TRACKER_TOKEN`
   - **Value:** Paste your PAT
4. Click **"Add secret"**

## Step 2: Create the Workflow File

Create a new file in your repository at `.github/workflows/star-tracker.yml`:

```yaml
name: Track GitHub Stars

on:
  schedule:
    # Run daily at midnight UTC
    - cron: '0 0 * * *'
  # Allow manual triggers
  workflow_dispatch:

jobs:
  track-stars:
    runs-on: ubuntu-latest
    steps:
      - name: Track star changes
        uses: fbuireu/github-star-tracker@v1
        with:
          github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
```

## Step 3: Run the Action

### Manual Run (Recommended for First Time)

1. Go to your repository's **Actions** tab
2. Select **"Track GitHub Stars"** workflow
3. Click **"Run workflow"** → **"Run workflow"**
4. Wait for the workflow to complete (usually 10-30 seconds)

### Verify It Worked

After the first run, check:

1. **Data Branch:** Go to your repository branches and look for `star-tracker-data`
2. **View Report:** Navigate to `https://github.com/YOUR_USERNAME/YOUR_REPO/tree/star-tracker-data`
3. **Check Files:**
   - `README.md` — Full report with charts
   - `stars-data.json` — Historical data
   - `stars-badge.svg` — Star count badge

## Step 4: Add Badge to Your Repository (Optional)

Display your total star count in your main README:

```markdown
![Total Stars](https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/star-tracker-data/stars-badge.svg)
```

Link to the full report:

```markdown
[📊 View detailed star report](https://github.com/YOUR_USERNAME/YOUR_REPO/tree/star-tracker-data)
```

## What Happens Next?

- The action will run **daily at midnight UTC** (based on the cron schedule)
- Each run compares current stars with the previous run
- Reports are updated in the `star-tracker-data` branch
- Historical data accumulates over time, creating a trend

## Customization

Ready to customize? Check out:

- **[Configuration](Configuration)** — All available options
- **[Email Notifications](Email-Notifications)** — Get reports via email
- **[Star Trend Charts](Star-Trend-Charts)** — Enable visual charts
- **[Examples](Examples)** — Advanced configurations

## Troubleshooting

Having issues? See the **[Troubleshooting](Troubleshooting)** guide.

## Next Steps

- ✅ Customize the schedule (daily, weekly, monthly)
- ✅ Enable star trend charts
- ✅ Configure email notifications
- ✅ Set up localization for your language
- ✅ Filter repositories by visibility

See **[Configuration](Configuration)** for all options.
