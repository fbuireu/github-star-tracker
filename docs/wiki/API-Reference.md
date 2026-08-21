Complete reference for all inputs, outputs, and data formats. Every input links to its full description in **[Configuration](Configuration)**, which is the prose guide; this page is the index.

- [Inputs](#inputs)
- [Outputs](#outputs)
- [Data Formats](#data-formats)
- [Generated Files on Data Branch](#generated-files-on-data-branch)
- [Configuration File Format](#configuration-file-format)
- [Versioning](#versioning)

---

## Inputs

### Required

| Input | Type | Description |
|---|---|---|
| `github-token` | `string` (secret) | Personal Access Token with `repo` or `public_repo` scope. [Details](Configuration#github-token) |

### Optional

| Input | Type | Default | Description |
|---|---|---|---|
| `chart-animation` | `boolean` | `true` | Animate the SVG charts (`true`) or render them static (`false`). [Details](Configuration#chart-animation) |
| `chart-begin-at-zero` | `boolean` | `false` | Start the Y-axis at zero (`true`) or zoom into the data range (`false`). [Details](Configuration#chart-begin-at-zero) |
| `chart-curve` | `string` | `monotone` | Curve used when smoothing is on: `monotone`, `catmull-rom`, `cubic-bezier` or `rounded-step`. [Details](Configuration#chart-curve) |
| `chart-custom-milestones` | `string` | - | Comma-separated star counts that replace the built-in milestone lines (e.g. `250, 750, 2500`). [Details](Configuration#chart-custom-milestones) |
| `chart-line-color` | `string` | `#dfb317` | Hex color for the primary chart line, fill and points. [Details](Configuration#chart-line-color) |
| `chart-line-width` | `number` | `2.5` | Stroke width in px (>0) of data lines across all charts. [Details](Configuration#chart-line-width) |
| `chart-max-points` | `number` | `30` | How many points are sampled across the full reconstructed history, capped at 365, with `0` meaning weekly resolution. [Details](Configuration#chart-max-points) |
| `chart-milestones` | `boolean` | `true` | Draw milestone reference lines on the main star-history chart. [Details](Configuration#chart-milestones) |
| `chart-range` | `string` | `all` | Time window plotted: `30d`, `90d`, `1y` or `all`. [Details](Configuration#chart-range) |
| `chart-show-points` | `boolean` | `true` | Draw a marker on each data point. [Details](Configuration#chart-show-points) |
| `chart-smoothing` | `boolean` | `true` | Draw a smooth curve between points rather than straight segments. [Details](Configuration#chart-smoothing) |
| `chart-theme` | `string` | `auto` | Color theme for the SVG charts: `auto`, `light` or `dark`. [Details](Configuration#chart-theme) |
| `chart-trend-line` | `boolean` | `false` | Overlay a dashed moving-average trend line on the main chart. [Details](Configuration#chart-trend-line) |
| `chart-y-axis-side` | `string` | `left` | Y-axis label side: `left` or `right`. [Details](Configuration#chart-y-axis-side) |
| `compare-against` | `string` | `last-run` | Which stored snapshot is used as the comparison baseline: `last-run`, `24h`, `7d` or `30d`. [Details](Configuration#compare-against) |
| `config-path` | `string` | `star-tracker.yml` | Path to the YAML config file, relative to the repo root. [Details](Configuration#config-path) |
| `data-branch` | `string` | `star-tracker-data` | Branch name for storing tracking data; an invalid git branch name fails the run. [Details](Configuration#data-branch) |
| `email-from` | `string` | localized | Sender name or address, falling back to a sender name localized from `locale`. [Details](Configuration#email-from) |
| `email-theme` | `string` | `auto` | Color theme for the HTML email and its chart images: `auto`, `light` or `dark`. [Details](Configuration#email-theme) |
| `email-to` | `string` | - | Recipient email address. [Details](Configuration#email-to) |
| `exclude-orgs` | `string` | - | Comma-separated owner names or `/regex/` patterns to exclude. [Details](Configuration#exclude-orgs) |
| `exclude-repos` | `string` | - | Comma-separated repository names or `/regex/` patterns to exclude. [Details](Configuration#exclude-repos) |
| `github-api-url` | `string` | - | GitHub API base URL for GHES, auto-detected on GHES runners. [Details](Configuration#github-api-url) |
| `include-archived` | `boolean` | `false` | Include archived repositories. [Details](Configuration#include-archived) |
| `include-charts` | `boolean` | `true` | Generate star trend charts. [Details](Configuration#include-charts) |
| `include-forks` | `boolean` | `false` | Include forked repositories. [Details](Configuration#include-forks) |
| `locale` | `string` | `en` | Report language: `en`, `es`, `ca` or `it`. [Details](Configuration#locale) |
| `max-history` | `number` | `52` | Maximum snapshots to keep, one snapshot being stored per run. [Details](Configuration#max-history) |
| `min-stars` | `number` | `0` | Only track repos with at least N stars. [Details](Configuration#min-stars) |
| `notification-mode` | `string` | `net` | How `notification-threshold` measures change: `net` (gains and losses cancel out) or `gains` (only upward movement counts). [Details](Configuration#notification-mode) |
| `notification-threshold` | `number` or `"auto"` | `0` | Accumulated star change required to notify: `0` for every changed run, N for once per N stars, or `auto` for a threshold derived from the total. [Details](Configuration#notification-threshold) |
| `only-orgs` | `string` | - | Comma-separated owner names or `/regex/` patterns to track exclusively. [Details](Configuration#only-orgs) |
| `only-repos` | `string` | - | Comma-separated repository names or `/regex/` patterns to track exclusively. [Details](Configuration#only-repos) |
| `read-only` | `boolean` | `false` | Run without writing to the data branch: it still fetches, reports, sets outputs and emails, but never commits or pushes. [Details](Configuration#read-only) |
| `send-on-no-changes` | `boolean` | `false` | Send email even with no star changes; this is the one tracking input the config file cannot set. [Details](Configuration#send-on-no-changes) |
| `smart-sampling` | `boolean` | `false` | Sample stargazer pages for high-star repos instead of fetching every page, at the cost of exact new-stargazer lists for the sampled repos. [Details](Configuration#smart-sampling) |
| `smart-sampling-pages` | `number` | `30` | Max evenly-spaced stargazer pages (100 stargazers each) to fetch per sampled repo. [Details](Configuration#smart-sampling-pages) |
| `smart-sampling-threshold` | `number` | `1500` | Star count above which a repo is sampled instead of fully fetched. [Details](Configuration#smart-sampling-threshold) |
| `smtp-host` | `string` | - | SMTP hostname, which is what enables the built-in email feature. [Details](Configuration#smtp-host) |
| `smtp-password` | `string` (secret) | - | SMTP auth password. [Details](Configuration#smtp-password) |
| `smtp-port` | `string` | `587` | SMTP port (`587` = STARTTLS, `465` = SSL). [Details](Configuration#smtp-port) |
| `smtp-username` | `string` | - | SMTP auth username. [Details](Configuration#smtp-username) |
| `top-repos` | `number` | `10` | Number of top repos featured in comparison charts and forecasts. [Details](Configuration#top-repos) |
| `track-stargazers` | `boolean` | `false` | Track individual stargazers per repo. [Details](Configuration#track-stargazers) |
| `velocity-metrics` | `boolean` | `false` | Add a growth-velocity section (stars/day, % growth, days to next milestone) to the report. [Details](Configuration#velocity-metrics) |
| `visibility` | `string` | `all` | Repo visibility filter: `public`, `private`, `all` or `owned`, with an invalid value failing the run. [Details](Configuration#visibility) |

> [!NOTE]
> `smtp-port` is typed `string` where every other numeric-looking input is typed `number`. That is deliberate: it is the one input that never reaches the resolved config. The SMTP adapter reads it raw, parses it itself, warns and falls back to `587` if it is not a number, and derives the TLS mode from the result (`465` means implicit TLS, anything else STARTTLS). Quote it in your workflow: `smtp-port: '465'`.

---

## Outputs

All outputs are strings (GitHub Actions requirement). Available in subsequent workflow steps via `steps.<id>.outputs.<name>`.

| Output | Type | Description |
|---|---|---|
| `lost-stars` | `string` | Per-run. Stars lost against the `compare-against` baseline |
| `new-stargazers` | `string` | Number of new stargazers found by diffing against the stored `stargazers.json`, which every writing run rewrites. Unlike its siblings it is not affected by `compare-against`, and it is `0` when stargazer tracking is off |
| `new-stars` | `string` | Per-run. Stars gained against the `compare-against` baseline |
| `notification-sent` | `string` | Whether an email was actually delivered this run: `true` or `false`. It is `false` when SMTP is unconfigured, `email-to` is empty, or the send failed. Unlike `should-notify` it reports delivery, so a `send-on-no-changes` email on an unchanged run sets it `true` while `should-notify` stays `false` |
| `report` | `string` | Full Markdown report |
| `report-csv` | `string` | CSV report (for data pipelines) |
| `report-html` | `string` | HTML report (for email) |
| `report-html-path` | `string` | Filesystem path to the HTML report. The file is written to `RUNNER_TEMP` (or the working directory when that is unset) on **every** run, including read-only runs and runs where no repository matched the filters, so a later step can always count on it being there. Use it instead of `report-html` when piping into a custom mailer: a large report can exceed the environment variable size limit |
| `should-notify` | `string` | Cumulative. Whether `notification-threshold` was reached under `notification-mode` since the last notification fired, and something changed: `true` or `false` |
| `stars-changed` | `string` | Per-run. Whether any counts changed against the `compare-against` baseline: `true` or `false` |
| `total-stars` | `string` | Total star count across all tracked repos |

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

> [!NOTE]
> The last example compares an unquoted number on purpose. Every output is a string, but the Actions expression language coerces both operands to numbers for the ordering operators (`>`, `>=`, `<`, `<=`), so `new-stars >= 10` works. Equality does no such coercion, which is why the `== 'true'` checks above keep their quotes.

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

Do not reach for `if: steps.tracker.outputs.new-stars >= 500` here. That requires 500 stars within a single run, which on a daily schedule would almost never fire.

---

## Data Formats

### History File (`stars-data.json`)

```typescript
interface History {
  version: number;                   // on-disk format version; absent in files written before it existed, which means 1
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
  "version": 1,
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
| `charts/forecast.svg` | Historical and projected trends |
| `charts/{owner}-{repo}.svg` | Per-repo star history |

To embed any of these, see **[Viewing Reports](Viewing-Reports#method-2-badges)**.

---

## Generated Files on Data Branch

| File | Description | Always Present |
|---|---|---|
| `README.md` | Markdown report with charts | Yes |
| `stars-data.json` | Historical snapshots | Yes |
| `stars-badge.svg` | Star count badge | Yes |
| `stars-data.csv` | CSV report with current star data | Yes |
| `charts/star-history.svg` | Total star trend chart | After first run (when the repo has stargazers and `include-charts` is on) |
| `charts/comparison.svg` | Top repos comparison | After first run (with multiple repos and `include-charts` on) |
| `charts/forecast.svg` | Growth forecast | After enough history points exist |
| `charts/{owner}-{repo}.svg` | Per-repo charts | After first run (for top N repos with stargazers) |
| `stargazers.json` | Stargazer login map | Only with `track-stargazers: true` |

---

## Configuration File Format

This is the complete set of keys the YAML config file can carry, all optional. Every tracking input can be set here. The credentials and plumbing inputs (`github-token`, `github-api-url`, `config-path`, the `smtp-*` inputs, `email-from` and `email-to`) and `send-on-no-changes` are workflow-only. Keys may use underscores or dashes interchangeably.

```yaml
# star-tracker.yml
visibility: public              # all | public | private | owned
include_archived: false         # boolean
include_forks: false            # boolean
exclude_repos:                  # string[] (names or /regex/)
  - repo-name
  - /^regex-pattern.*/
only_repos:                     # string[] (names or /regex/)
  - specific-repo
only_orgs: []                   # string[]
exclude_orgs: []                # string[]
min_stars: 0                    # number
data_branch: star-tracker-data  # string (valid git branch name)
max_history: 52                 # number
compare_against: last-run       # last-run | 24h | 7d | 30d
read_only: false                # boolean
include_charts: true            # boolean
locale: en                      # en | es | ca | it
notification_threshold: 0       # number | "auto"
notification_mode: net          # net | gains
track_stargazers: false         # boolean
top_repos: 10                   # number
smart_sampling: false           # boolean
smart_sampling_threshold: 1500  # number
smart_sampling_pages: 30        # number
chart_line_color: "#dfb317"     # string (hex; quote it, a bare # starts a YAML comment)
chart_line_width: 2.5           # number (the only decimal field)
chart_max_points: 30            # number (granularity, capped at 365; 0 = weekly resolution)
chart_y_axis_side: left         # left | right
chart_smoothing: true           # boolean
chart_curve: monotone           # monotone | catmull-rom | cubic-bezier | rounded-step
chart_show_points: true         # boolean
chart_animation: true           # boolean
chart_milestones: true          # boolean
chart_custom_milestones: []     # number[] or "250, 750, 2500"
chart_begin_at_zero: false      # boolean
chart_theme: auto               # auto | light | dark
email_theme: auto               # auto | light | dark (auto = same as chart_theme)
chart_range: all                # 30d | 90d | 1y | all
chart_trend_line: false         # boolean
velocity_metrics: false         # boolean
```

Booleans here accept the full YAML vocabulary (`true`, `yes`, `on`, `y`, `1` and `false`, `no`, `off`, `n`, `0`), which the equivalent action inputs do not. See [Configuration](Configuration#how-values-are-parsed).

---

## Versioning

| Tag | Description |
|---|---|
| `v1` | Latest stable major version (recommended) |
| `v1.x.x` | Specific patch version |

```yaml
uses: fbuireu/github-star-tracker@v1
```

See [Releases](https://github.com/fbuireu/github-star-tracker/releases) for the changelog.

---

## Next Steps

- **[Configuration](Configuration)**: detailed option descriptions
- **[Examples](Examples)**: real-world workflows
- **[Troubleshooting](Troubleshooting)**: common issues
