# Troubleshooting

Common issues and solutions for GitHub Star Tracker.

## 🔑 Authentication Issues

### Error: `401 Unauthorized` or `403 Forbidden`

**Symptom:** Workflow fails with authentication error when listing repositories.

**Cause:** Using default `GITHUB_TOKEN` instead of Personal Access Token (PAT).

**Solution:**

1. Create a PAT with `repo` or `public_repo` scope
2. Add it as `STAR_TRACKER_TOKEN` secret
3. Use in workflow:

```yaml
with:
  github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
```

See **[Getting Started](Getting-Started)** for detailed PAT setup.

---

### Error: `Bad credentials`

**Symptom:** `HttpError: Bad credentials` in workflow logs.

**Cause:** PAT is expired, revoked, or incorrectly copied.

**Solution:**

1. Verify the secret value is correct (no extra spaces)
2. Check PAT hasn't expired at [GitHub Settings → Tokens](https://github.com/settings/tokens)
3. Generate a new token if needed
4. Update the repository secret

---

### Error: `Resource not accessible by integration`

**Symptom:** Cannot access private repositories.

**Cause:** PAT missing `repo` scope.

**Solution:**

1. Go to [GitHub Settings → Tokens](https://github.com/settings/tokens)
2. Find your token and click **Edit**
3. Check ✅ `repo` scope
4. Click **Update token**
5. Copy the token (if regenerated) and update secret

---

## 📧 Email Issues

### Email Not Received

**Check these in order:**

1. **Secrets configured?**

   ```yaml
   # Verify all secrets exist in Settings → Secrets
   EMAIL_FROM, EMAIL_PASSWORD, EMAIL_TO
   ```

2. **Correct SMTP settings?**

   ```yaml
   smtp-host: smtp.gmail.com
   smtp-port: '587' # Note: string, not number
   ```

3. **App password for Gmail?**
   - Gmail requires app-specific password (not account password)
   - See [Email Notifications → Gmail Setup](Email-Notifications#gmail)

4. **Check spam folder**
   - Search for "GitHub Star" or sender address
   - Mark as "Not Spam" if found

5. **Check workflow logs**
   ```
   Actions → Select run → View logs
   Look for email-related errors
   ```

---

### Error: `Invalid credentials`

**Symptom:** Email step fails with authentication error.

**Gmail users:**

- **Must use app-specific password**, not account password
- Enable 2FA first: [Google Account → Security](https://myaccount.google.com/security)
- Generate app password: [App Passwords](https://myaccount.google.com/apppasswords)

**Other providers:**

- Verify username/password are correct
- Check if account requires special app password

---

### Email Sent But No Charts

**Symptom:** Email received but charts are missing or broken.

**Solution:**

1. Verify charts are enabled:

   ```yaml
   with:
     include-charts: true
   ```

2. Check sufficient data exists:
   - Need at least **2 runs** for charts to appear
   - First run has no historical data

3. Check QuickChart accessibility:

   ```yaml
   - name: Test QuickChart
     run: curl -I https://quickchart.io
   ```

4. Email client blocking images:
   - Some email clients block external images by default
   - Look for "Show images" or "Load images" option
   - Add sender to safe senders list

---

### Multiple Email Copies

**Symptom:** Receiving duplicate emails on each run.

**Causes:**

- Multiple workflows running the action
- Overlapping cron schedules
- Workflow triggered multiple times

**Solution:**

1. Check for duplicate workflows:

   ```bash
   ls .github/workflows/*.yml
   ```

2. Review cron schedules:

   ```yaml
   on:
     schedule:
       - cron: '0 0 * * *' # Should appear only once
   ```

3. Add conditional email:
   ```yaml
   - name: Send email
     if: steps.tracker.outputs.stars-changed == 'true'
   ```

---

## 📊 Chart Issues

### Chart Not Displaying

**Symptom:** Report shows no chart image.

**Possible causes:**

1. **First run** (need 2+ data points)
   - **Solution:** Wait for second run

2. **Charts disabled**
   - **Solution:** Set `include-charts: true`

3. **Browser/email blocking images**
   - **Solution:** Allow external images, check browser console

4. **Invalid chart data**
   - **Solution:** Check workflow logs for chart generation errors

---

### Chart Shows Wrong Dates

**Symptom:** Chart dates are in wrong language or format.

**Solution:**

Set correct locale:

```yaml
with:
  locale: 'es' # or 'en', 'ca', 'it'
```

---

### Chart URL Too Long

**Symptom:** Chart not loading due to URL length.

**Cause:** Very large datasets exceeding URL limits.

**Solution:**

- Action automatically limits to 30 data points
- This should prevent URL overflow
- If issue persists, [report a bug](https://github.com/fbuireu/github-star-tracker/issues/new?template=bug_report.yml)

---

## 📁 Data Branch Issues

### Branch Not Created

**Symptom:** No `star-tracker-data` branch after workflow runs.

**Solution:**

1. Check workflow completed successfully:

   ```
   Actions → Select run → Verify green checkmark
   ```

2. Verify PAT has repo access:

   ```yaml
   github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
   ```

3. Check branch permissions:
   - **Settings → Branches**
   - Ensure no branch protection rules prevent creation

4. Manual branch creation (workaround):
   ```bash
   git checkout --orphan star-tracker-data
   git rm -rf .
   echo "# Star Tracker Data" > README.md
   git add README.md
   git commit -m "Initialize data branch"
   git push origin star-tracker-data
   ```

---

### Branch Not Updating

**Symptom:** Data branch exists but not updated after workflow runs.

**Solution:**

1. Check workflow logs for errors:

   ```
   Actions → Latest run → View logs → Push to data branch step
   ```

2. Verify git configuration:

   ```yaml
   # Action should set these automatically
   git config user.name "github-actions[bot]"
   git config user.email "github-actions[bot]@users.noreply.github.com"
   ```

3. Check for conflicts:

   ```bash
   git checkout star-tracker-data
   git status
   ```

4. Reset branch (if corrupted):
   ```bash
   git checkout main
   git branch -D star-tracker-data
   git push origin --delete star-tracker-data
   # Let workflow recreate it
   ```

---

### Cannot View Data Branch

**Symptom:** 404 error when accessing branch URL.

**Solution:**

1. Check branch exists:

   ```
   Repository → Branches → Look for "star-tracker-data"
   ```

2. Verify URL format:

   ```
   https://github.com/USERNAME/REPO/tree/star-tracker-data
   ```

3. Check repository visibility:
   - **Private repo:** Must be logged in with access
   - **Public repo:** Anyone can view

---

## 🔧 Workflow Issues

### Workflow Not Running on Schedule

**Symptom:** Scheduled runs not triggering.

**Possible causes:**

1. **Repository inactive**
   - GitHub disables scheduled workflows after 60 days of no activity
   - **Solution:** Make a commit or manually trigger workflow

2. **Wrong cron syntax**

   ```yaml
   on:
     schedule:
       - cron: '0 0 * * *' # Valid: Daily at midnight
       - cron: '60 0 * * *' # INVALID: Hour can't be 60
   ```

   - **Solution:** Validate at [Crontab Guru](https://crontab.guru/)

3. **Workflow file in wrong location**
   - **Solution:** Must be in `.github/workflows/` directory

4. **Default branch issues**
   - Scheduled workflows only run on default branch
   - **Solution:** Verify workflow file is on `main` or default branch

---

### Workflow Fails Immediately

**Symptom:** Workflow fails in first step.

**Common errors:**

1. **Missing secrets**

   ```
   Error: Input required and not supplied: github-token
   ```

   - **Solution:** Add `STAR_TRACKER_TOKEN` secret

2. **Invalid configuration**

   ```
   Error: Invalid visibility value
   ```

   - **Solution:** Use `all`, `public`, or `private`

3. **Syntax errors**
   ```
   Error: Invalid workflow file
   ```

   - **Solution:** Validate YAML syntax at [YAML Lint](http://www.yamllint.com/)

---

### Very Slow Workflow

**Symptom:** Workflow takes 5+ minutes to complete.

**Causes:**

- Many repositories (100+)
- Large historical data
- Network latency to GitHub API

**Optimizations:**

1. **Filter by visibility:**

   ```yaml
   with:
     visibility: 'public' # Only track public repos
   ```

2. **Disable charts:**

   ```yaml
   with:
     include-charts: false
   ```

3. **Reduce email frequency:**
   ```yaml
   on:
     schedule:
       - cron: '0 0 * * 1' # Weekly instead of daily
   ```

---

## 📊 Data Issues

### Wrong Star Counts

**Symptom:** Star counts don't match repository pages.

**Possible causes:**

1. **Cached data**
   - GitHub API may cache results
   - **Solution:** Wait 5-10 minutes and re-run

2. **Private repositories**
   - PAT may not have access
   - **Solution:** Verify PAT has `repo` scope

3. **Archived repositories**
   - Stars don't update on archived repos
   - **Solution:** This is expected behavior

---

### Missing Repositories

**Symptom:** Some repositories not appearing in report.

**Solution:**

1. Check visibility filter:

   ```yaml
   with:
     visibility: 'all' # Include both public and private
   ```

2. Verify PAT scopes:
   - `repo` — Access to private repos
   - `public_repo` — Access to public repos only

3. Check repository ownership:
   - Action only tracks repositories you **own**
   - Repositories you've starred or contributed to are **not included**

---

### Historical Data Lost

**Symptom:** `stars-data.json` missing or incomplete.

**Possible causes:**

1. **Data branch force-pushed**
   - Someone manually modified branch
   - **Solution:** Recover from git history or start fresh

2. **Workflow error during commit**
   - Check workflow logs
   - **Solution:** Re-run workflow

3. **Manual file deletion**
   - **Solution:** File will be recreated on next run

---

## 🌍 Localization Issues

### Wrong Language in Reports

**Symptom:** Reports in wrong language.

**Solution:**

Set locale explicitly:

```yaml
with:
  locale: 'es' # Spanish
```

**Available:**

- `en` — English
- `es` — Spanish
- `ca` — Catalan
- `it` — Italian

---

### Dates Not Localized

**Symptom:** Dates still in English despite locale setting.

**Cause:** Date formatting uses basic locale support.

**Expected behavior:**

- Format changes (e.g., `13/02/2026` vs `02/13/2026`)
- Month names localized
- This is working as designed

---

## 🐛 Reporting Bugs

If you've tried everything and still have issues:

1. **Check existing issues:** [GitHub Issues](https://github.com/fbuireu/github-star-tracker/issues)

2. **Gather information:**
   - Workflow file (sanitized, no secrets)
   - Error messages from logs
   - Action version used
   - Steps to reproduce

3. **Report bug:** [New Bug Report](https://github.com/fbuireu/github-star-tracker/issues/new?template=bug_report.yml)

---

## 📚 Additional Help

- **[Configuration](Configuration)** — Review all settings
- **[Getting Started](Getting-Started)** — Setup guide
- **[API Reference](API-Reference)** — Technical details
- **[Examples](Examples)** — Working configurations

---

## 💡 Common Solutions Quick Reference

| Problem                | Quick Fix                                |
| ---------------------- | ---------------------------------------- |
| 401/403 error          | Use PAT, not `GITHUB_TOKEN`              |
| No email               | Check secrets, use app password (Gmail)  |
| No charts              | Need 2+ runs, set `include-charts: true` |
| Branch not created     | Check PAT permissions                    |
| Wrong locale           | Set `locale: 'xx'` explicitly            |
| Workflow not scheduled | Re-enable in Actions tab                 |
| Missing repos          | Check `visibility` and PAT scopes        |
| Slow workflow          | Filter by visibility, disable charts     |
