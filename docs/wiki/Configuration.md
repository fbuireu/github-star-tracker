Complete reference for all GitHub Star Tracker configuration options.

---

## Configuration Methods

GitHub Star Tracker supports two configuration methods:

### 1. Action Inputs (Workflow File)

Set options directly in your workflow YAML:

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.GITHUB_STAR_TRACKER_TOKEN }}
    visibility: 'public'
    locale: 'es'
    include-charts: true
```

### 2. Configuration File (YAML)

Create a YAML file in your repository (default path: `star-tracker.yml` at repo root):

```yaml
# star-tracker.yml
visibility: public
include_archived: false
include_forks: false
exclude_repos:
  - test-repo
  - /^demo-.*/
only_repos: []
min_stars: 5
data_branch: star-tracker-data
max_history: 52
include_charts: true
locale: en
notification_threshold: auto
track_stargazers: false
top_repos: 10
```

Point to a custom path with `config-path`:

```yaml
with:
  config-path: '.github/star-tracker.yml'
```

> **Note:** Config file keys use `snake_case` (e.g. `include_archived`), while action inputs use `kebab-case` (e.g. `include-archived`).

---

## Configuration Precedence

When the same option is set in multiple places:

```
Action Inputs  >  Config File (YAML)  >  Built-in Defaults
```

Action inputs always win. Missing values fall through to the config file, then to defaults.

**Example:**

```yaml
# Workflow
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.GITHUB_STAR_TRACKER_TOKEN }}
    config-path: 'star-tracker.yml'
    locale: 'en'  # Overrides config file
```

```yaml
# star-tracker.yml
locale: es        # Ignored — workflow input takes priority
visibility: public # Used (no workflow input overrides it)
include_charts: true # Used
```

**Result:** `locale: en`, `visibility: public`, `include_charts: true`

---

## Required Input

### `github-token`

Personal Access Token for GitHub API access.

| Property | Value |
|---|---|
| **Type** | `string` (secret) |
| **Required** | Yes |
| **Scopes** | `repo` (private + public) or `public_repo` (public only) |

```yaml
with:
  github-token: ${{ secrets.GITHUB_STAR_TRACKER_TOKEN }}
```

> The default `GITHUB_TOKEN` is **not sufficient**. See **[Personal Access Token (PAT)](<Personal-Access-Token-(PAT)>)**.

---

## Core Options

### `github-api-url`

GitHub API base URL for GitHub Enterprise Server (GHES) instances.

| Property | Value |
|---|---|
| **Type** | `string` |
| **Default** | — (auto-detected on GHES runners via `GITHUB_API_URL`) |

When running on a GHES runner, the action automatically detects the API URL from the `GITHUB_API_URL` environment variable. Only set this input if you need to override the auto-detected value or if you're running on a github.com runner targeting a GHES instance.

```yaml
with:
  github-api-url: 'https://github.example.com/api/v3'
```

---

### `config-path`

Path to the YAML configuration file (relative to repo root).

| Property | Value |
|---|---|
| **Type** | `string` |
| **Default** | `star-tracker.yml` |

```yaml
with:
  config-path: '.github/star-tracker.yml'
```

---

### `visibility`

Filter repositories by visibility.

| Property | Value |
|---|---|
| **Type** | `string` |
| **Default** | `all` |
| **Options** | `all`, `public`, `private`, `owned` |

- `all` — all repos accessible to the token (including collaborator repos)
- `public` — only public repos
- `private` — only private repos
- `owned` — only repos you own (excludes collaborator repos)

```yaml
with:
  visibility: 'public'
```

---

### `locale`

Language for reports, charts, badges, and emails.

| Property | Value |
|---|---|
| **Type** | `string` |
| **Default** | `en` |
| **Options** | `en` (English), `es` (Spanish), `ca` (Catalan), `it` (Italian) |

```yaml
with:
  locale: 'es'
```

See **[Internationalization (i18n)](<Internationalization-(i18n)>)**.

---

### `include-charts`

Enable star trend chart generation.

| Property | Value |
|---|---|
| **Type** | `boolean` |
| **Default** | `true` |

When enabled, generates animated SVG charts committed to the `charts/` directory on the data branch, and QuickChart.io URLs in HTML email reports.

```yaml
with:
  include-charts: true
```

See **[Star Trend Charts](Star-Trend-Charts)**.

---

### `data-branch`

Branch name for storing tracking data.

| Property | Value |
|---|---|
| **Type** | `string` |
| **Default** | `star-tracker-data` |

The action creates this branch as an orphan branch (separate history from `main`). All reports, charts, badges, and historical data are committed here.

```yaml
with:
  data-branch: 'my-star-data'
```

---

### `max-history`

Maximum number of snapshots to keep in history.

| Property | Value |
|---|---|
| **Type** | `number` |
| **Default** | `52` |

Older snapshots are pruned when the limit is exceeded. With daily runs, `52` keeps roughly one year of data. With weekly runs, it keeps one year exactly.

```yaml
with:
  max-history: '104' # ~2 years of weekly data
