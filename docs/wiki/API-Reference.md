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
| `compare-against` | `string` | `last-run` | Which stored snapshot is used as the comparison baseline: `last-run`, `24h`, `7d`, `30d`. Windowed values pick the most recent snapshot at least that old; if history is shorter, the oldest available snapshot is used, so the period reported is shorter than requested and the report's "Compared to" date shows how far back it really goes. Affects `new-stars`, `lost-stars`, `stars-changed` and the total delta only - every run still appends its own snapshot, and charts, forecast and velocity are unaffected |
| `read-only` | `boolean` | `false` | Run without writing to the data branch: still fetches, reports, sets outputs and emails, but never commits or pushes. Pair with `compare-against` for a digest workflow that shares a data branch with your tracking workflow. Incompatible with a non-zero `notification-threshold`, whose counter lives on that branch |
| `top-repos` | `number` | `10` | Number of top repos in charts and forecasts |
| `track-stargazers` | `boolean` | `false` | Track individual stargazers per repo |
| `chart-line-color` | `string` | `#dfb317` | Hex color for the primary chart line/fill/points (not the comparison palette); accepts 3/4/6/8-digit hex with or without a leading `#` |
| `chart-line-width` | `number` | `2.5` | Stroke width in px (>0) of data lines across all charts |
| `chart-max-points` | `number` | `30` | Curve granularity: how many points are sampled across the full reconstructed history (capped at 365); `0` reconstructs at weekly resolution. Controls resolution, not the time window (see `chart-range`). Email charts are always limited to 30 |
| `chart-y-axis-side` | `string` | `left` | Y-axis label side: `left` or `right` |
| `chart-smoothing` | `boolean` | `true` | Smooth curve (`true`) or straight segments between points to reveal small spikes (`false`) |
| `chart-curve` | `string` | `monotone` | Curve when smoothing is on: `monotone`, `catmull-rom`, `cubic-bezier`, `rounded-step`. Email approximates non-monotone curves |
| `chart-show-points` | `boolean` | `true` | Draw a marker on each data point (`true`) or hide them for a cleaner dense line (`false`) |
| `chart-animation` | `boolean` | `true` | Animate the SVG charts (`true`) or render them static (`false`) for email/static contexts |
| `chart-milestones` | `boolean` | `true` | Show milestone reference lines on the main star-history chart (`true`) or hide them (`false`) |
| `chart-begin-at-zero` | `boolean` | `false` | Start the Y-axis at zero (`true`) or zoom into the data range (`false`) |
| `chart-theme` | `string` | `auto` | Color theme for the SVG charts: `auto` (follows `prefers-color-scheme`), `light` or `dark` |
| `email-theme` | `string` | `auto` | Color theme for the HTML email and its charts: `auto` (same as `chart-theme`), `light` or `dark`. The email charts are images with a baked-in background, so a dark-mode reader needs this to resolve to `dark` |
| `chart-custom-milestones` | `string` | _(empty)_ | Comma-separated star counts for the milestone reference lines, replacing the built-in defaults (e.g. `250, 750, 2500`). Requires `chart-milestones` |
| `chart-range` | `string` | `all` | Time window plotted: `30d`, `90d`, `1y` or `all` |
| `chart-trend-line` | `boolean` | `false` | Overlay a dashed moving-average trend line on the main chart |
| `velocity-metrics` | `boolean` | `false` | Add a growth-velocity section (stars/day, % growth, days to next milestone) to the report |

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
| `email-from` | `string` | localized | Sender name or address. When unset it falls back to a sender name localized from the `locale` input |
| `send-on-no-changes` | `boolean` | `false` | Send email even with no star changes |
| `notification-threshold` | `number` or `"auto"` | `0` | Accumulated star change required to notify: `0` = every run that has changes, N = notify once the total has moved by at least N since the last notification, `auto` = adaptive threshold derived from the total star count (see [Configuration](Configuration#notification-threshold)) |
| `notification-mode` | `string` | `net` | How `notification-threshold` measures that change: `net` (absolute change in total stars - gains and losses cancel out, and a large drop also reaches the threshold) or `gains` (only upward movement counts; a drop never notifies) |

Both modes measure against `starsAtLastNotification` in `stars-data.json`, which is only updated when a notification actually fires. The counter therefore accumulates across runs that do not notify instead of resetting. On a data branch that has never sent a notification there is no stored baseline (`starsAtLastNotification` is absent and treated as `0`), so the first run fires immediately and then settles. That is not the case if you were already running with the default `notification-threshold: 0`: every changed run has been notifying, so `starsAtLastNotification` already holds your current total and raising the threshold fires nothing immediately - the next email waits until the total actually moves by at least the threshold.

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
| `stars-changed` | `string` | Per-run. Whether any counts changed against the `compare-against` baseline: `true` or `false` |
| `new-stars` | `string` | Per-run. Stars gained against the `compare-against` baseline |
| `lost-stars` | `string` | Per-run. Stars lost against the `compare-against` baseline |
| `should-notify` | `string` | Cumulative. Whether `notification-threshold` was reached under `notification-mode` since the last notification fired, and something changed: `true` or `false` |
| `notification-sent` | `string` | Whether an email was actually delivered this run: `true` or `false`. It is `false` when SMTP is unconfigured, `email-to` is empty, or the send failed. Unlike `should-notify` it reports delivery, so a `send-on-no-changes` email on an unchanged run sets it `true` while `should-notify` stays `false` |
| `new-stargazers` | `string` | Number of new stargazers detected by diffing against the stored `stargazers.json`, which every writing run rewrites - unlike its siblings it is not affected by `compare-against` (0 if tracking disabled) |

`new-stars`, `lost-stars` and `stars-changed` are per-run figures measured against the comparison baseline. They are not cumulative and carry no memory of whether an email was sent - with a daily cron and `compare-against: last-run` they mean "gains in the last 24 hours". `should-notify` is the cumulative one: its counter only resets when a notification actually fires. `notification-sent` is the delivery counterpart — `should-notify` is the decision, `notification-sent` is whether mail left the building.

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

- name: Celebrate a single-run jump
  if: steps.tracker.outputs.new-stars >= 10
  run: echo "Gained ${{ steps.tracker.outputs.new-stars }} stars in this run!"
```

To act every N stars overall (e.g. every 500), use the cumulative output with `notification-threshold: '500'` and `notification-mode: 'gains'`:

```yaml
- name: Track stars
  id: tracker
  uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    notification-threshold: '500'
    notification-mode: 'gains'

- name: Every 500 stars
  if: steps.tracker.outputs.should-notify == 'true'
  run: echo "Another 500 stars!"
```

Do not use `if: steps.tracker.outputs.new-stars >= 500` for this - that requires 500 stars within a single run, which on a daily schedule would almost never fire.

---

## Data Formats

### History File (`stars-data.json`)

```typescript
interface History {
  snapshots: Snapshot[];
  starsAtLastNotification?: number;  // total stars captured when the last notification fired; absent until one does
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
compare_against: last-run     # last-run | 24h | 7d | 30d
read_only: false              # boolean
include_charts: true          # boolean
locale: en                    # en | es | ca | it
notification_threshold: 0     # number | "auto"
notification_mode: net        # net | gains
track_stargazers: false       # boolean
top_repos: 10                 # number
smart_sampling: false         # boolean
smart_sampling_threshold: 1500 # number
smart_sampling_pages: 30      # number
chart_line_color: "#dfb317"   # string (hex)
chart_line_width: 2.5         # number
chart_max_points: 30          # number (granularity, capped at 365; 0 = weekly resolution)
chart_y_axis_side: left       # left | right
chart_smoothing: true         # boolean
chart_curve: monotone         # monotone | catmull-rom | cubic-bezier | rounded-step
chart_show_points: true       # boolean
chart_animation: true         # boolean
chart_milestones: true        # boolean
chart_begin_at_zero: false    # boolean
chart_theme: auto             # auto | light | dark
chart_range: all              # 30d | 90d | 1y | all
chart_trend_line: false       # boolean
velocity_metrics: false       # boolean
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
