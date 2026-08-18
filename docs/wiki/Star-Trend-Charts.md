GitHub Star Tracker generates animated SVG charts to visualize star growth over time.

---

## Real Star History

Charts plot the **real historical star curve**. Every star is placed on the date it was actually given (GitHub's `starred_at` timestamp via the `application/vnd.github.star+json` media type), and the cumulative count is reconstructed over real time. The timeline runs from a repo's very first star up to now, regardless of when you started running the action. Per-run snapshots on the data branch are still kept for the report's delta tables and notifications, but the charts no longer depend on them. Why the charts were moved off those snapshots, and what it costs in stargazer API calls, is [ADR 0005](https://github.com/fbuireu/github-star-tracker/blob/main/docs/adr/0005-charts-are-reconstructed-from-stargazer-timestamps.md).

---

## Chart Types

### 1. Star History

**File:** `charts/star-history.svg`

Shows the **total star count** across all tracked repositories over time.

- Animated line with smooth monotone cubic curves (configurable via `chart-curve`), anchored to the baseline at the first point (starts from zero, not mid-air)
- CSS draw-line animation + fade-in data points
- Milestone markers at 10, 50, 100, 500, 1K, 5K, 10K, 50K, 100K, 500K, 1M stars (when in range)
- Compact Y-axis and milestone values (e.g. `50K`) that stay inside the chart bounds
- X-axis date labels scaled to the time span: years for multi-year histories (e.g. `2023 2024 2025`), day-level labels for shorter ranges
- Optional **trend line**: when `chart-trend-line` is enabled, a dashed neutral-gray line (`#6a737d`) is overlaid on top of the gold star line. It is a 7-point moving average that smooths week-to-week noise so the underlying growth direction is easier to read. This chart has no legend, so the gray dashed line is the trend line (the solid gold line is the actual star count).

![Star History](https://raw.githubusercontent.com/fbuireu/github-star-tracker/main/examples/star-history.svg)

### 2. Per-Repo Charts

**File:** `charts/{owner}-{repo}.svg`

Individual star history for each of the top N repositories (configurable via `top-repos`).

Each per-repo chart uses that repository's own timeline, starting at its first star (not the earliest star across all your tracked repos), so a newer repo's chart begins when it actually started getting stars instead of showing a flat line back to your oldest repo.

- Same style as the star history chart
- One chart per top repo
- Collapsible in the Markdown report via `<details>`

![Per-Repo Chart](https://raw.githubusercontent.com/fbuireu/github-star-tracker/main/examples/per-repo.svg)

### 3. Comparison Chart

**File:** `charts/comparison.svg`

Top N repositories overlaid on a single chart for comparison.

- Multi-line chart with distinct colors per repo
- Legend showing repo names (short names when all repos share the same owner)
- Up to 10 repos (limited by `CHART.maxComparison`)

![Comparison Chart](https://raw.githubusercontent.com/fbuireu/github-star-tracker/main/examples/comparison.svg)


### 4. Forecast Chart

**File:** `charts/forecast.svg`

Historical data + projected growth for the next 4 weeks.

- Solid line for historical data
- Dashed green line for linear regression forecast
- Dashed red line for weighted moving average forecast
- Legend distinguishing methods

![Forecast Chart](https://raw.githubusercontent.com/fbuireu/github-star-tracker/main/examples/forecast.svg)

---

## Two Chart Systems

GitHub Star Tracker uses two complementary chart systems:

| System | Format | Used In | Features |
|---|---|---|---|
| **SVG Charts** | Animated SVG | Data branch `README.md` | CSS animations, self-contained, no external deps |
| **QuickChart URLs** | PNG via URL | HTML email reports | Compatible with email clients |

### Why Two Systems?

- **SVG charts** use CSS animations (`@keyframes`) that render beautifully in GitHub Markdown but are not supported by email clients
- **QuickChart URLs** generate static PNG images via [QuickChart.io](https://quickchart.io) that work in all email clients

### Curve fidelity

The SVG charts implement every [`chart-curve`](Configuration#chart-curve) option exactly. QuickChart can only draw the curves Chart.js supports natively, so the email charts approximate: `monotone` is exact, `rounded-step` falls back to `monotone`, and `catmull-rom` and `cubic-bezier` both render as a tensioned spline. Colors, line width, points, milestones and range match between the two systems. What the email charts genuinely drop is `chart-max-points` (always 30), `chart-animation` (a PNG cannot animate) and `chart-y-axis-side`.

---

## Enabling Charts

Charts are **enabled by default** (`include-charts: true`).

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    include-charts: true
```

### Disabling Charts

```yaml
with:
  include-charts: false
```

**When to disable:**
- You only need JSON data
- Faster execution
- Reducing data branch size

---

## Data Requirements

| Chart | Minimum Snapshots | Notes |
|---|---|---|
| Star History | 2 | Need at least 2 data points |
| Per-Repo | 2 | Per top N repos |
| Comparison | 2 | At least 1 repo in top N |
| Forecast | 3 | Linear regression needs 3+ points |

Charts are produced on the first run, since the curve is reconstructed from historical star dates (you need at least ~2 stars total for a 2-point line).

---

## Chart Appearance

### Dimensions

- **Width:** 800px
- **Height:** 400px
- **Format:** SVG (data branch) / PNG (email)

### Colors

**Star history / per-repo:**
- Line: `#dfb317` (gold) - this is the **default** and can be changed with `chart-line-color` (see [Chart customization](#chart-customization)). It affects the star-history, per-repo and forecast historical series, but not the comparison palette or the forecast trend lines.
- Fill: 10% opacity gold
- Trend line (when `chart-trend-line` is enabled): `#6a737d` (neutral gray, dashed) - fixed color, not affected by `chart-line-color`.

**Comparison chart palette (up to 10 repos):**

| Position | Color |
|---|---|
| 1 | `#dfb317` (gold) |
| 2 | `#28a745` (green) |
| 3 | `#e74c3c` (red) |
| 4 | `#3498db` (blue) |
| 5 | `#9b59b6` (purple) |
| 6 | `#e67e22` (orange) |
| 7 | `#1abc9c` (teal) |
| 8 | `#e84393` (pink) |
| 9 | `#795548` (brown) |
| 10 | `#00bcd4` (cyan) |

**Forecast chart:**
- Historical: `#dfb317` (gold, solid) - the historical series uses the `chart-line-color` default and respects `chart-line-color`; the trend lines below do not.
- Linear regression: `#28a745` (green, dashed)
- Weighted moving average: `#d73a49` (red, dashed)

### Animations (SVG only)

- **Line draw:** 2-second ease-out animation
- **Data points:** fade-in with staggered delay
- Animations play when the SVG is first loaded in the browser

### Data Point Limits

- `chart-max-points` sets the curve granularity: how many points are sampled across the **full** time span of the star history (first star to now). It is not a time window, so raising it does not show more history, only a finer line over the same span. Use `chart-range` to narrow the window.
- By default charts plot **30 points** (`chart-max-points`, default `30`). Higher values are allowed and capped at **365**.
- Set `chart-max-points: 0` to reconstruct the full history at **weekly** resolution, so the point count scales with the repository's age.
- Email charts are always limited to 30 points.
- JSON data still contains all snapshots up to `max-history`

### Localization

Date labels and chart titles are localized based on your `locale` setting:

```yaml
with:
  locale: 'es' # Spanish date labels and titles
```

---

## Embedding Charts in Your README

Every chart is a raw file on the data branch, so a plain Markdown image tag is all you need. The snippets for
all four charts and for the badge live in **[Viewing Reports](Viewing-Reports#method-2-badges)** — they are the same
URLs whichever page you come from, so they are written once there.

---

## Controlling Top Repos

The `top-repos` input controls how many repos get individual charts, appear in the comparison chart, and have per-repo forecasts:

```yaml
with:
  top-repos: '5' # Only top 5 repos
```

Default is `10`.

---

## Chart customization

Every `chart-*` input, with its default and full description, is in
**[Configuration](Configuration#chart-line-color)** — it is the reference and this page does not restate it.

What belongs here is which of the **two chart systems** honours each one. The SVG charts on the data branch
are hand-rendered; the email charts are QuickChart images, and some options cannot survive that trip:

| Input | SVG charts | Email charts |
|---|---|---|
| `chart-line-color` | Yes | Yes |
| `chart-line-width` | Yes | Yes |
| `chart-smoothing` | Yes | Yes |
| `chart-curve` | Exact | Approximated — see [Two Chart Systems](#two-chart-systems) |
| `chart-show-points` | Yes | Yes |
| `chart-milestones` | Yes | Yes |
| `chart-custom-milestones` | Yes | Yes |
| `chart-begin-at-zero` | Yes | Yes |
| `chart-range` | Yes | Yes |
| `chart-trend-line` | Yes | Yes |
| `chart-max-points` | Yes | **No** — email is always 30 points |
| `chart-animation` | Yes | **No** — a PNG cannot animate |
| `chart-y-axis-side` | Yes | **No** |
| `chart-theme` | Yes | Indirectly — the email follows `email-theme`, which defaults to `auto`, meaning "same as `chart-theme`" |
| `email-theme` | — | Yes |

```yaml
with:
  chart-line-color: "#6b63ff"
  chart-line-width: 2.5
  chart-max-points: 0
  chart-y-axis-side: right
  chart-smoothing: true
  chart-curve: monotone
  chart-custom-milestones: "250, 750, 2500"
```

### Large repos

GitHub caps the stargazers listing at roughly 40,000 per repo, oldest first, so on very large repos the **recent** tail is the part that cannot be read and is bridged with a ramp. [Known Limitations](Known-Limitations#-stargazer-listing-cap-40000) has the full account. Pair charts with `smart-sampling` to keep the request cost bounded on big repos.

---

## Comparing Options

A look at how the main settings change the chart, to help you pick. For a rendered side-by-side of every option (default vs on/off vs variants), see the **[examples gallery](https://github.com/fbuireu/github-star-tracker/blob/main/examples/README.md)**.

### Curve styles (`chart-curve`)

All four curves keep the plateaus flat except `catmull-rom`, which overshoots at the foot of a step, briefly drawing the line below the previous value.

| Curve | Overshoots? | Best for |
|---|---|---|
| `monotone` | no | star counts, which only go up (the default) |
| `catmull-rom` | yes | an organic look where slight overshoot is fine |
| `cubic-bezier` | no | pronounced, symmetric easing between points |
| `rounded-step` | no | discrete data you want to read as soft steps |

### On / off toggles

| Option | Default | Alternative | Choose the alternative when |
|---|---|---|---|
| `chart-smoothing` | `true` (smooth curve) | `false` (straight segments) | you need to see exact week-to-week spikes |
| `chart-show-points` | `true` (dot per point) | `false` (line only) | the chart is dense and dots add noise |
| `chart-milestones` | `true` (threshold lines) | `false` (none) | you want a cleaner chart |
| `chart-begin-at-zero` | `false` (zoom to data range) | `true` (anchor at zero) | you want an honest absolute scale |
| `chart-animation` | `true` (draws in on load) | `false` (static render) | embedding in email or a static context |
| `chart-trend-line` | `false` (raw line only) | `true` (+ moving-average overlay) | the data is noisy and you want the direction |

### Value choices

| Option | Options | Effect |
|---|---|---|
| `chart-theme` | `auto` / `light` / `dark` | `auto` follows the viewer's color scheme; the others force a palette |
| `email-theme` | `auto` / `light` / `dark` | palette for the email only; `auto` inherits `chart-theme`, and a raster chart cannot follow the reader's scheme |
| `chart-y-axis-side` | `left` / `right` | moves the axis labels, e.g. to avoid overlap with the start of the line |
| `chart-range` | `30d` / `90d` / `1y` / `all` | narrows the time window, measured back from the latest point |
| `chart-max-points` | `0` / `N` (capped at 365) | curve resolution across the span; `0` reconstructs at weekly cadence |

---

## Troubleshooting

| Issue | Solution |
|---|---|
| No charts after first run | Need at least ~2 stars so the history has 2+ points |
| No forecast chart | Need at least 3 points in the reconstructed history |
| Charts not updating | Check workflow completed successfully |
| Broken images in email | Email client may block external images |
| Charts render as code | Make sure you're viewing the data branch, not raw SVG source |

---

## Next Steps

- **[Viewing Reports](Viewing-Reports)** - How to access charts
- **[Email Notifications](Email-Notifications)** - Charts in emails
- **[Configuration](Configuration)** - Chart-related settings
