# Configuration

Complete reference for all GitHub Star Tracker configuration options.

## Action Inputs

### `github-token` (Required)

Personal Access Token for GitHub API access.

```yaml
with:
  github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
```

**Type:** `string` (secret)  
**Required:** Yes  
**Scopes needed:**

- `repo` (for private repositories)
- `public_repo` (for public repositories only)

> ⚠️ **IMPORTANT:** The default `GITHUB_TOKEN` is **NOT** sufficient. You must create a Personal Access Token.

See **[Getting Started](Getting-Started)** for PAT creation instructions.

---

### `config-path`

Path to a JSON configuration file with custom settings.

```yaml
with:
  config-path: '.github/star-tracker-config.json'
```

**Type:** `string`  
**Required:** No  
**Default:** `.github/star-tracker-config.json`

#### Configuration File Format

```json
{
  "visibility": "public",
  "locale": "en",
  "includeCharts": true
}
```

**Supported options:**

- `visibility`: `"all"` | `"public"` | `"private"`
- `locale`: `"en"` | `"es"` | `"ca"` | `"it"`
- `includeCharts`: `true` | `false`

---

### `visibility`

Filter repositories by visibility.

```yaml
with:
  visibility: 'public' # Track only public repos
```

**Type:** `string`  
**Required:** No  
**Default:** `all`  
**Options:**

- `all` — Track all repositories (public and private)
- `public` — Track only public repositories
- `private` — Track only private repositories

---

### `locale`

Language for reports and labels.

```yaml
with:
  locale: 'es' # Spanish reports
```

**Type:** `string`  
**Required:** No  
**Default:** `en`  
**Options:**

- `en` — English
- `es` — Spanish / Español
- `ca` — Catalan / Català
- `it` — Italian / Italiano

All dates, labels, and report sections will be localized.

---

### `include-charts`

Enable star trend chart generation.

```yaml
with:
  include-charts: true
```

**Type:** `boolean`  
**Required:** No  
**Default:** `true`

When enabled, generates:

- **Total stars chart** — All repositories combined
- **Comparison chart** — Top 5 repositories with individual trends

See **[Star Trend Charts](Star-Trend-Charts)** for details.

---

### Email Configuration (Optional)

#### `smtp-host`

SMTP server hostname.

```yaml
with:
  smtp-host: 'smtp.gmail.com'
```

**Type:** `string`  
**Required:** No (required if using built-in email)

---

#### `smtp-port`

SMTP server port.

```yaml
with:
  smtp-port: '587'
```

**Type:** `string`  
**Required:** No  
**Default:** `587`

---

#### `smtp-username`

SMTP authentication username.

```yaml
with:
  smtp-username: ${{ secrets.EMAIL_FROM }}
```

**Type:** `string`  
**Required:** No (required if using built-in email)

---

#### `smtp-password`

SMTP authentication password.

```yaml
with:
  smtp-password: ${{ secrets.EMAIL_PASSWORD }}
```

**Type:** `string` (secret)  
**Required:** No (required if using built-in email)

---

#### `email-from`

Sender email address.

```yaml
with:
  email-from: ${{ secrets.EMAIL_FROM }}
```

**Type:** `string`  
**Required:** No (required if using built-in email)

---

#### `email-to`

Recipient email address(es). Multiple addresses separated by commas.

```yaml
with:
  email-to: ${{ secrets.EMAIL_TO }}
```

**Type:** `string`  
**Required:** No (required if using built-in email)  
**Format:** `user@example.com` or `user1@example.com,user2@example.com`

See **[Email Notifications](Email-Notifications)** for complete email setup.

---

## Configuration Priority

When the same option is specified in multiple places, the priority is:

1. **Workflow inputs** (highest priority)
2. **Configuration file** (if `config-path` specified)
3. **Default values** (lowest priority)

### Example

```yaml
# .github/workflows/star-tracker.yml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    config-path: '.github/star-config.json'
    locale: 'en' # Overrides locale from config file
```

```json
// .github/star-config.json
{
  "locale": "es", // Ignored, workflow input takes priority
  "visibility": "public", // Used
  "includeCharts": true // Used
}
```

---

## Configuration File Examples

### Track All Repositories with Charts

```json
{
  "visibility": "all",
  "locale": "en",
  "includeCharts": true
}
```

### Track Only Public Repositories (Spanish)

```json
{
  "visibility": "public",
  "locale": "es",
  "includeCharts": true
}
```

### Private Repositories Only (No Charts)

```json
{
  "visibility": "private",
  "locale": "en",
  "includeCharts": false
}
```

---

## Environment Variables

The action automatically uses these environment variables when available:

- `GITHUB_TOKEN` — Used by `@actions/core` (but insufficient for repository listing)
- `GITHUB_REPOSITORY` — Current repository (for data branch)
- `GITHUB_ACTOR` — User for git commits

---

## Advanced Configuration

### Custom Data Branch

By default, the action uses `star-tracker-data` branch. This is currently **not configurable** but may be added in future versions.

### Custom Schedule

Configure when the action runs using cron syntax:

```yaml
on:
  schedule:
    # Daily at 3 AM UTC
    - cron: '0 3 * * *'

    # Every Monday at 9 AM UTC
    - cron: '0 9 * * 1'

    # First day of every month
    - cron: '0 0 1 * *'
```

See [Crontab Guru](https://crontab.guru/) for help with cron syntax.

---

## Validation

The action validates all inputs at startup:

- ✅ `github-token` is provided
- ✅ `visibility` is one of: `all`, `public`, `private`
- ✅ `locale` is one of: `en`, `es`, `ca`, `it`
- ✅ Email configuration is complete (if any email field is provided)

Invalid configurations will cause the workflow to fail with a clear error message.

---

## Next Steps

- **[Examples](Examples)** — See real-world configurations
- **[API Reference](API-Reference)** — Complete input/output reference
- **[Troubleshooting](Troubleshooting)** — Common configuration issues