```

---

### `top-repos`

Number of top repositories (by star count) to feature in comparison charts and forecasts.

| Property | Value |
|---|---|
| **Type** | `number` |
| **Default** | `10` |

```yaml
with:
  top-repos: '5'
```

---

### `track-stargazers`

Track individual stargazers and show new ones in reports.

| Property | Value |
|---|---|
| **Type** | `boolean` |
| **Default** | `false` |

When enabled, the action fetches the full stargazer list for each repo, diffs against the previous run, and shows new stargazers with avatar, profile link, and starred date.

> **Warning:** This is API-intensive. Each repo requires `ceil(stars / 100)` API calls. See **[Known Limitations](Known-Limitations)** for rate limit details.

```yaml
with:
  track-stargazers: true
```

---

## Filtering Options

### `include-archived`

Include archived repositories in tracking.

| Property | Value |
|---|---|
| **Type** | `boolean` |
| **Default** | `false` |

```yaml
with:
  include-archived: true
```

---

### `include-forks`

Include forked repositories in tracking.

| Property | Value |
|---|---|
| **Type** | `boolean` |
| **Default** | `false` |

```yaml
with:
  include-forks: true
```

---

### `exclude-repos`

Comma-separated list of repository names or regex patterns to exclude.

| Property | Value |
|---|---|
| **Type** | `string` (comma-separated) |
| **Default** | — |

Supports exact names and regex patterns (wrapped in `/`):

```yaml
with:
  exclude-repos: 'test-repo,old-project,/^demo-.*/'
```

In a config file:

```yaml
exclude_repos:
  - test-repo
  - old-project
  - /^demo-.*/
```

---

### `only-repos`

Comma-separated list of repository names to exclusively track.

| Property | Value |
|---|---|
| **Type** | `string` (comma-separated) |
| **Default** | — |

When set, **only** these repos are tracked. All other filters are ignored.

```yaml
with:
  only-repos: 'my-awesome-project,another-repo'
```

---

### `min-stars`

Only track repositories with at least this many stars.

| Property | Value |
|---|---|
| **Type** | `number` |
| **Default** | `0` |

```yaml
with:
  min-stars: '10'
```

---

## Email Configuration

All email inputs are optional. Providing `smtp-host` enables the built-in email feature.

### `smtp-host`

SMTP server hostname. **Providing this enables built-in email notifications.**

| Property | Value |
|---|---|
| **Type** | `string` |
| **Default** | — |

Common values: `smtp.gmail.com`, `smtp-mail.outlook.com`, `smtp.office365.com`, `smtp.sendgrid.net`

---

### `smtp-port`

SMTP server port.

| Property | Value |
|---|---|
| **Type** | `string` |
| **Default** | `587` |

Common ports: `587` (STARTTLS, recommended), `465` (SSL/TLS).

---

### `smtp-username`

SMTP authentication username.

| Property | Value |
|---|---|
| **Type** | `string` |
| **Default** | — |

---

### `smtp-password`

SMTP authentication password.

| Property | Value |
|---|---|
| **Type** | `string` (secret) |
| **Default** | — |

For Gmail, use an app-specific password. For SendGrid, use your API key.

---

### `email-to`

Recipient email address.

| Property | Value |
|---|---|
| **Type** | `string` |
| **Default** | — |

---

### `email-from`

Sender name or email address.

| Property | Value |
|---|---|
| **Type** | `string` |
| **Default** | `GitHub Star Tracker` |

---

### `send-on-no-changes`

Send email even when no star changes are detected.

| Property | Value |
|---|---|
| **Type** | `boolean` |
| **Default** | `false` |

```yaml
with:
  send-on-no-changes: true
```

---

### `notification-threshold`

Star change threshold before sending a notification.

| Property | Value |
|---|---|
| **Type** | `number` or `"auto"` |
| **Default** | `0` |

| Value | Behavior |
|---|---|
| `0` | Notify on every run that has changes |
| `N` (e.g. `5`) | Notify when accumulated change since last notification >= N |
| `auto` | Adaptive threshold based on total stars |

**Adaptive thresholds (`auto`):**

| Total Stars | Threshold |
|---|---|
| 0 – 50 | 1 star |
| 51 – 200 | 5 stars |
| 201 – 500 | 10 stars |
| 500+ | 20 stars |

```yaml
with:
  notification-threshold: 'auto'
```

See **[Email Notifications](Email-Notifications)** for complete setup.

---

## Validation

The action validates inputs at startup:

- `github-token` is provided
- `visibility` is one of: `all`, `public`, `private`, `owned`
- `locale` is one of: `en`, `es`, `ca`, `it` (falls back to `en` with a warning if invalid)
- Invalid values cause the workflow to fail with a descriptive error message

---

## Next Steps

- **[API Reference](API-Reference)** — Complete inputs and outputs reference
- **[Examples](Examples)** — Real-world configurations
- **[Email Notifications](Email-Notifications)** — Email setup details
- **[Troubleshooting](Troubleshooting)** — Common configuration issues
