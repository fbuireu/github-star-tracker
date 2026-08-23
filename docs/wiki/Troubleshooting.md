Solutions for common issues with GitHub Star Tracker.

---

> [!NOTE]
> Anything that fails the run arrives in the log as `Star Tracker failed: <message>`, so the useful half is
> always what follows the colon. Search this page for that half.

## Authentication

### "Bad credentials" or 401 Error

The run fails with
`Star Tracker failed: Failed to fetch repositories from GitHub API: HTTP 401 Bad credentials. Verify that
your github-token has the correct permissions.`

**Cause:** Invalid or expired Personal Access Token.

**Fix:**
1. Generate a new token at **[GitHub Settings > Tokens](https://github.com/settings/tokens)**
2. Ensure the token has `repo` scope (for private repos) or `public_repo` scope (public only)
3. Update the secret in your repo: **Settings > Secrets and variables > Actions**
4. Re-run the workflow

### "Resource not accessible by integration"

The run fails with
`Star Tracker failed: Failed to fetch repositories from GitHub API: HTTP 403 Resource not accessible by
integration. Verify that your github-token has the correct permissions.`

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

## Configuration Errors That Fail the Run

Almost every bad configuration value warns and falls back to the default. **Two throw**, and both stop the
run before anything is fetched.

### "Invalid data-branch ..."

```
Star Tracker failed: Invalid data-branch "<value>". It must be a valid git branch name: ...
```

**Cause:** `data-branch` is not a name git will accept. Rejected: an empty value, `@`, whitespace, any of
`~ ^ : ? * [ \`, control characters, the sequences `..` `//` `/.` `@{`, a leading `-`, `.` or `/`, and a
trailing `/`, `.` or `.lock`.

**Fix:** pick a plain branch name. `star-tracker-data`, `data/star-tracker`, `_star-data`, `stars@v2` and
`v1.2.3` are all fine. This one throws rather than warning because falling back to the default branch would
silently write your data somewhere you did not ask for.

### "Invalid visibility ..."

```
Star Tracker failed: Invalid visibility "<value>". Must be one of: public, private, all, owned
```

**Cause:** a typo in `visibility`. It throws rather than warning because every other value changes *which
repositories are tracked*, so a silent fallback would quietly report on the wrong set.

**Fix:** use one of the four values above.

---

## Data Branch Errors

All four fail the run. None of them is recoverable by re-running: fix the branch or the workflow first.

### "... is not valid JSON"

```
Star Tracker failed: stars-data.json on the data branch is not valid JSON (<parse error>). Fix or delete
the file on that branch and re-run.
```

**Cause:** the stored history was hand-edited, truncated by a failed push, or merged badly.

**Fix:** correct the JSON on the data branch, or delete `stars-data.json` there to start the history over.
The action deliberately refuses to read it as empty, because that would append a snapshot over the top of a
record it had just discarded.

### "... is valid JSON but not an object"

```
Star Tracker failed: stars-data.json on the data branch is valid JSON but not an object (found an array).
Reading it as an empty history would discard your tracking record, so this run stops instead. ...
```

**Cause:** the file holds `null`, `[]`, a number or a string. Usually a script that overwrote it.

**Fix:** restore the object shape (`{"version": 1, "snapshots": []}` at minimum) or delete the file.

### "... declares format version N, which this version of the action does not understand"

```
Star Tracker failed: stars-data.json on the data branch declares format version 2, which this version of
the action does not understand (it writes version 1). Upgrade the action, or point data-branch at a branch
this version wrote.
```

**Cause:** the branch was written by a **newer** action than the one now running. This is the "I pinned an
older tag" or "I rolled the action back" case.

**Fix:** upgrade the action back, or point `data-branch` at a branch this version wrote. A file with **no**
`version` key is always fine: it predates the field and is read as version 1.

### "Branch ... does not exist on the remote and this is a read-only run"

```
Star Tracker failed: Branch "<name>" does not exist on the remote and this is a read-only run, so it
cannot be created. ...
```

**Cause:** `read-only: true` on a branch nothing has created yet. A read-only run may never bring the data
branch into existence.

**Fix:** point `data-branch` at the branch your tracking workflow maintains, or drop `read-only` for one run
so it can create it.

### "Git command failed: ..."

```
Star Tracker failed: Git command failed: "git <args>"
<git's own output>
```

**Cause:** the generic wrapper around any git invocation that exited non-zero and was not one of the cases
above. The second line is git's own message and is the part worth reading.

**Fix:** depends entirely on that message. Missing `permissions: contents: write`, a protected branch rule
on the data branch and a detached or shallow checkout are the usual three.

---

## Data Issues

### No Repositories Matched

The run **succeeds**, warns `No repositories matched the configured filters`, and produces a report saying
so. Every output is set to a zero value, and the data branch is not opened at all, so no snapshot is
recorded and no email is attempted.

**Cause:** the filters combined to nothing. `only-repos` cannot bring back a repository `only-orgs` already
excluded, which is the usual surprise; `min-stars` and `visibility: private` on an account with no private
repositories are the other two.

**Fix:** remove filters one at a time until repositories reappear. The run log prints the surviving count
after each filtering stage, which localises it quickly.

### `new-stargazers` Is 0 Although Stars Clearly Moved

**Cause:** the stargazer diff skips two kinds of repository.

- A **sampled** repository (one over `smart-sampling-threshold` while `smart-sampling` is on) is never
  diffed, because absence from a sample is not evidence that someone unstarred. These are named in a note in
  the report.
- A repository whose stargazer list came back **incomplete**, meaning the fetch failed or was cut short
  mid-pagination, is skipped **silently**. Its previous logins are kept rather than overwritten, so one
  transient failure cannot fabricate a spike on the next run.

Both still contribute their star counts, so `total-stars` and `new-stars` move while `new-stargazers` stays
at `0`.

**Fix:** if the repository matters more than the request budget, raise `smart-sampling-threshold` above its
star count or turn `smart-sampling` off for it. For the incomplete case, check the run log for
`Failed to fetch stargazers for <repo>` and re-run.

### No Data After First Run

**Expected behavior.** The first run creates the data branch and records initial star counts with `delta: 0`. Star-history charts are reconstructed from each stargazer's real `starred_at` date, so they appear on the first run (whenever `include-charts` is on). Growth forecasts appear on the first run too, for the same reason: they are fitted to that same reconstructed series. Only with `include-charts: false` do they wait for 3 stored snapshots.

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

If the report says no repositories matched rather than showing zeroes, see
[No Repositories Matched](#no-repositories-matched) above: that path skips the data branch entirely.

### Snapshots Disappeared After Lowering `max-history`

**Cause:** `max-history` is the retained count, applied on write. Lowering it makes the very next run prune
down to the new number and push the shorter history, and the data branch is the only copy.

The run warns before doing it, naming how many it is about to drop:

```
max-history is 12 but 52 snapshots are stored, so this run drops the oldest 40. Raise max-history before
this run if you want to keep them.
```

**Fix:** raise `max-history` **before** the next run. Once a run with the lower value has pushed, the
snapshots are gone, and only a `git revert` on the data branch can bring them back.

### Stale or Missing Data Branch

**Fix:** Delete the branch and let the action recreate it:

```bash
git push origin --delete star-tracker-data
```

### "Another run pushed to ... while this one was working"

**Cause:** Two runs that both write overlapped. The action reads the data branch when it starts and pushes
when it finishes, and everything in between (listing repositories, fetching stargazers, rendering) takes
minutes. If a second writing run starts in that window, both branch from the same commit and the one that
finishes last is refused. The usual trigger is a scheduled run plus a manual **Run workflow**; it can also
happen if a run takes longer than the schedule interval.

**What it means:** that run's snapshot was not recorded. Its report and email had already gone out, because
the email is sent before the data is saved, so you may receive a digest for a run that ends red.

**Fix:** re-run it. The next run records the current totals and nothing is lost but that one snapshot.
To stop it recurring, give the workflow a concurrency group so runs queue instead of overlapping:

```yaml
concurrency:
  group: star-tracker
  cancel-in-progress: false
```

If you deliberately have two workflows sharing one data branch, set [`read-only`](Configuration#read-only)
on whichever one should not be the writer.

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

**Fix:** Ensure `include-charts` is true (default) and that tracked repos have stargazers. Charts are reconstructed from stargazer timestamps and do not require multiple runs.

### Chart Is a Flat or Straight Line

**Cause:** The stargazers fetch for that repository came back empty or failed, so its history cannot be reconstructed. The run log includes a warning naming the affected repository and, for failures, the API error. Common reasons:

- **Transient GitHub-side failures.** During the [2026 stargazers restriction](https://github.blog/changelog/2026-06-30-upcoming-access-restrictions-to-public-api-endpoints-and-ui-views/) rollout (~July 5–13, 2026) the endpoint intermittently returned `404`s, empty lists, or `5xx` errors with an empty/plain-text body **even to repository admins**, most commonly on deep pagination of very large (40,000+ star) repos. Since v1.22.3 the run log always includes the HTTP status (`Failed to fetch stargazers for <repo>: HTTP 5xx ...`), so you can tell a real restriction (`403`/`404`) apart from a transient server error at a glance, and `5xx`/network errors are retried automatically before being reported. Verify with `curl -i -H "Authorization: Bearer <token>" -H "Accept: application/vnd.github.star+json" "https://api.github.com/repos/<owner>/<repo>/stargazers?per_page=1"`. If it returns `200` with data, just re-run the workflow: charts are reconstructed from scratch on every run.
- **The token's user is not an admin or collaborator on the repository**, per the same restriction: the list comes back `404` or empty (`200 []`) silently. Note this is about the user's *role*, not token scopes (implicit admin through org ownership works with a classic PAT). Typical setups: a fine-grained PAT without a grant on the repository's organization, or org repositories where you are a member with read access only. See [Known Limitations](Known-Limitations#-stargazers-api-access-restriction-2026).
- **Rate limiting on large repositories.** A repository above 40,000 stars costs 400 API requests per run without smart sampling; a handful of large repos can exhaust the 5,000 requests/hour REST quota mid-run.

Since v1.22.3, a single failing page no longer discards the rest of a repo's history: the action keeps whatever pages it could fetch, logs which ones it had to skip, and scales the chart to the real coverage. If the repo's list still comes back completely empty, the per-repo chart falls back to the Stored History, which only covers the period the action has been running.

**Fix:** Check the run log warning for the HTTP status and verify the endpoint with the `curl` above. If the token's access is healthy, re-run: transient server errors recover on their own and no longer lose a repo's whole history. Otherwise use a token whose user has admin or collaborator access to every tracked repository; for rate limits, enable `smart-sampling` to cut large-repo fetches from 400 requests to a few dozen. Star counts, reports and badges are unaffected either way.

### No Forecast Chart

**Cause:** the forecast needs 3 points in the series it is fitted to. With `include-charts` on that series is the history reconstructed from `starred_at`, so it is normally there from the first run. An empty forecast then means no stargazer dates were reachable (see [No Charts Generated](#no-charts-generated)). With `include-charts: false` the series is the Stored History instead.

**Fix:** check `include-charts` is on and the token can list stargazers. If charts are deliberately off, run the workflow 3+ times to accumulate stored snapshots.

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
5. If you set a `notification-threshold`, check that `should-notify` is `true` - the threshold accumulates against the star total at the last notification, so it may simply not have tripped yet
6. Check the workflow run logs for email-related warnings

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

### Email Received Almost Every Day

A daily schedule with a condition like `if: steps.tracker.outputs.new-stars >= 10` emails you on almost every run, because `new-stars` is a **per-run** figure measured against the comparison baseline - it does not accumulate, and it does not know whether an email was already sent. Raising that number does not help either: it then requires that many stars within a single run, so it almost never fires.

**Fix:** gate on `should-notify`, which accumulates across runs and only resets when the threshold trips (and not even then if a configured send failed):

```yaml
- name: Track stars
  id: tracker
  uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    notification-threshold: '500'
    notification-mode: 'gains'

- name: Send email
  if: steps.tracker.outputs.should-notify == 'true'
  uses: dawidd6/action-send-mail@62a2d05b79935ad4fb90ce9079928099579c14ac # v9
```

See **[Configuration > notification-threshold](Configuration#notification-threshold)** and **[notification-mode](Configuration#notification-mode)**.

### Weekly Report Only Covers One Day

A weekly `cron` on its own does not widen the reporting period. The report is diffed against the last stored snapshot, so if a more frequent workflow writes to the same data branch, the weekly run only covers the time since that last write.

**Fix:** set [`compare-against`](Configuration#compare-against) to `7d` on the weekly workflow so it compares against the most recent snapshot at least seven days old.

### Charts Missing in Email

**Possible causes:**
- `include-charts: false`
- The charted series has fewer than 2 points. On a normal run that series is the history reconstructed from
  `starred_at` dates, not the stored snapshots, so this means no star had a readable date rather than "the
  action has not run enough times". See [No Charts Generated](#no-charts-generated)
- Email client blocking external images (QuickChart.io URLs)

**Fix:** Click "Show images" or "Load remote content" in your email client.

### Log Says `Invalid smtp-port "..."`

```
Invalid smtp-port "465 ". Falling back to 587.
```

**Cause:** `smtp-port` was not a whole number between 1 and 65535. A stray space, a quote inside the value
or a non-numeric secret all do it. The run does **not** fail.

**Fix:** the fallback matters more than the warning. Port `465` means implicit SSL and anything else means
STARTTLS, so a rejected `465` silently switches the transport and the connection then fails against an
SSL-only server. Correct the value rather than ignoring the warning.

### Log Says `SMTP configured but no email-to address provided`

```
SMTP configured but no email-to address provided, skipping email
```

**Cause:** `smtp-host` is set but `email-to` resolved to an empty string, usually a missing or misnamed
secret.

**Fix:** set `email-to`. Note that this counts as a **failed** delivery, so the notification baseline is
held back and the accumulated change keeps growing. Once the address is fixed, the first email covers all
of it.

### Log Says `Email sent`, But Nothing Arrived

Check the log for the line just above it:

```
Email rejected for: someone@example.com
```

**Cause:** the SMTP server accepted the message but refused those recipients. The action still counts the
send as successful, so the run is green and the baseline advances.

**Fix:** verify the recipient addresses and whether the provider requires a verified sender. If there is no
`Email rejected` line, it is spam filtering or the recipient's own rules; start with the spam folder.

---

## Workflow

### "This action must run inside a checked-out repository"

```
Star Tracker failed: This action must run inside a checked-out repository. Add an "actions/checkout" step
before this action in your workflow.
```

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
- Ensure the workflow file is in [`.github/workflows/`](https://github.com/fbuireu/github-star-tracker/blob/main/.github/workflows) on your default branch

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

See **[Configuration Precedence](Configuration#configuration-precedence)**.

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

An unwrapped pattern is not an error; it becomes an exact name to match, and simply matches nothing.

### Log Says `Ignoring invalid pattern "..."`

```
Ignoring invalid pattern "/[unclosed/". Filters expect either an exact name or /pattern/flags.
```

**Cause:** the value *was* wrapped in `/` but the body is not a regex the engine can compile. This is the
warning to look for when a filter has no effect: it names the offending pattern, which the entry above
cannot. Each distinct bad pattern is reported once, treated as matching nothing, and never fails the run.

**Fix:** correct the pattern. Every list filter (`exclude-repos`, `only-repos`, `only-orgs`,
`exclude-orgs`) accepts either an exact name or a `/body/flags` literal, matched against the short
repository name (or the owner, for the org filters).

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
