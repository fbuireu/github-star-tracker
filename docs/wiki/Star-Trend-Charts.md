GitHub Star Tracker generates animated SVG charts to visualize star growth over time.

---

## Reconstructed History

Charts plot a **Reconstructed History**. Every star is placed on the date it was actually given (GitHub's `starred_at` timestamp via the `application/vnd.github.star+json` media type), and the cumulative count is rebuilt over real time. The timeline runs from a repo's very first star up to now, regardless of when you started running the action. It is rebuilt from scratch on every run and never stored.

The **Stored History** on the data branch is still kept, and still drives the report's delta tables, the notification threshold and the velocity section, but the charts no longer depend on it. Why the charts were moved off it, and what that costs in stargazer API calls, is [ADR 0005](https://github.com/fbuireu/github-star-tracker/blob/main/docs/adr/0005-charts-are-reconstructed-from-stargazer-timestamps.md).

**The Stored History is still the fallback.** A repository whose stargazers cannot be read has no reconstruction, and its chart is drawn from the Stored History instead. That series spans the tracker's own runs rather than the repository's life, which is what a suspiciously short or flat chart usually means.

---

## Chart Types

### 1. Star History

**File:** `charts/star-history.svg`

Shows the **total star count** across all tracked repositories over time.

- Animated line with smooth monotone cubic curves (configurable via `chart-curve`), dropped to the chart floor at the first point so the shaded area closes cleanly rather than hanging mid-air. With the default `chart-begin-at-zero: false` that floor is the lowest plotted value, not zero; set `chart-begin-at-zero: true` to make it a true zero baseline
- CSS draw-line animation + fade-in points
- Milestone markers at 10, 50, 100, 500, 1K, 5K, 10K, 50K, 100K, 500K, 1M stars (when in range)
- Compact Y-axis and milestone values (e.g. `50K`) that stay inside the chart bounds
- X-axis date labels scaled to the time span: years for multi-year histories (e.g. `2023 2024 2025`), day-level labels for shorter ranges
- Optional **trend line**: when `chart-trend-line` is enabled, a dashed line in the palette's neutral gray is overlaid on top of the star line. It is computed as a 7-point moving average, which smooths week-to-week noise so the underlying growth direction is easier to read; it describes the past only and is a different thing from the forecast. This chart has no legend, so the gray dashed line is the trend line and the solid line is the actual star count.

![Star History](https://raw.githubusercontent.com/fbuireu/github-star-tracker/main/examples/star-history.svg)

### 2. Per-Repo Charts

**File:** `charts/{owner}-{repo}.svg`

Individual star history for each of the top N repositories (configurable via `top-repos`).

Each per-repo chart uses that repository's **own** Reconstructed History, starting at its first star rather than at the earliest star across all your tracked repos, so a newer repo's chart begins when it actually started getting stars instead of showing a flat line back to your oldest repo.

That holds whenever the repository's own reconstruction has at least 2 points. When it does not, because its stargazers could not be read, the chart falls back to the Stored History, which spans the tracker's runs rather than the repository's life. The chart is still drawn; it just no longer means what the paragraph above says.

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

Observed history plus projected growth for the next 4 weeks.

- Solid line for the observed history
- Dashed green line for linear regression forecast
- Dashed red line for weighted moving average forecast
- Legend distinguishing methods

![Forecast Chart](https://raw.githubusercontent.com/fbuireu/github-star-tracker/main/examples/forecast.svg)

---

## Two Chart Systems

GitHub Star Tracker uses two complementary chart systems:

| System | Format | Used In | Features |
|---|---|---|---|
| **SVG Charts** | Animated SVG | Data branch [`README.md`](https://github.com/fbuireu/github-star-tracker/blob/main/README.md) | CSS animations, self-contained, no external deps |
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

| Chart | Minimum points in the series | Notes |
|---|---|---|
| Star History | 2 | |
| Per-Repo | 2 | One chart per top N repo |
| Comparison | 2 | Plus at least 1 repo in top N |
| Forecast | 3 | Linear regression needs 3+ |

**Those minimums are about points in the series, not about how many stars you have.** The reconstruction is
drawn as a fixed number of evenly spaced buckets across the span, `chart-max-points` of them (30 by default,
never fewer than 2), so a **single** stargazer with a readable `starred_at` date already produces a 30-point
curve on the very first run. What produces no curve at all is having no star event with a usable date
anywhere in the tracked set: an empty stargazers list, or one the API would not return. In that case the
chart falls back to the Stored History, which does need two runs before it has two points.

---

## Chart Appearance

### Dimensions

- **Width:** 800px
- **Height:** 400px
- **Format:** SVG (data branch) / PNG (email)

### Colors

**Star history / per-repo:**
- Line: `#dfb317` (gold) by default, changed with `chart-line-color` (see [Chart customization](#chart-customization)). It sets the star-history series, the per-repo series and the forecast's historical series, and nothing else
- Fill: the same colour at 10% opacity
- Trend line (when `chart-trend-line` is enabled): the palette's neutral gray, dashed. `chart-line-color` does not reach it

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

This palette is fixed in both senses: `chart-line-color` does not reach it, and it does not change with `chart-theme`.

**Forecast chart:**
- Historical: the `chart-line-color` series, solid
- Linear regression: the palette's positive green, dashed
- Weighted moving average: the palette's negative red, dashed

**Three of those series are palette colours, so they move with `chart-theme`.** They are fixed with respect to `chart-line-color`, not with respect to the theme:

| Series | `chart-theme: light` (and `auto`) | `chart-theme: dark` |
|---|---|---|
| Trend line (neutral) | `#6a737d` | `#8b949e` |
| Linear regression (positive) | `#28a745` | `#3fb950` |
| Weighted moving average (negative) | `#d73a49` | `#f85149` |

### Dark / Light Mode

By default (`chart-theme: auto`) the SVG charts adapt to the viewer's colour scheme through a
`@media (prefers-color-scheme: dark)` block inside the SVG's own `<style>` element, and no configuration is
needed. Forcing [`chart-theme`](Configuration#chart-theme) to `light` or `dark` drops the media query and
bakes one palette in, which is what you want when the chart is embedded somewhere that does not follow the
reader's system theme.

**What that media query switches is the chrome, not the data.** Background, title, legend text, axis labels,
grid lines and axis strokes swap; series strokes are written as inline attributes resolved once, and under
`auto` they resolve from the light palette. So a dark-mode reader of an `auto` chart gets dark chrome around
light-palette data. Setting `chart-theme: dark` explicitly does recolour the three series in the table above,
because the palette is then chosen before rendering rather than by the reader's browser.

| Element | Light | Dark |
|---|---|---|
| Background | `#fff` | `#0d1117` |
| Text | `#24292e` | `#e6edf3` |
| Muted text | `#6a737d` | `#8b949e` |
| Grid lines | `#eee` | `#21262d` |
| Axis lines | `#6a737d` | `#8b949e` |

Where the media query reaches:

| Context | Follows the reader's scheme |
|---|---|
| GitHub README / Markdown | Yes, GitHub respects `prefers-color-scheme` in inline SVGs |
| Browser (opening the SVG directly) | Yes |
| HTML email | No. Gmail strips `<style>` blocks, so set [`email-theme`](Configuration#email-theme) to pick the palette instead |
| QuickChart PNGs in email | No. The image is rasterised once, on whatever background `email-theme` resolves to |

The badge ([`stars-badge.svg`](https://github.com/fbuireu/github-star-tracker/blob/main/examples/stars-badge.svg)) carries no dark-mode styles at all. It uses a fixed dark label with an
accent-coloured value, legible on either background.

### Animations (SVG only)

- **Line draw:** 2-second ease-out animation
- **Point markers:** fade in with a staggered delay
- Animations play when the SVG is first loaded in the browser

### Resolution Limits

- `chart-max-points` sets the curve granularity: how many points are plotted across the **full** time span of the reconstruction (first star to now). It is not a time window, so raising it does not show more history, only a finer line over the same span. Use `chart-range` to narrow the window.
- By default charts plot **30 points** (`chart-max-points`, default `30`). Higher values are allowed and capped at **365**.
- Set `chart-max-points: 0` to reconstruct the full history at **weekly** resolution, so the point count scales with the repository's age.
- Email charts are always limited to 30 points.
- None of this touches `stars-data.json`, which still holds every snapshot up to `max-history`.

### Localization

Date labels and chart titles are localized based on your `locale` setting:

```yaml
with:
  locale: 'es' # Spanish date labels and titles
```

---

## Embedding Charts in Your README

Every chart is a raw file on the data branch, so a plain Markdown image tag is all you need. The snippets for
all four charts and for the badge live in **[Viewing Reports](Viewing-Reports#method-2-badges)**. They are the same
URLs whichever page you come from, so they are written once there.

---

## Controlling Top Repos

The `top-repos` input controls how many repos get individual charts and per-repo forecasts:

```yaml
with:
  top-repos: '5' # Only top 5 repos
```

Default is `10`.

The comparison chart draws from the same ranking but caps itself at **10 series** whatever `top-repos` says,
so `top-repos: 20` gives you twenty per-repo charts and twenty per-repo forecasts, and a comparison chart
still showing the top ten. Beyond that the lines stop being distinguishable.

---

## Chart customization

Every `chart-*` input, with its default and full description, is in
**[Configuration](Configuration#chart-line-color)**. That page is the reference; this one does not restate it.

What belongs here is which of the **two chart systems** honours each one. The SVG charts on the data branch
are hand-rendered; the email charts are QuickChart images, and some options cannot survive that trip:

| Input | SVG charts | Email charts |
|---|---|---|
| `chart-line-color` | Yes | Yes |
| `chart-line-width` | Yes | Yes |
| `chart-smoothing` | Yes | Yes |
| `chart-curve` | Exact | Approximated, see [Two Chart Systems](#two-chart-systems) |
| `chart-show-points` | Yes | Yes |
| `chart-milestones` | Yes | Yes |
| `chart-custom-milestones` | Yes | Yes |
| `chart-begin-at-zero` | Yes | Yes |
| `chart-range` | Yes | Yes |
| `chart-trend-line` | Yes | Yes |
| `chart-max-points` | Yes | **No**, email is always 30 points |
| `chart-animation` | Yes | **No**, a PNG cannot animate |
| `chart-y-axis-side` | Yes | **No** |
| `chart-theme` | Yes | Indirectly: the email follows `email-theme`, which defaults to `auto`, meaning "same as `chart-theme`" |
| `email-theme` | No | Yes |

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

On a repository above GitHub's stargazer listing cap the chart's recent tail is a bridged approximation rather than read data; [Known Limitations](Known-Limitations#-stargazer-listing-cap-40000) has the full account. Pair such repositories with `smart-sampling` to keep the request cost bounded.

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

Every other option's default and effect is in [Configuration](Configuration#chart-line-color), and the
examples gallery above shows each one rendered.

---

## Troubleshooting

| Issue | Solution |
|---|---|
| No charts at all on the first run | No star in the tracked set had a readable `starred_at` date, so there was nothing to reconstruct. See [Troubleshooting](Troubleshooting#no-charts-generated) |
| Charts render as source code | You are looking at the raw SVG file rather than the rendered data branch |

Everything else, including flat lines, missing forecasts and charts that stop updating, is in
**[Troubleshooting](Troubleshooting)**.

---

## Next Steps

- **[Viewing Reports](Viewing-Reports)** - How to access charts
- **[Email Notifications](Email-Notifications)** - Charts in emails
- **[Configuration](Configuration)** - Chart-related settings
