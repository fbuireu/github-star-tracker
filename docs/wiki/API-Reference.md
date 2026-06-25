Complete reference for all inputs, outputs, and data formats.

---

## Inputs

### Required

| Input | Type | Description |
|---|---|---|
| `github-token` | `string` (secret) | Personal Access Token with `repo` or `public_repo` scope |

### Core Configuration

| Input | Type | Default | Description |
|---|---|---|---|
| `github-api-url` | `string` | - | GitHub API base URL for GHES (auto-detected on GHES runners) |
| `config-path` | `string` | `star-tracker.yml` | Path to YAML config file (relative to repo root) |
| `visibility` | `string` | `all` | Repo visibility filter: `public`, `private`, `all`, or `owned` |
| `locale` | `string` | `en` | Report language: `en`, `es`, `ca`, `it` |
| `include-charts` | `boolean` | `true` | Generate star trend charts |
| `data-branch` | `string` | `star-tracker-data` | Branch name for storing tracking data |
| `max-history` | `number` | `52` | Maximum snapshots to keep in history |
| `top-repos` | `number` | `10` | Number of top repos in charts and forecasts |
| `track-stargazers` | `boolean` | `false` | Track individual stargazers per repo |
| `chart-line-color` | `string` | `#dfb317` | Hex color for the primary chart line/fill/points (not the comparison palette); accepts 3/4/6/8-digit hex with or without a leading `#` |
| `chart-line-width` | `number` | `2.5` | Stroke width in px (>0) of data lines across all charts |
| `chart-max-points` | `number` | `30` | Max recent data points to plot; `0` plots the full history from the beginning |
| `chart-y-axis-side` | `string` | `left` | Y-axis label side: `left` or `right` |
| `chart-smoothing` | `boolean` | `true` | Smooth curve (`true`) or straight segments between points to reveal small spikes (`false`) |

### Stargazer Sampling

| Input | Type | Default | Description |
|---|---|---|---|
| `smart-sampling` | `boolean` | `false` | Sample stargazer pages for high-star repos instead of fetching every page, to avoid API rate limits |
| `smart-sampling-threshold` | `number` | `1500` | Star count above which a repo is sampled instead of fully fetched (only when smart-sampling is enabled) |
| `smart-sampling-pages` | `number` | `30` | Max evenly-spaced stargazer pages (100 stargazers each) to fetch per sampled repo |

### Filtering

| Input | Type | Default | Description |
|---|---|---|---|
| `include-archived` | `boolean` | `false` | Include archived repositories |
| `include-forks` | `boolean` | `false` | Include forked repositories |
| `exclude-repos` | `string` | - | Comma-separated names or regex patterns (e.g. `/^test-.*/`) to exclude |
| `only-repos` | `string` | - | Comma-separated repo names to exclusively track (overrides other filters) |
| `only-orgs` | `string` | - | Comma-separated organization/owner names or regex patterns (e.g. `/^my-org$/`) to exclusively track |
| `exclude-orgs` | `string` | - | Comma-separated organization/owner names or regex patterns to exclude |
| `min-stars` | `number` | `0` | Only track repos with at least N stars |

### Email & Notifications

| Input | Type | Default | Description |
|---|---|---|---|
| `smtp-host` | `string` | - | SMTP hostname (enables email if provided) |
| `smtp-port` | `string` | `587` | SMTP port (`587` = STARTTLS, `465` = SSL) |
| `smtp-username` | `string` | - | SMTP auth username |
| `smtp-password` | `string` (secret) | - | SMTP auth password |
| `email-to` | `string` | - | Recipient email address |
| `email-from` | `string` | `GitHub Star Tracker` | Sender name or address |
| `send-on-no-changes` | `boolean` | `false` | Send email even with no star changes |
| `notification-threshold` | `number` or `"auto"` | `0` | When to notify: `0` (every run), N (threshold), `auto` (adaptive) |

---

## Outputs

All outputs are strings (GitHub Actions requirement). Available in subsequent workflow steps via `steps.<id>.outputs.<name>`.

| Output | Type | Description |
|---|---|---|
| `report` | `string` | Full Markdown report |
| `report-html` | `string` | HTML report (for email) |
| `report-html-path` | `string` | Filesystem path to the HTML report. Use this instead of `report-html` when piping into a custom mailer step - large reports can exceed the shell environment variable size limit |
| `report-csv` | `string` | CSV report (for data pipelines) |
| `total-stars` | `string` | Total star count across all tracked repos |
| `stars-changed` | `string` | Whether any counts changed: `true` or `false` |
| `new-stars` | `string` | Number of stars gained since last run |
| `lost-stars` | `string` | Number of stars lost since last run |
| `should-notify` | `string` | Whether the notification threshold was reached: `true` or `false` |
| `new-stargazers` | `string` | Number of new stargazers detected (0 if tracking disabled) |

### Usage Example

```yaml
- name: Track stars
  id: tracker
  uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}

- name: Use outputs
  run: |
    echo "Total stars: ${{ steps.tracker.outputs.total-stars }}"
    echo "Stars changed: ${{ steps.tracker.outputs.stars-changed }}"
    echo "New stars: ${{ steps.tracker.outputs.new-stars }}"
    echo "Lost stars: ${{ steps.tracker.outputs.lost-stars }}"
    echo "Should notify: ${{ steps.tracker.outputs.should-notify }}"
    echo "New stargazers: ${{ steps.tracker.outputs.new-stargazers }}"
    echo "CSV report: ${{ steps.tracker.outputs.report-csv }}"
```

