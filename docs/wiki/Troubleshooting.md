Solutions for common issues with GitHub Star Tracker.

---

## Authentication

### "Bad credentials" or 401 Error

**Cause:** Invalid or expired Personal Access Token.

**Fix:**
1. Generate a new token at **[GitHub Settings > Tokens](https://github.com/settings/tokens)**
2. Ensure the token has `repo` scope (for private repos) or `public_repo` scope (public only)
3. Update the secret in your repo: **Settings > Secrets and variables > Actions**
4. Re-run the workflow

### "Resource not accessible by integration"

**Cause:** Using the default `GITHUB_TOKEN` instead of a Personal Access Token.

**Fix:** The default `GITHUB_TOKEN` cannot list repositories across your account. You must create a Personal Access Token. See **[Personal Access Token (PAT)](<Personal-Access-Token-(PAT)>)**.

### Token Works Locally but Fails in Actions

**Cause:** The secret name in the workflow doesn't match the secret stored in the repo.

**Fix:** Verify the secret name matches exactly:
```yaml
# In workflow
github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
```
Must match the secret name `STAR_TRACKER_TOKEN` in **Settings > Secrets**.

---

## Permissions

### "Permission denied" or 403 on Push

**Cause:** The workflow doesn't have write permission to push to the data branch.

**Fix:** Add permissions to your workflow:

```yaml
permissions:
  contents: write
```

### "refusing to allow a Personal Access Token to create or update workflow files"

**Cause:** The token doesn't have the `workflow` scope, and the data branch somehow contains workflow files.

**Fix:** This shouldn't happen with normal usage. If it does, delete the data branch and let the action recreate it:

```bash
git push origin --delete star-tracker-data
```

---

## Data Issues

### No Data After First Run

**Expected behavior.** The first run creates the data branch and records initial star counts with `delta: 0`. Star-history charts are reconstructed from each stargazer's real `starred_at` date, so they appear on the first run (whenever `include-charts` is on). Growth forecasts still require 3+ snapshots/runs.

### Empty Report or Zero Stars

**Possible causes:**
- Token doesn't have access to the repos you expect
- All repos are filtered out by `visibility`, `min-stars`, `exclude-repos`, or other filters
- Only forks/archived repos exist and `include-forks`/`include-archived` are `false`

**Fix:** Check your filters. Try running with minimal config first:

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
```

### Stale or Missing Data Branch

**Fix:** Delete the branch and let the action recreate it:

```bash
git push origin --delete star-tracker-data
```

### Data Branch Shows in PR Comparisons

**Cause:** Some Git tools show orphan branches in comparisons.

**Fix:** This is cosmetic. The data branch has no common history with `main` and cannot be merged.

---

## Charts

### No Charts Generated

**Possible causes:**
- `include-charts: false`
- The repo has no stargazers with valid `starred_at` dates
- All repos filtered out
- The stargazers endpoint returned empty or `403` for repos where you are not an admin or collaborator, per GitHub's [2026 API access restrictions](https://github.blog/changelog/2026-06-30-upcoming-access-restrictions-to-public-api-endpoints-and-ui-views/)

**Fix:** Ensure `include-charts` is true (default) and that tracked repos have stargazers. Charts are reconstructed from real stargazer history and do not require multiple runs.

### Chart Is a Flat or Straight Line

**Cause:** The stargazers fetch for that repository came back empty or failed, so its history cannot be reconstructed. The run log includes a warning naming the affected repository and, for failures, the API error. Common reasons:

- **Rate limiting on large repositories.** A repository above 40,000 stars costs 400 API requests per run without smart sampling; a handful of large repos can exhaust the 5,000 requests/hour REST quota mid-run.
- **A fine-grained PAT that does not cover the repository.** Fine-grained tokens are scoped per organization; repos under other orgs you belong to are not included unless granted.
- **Organization repositories where you are a member with read access only** (neither admin nor direct collaborator), per GitHub's [2026 API access restrictions](https://github.blog/changelog/2026-06-30-upcoming-access-restrictions-to-public-api-endpoints-and-ui-views/). Classic PATs over your own repositories are unaffected.

The per-repo chart then falls back to the stored per-run snapshots, which only cover the period the action has been running.

**Fix:** Check the run log warning for the actual reason. Enable `smart-sampling` to cut large-repo fetches from 400 requests to a few dozen, or use a token that covers the repository. Star counts, reports and badges are unaffected either way.

### No Forecast Chart

**Cause:** Forecasts require at least 3 snapshots.

**Fix:** Run the workflow 3+ times to accumulate enough data.

### Charts Not Updating

**Possible causes:**
- No star changes detected (the action skips the commit)
- Workflow failed silently

**Fix:** Check the workflow run logs in **Actions** tab. If stars haven't changed, no commit is made - this is expected.

> Star-history charts plot the true cumulative curve from each stargazer's `starred_at` date, not one point per run. If stars haven't changed, no new commit is made (expected).

### Broken Chart Images in README

**Cause:** Using the wrong URL or branch name.

**Fix:** Use the correct raw URL format:

```markdown
![Star History](https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/star-tracker-data/charts/star-history.svg)
```

Replace `star-tracker-data` with your `data-branch` value if customized.

---

## Email

### Email Not Received

**Checklist:**
1. Check your spam/junk folder
2. Verify SMTP credentials are correct
3. For Gmail: ensure you're using an **app password** (not your account password) - requires 2FA enabled
4. Check that `stars-changed` is `true` (no email sent if nothing changed, unless `send-on-no-changes: true`)
5. Check the workflow run logs for email-related warnings

### "Invalid login" or SMTP Authentication Failed

**Common causes:**
- Gmail: using account password instead of app password
- Incorrect username or password
- 2FA not enabled (required for Gmail app passwords)

**Fix for Gmail:**
1. Enable 2-factor authentication
2. Go to **[App Passwords](https://myaccount.google.com/apppasswords)**
3. Generate a new app password for "Mail"
4. Use the 16-character generated password as `smtp-password`

### Email Sent When It Shouldn't Be

**Fix:** Add a condition to your email step:

```yaml
- name: Send email
  if: steps.tracker.outputs.stars-changed == 'true'
  uses: dawidd6/action-send-mail@62a2d05b79935ad4fb90ce9079928099579c14ac # v9
```

Or use `notification-threshold` with the built-in email to control frequency.

### Charts Missing in Email

**Possible causes:**
- `include-charts: false`
- Less than 2 snapshots
- Email client blocking external images (QuickChart.io URLs)

**Fix:** Click "Show images" or "Load remote content" in your email client.

---

## Workflow

### "fatal: not in a git directory" / "This action must run inside a checked-out repository"

**Cause:** The workflow is missing the `actions/checkout` step. The action stores its data in a Git branch, so it needs the repository checked out before it runs.

**Fix:** Add `actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6.0.3` as the first step:

```yaml
steps:
  - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6.0.3
  - uses: fbuireu/github-star-tracker@v1
    with:
      github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
```

### Workflow Doesn't Run on Schedule

**Possible causes:**
- GitHub Actions disables scheduled workflows after 60 days of repo inactivity
- Cron syntax error
- Workflow file is not on the default branch

**Fix:**
- Push a commit or manually trigger the workflow to re-enable it
- Validate cron syntax at [crontab.guru](https://crontab.guru)
- Ensure the workflow file is in `.github/workflows/` on your default branch

### Workflow Runs but Nothing Happens

**Possible causes:**
- No star changes detected (expected - no commit is made)
- All repos filtered out

**Fix:** Check the workflow run logs. The action logs which repos are tracked and any filtering that occurred.

### "Resource not accessible" for Forked Repos

**Cause:** Your PAT only has `public_repo` scope but is trying to access private forks.

**Fix:** Use `repo` scope on the PAT if you need access to private repositories.

---

## Configuration

### Config File Not Found

**Cause:** Wrong path or the file doesn't exist.

**Fix:** The default path is `star-tracker.yml` at the repo root. If using a custom path:

```yaml
with:
  config-path: '.github/star-tracker.yml'
```

Ensure the file exists at that path on the branch where the workflow runs.

### Config File Ignored

**Cause:** Action inputs take precedence over config file values.

**Fix:** If you set an option in both the workflow and the config file, the workflow value wins. Remove the workflow input to let the config file value apply.

See **[Configuration > Precedence](Configuration)**.

### Invalid Locale Warning

**Cause:** Unsupported locale value.

**Fix:** Use one of: `en`, `es`, `ca`, `it`. The action falls back to `en` with a warning.

### Regex Pattern Not Matching

**Cause:** Regex patterns in `exclude-repos` must be wrapped in `/`:

```yaml
# Correct
exclude-repos: '/^test-.*/'

# Incorrect - treated as literal string
exclude-repos: '^test-.*'
```

---

## Getting Help

If your issue isn't covered here:

1. Check the **[workflow run logs](https://docs.github.com/en/actions/monitoring-and-troubleshooting-workflows/viewing-workflow-run-history)** for detailed error messages
2. Open an issue at **[github-star-tracker/issues](https://github.com/fbuireu/github-star-tracker/issues)**
3. Include: workflow file, error logs, and expected vs actual behavior

---

## Next Steps

- **[Configuration](Configuration)** - All available options
- **[Known Limitations](Known-Limitations)** - Current constraints
- **[Examples](Examples)** - Working configurations
