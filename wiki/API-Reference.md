# API Reference

Complete reference for GitHub Star Tracker inputs and outputs.

## Inputs

### Required Inputs

#### `github-token`

Personal Access Token for GitHub API access.

**Type:** `string` (secret)  
**Required:** ✅ Yes  

**Details:**
- Must be a Personal Access Token (PAT), not `GITHUB_TOKEN`
- Required scopes:
  - `repo` — For private repositories
  - `public_repo` — For public repositories only
- Create at: [GitHub Settings → Tokens](https://github.com/settings/tokens)

**Example:**
```yaml
with:
  github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
```

---

### Optional Inputs

#### `config-path`

Path to JSON configuration file.

**Type:** `string`  
**Required:** ❌ No  
**Default:** `.github/star-tracker-config.json`

**Details:**
- Allows centralizing configuration in a file
- File must be valid JSON
- Supported keys: `visibility`, `locale`, `includeCharts`

**Example:**
```yaml
with:
  config-path: '.github/star-config.json'
```

**Config file format:**
```json
{
  "visibility": "public",
  "locale": "en",
  "includeCharts": true
}
```

---

#### `visibility`

Filter repositories by visibility.

**Type:** `string`  
**Required:** ❌ No  
**Default:** `all`  
**Allowed values:** `all`, `public`, `private`

**Details:**
- `all` — Track all repositories (public and private)
- `public` — Track only public repositories
- `private` — Track only private repositories

**Example:**
```yaml
with:
  visibility: 'public'
```

---

#### `locale`

Language for reports and labels.

**Type:** `string`  
**Required:** ❌ No  
**Default:** `en`  
**Allowed values:** `en`, `es`, `ca`, `it`

**Details:**
- `en` — English
- `es` — Spanish / Español
- `ca` — Catalan / Català
- `it` — Italian / Italiano
- Affects report labels, dates, and chart text

**Example:**
```yaml
with:
  locale: 'es'
```

---

#### `include-charts`

Enable star trend chart generation.

**Type:** `boolean`  
**Required:** ❌ No  
**Default:** `true`

**Details:**
- When `true`, generates QuickChart visualizations
- Charts included in Markdown and HTML reports
- Requires at least 2 data points (runs)
- Maximum 30 data points per chart

**Example:**
```yaml
with:
  include-charts: false
```

---

### Email Inputs (Optional)

All email inputs are optional. If **any** email input is provided, **all** email inputs become required.

#### `smtp-host`

SMTP server hostname.

**Type:** `string`  
**Required:** ❌ No (required if using built-in email)

**Common values:**
- Gmail: `smtp.gmail.com`
- Outlook: `smtp-mail.outlook.com`
- Office 365: `smtp.office365.com`
- SendGrid: `smtp.sendgrid.net`

**Example:**
```yaml
with:
  smtp-host: 'smtp.gmail.com'
```

---

#### `smtp-port`

SMTP server port.

**Type:** `string`  
**Required:** ❌ No  
**Default:** `587`

**Common ports:**
- `587` — STARTTLS (recommended)
- `465` — SSL/TLS
- `25` — Unencrypted (not recommended)

**Example:**
```yaml
with:
  smtp-port: '587'
```

---

#### `smtp-username`

SMTP authentication username.

**Type:** `string`  
**Required:** ❌ No (required if using built-in email)

**Details:**
- Usually your email address
- For SendGrid, use literal string `"apikey"`

**Example:**
```yaml
with:
  smtp-username: ${{ secrets.EMAIL_FROM }}
```

---

#### `smtp-password`

SMTP authentication password.

**Type:** `string` (secret)  
**Required:** ❌ No (required if using built-in email)

**Details:**
- For Gmail, must be app-specific password
- For SendGrid, use API key
- Store in GitHub secrets

**Example:**
```yaml
with:
  smtp-password: ${{ secrets.EMAIL_PASSWORD }}
```

---

#### `email-from`

Sender email address.

**Type:** `string`  
**Required:** ❌ No (required if using built-in email)

**Details:**
- Must match SMTP username for most providers
- Format: `address@domain.com`

**Example:**
```yaml
with:
  email-from: ${{ secrets.EMAIL_FROM }}
```

---

#### `email-to`

Recipient email address(es).

**Type:** `string`  
**Required:** ❌ No (required if using built-in email)

**Details:**
- Single address: `user@example.com`
- Multiple addresses: `user1@example.com,user2@example.com`
- Comma-separated, no spaces

**Example:**
```yaml
with:
  email-to: ${{ secrets.EMAIL_TO }}
```

---

## Outputs

All outputs are available in subsequent workflow steps.

### `report`

Full Markdown report with star data.

**Type:** `string`

**Contains:**
- Summary header with total stars
- Stars gained/lost since last run
- Star trend chart (if enabled)
- Repository list with star counts
- Top 5 repositories comparison chart (if enabled)

**Example usage:**
```yaml
- name: Track stars
  id: tracker
  uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}

- name: Print report
  run: echo "${{ steps.tracker.outputs.report }}"
```

---

### `report-html`

HTML version of the report for email.

**Type:** `string`

**Contains:**
- Same content as Markdown report
- HTML formatting with CSS
- Embedded chart images
- Responsive design

**Example usage:**
```yaml
- name: Send email
  uses: dawidd6/action-send-mail@v9
  with:
    html_body: ${{ steps.tracker.outputs.report-html }}
```

---

### `total-stars`

Total star count across all tracked repositories.

**Type:** `number`

**Details:**
- Sum of stars from all repositories
- Includes both public and private (based on `visibility`)

**Example usage:**
```yaml
- name: Print total
  run: echo "Total stars: ${{ steps.tracker.outputs.total-stars }}"
```

---

### `stars-changed`

Whether star count changed since last run.

**Type:** `boolean`

**Values:**
- `true` — Stars gained or lost
- `false` — No change

**Example usage:**
```yaml
- name: Send email
  if: steps.tracker.outputs.stars-changed == 'true'
  run: echo "Stars changed!"
```

---

### `new-stars`

Number of stars gained since last run.

**Type:** `number`

**Details:**
- `0` if no stars gained
- Positive integer for stars gained
- Calculated as: `current_total - previous_total` (if positive)

**Example usage:**
```yaml
- name: Celebrate
  if: steps.tracker.outputs.new-stars >= 10
  run: echo "🎉 Gained ${{ steps.tracker.outputs.new-stars }} stars!"
```

---

### `lost-stars`

Number of stars lost since last run.

**Type:** `number`

**Details:**
- `0` if no stars lost
- Positive integer for stars lost
- Calculated as: `previous_total - current_total` (if positive)

**Example usage:**
```yaml
- name: Alert on loss
  if: steps.tracker.outputs.lost-stars > 0
  run: echo "⚠️ Lost ${{ steps.tracker.outputs.lost-stars }} stars"
```

---

## Configuration Priority

When the same option is specified in multiple places:

1. **Workflow input** (highest priority)
2. **Configuration file**
3. **Default value** (lowest priority)

**Example:**

```yaml
# Workflow file
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    config-path: '.github/star-config.json'
    locale: 'en'  # Overrides config file
```

```json
// .github/star-config.json
{
  "locale": "es",  // Ignored, workflow input wins
  "visibility": "public"  // Used
}
```

**Result:** `locale: en`, `visibility: public`

---

## Data Formats

### JSON Data Structure

The `stars-data.json` file follows this schema:

```typescript
interface Snapshot {
  timestamp: string;           // ISO 8601 datetime
  repositories: Repository[];  // All tracked repositories
  totalStars: number;          // Sum of all stars
}

interface Repository {
  name: string;                // Repository name
  fullName: string;            // Owner/repo format
  stars: number;               // Star count
  url: string;                 // GitHub URL
}

type HistoricalData = Snapshot[];
```

**Example:**
```json
[
  {
    "timestamp": "2026-02-13T00:00:00.000Z",
    "repositories": [
      {
        "name": "my-repo",
        "fullName": "username/my-repo",
        "stars": 123,
        "url": "https://github.com/username/my-repo"
      }
    ],
    "totalStars": 123
  }
]
```

---

### Badge Format

The `stars-badge.svg` is a standard SVG badge:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="90" height="20">
  <rect width="90" height="20" fill="#007ec6"/>
  <text x="10" y="14" fill="#fff">123 stars</text>
</svg>
```

**Usage:**
```markdown
![Stars](https://raw.githubusercontent.com/USERNAME/REPO/star-tracker-data/stars-badge.svg)
```

---

## Environment Variables

The action automatically uses these environment variables:

| Variable | Purpose |
|----------|---------|
| `GITHUB_TOKEN` | Used internally by `@actions/core` |
| `GITHUB_REPOSITORY` | Current repository (for data branch) |
| `GITHUB_ACTOR` | User for git commits |

**Note:** You don't need to set these manually.

---

## Error Handling

### Validation Errors

The action validates inputs at startup:

**Invalid visibility:**
```
Error: Invalid visibility value: "invalid". Must be one of: all, public, private
```

**Invalid locale:**
```
Error: Invalid locale: "fr". Must be one of: en, es, ca, it
```

**Missing token:**
```
Error: Input required and not supplied: github-token
```

**Incomplete email config:**
```
Error: All email configuration inputs are required when using email notifications
```

---

### Runtime Errors

**Authentication failure:**
```
HttpError: Bad credentials
```
→ Check PAT is valid and not expired

**Permission denied:**
```
HttpError: Resource not accessible by integration
```
→ Check PAT has correct scopes (`repo` or `public_repo`)

**Network errors:**
```
RequestError: connect ETIMEDOUT
```
→ Temporary network issue, retry workflow

---

## Limits and Constraints

| Limit | Value | Reason |
|-------|-------|--------|
| Max chart data points | 30 | QuickChart URL length limit |
| Max comparison repos | 5 | Chart readability |
| Max email recipients | Unlimited | SMTP provider limit |
| Max data file size | ~10MB | Git/GitHub limit (practical) |
| API rate limit | 5,000/hour | GitHub REST API (authenticated) |

---

## TypeScript Types

For advanced integrations, here are the internal TypeScript types:

```typescript
interface Config {
  visibility: 'all' | 'public' | 'private';
  locale: 'en' | 'es' | 'ca' | 'it';
  includeCharts: boolean;
  email?: EmailConfig;
}

interface EmailConfig {
  smtpHost: string;
  smtpPort: number;
  smtpUsername: string;
  smtpPassword: string;
  emailFrom: string;
  emailTo: string;
}

interface ActionOutputs {
  report: string;
  'report-html': string;
  'total-stars': string;  // Note: outputs are always strings
  'stars-changed': string;
  'new-stars': string;
  'lost-stars': string;
}
```

---

## Versioning

### Version Tags

- `v1` — Latest stable major version (auto-updated)
- `v1.0` — Latest minor version (auto-updated)
- `v1.0.4` — Specific patch version (static)

**Recommended usage:**
```yaml
uses: fbuireu/github-star-tracker@v1
```

### Changelog

See [Releases](https://github.com/fbuireu/github-star-tracker/releases) for version history.

---

## Next Steps

- **[Configuration](Configuration)** — Detailed configuration guide
- **[Examples](Examples)** — Real-world usage examples
- **[Troubleshooting](Troubleshooting)** — Common issues and solutions