### Conditional Steps

```yaml
- name: Notify on changes
  if: steps.tracker.outputs.stars-changed == 'true'
  run: echo "Stars changed!"

- name: Notify on threshold
  if: steps.tracker.outputs.should-notify == 'true'
  run: echo "Threshold reached!"

- name: Celebrate milestones
  if: steps.tracker.outputs.new-stars >= 10
  run: echo "Gained ${{ steps.tracker.outputs.new-stars }} stars!"
```

---

## Data Formats

### History File (`stars-data.json`)

```typescript
interface History {
  snapshots: Snapshot[];
  starsAtLastNotification?: number;
}

interface Snapshot {
  timestamp: string;        // ISO 8601
  totalStars: number;
  repos: SnapshotRepo[];
}

interface SnapshotRepo {
  fullName: string;         // "owner/repo"
  name: string;
  owner: string;
  stars: number;
}
```

**Example:**

```json
{
  "snapshots": [
    {
      "timestamp": "2026-02-15T00:00:00.000Z",
      "totalStars": 523,
      "repos": [
        { "fullName": "user/my-repo", "name": "my-repo", "owner": "user", "stars": 200 },
        { "fullName": "user/other-repo", "name": "other-repo", "owner": "user", "stars": 323 }
      ]
    }
  ],
  "starsAtLastNotification": 520
}
```

### Stargazer Map (`stargazers.json`)

Only present when `track-stargazers: true`.

```typescript
type StargazerMap = Record<string, string[]>;
// { "owner/repo": ["login1", "login2", ...] }
```

**Example:**

```json
{
  "user/my-repo": ["octocat", "defunkt", "mojombo"],
  "user/other-repo": ["octocat"]
}
```

### CSV Report (`stars-data.csv`)

Machine-readable CSV with one row per tracked repository. Fields containing commas or double quotes are escaped per RFC 4180.

**Columns:** `repository`, `owner`, `name`, `stars`, `previous`, `delta`, `status`

- `status` is `active`, `new` (first time seen), or `removed` (no longer matched by filters)
- `previous` is empty for new repos

**Example:**

```csv
repository,owner,name,stars,previous,delta,status
user/my-repo,user,my-repo,200,195,5,active
user/new-project,user,new-project,3,,3,new
user/archived,user,archived,50,55,-5,removed
```

---

### Badge (`stars-badge.svg`)

Shields.io-style SVG badge. Dimensions computed from label/value text length.

```markdown
![Stars](https://raw.githubusercontent.com/USER/REPO/star-tracker-data/stars-badge.svg)
```

### Charts (`charts/`)

Animated SVG files committed to the data branch:

| File | Description |
|---|---|
| `charts/star-history.svg` | Total stars over real time, reconstructed from each stargazer's starred_at date (from the repo's first star to now), with milestone lines |
| `charts/comparison.svg` | Top N repos overlaid |
| `charts/forecast.svg` | Historical + projected trends |
| `charts/{owner}-{repo}.svg` | Per-repo star history |

```markdown
![Star History](https://raw.githubusercontent.com/USER/REPO/star-tracker-data/charts/star-history.svg)
```

---

## Generated Files on Data Branch

| File | Description | Always Present |
|---|---|---|
| `README.md` | Markdown report with charts | Yes |
| `stars-data.json` | Historical snapshots | Yes |
| `stars-badge.svg` | Star count badge | Yes |
| `stars-data.csv` | CSV report with current star data | Yes |
| `charts/star-history.svg` | Total star trend chart | After first run (when the repo has stargazers / `include-charts` is on) |
| `charts/comparison.svg` | Top repos comparison | After first run (if multiple repos / `include-charts` is on) |
| `charts/forecast.svg` | Growth forecast | After enough history points exist |
| `charts/{owner}-{repo}.svg` | Per-repo charts | After first run (for top N repos with stargazers) |
| `stargazers.json` | Stargazer login map | Only with `track-stargazers: true` |

---

## Configuration File Format

The YAML config file supports these keys (all optional):

```yaml
# star-tracker.yml
visibility: public           # all | public | private | owned
include_archived: false       # boolean
include_forks: false          # boolean
exclude_repos:                # string[]
  - repo-name
  - /^regex-pattern.*/
only_repos:                   # string[]
  - specific-repo
only_orgs: []                 # string[]
exclude_orgs: []              # string[]
min_stars: 0                  # number
data_branch: star-tracker-data # string
max_history: 52               # number
include_charts: true          # boolean
locale: en                    # en | es | ca | it
notification_threshold: auto  # number | "auto"
track_stargazers: false       # boolean
top_repos: 10                 # number
smart_sampling: false         # boolean
smart_sampling_threshold: 1500 # number
smart_sampling_pages: 30      # number
chart_line_color: "#dfb317"   # string (hex)
chart_line_width: 2.5         # number
chart_max_points: 30          # number (0 = full history)
chart_y_axis_side: left       # left | right
chart_smoothing: true         # boolean
```

---

## Versioning

| Tag | Description |
|---|---|
| `v1` | Latest stable major version (recommended) |
| `v1.x.x` | Specific patch version |

```yaml
uses: fbuireu/github-star-tracker@v1
```

See [Releases](https://github.com/fbuireu/github-star-tracker/releases) for changelog.

---

## Next Steps

- **[Configuration](Configuration)** - Detailed option descriptions
- **[Examples](Examples)** - Real-world workflows
- **[Troubleshooting](Troubleshooting)** - Common issues
