GitHub Star Tracker generates animated SVG charts to visualize star growth over time.

---

## Chart Types

### 1. Star History

**File:** `charts/star-history.svg`

Shows the **total star count** across all tracked repositories over time.

- Animated line with smooth Catmull-Rom curves
- CSS draw-line animation + fade-in data points
- Milestone markers at 10, 50, 100, 500, 1K, 5K, 10K stars (when in range)
- Locale-aware date labels on the X-axis

![Total Stars Chart](https://quickchart.io/chart?c=%7Btype%3A%27line%27%2Cdata%3A%7Blabels%3A%5B%27Jan%201%27%2C%27Jan%208%27%2C%27Jan%2015%27%5D%2Cdatasets%3A%5B%7Blabel%3A%27Total%20Stars%27%2Cdata%3A%5B100%2C105%2C112%5D%2CbackgroundColor%3A%27rgba%2875%2C192%2C192%2C0.2%29%27%2CborderColor%3A%27rgba%2875%2C192%2C192%2C1%29%27%7D%5D%7D%7D)

### 2. Per-Repo Charts

**File:** `charts/{owner}-{repo}.svg`

Individual star history for each of the top N repositories (configurable via `top-repos`).

- Same style as the star history chart
- One chart per top repo
- Collapsible in the Markdown report via `<details>`

### 3. Comparison Chart

**File:** `charts/comparison.svg`

Top N repositories overlaid on a single chart for comparison.

- Multi-line chart with distinct colors per repo
- Legend showing repo names (short names when all repos share the same owner)
- Up to 10 repos (limited by `CHART.maxComparison`)

![Comparison Chart](https://quickchart.io/chart?c=%7Btype%3A%27line%27%2Cdata%3A%7Blabels%3A%5B%27Jan%201%27%2C%27Jan%208%27%5D%2Cdatasets%3A%5B%7Blabel%3A%27repo-a%27%2Cdata%3A%5B50%2C55%5D%2CborderColor%3A%27%2336A2EB%27%7D%2C%7Blabel%3A%27repo-b%27%2Cdata%3A%5B30%2C32%5D%2CborderColor%3A%27%23FF6384%27%7D%5D%7D%7D)


### 4. Forecast Chart

**File:** `charts/forecast.svg`

Historical data + projected growth for the next 4 weeks.

- Solid line for historical data
- Dashed green line for linear regression forecast
- Dashed red line for weighted moving average forecast
- Legend distinguishing methods

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

---

## Enabling Charts

Charts are **enabled by default** (`include-charts: true`).

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.GITHUB_STAR_TRACKER_TOKEN }}
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

Charts appear automatically once enough data accumulates. The first run produces no charts.

---

## Chart Appearance

### Dimensions

- **Width:** 800px
- **Height:** 400px
- **Format:** SVG (data branch) / PNG (email)

### Colors

**Star history / per-repo:**
- Line: `#dfb317` (gold)
- Fill: 10% opacity gold

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
- Historical: `#dfb317` (gold, solid)
- Linear regression: `#28a745` (green, dashed)
- Weighted moving average: `#d73a49` (red, dashed)

### Animations (SVG only)

- **Line draw:** 2-second ease-out animation
- **Data points:** fade-in with staggered delay
- Animations play when the SVG is first loaded in the browser

### Data Point Limits

- Maximum **30 data points** per chart (`CHART.maxDataPoints`)
- When history exceeds 30 snapshots, only the most recent 30 are charted
- JSON data still contains all snapshots up to `max-history`

### Localization

Date labels and chart titles are localized based on your `locale` setting:

```yaml
with:
  locale: 'es' # Spanish date labels and titles
```

---

## Embedding Charts in Your README

### Star History

```markdown
![Star History](https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/star-tracker-data/charts/star-history.svg)
```

### Comparison

```markdown
![Comparison](https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/star-tracker-data/charts/comparison.svg)
```

### Forecast

```markdown
![Forecast](https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/star-tracker-data/charts/forecast.svg)
```

### Per-Repo

```markdown
![Per-Repo](https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/star-tracker-data/charts/owner-repo.svg)
```

> Replace `owner-repo` with your actual repo's `{owner}-{repo}` (slash replaced with dash).

---

## Controlling Top Repos

The `top-repos` input controls how many repos get individual charts, appear in the comparison chart, and have per-repo forecasts:

```yaml
with:
  top-repos: '5' # Only top 5 repos
```

Default is `10`.

---

## Troubleshooting

| Issue | Solution |
|---|---|
| No charts after first run | Need at least 2 runs for chart data |
| No forecast chart | Need at least 3 runs |
| Charts not updating | Check workflow completed successfully |
| Broken images in email | Email client may block external images |
| Charts render as code | Make sure you're viewing the data branch, not raw SVG source |

---

## Next Steps

- **[Viewing Reports](Viewing-Reports)** — How to access charts
- **[Email Notifications](Email-Notifications)** — Charts in emails
- **[Configuration](Configuration)** — Chart-related settings
