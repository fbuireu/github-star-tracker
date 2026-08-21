Complete reference for all GitHub Star Tracker configuration options.

## Contents

- [Configuration Methods](#configuration-methods)
- [Configuration Precedence](#configuration-precedence)
- [How Values Are Parsed](#how-values-are-parsed)
- [Required Input](#required-input): [`github-token`](#github-token)
- [Core Options](#core-options): [`compare-against`](#compare-against), [`config-path`](#config-path), [`data-branch`](#data-branch), [`github-api-url`](#github-api-url), [`include-charts`](#include-charts), [`locale`](#locale), [`max-history`](#max-history), [`read-only`](#read-only), [`top-repos`](#top-repos), [`track-stargazers`](#track-stargazers), [`velocity-metrics`](#velocity-metrics), [`visibility`](#visibility)
- [Smart Sampling](#smart-sampling): [`smart-sampling`](#smart-sampling-1), [`smart-sampling-pages`](#smart-sampling-pages), [`smart-sampling-threshold`](#smart-sampling-threshold)
- [Chart Customization](#chart-customization): [`chart-animation`](#chart-animation), [`chart-begin-at-zero`](#chart-begin-at-zero), [`chart-curve`](#chart-curve), [`chart-custom-milestones`](#chart-custom-milestones), [`chart-line-color`](#chart-line-color), [`chart-line-width`](#chart-line-width), [`chart-max-points`](#chart-max-points), [`chart-milestones`](#chart-milestones), [`chart-range`](#chart-range), [`chart-show-points`](#chart-show-points), [`chart-smoothing`](#chart-smoothing), [`chart-theme`](#chart-theme), [`chart-trend-line`](#chart-trend-line), [`chart-y-axis-side`](#chart-y-axis-side), [`email-theme`](#email-theme)
- [Filtering Options](#filtering-options): [`exclude-orgs`](#exclude-orgs), [`exclude-repos`](#exclude-repos), [`include-archived`](#include-archived), [`include-forks`](#include-forks), [`min-stars`](#min-stars), [`only-orgs`](#only-orgs), [`only-repos`](#only-repos)
- [Email Configuration](#email-configuration): [`email-from`](#email-from), [`email-to`](#email-to), [`notification-mode`](#notification-mode), [`notification-threshold`](#notification-threshold), [`send-on-no-changes`](#send-on-no-changes), [`smtp-host`](#smtp-host), [`smtp-password`](#smtp-password), [`smtp-port`](#smtp-port), [`smtp-username`](#smtp-username)
- [Validation](#validation)

---

## Configuration Methods

GitHub Star Tracker supports two configuration methods:

### 1. Action Inputs (Workflow File)

Set options directly in your workflow YAML:

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    visibility: 'public'
    locale: 'es'
    include-charts: true
```

### 2. Configuration File (YAML)

Create a YAML file in your repository (default path: `star-tracker.yml` at repo root):

```yaml
# star-tracker.yml
visibility: public
min_stars: 5
exclude_repos:
  - test-repo
  - /^demo-.*/
locale: en
compare_against: last-run
chart_line_color: "#dfb317"
velocity_metrics: true
```

That is an excerpt. The **[complete key list, with the allowed values for each](API-Reference#configuration-file-format)**, lives in the API Reference and is the canonical version.

Point to a custom path with `config-path`:

```yaml
with:
  config-path: '.github/star-tracker.yml'
```

> [!NOTE]
> In the config file, keys may be written with either underscores or dashes: `include_archived` and `include-archived` are both accepted. Action inputs always use `kebab-case` (e.g. `include-archived`).

---

## Configuration Precedence

When the same option is set in multiple places:

```
Action Inputs  >  Config File (YAML)  >  Built-in Defaults
```

Action inputs always win. Missing values fall through to the config file, then to defaults.

One tracking option sits outside this: [`send-on-no-changes`](#send-on-no-changes) is **input-only**, so
`send_on_no_changes` in `star-tracker.yml` is read by nothing. The credentials and plumbing inputs
(`github-token`, `github-api-url`, `config-path`, every `smtp-*` input, `email-from` and `email-to`) are workflow-only too,
by design: secrets do not belong in a committed file.

**Example:**

```yaml
# Workflow
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    config-path: 'star-tracker.yml'
    locale: 'en'  # Overrides config file
```

```yaml
# star-tracker.yml
locale: es        # Ignored, the workflow input takes priority
visibility: public # Used (no workflow input overrides it)
include_charts: true # Used
```

**Result:** `locale: en`, `visibility: public`, `include_charts: true`

---

## How Values Are Parsed

The two configuration sources do not read values the same way. The differences are small and they bite silently, because a rejected value falls through instead of failing.

### Booleans

The config file accepts the full YAML vocabulary. An action input accepts only `true` and `false`.

| Source | Accepted as true | Accepted as false |
|---|---|---|
| `star-tracker.yml` | `true`, `yes`, `on`, `y`, `1` (and YAML's own native booleans) | `false`, `no`, `off`, `n`, `0` |
| Action input | `true` | `false` |

Both are trimmed and case-folded, so `TRUE` and ` true ` are fine on either side. But `include-archived: 'yes'` as a workflow input logs `Invalid include-archived "yes". Ignoring it.` and falls through to the config file and then to the default, while `include_archived: yes` in `star-tracker.yml` works exactly as you would expect.

### Numbers

Every numeric option except one is parsed as a strict integer: after trimming, the value must match `^[+-]?\d+$` in full. There is no partial parse and no rounding of a decimal string. `min-stars: '3.7'` and `max-history: '42abc'` are both rejected outright, warn, and fall through.

[`chart-line-width`](#chart-line-width) is the sole exception: it is parsed as a decimal, which is why `2.5` is a valid stroke width.

### The `auto` keyword

The literal `auto` is matched by exact string equality, with no trimming and no case-folding, before the value is tried as a number. `'Auto'`, `'AUTO'` and `' auto'` are therefore not the keyword; they fail the integer test too, so they warn and fall through to the config file and then to `0`. Write it lowercase and unpadded.

### Empty lists

An empty YAML sequence is respected as an explicit "no filter": `only_repos: []` in the config file is read as an empty list, which means the same thing as omitting the key. An empty *input* (`only-repos: ''`) is treated as unset and falls through to the config file. Either way the result is the same, so an empty list in the sample config is safe to leave in place.

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
  github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
```

> The default `GITHUB_TOKEN` is **not sufficient**. See **[Personal Access Token (PAT)](<Personal-Access-Token-(PAT)>)**.

---

## Core Options

### `compare-against`

Which stored snapshot the current star counts are compared against. This selects the Comparison Window, and the window selects the Baseline Snapshot. Config file key: `compare_against`.

| Property | Value |
|---|---|
| **Type** | `string` |
| **Default** | `last-run` |
| **Options** | `last-run`, `24h`, `7d`, `30d` |

| Value | Behavior |
|---|---|
| `last-run` | The most recent stored snapshot |
| `24h`, `7d`, `30d` | The most recent snapshot that is at least that old, minus a 6-hour tolerance |

The Baseline Snapshot is what the `new-stars`, `lost-stars` and `stars-changed` outputs measure against, along with the total delta and the "Compared to snapshot from ..." line in the report. The time windows make a genuine daily, weekly or monthly digest possible even when the tracker itself runs more frequently.

The window carries **6 hours of slack**: `7d` accepts a snapshot as young as 6 days and 18 hours. That exists so a scheduled run drifting a few minutes late does not fall just short of its own window and silently compare against something older than you asked for.

If the stored history is shorter than the requested window, the oldest snapshot available is used instead. The reported period is then shorter than the one you asked for, and the report's "Compared to" date shows exactly how far back it really goes. On the very first run there is no history and therefore no Baseline Snapshot, exactly as with `last-run`.

This input **only** changes which snapshot is the Baseline Snapshot. Every run still appends its own snapshot to the history, and the charts, forecast and velocity sections are unaffected.

```yaml
with:
  compare-against: '7d'
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

> [!WARNING]
> This is one of only two inputs whose invalid value **fails the run** instead of falling back, because a bad branch name would otherwise surface much later as a confusing `git` error. The name is checked against git's own rules before anything else happens. It is rejected when it:
>
> - is empty, or is exactly `@`
> - contains whitespace, or any of `~ ^ : ? * [ \`
> - contains an ASCII control character or `DEL`
> - contains `..`, `//`, `/.` or `@{`
> - starts with `-`, `.` or `/`
> - ends with `/`, `.` or `.lock`
>
> Anything else is accepted, including slashes in the middle (`star-tracker/data` is fine).

---

### `github-api-url`

GitHub API base URL for GitHub Enterprise Server (GHES) instances.

| Property | Value |
|---|---|
| **Type** | `string` |
| **Default** | - (auto-detected on GHES runners via `GITHUB_API_URL`) |

When running on a GHES runner, the action automatically detects the API URL from the `GITHUB_API_URL` environment variable. Only set this input if you need to override the auto-detected value or if you are running on a github.com runner targeting a GHES instance.

```yaml
with:
  github-api-url: 'https://github.example.com/api/v3'
```

---

### `include-charts`

Enable star trend chart generation.

| Property | Value |
|---|---|
| **Type** | `boolean` |
| **Default** | `true` |

When enabled, generates animated SVG charts committed to the `charts/` directory on the data branch, and QuickChart.io URLs in HTML email reports.

When enabled, the action also fetches each repo's stargazers to read their `starred_at` dates and reconstruct the true cumulative star history. This happens whenever charts are on, independent of `track-stargazers`, and it is the single biggest cost of a run. For very large repos (GitHub caps stargazer listing at ~40,000 per repo, oldest first) the *recent* tail is unreachable and is bridged with a ramp: see [Known Limitations](Known-Limitations#-stargazer-listing-cap-40000). Pair those with `smart-sampling`.

```yaml
with:
  include-charts: true
```

See **[Star Trend Charts](Star-Trend-Charts)**.

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

### `max-history`

Maximum number of snapshots to keep in history.

| Property | Value |
|---|---|
| **Type** | `number` |
| **Default** | `52` |

Older snapshots are pruned when the limit is exceeded. One snapshot is stored per run, so how far back the retained history reaches follows your schedule, not the calendar: `52` covers a year of weekly runs, but only 52 days of daily ones. Pick the number of runs you want to keep, then divide by your cron frequency to read it back as a duration.

```yaml
with:
  max-history: '104' # ~2 years of weekly runs
```

> [!NOTE]
> Velocity metrics need at least two *stored* snapshots, so `max-history: 1` leaves exactly one after every run and [`velocity-metrics`](#velocity-metrics) renders nothing.

---

### `read-only`

Run without writing to the data branch. Config file key: `read_only`.

| Property | Value |
|---|---|
| **Type** | `boolean` |
| **Default** | `false` |

A read-only run does everything except touch the data branch: it fetches the repositories, picks the Baseline Snapshot, builds the report, sets every output and sends the email. It simply never commits or pushes.

Use it for a second workflow that shares a data branch with your tracking workflow, typically a weekly digest paired with [`compare-against`](#compare-against). Without it, the digest run would append its own snapshot to the branch and could race the run that actually maintains it.

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    compare-against: '7d'
    read-only: true
```

> [!IMPORTANT]
> **The data branch must already exist.** A read-only run cannot create it, and fails outright when the branch is absent from the remote:
>
> `Branch "star-tracker-data" does not exist on the remote and this is a read-only run, so it cannot be created.`
>
> This is the first thing anyone hits who reaches for `read-only: true` on a fresh setup. Let one normal run create the branch first, or point `data-branch` at the branch your tracking workflow already maintains.

> [!WARNING]
> Do not combine `read-only` with a `notification-threshold` other than `0`. The threshold accumulates against the Notification Baseline (`starsAtLastNotification`), which lives in `stars-data.json` on the data branch, and a read-only run never updates it. Depending on what else writes to that branch, the notification would either fire on every run forever or never fire at all. The action logs a warning if you set both. Gate a read-only digest on the `stars-changed` output instead.

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

> [!WARNING]
> This is API-intensive. Each repo requires `ceil(stars / 100)` API calls. See **[Known Limitations](Known-Limitations)** for rate limit details.

```yaml
with:
  track-stargazers: true
```

---

### `velocity-metrics`

Whether to add a growth-velocity section to the Markdown and HTML reports.

| Property | Value |
|---|---|
| **Type** | `boolean` |
| **Default** | `false` |

When `true`, the report gains a "Growth Velocity" section: stars gained per day, percent growth, and a projection of how many days remain until the next star milestone at the current pace.

The figures are measured period over period, comparing the latest snapshot against the newest earlier one at least 0.25 days (6 hours) back. Measuring over a recent interval keeps them tied to current momentum rather than an arbitrary all-time baseline, and skipping any pair closer together than that minimum stops a manual re-run minutes after a scheduled one from inflating the rate.

The section therefore renders nothing until the stored history holds two snapshots that are at least 6 hours apart. When forecasts are enabled it is nested under the Growth Forecast section.

---

### `visibility`

Filter repositories by visibility.

| Property | Value |
|---|---|
| **Type** | `string` |
| **Default** | `all` |
| **Options** | `all`, `public`, `private`, `owned` |

- `all`: all repos accessible to the token (including collaborator repos)
- `public`: only public repos
- `private`: only private repos
- `owned`: only repos you own (excludes collaborator repos)

An unrecognised value **fails the run** rather than falling back. This and [`data-branch`](#data-branch) are the only two inputs that behave that way.

```yaml
with:
  visibility: 'public'
```

---

## Smart Sampling

For high-star repos, sampling stargazer pages instead of fetching every page keeps the action within GitHub API rate limits.

### `smart-sampling`

Enable stargazer page sampling for high-star repos.

| Property | Value |
|---|---|
| **Type** | `boolean` |
| **Default** | `false` |

When enabled, repos above `smart-sampling-threshold` stars are sampled (a bounded number of evenly-spaced pages) rather than fully fetched.

> [!IMPORTANT]
> Sampling has a cost: **a sampled repo loses its exact new-stargazer list.** The action never sees the full set of logins for that repo, so it cannot say precisely who is new. Star counts, deltas, charts and the reconstructed history are all still produced; it is the per-stargazer detail that [`track-stargazers`](#track-stargazers) reports which becomes approximate. Repos below the threshold are unaffected.

```yaml
with:
  smart-sampling: true
```

---

### `smart-sampling-pages`

Max evenly-spaced stargazer pages (100 stargazers each) to fetch per sampled repo.

| Property | Value |
|---|---|
| **Type** | `number` |
| **Default** | `30` |

---

### `smart-sampling-threshold`

Star count above which a repo is sampled instead of fully fetched (only when `smart-sampling` is enabled).

| Property | Value |
|---|---|
| **Type** | `number` |
| **Default** | `1500` |

---

## Chart Customization

These inputs control the appearance of the generated charts. Unless a section says otherwise, each one applies to both the SVG charts committed to the data branch and the chart images embedded in the email report. See **[Star Trend Charts](Star-Trend-Charts)**.

### `chart-animation`

Whether the SVG charts animate when first rendered.

| Property | Value |
|---|---|
| **Type** | `boolean` |
| **Default** | `true` |

`true` draws the line and fades in the points with CSS animations; `false` renders the charts static. Static is preferable for contexts that do not play CSS animations (most email clients, raster previews). Only affects the SVG charts; the QuickChart images embedded in the email are static regardless.

---

### `chart-begin-at-zero`

Where the chart Y-axis starts.

| Property | Value |
|---|---|
| **Type** | `boolean` |
| **Default** | `false` |

`false` (the default) zooms the Y-axis into the data range so day-to-day changes are visible; `true` anchors the Y-axis at zero for an absolute view of scale.

---

### `chart-curve`

The curve used to connect points when [`chart-smoothing`](#chart-smoothing) is `true`. Ignored when smoothing is `false` (the line is always straight then).

| Property | Value |
|---|---|
| **Type** | `string` |
| **Default** | `monotone` |
| **Options** | `monotone`, `catmull-rom`, `cubic-bezier`, `rounded-step` |

- **`monotone`** (default): a monotone cubic spline. It is smooth but never overshoots, so plateaus stay flat and the line never dips below a value. This is the best fit for star counts, which only ever go up.
- **`catmull-rom`**: a natural spline through every point. Looks organic but can overshoot on sharp steps, briefly drawing the line below the previous value.
- **`cubic-bezier`**: eased S-curves that are flat at every point. Similar to `monotone` but with more pronounced, symmetric transitions.
- **`rounded-step`**: keeps the segments straight and only rounds the corners with a fixed radius, so the chart reads as a step chart with softened edges.

See the **[examples gallery](https://github.com/fbuireu/github-star-tracker/blob/main/examples/README.md#curve-styles-chart-curve)** for a rendered comparison.

**Email charts** (rendered via QuickChart) respect this setting with one caveat, since QuickChart cannot draw every curve natively: `monotone` is reproduced exactly, `rounded-step` falls back to `monotone`, and `catmull-rom` and `cubic-bezier` both render as a tensioned spline. The SVG charts on the data branch always use the exact curve.

---

### `chart-custom-milestones`

Custom star counts to use as milestone reference lines instead of the built-in defaults.

| Property | Value |
|---|---|
| **Type** | `string` (comma-separated integers) |
| **Default** | - |

A comma-separated list of positive star counts (e.g. `"250, 750, 2500"`) that replaces the built-in thresholds. Values are sorted and de-duplicated, non-positive and non-numeric entries are ignored, and an input with no valid numbers at all logs a warning and falls back to the built-in list. When empty, the built-in list is used.

Everything else about milestone lines, including the built-in values and which of them actually get drawn, is described under [`chart-milestones`](#chart-milestones), and this input does nothing while that one is off.

In a config file you can provide either a quoted comma-separated string or a YAML list:

```yaml
chart_custom_milestones: "250, 750, 2500"
# or
chart_custom_milestones:
  - 250
  - 750
  - 2500
```

```yaml
with:
  chart-custom-milestones: "250, 750, 2500"
```

---

### `chart-line-color`

Hex color for the primary chart line/fill/points (star-history, per-repo and forecast historical series; not the comparison palette or forecast trend lines).

| Property | Value |
|---|---|
| **Type** | `string` |
| **Default** | `#dfb317` |

Accepts 3/4/6/8-digit hex with or without a leading `#`. In YAML a bare `#` starts a comment, so quote it (`"#6b63ff"`) or drop the `#` (`6b63ff`).

```yaml
with:
  chart-line-color: '#6b63ff'
```

---

### `chart-line-width`

Stroke width in px (>0) of data lines across all charts.

| Property | Value |
|---|---|
| **Type** | `number` |
| **Default** | `2.5` |

This is the only option parsed as a decimal rather than a strict integer. See [How Values Are Parsed](#how-values-are-parsed).

---

### `chart-max-points`

How many points are sampled across the full reconstructed history. This is the curve's granularity, not a time window: every chart already spans the whole history (from the first star to now), and a higher value just samples that same span more finely for a more detailed line. To narrow the time window instead, use [`chart-range`](#chart-range).

| Property | Value |
|---|---|
| **Type** | `number` |
| **Default** | `30` |

Values above `30` are allowed and capped at `365`. Set to `0` to reconstruct the full history at weekly resolution (the number of points then scales with the repository's age). Email charts are always limited to 30 points regardless of this setting.

---

### `chart-milestones`

Whether to draw milestone reference lines on the main star-history chart.

| Property | Value |
|---|---|
| **Type** | `boolean` |
| **Default** | `true` |

`true` draws dashed reference lines at the star milestones (10, 50, 100, 500, 1k, 5k, 10k, 50k, 100k, 500k, 1M) that fall strictly between the lowest and highest plotted values; `false` hides them. Replace that list with your own using [`chart-custom-milestones`](#chart-custom-milestones).

Applies to the main star-history chart only, in both the SVG output and the email report.

---

### `chart-range`

Time window of history to plot.

| Property | Value |
|---|---|
| **Type** | `string` |
| **Default** | `all` |
| **Options** | `30d`, `90d`, `1y`, `all` |

Keeps only the snapshots within the selected window before applying [`chart-max-points`](#chart-max-points). The window is measured back from the most recent data point (not wall-clock time), so it is deterministic across runs. `all` plots the full reconstructed history.

---

### `chart-show-points`

Whether to draw a marker on each data point.

| Property | Value |
|---|---|
| **Type** | `boolean` |
| **Default** | `true` |

`true` marks each snapshot with a dot; `false` hides the markers for a cleaner line on dense charts.

---

### `chart-smoothing`

Curve style between points.

| Property | Value |
|---|---|
| **Type** | `boolean` |
| **Default** | `true` |

`true` draws a smooth curve; `false` draws straight segments between points to reveal small spikes. When `true`, the exact curve is chosen by [`chart-curve`](#chart-curve).

---

### `chart-theme`

Color theme for the SVG charts, and the fallback for the email report when [`email-theme`](#email-theme) is `auto`.

| Property | Value |
|---|---|
| **Type** | `string` |
| **Default** | `auto` |
| **Options** | `auto`, `light`, `dark` |

`auto` makes the SVG charts follow the reader's `prefers-color-scheme` (light or dark) via a media query. `light` and `dark` force that palette. Most email clients ignore `prefers-color-scheme`, so under `auto` the email body and its charts render in light; use [`email-theme`](#email-theme) to give the email a palette of its own.

---

### `chart-trend-line`

Whether to overlay a moving-average trend line on the main star-history chart.

| Property | Value |
|---|---|
| **Type** | `boolean` |
| **Default** | `false` |

When `true`, a dashed line is drawn over the main chart showing a 7-point simple moving average of the total, smoothing out short-term noise to highlight the underlying direction.

Applies to the main star-history chart only, in both the SVG output and the email report.

---

### `chart-y-axis-side`

Y-axis label side.

| Property | Value |
|---|---|
| **Type** | `string` |
| **Default** | `left` |
| **Options** | `left`, `right` |

---

### `email-theme`

Color theme for the HTML email report and the chart images inside it.

| Property | Value |
|---|---|
| **Type** | `string` |
| **Default** | `auto` |
| **Options** | `auto`, `light`, `dark` |

`auto` means "same as [`chart-theme`](#chart-theme)", so you only need to set this when the email should differ from the SVG charts on the data branch. For example, `chart-theme: auto` lets the README charts follow each viewer's system theme while `email-theme: dark` gives every recipient a dark digest.

This is the input to reach for when a reader in dark mode sees a **white background behind the email charts**. Those charts are PNG images rendered by QuickChart with the background baked into the request ([ADR 0010](https://github.com/fbuireu/github-star-tracker/blob/main/docs/adr/0010-quickchart-renders-the-email-charts.md)), so `prefers-color-scheme` cannot reach them the way it reaches an SVG: the mail client darkens the surrounding HTML and leaves the image untouched. `email-theme: dark` bakes the dark palette into both the body and the images instead.

The trade-off is that a raster has exactly one background for every recipient. `light` and `dark` are a bet on how your audience reads mail; there is no per-reader answer.

```yaml
with:
  chart-theme: auto
  email-theme: dark
```

---

## Filtering Options

Four of these inputs take lists: `exclude-orgs`, `exclude-repos`, `only-orgs` and `only-repos`. They share one grammar, so it is stated here once rather than in each section.

Each is a comma-separated list, and each entry is either an **exact, case-sensitive name** or a **regular expression wrapped in slashes**, optionally with flags: `/^demo-.*/`, `/^demo-.*/i`. The `only-orgs` and `exclude-orgs` lists match the owner name; `only-repos` and `exclude-repos` match the repository name on its own, without the owner. In a config file the same lists can be written as YAML sequences, one entry per line. An entry that looks like a regex but does not compile is skipped with the warning `Ignoring invalid pattern "..."` rather than failing the run.

The four compose: `only-orgs` narrows first, then `only-repos` narrows what is left, then the exclusions apply.

### `exclude-orgs`

Comma-separated list of organization/owner names or regex patterns to exclude.

| Property | Value |
|---|---|
| **Type** | `string` (comma-separated) |
| **Default** | - |

```yaml
with:
  exclude-orgs: 'old-org,/^test-.*/'
```

---

### `exclude-repos`

Comma-separated list of repository names or regex patterns to exclude.

| Property | Value |
|---|---|
| **Type** | `string` (comma-separated) |
| **Default** | - |

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

### `only-orgs`

Comma-separated list of organization/owner names or regex patterns to exclusively track.

| Property | Value |
|---|---|
| **Type** | `string` (comma-separated) |
| **Default** | - |

```yaml
with:
  only-orgs: 'my-org,/^acme-.*/'
```

---

### `only-repos`

Comma-separated list of repository names or regex patterns to exclusively track.

| Property | Value |
|---|---|
| **Type** | `string` (comma-separated) |
| **Default** | - |

When set, **only** these repos are tracked, and the archived/fork/exclude/min-stars filters are skipped. [`only-orgs`](#only-orgs) still applies first and narrows the set this selects from, so this input cannot bring back a repo that `only-orgs` already excluded.

```yaml
with:
  only-repos: 'my-awesome-project,/^docs-.*/'
```

---

## Email Configuration

All email inputs are optional. Providing `smtp-host` enables the built-in email feature.

### `email-from`

Sender name or email address.

| Property | Value |
|---|---|
| **Type** | `string` |
| **Default** | _(localized)_ |

---

### `email-to`

Recipient email address.

| Property | Value |
|---|---|
| **Type** | `string` |
| **Default** | - |

---

### `notification-mode`

How [`notification-threshold`](#notification-threshold) measures the accumulated change since the last notification. Config file key: `notification_mode`.

| Property | Value |
|---|---|
| **Type** | `string` |
| **Default** | `net` |
| **Options** | `net`, `gains` |

| Value | Behavior |
|---|---|
| `net` | The absolute value of the change in total stars since the last notification. Gains and losses across repos cancel out, and a large **drop** also reaches the threshold |
| `gains` | Only upward movement counts. The threshold is reached when the total has risen by at least N since the last notification; a drop never triggers a notification |

Both modes measure against the Notification Baseline. [`notification-threshold`](#notification-threshold) explains the accumulation rule in full. `notification-threshold: '0'` still means "notify on every run that has changes", regardless of mode.

```yaml
with:
  notification-threshold: '500'
  notification-mode: 'gains'
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
| `N` (e.g. `5`) | Notify when accumulated change since the last notification >= N |
| `auto` | Adaptive threshold based on total stars |

**Adaptive thresholds (`auto`):**

| Total Stars | Threshold |
|---|---|
| 0 – 50 | 1 star |
| 51 – 200 | 5 stars |
| 201 – 500 | 10 stars |
| 501+ | 20 stars |

The keyword is matched literally: `'auto'` in lowercase, with no surrounding spaces. Anything else warns and falls through. See [How Values Are Parsed](#how-values-are-parsed).

The threshold is **cumulative, not per-run**. It is measured against the Notification Baseline, stored as `starsAtLastNotification` in `stars-data.json` on the data branch. Runs that do not notify leave that baseline untouched, so the accumulated change keeps growing across runs until it trips the threshold. How that change is measured is controlled by [`notification-mode`](#notification-mode).

The baseline advances only when the notification actually went out. If a configured SMTP send fails, the action logs a warning, leaves the baseline where it was and keeps accumulating, so the change is not lost. When no SMTP transport is configured at all, the `should-notify` output *is* the notification, so the baseline advances as soon as the threshold trips.

On a data branch that has never sent a notification there is no stored baseline (`starsAtLastNotification` is absent and treated as `0`), so the first run fires immediately and then settles into the cumulative rhythm. That is not the case if you were already running with the default `notification-threshold: '0'`. Every changed run has been notifying, so the Notification Baseline already holds your current total, and raising the threshold fires nothing immediately: the next email waits until the total actually moves by at least the threshold.

This is what drives the `should-notify` output, which additionally requires that something actually changed. To express "email me every N stars", gate your notification step on `should-notify`, not on `new-stars >= N`. The `new-stars` and `lost-stars` outputs are **per-run** figures measured against the Baseline Snapshot (see [`compare-against`](#compare-against)); they are not cumulative and carry no memory of whether an email was sent, so `new-stars >= N` would require N stars within a single run and would almost never fire on a daily schedule.

```yaml
with:
  notification-threshold: 'auto'
```

> [!IMPORTANT]
> **The threshold and the report period are independent.** `notification-threshold` decides *when* an email goes out. [`compare-against`](#compare-against) decides *what period the report body covers*. If a threshold of `500` trips after ten daily runs, the email still contains a report diffed against whatever `compare-against` selects, by default the previous run, so a subject line announcing 500 new stars arrives on top of a table covering a single day. Set `compare-against` to the window you expect the threshold to accumulate over if you want the two to agree, or drive your own subject line from the `total-stars` output with an external mailer.

See **[Email Notifications](Email-Notifications)** for complete setup.

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

### `smtp-host`

SMTP server hostname. **Providing this enables built-in email notifications.**

| Property | Value |
|---|---|
| **Type** | `string` |
| **Default** | - |

Common values: `smtp.gmail.com`, `smtp-mail.outlook.com`, `smtp.office365.com`, `smtp.sendgrid.net`

---

### `smtp-password`

SMTP authentication password.

| Property | Value |
|---|---|
| **Type** | `string` (secret) |
| **Default** | - |

For Gmail, use an app-specific password. For SendGrid, use your API key.

---

### `smtp-port`

SMTP server port.

| Property | Value |
|---|---|
| **Type** | `string` |
| **Default** | `587` |

Common ports: `587` (STARTTLS, recommended), `465` (SSL/TLS). It is typed `string` rather than `number` because the SMTP adapter reads and parses it directly instead of going through the resolved config; quote it in your workflow.

---

### `smtp-username`

SMTP authentication username.

| Property | Value |
|---|---|
| **Type** | `string` |
| **Default** | - |

---

## Validation

The action validates inputs at startup:

- [`visibility`](#visibility) and [`data-branch`](#data-branch) are the only inputs whose invalid values fail the run; a missing `github-token` fails it too. Every other invalid value falls back rather than failing, including non-positive `max-history`, `top-repos` and `smart-sampling-pages`, and negative `min-stars`, `smart-sampling-threshold` and `chart-max-points`
- **For most keys an invalid input falls to the *next layer*, not straight to the default.** `max-history: 'abc'` in the workflow with `max_history: 104` in the file yields 104, not 52. The enum keys behave differently: a non-empty but unrecognised value goes straight to the default and the config file is never consulted, and `chart-custom-milestones` is the same
- **Only the enum keys warn about a bad config-file value.** `locale`, `compare-against`, `notification-mode`, `chart-curve`, `chart-range`, `chart-theme`, `email-theme` and `chart-y-axis-side` are checked whichever layer the value came from; every other key warns only about a bad *input*, so `min_stars: "abc"` in the YAML falls back silently. `send-on-no-changes` never warns at all, and `visibility` does not warn either: it **throws**

---

## Next Steps

- **[API Reference](API-Reference)**: complete inputs and outputs reference
- **[Examples](Examples)**: real-world configurations
- **[Email Notifications](Email-Notifications)**: email setup details
- **[Troubleshooting](Troubleshooting)**: common configuration issues
