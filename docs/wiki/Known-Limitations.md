A detailed overview of current limitations, the technical reasons behind each one, and the design decisions that led to the chosen approach.

---

## 🔑 GitHub Token Scope

### Limitation

The default `GITHUB_TOKEN` provided by GitHub Actions is **not sufficient** for this action. A Personal Access Token (PAT) with `repo` or `public_repo` scope is required.

### Why

The `GITHUB_TOKEN` is scoped to the **current repository only**. GitHub Star Tracker needs to list **all repositories owned by the authenticated user** via `GET /user/repos`, which requires broader access. This is a GitHub API restriction - the automatic token simply cannot enumerate repos outside the triggering repository.

### Approach

The action requires the user to create a PAT and store it as a repository secret (`STAR_TRACKER_TOKEN`). Both classic tokens and fine-grained tokens are supported.

- Classic: `repo` (private + public) or `public_repo` (public only)
- Fine-grained: `Repository access → All repositories` with `Metadata: Read-only`

See **[Personal Access Token (PAT)](Personal-Access-Token-(PAT))** for a step-by-step setup guide.

---

## ⚡ Stargazer API Rate Limits

### Limitation

When `track-stargazers` is enabled, fetching stargazers is **API-intensive**. Each repository requires `ceil(stars / 100)` API calls. A repo with 1,500 stars needs 15 API calls just for stargazers. With many high-star repos, the authenticated rate limit of **5,000 requests/hour** can be approached or exceeded.

### Why

The GitHub Stargazers API (`GET /repos/{owner}/{repo}/stargazers`) paginates at 100 results per page. There is no endpoint to fetch only "recent" or "new" stargazers - the action must retrieve the full list and diff against the previously stored map to determine who's new.

Additionally, stargazers are fetched **sequentially per repo** (not in parallel) to be rate-limit friendly and avoid triggering GitHub's secondary abuse limits.

### Approach

- **Fetched by default for charts**: `track-stargazers` defaults to `false`, but stargazers are now also fetched whenever charts are enabled (`include-charts: true`, the default) in order to reconstruct the real star-history curve. So the stargazer API cost in this table applies to any run with charts on, not only when `track-stargazers` is enabled. To avoid this cost entirely, set `include-charts: false`. Use `smart-sampling` (with `smart-sampling-threshold` / `smart-sampling-pages`) to cap requests for high-star repos.
- **Per-repo error tolerance**: If fetching stargazers fails for one repository (e.g., due to rate limiting), the action logs a warning and continues with the remaining repos instead of aborting the entire run.
- **Separate persistence**: Stargazer data is stored in `stargazers.json` (repo → login array), separate from `stars-data.json`. This keeps the diff lightweight - only login strings are compared, not full user objects.

### Mitigation tips

- Use `only-repos` to limit tracking to specific repos of interest.
- Combine with `min-stars` to avoid fetching stargazers for low-activity repos.
- Run the workflow weekly instead of daily to stay well within rate limits.

| Repository stars | API calls per repo | 10 repos | 50 repos |
|:-----------------|:-------------------|:---------|:---------|
| 100              | 1                  | 10       | 50       |
| 500              | 5                  | 50       | 250      |
| 1,000            | 10                 | 100      | 500      |
| 5,000            | 50                 | 500      | 2,500    |

---

## ⭐ Stargazer Listing Cap (~40,000)

GitHub's stargazers API only lists up to ~40,000 stargazers per repository, oldest first. The real star-history curve is reconstructed from the listed stargazers' `starred_at` dates, so for repos above ~40,000 stars only the oldest ~40,000 stars are reachable and their dates stop well before today.

For those repos the reachable history is drawn accurately (scaled to the reachable count), and the unreachable recent tail is bridged with a straight ramp from there up to the repo's true current total at the final point - so the chart no longer flattens out at the cutoff date. The final point always equals the true star count. Repos within the 40,000 window are unaffected. Pair high-star repos with `smart-sampling` to keep within rate limits.

---

## 🔐 Stargazers API Access Restriction (2026)

### Limitation

GitHub [restricted](https://github.blog/changelog/2026-06-30-upcoming-access-restrictions-to-public-api-endpoints-and-ui-views/) the stargazers list endpoint (`GET /repos/{owner}/{repo}/stargazers`) to repository **admins and collaborators**. Anyone else receives empty responses or `403` errors, which is why third-party tools that chart stars for repositories they don't own (Star History, Starchart.cc, etc.) stop working.

The restriction is evaluated on the **user's role on the repository, not on token scopes**: the endpoint accepts any scope (`x-accepted-oauth-scopes` is empty), so adding scopes to a classic token neither helps nor hurts. A classic PAT carries its owner's full role — including **implicit admin through organization ownership**, which has been verified to keep stargazers access. In practice the affected cases are:

- **Organization repositories where you are a member with read access only** (neither admin nor direct collaborator).
- **Fine-grained PATs without an explicit grant on the repository's organization.** Fine-grained tokens are granted per resource owner: a token that can *list* a public repository (and therefore track its star count) may still lack the `Metadata (read)` grant that the stargazers endpoint checks.

For those repos the stargazers list comes back **`404`, `403` or empty (`200 []`)** — the empty case is silent at the API level, so since v1.22.2 the action logs a warning naming each starred repository whose list came back empty. Charts for affected repos fall back to the per-run snapshot history instead of the reconstructed curve, and stargazer tracking degrades there. Star counts and delta reports keep working everywhere, since `stargazers_count` is not part of the restriction.

> [!NOTE]
> **Rollout instability (July 2026).** During the restriction's initial rollout (~July 5–13, 2026) GitHub's enforcement was observed over-restricting intermittently, returning `404` or empty lists **even to repository admins** — stargazers pages 404'd platform-wide for a period ([community report](https://github.com/orgs/community/discussions/201178)). Charts generated during that window degraded silently on pre-v1.22.2 versions. If yours did, simply re-run once access behaves again: charts are reconstructed from scratch on every run.

### Why

GitHub applied the restriction platform-wide to prevent stargazer lists from being scraped for spam. It is not specific to this action.

### Approach

- The action authenticates with **your own PAT** and tracks repositories from **your own account**, where you are the admin, so the single-account use case with a classic PAT is unaffected.
- For cross-organization setups, use a **classic PAT** of an account that is admin/collaborator on every tracked repository, or grant your fine-grained PAT access to each tracked organization.
- **Per-repo error tolerance** already applies: if fetching stargazers fails or comes back empty for one repository, the action logs a warning naming it and continues with the rest.
- Star counts, reports, badges and notifications never depend on the stargazers list, only charts and `track-stargazers` do.
- If a chart renders as a straight or flat line, see [Troubleshooting](Troubleshooting#chart-is-a-flat-or-straight-line).

---

## 🔮 Forecast Accuracy

### Limitation

Growth forecasts are **trend extrapolations**, not predictive models. They assume that recent growth patterns will continue unchanged. Sudden events - a viral Hacker News post, a project being archived, a major release - are not anticipated.

### Why

When charts are enabled (the default), forecasts extrapolate from the reconstructed real star-history curve (built from stargazers' starred_at dates); otherwise they use the per-run snapshot history. In either case the action has no external signals (social media mentions, download counts, contributor activity) that could improve predictions. Adding external data sources would introduce API dependencies and configuration complexity disproportionate to the value.

### Approach

Two complementary methods are provided, each with different strengths:

**Linear Regression** fits a straight line through all historical data points using least squares. It is resilient to noise and captures long-term trends, but it reacts slowly to recent changes.

```
predicted(week) = slope * (n - 1 + week) + intercept
```

**Weighted Moving Average** computes deltas between consecutive snapshots and weights recent deltas higher. It is more responsive to recent acceleration or deceleration, but more sensitive to short-term noise.

```
predicted(week) = lastValue + avgWeightedDelta * week
```

Both methods clamp predictions to non-negative integers via `Math.max(0, Math.round(...))` to avoid nonsensical outputs (e.g., -3 stars).

Forecasts require a minimum of **3 snapshots** (`MIN_SNAPSHOTS = 3`) and project **4 weeks ahead** (`FORECAST_WEEKS = 4`). These thresholds are intentionally conservative - with fewer data points, any extrapolation would be unreliable.

### Interpretation guide

| Scenario | LR says | WMA says | Interpretation |
|:---------|:--------|:---------|:---------------|
| Steady growth | +10/week | +10/week | Consistent trend, both agree |
| Recent acceleration | +8/week | +15/week | WMA detects recent surge, LR is more conservative |
| Recent slowdown | +12/week | +5/week | WMA detects deceleration, LR still reflects historical average |
| Stagnation | +0/week | +0/week | No growth trend detected |

---

## 🌗 Dark / Light Mode

### Behavior

SVG charts automatically adapt to the viewer's color scheme using `@media (prefers-color-scheme: dark)` inside the SVG `<style>` block. No configuration input is needed - it works out of the box on GitHub, browsers, and any SVG viewer that respects the media query.

### What adapts

Chrome elements - background, title, legend text, axis labels, grid lines, and axis strokes - switch between a light palette and a dark palette (GitHub dark theme values). Data colors (line strokes, point fills, comparison colors) remain unchanged because they are vibrant enough for both themes.

| Element | Light | Dark |
|:--------|:------|:-----|
| Background | `#fff` | `#0d1117` |
| Text | `#24292e` | `#e6edf3` |
| Muted text | `#6a737d` | `#8b949e` |
| Grid lines | `#eee` | `#21262d` |
| Axis lines | `#6a737d` | `#8b949e` |

### Where it works

| Context | Dark mode support |
|:--------|:------------------|
| GitHub README / Markdown | Yes - GitHub respects `prefers-color-scheme` in inline SVGs |
| Browser (direct SVG open) | Yes |
| HTML email reports | No - Gmail strips `<style>` blocks; the HTML report uses an explicit light background instead |
| QuickChart PNG fallbacks | No - PNGs are rasterized with a fixed white background |

### Badges

The Shields.io-style badge (`stars-badge.svg`) does **not** include dark mode styles. Shields badges have their own theming via URL parameters. The badge uses a fixed dark label / accent-colored value scheme that is legible on both light and dark backgrounds.

---

## 📊 Chart Rendering

### Limitation

The action produces two types of charts:

1. **Animated SVG charts** - generated locally, committed to the data branch. Support dark/light mode via CSS media queries. No external dependencies.
2. **QuickChart PNG charts** - generated via [QuickChart.io](https://quickchart.io), used in HTML email reports. Static images, light-only, dependent on an external service.

There is no interactive zooming, panning, tooltips, or click-to-drill-down in either format.

### Why

GitHub Markdown and HTML emails do not support JavaScript. This rules out client-side chart libraries (Chart.js, D3, Highcharts, etc.) in the report output.

SVG charts are the primary output: they are self-contained, support CSS animations and dark mode, and require no external service. QuickChart PNGs are used as a fallback in HTML email reports because email clients strip `<style>` blocks, making SVG theming and animations non-functional.

### Approach

**SVG charts (primary)**
- Generated entirely in-process using TypeScript string templates.
- Committed as `.svg` files to the data branch (`charts/` directory).
- Dimensions fixed at `800x400` pixels.
- CSS animations for line drawing and point fade-in.
- `@media (prefers-color-scheme: dark)` for automatic theme switching.
- Data points capped at **30** (`CHART.maxDataPoints`).
- Comparison charts limited to **10 repositories** (`CHART.maxComparison`).
- Milestone annotations (50, 100, 500, 1K, 5K, 10K stars) appear as horizontal dashed lines when within the visible range.

**QuickChart PNGs (email fallback)**
- Encoded as **URL query parameters** (`GET /chart?c={config}`), no POST requests or authentication needed.
- Chart.js configuration format (well-documented, flexible).
- URL length constrained by the 30-data-point cap to stay within browser and email client limits (~8KB URL).
- Forecast charts use dashed lines (`borderDash: [8, 4]` for LR, `[4, 4]` for WMA).

### Implications

- SVG charts have **no external dependency** - they render even offline.
- If QuickChart.io is down, email chart images appear broken. Report text content is unaffected.
- Some corporate networks or email security filters may block external image URLs in emails.
- QuickChart URLs are deterministic - the same data produces the same URL, enabling browser caching.

---

## 📧 Email Client Compatibility

### Limitation

HTML reports rely on **inline styles** for formatting. Some email clients strip or modify certain CSS properties, leading to visual differences. The `<details>` HTML element (used for collapsible sections) is **not supported** in email clients.

### Why

Email HTML rendering is notoriously inconsistent across clients. Outlook uses the Word rendering engine, Gmail strips `<style>` tags and class attributes, Apple Mail has its own quirks. The lowest common denominator for cross-client compatibility is inline CSS applied directly to each element.

### Approach

- **All styles are inline**: Every HTML element in the report carries its own `style` attribute. No external stylesheets, no `<style>` blocks, no CSS classes.
- **Explicit light background**: The `<body>` has an explicit `background-color: #fff` to ensure consistent rendering regardless of the email client's own background. Dark mode is not supported in email reports.
- **No `<details>` in HTML reports**: Collapsible sections (`<details>`/`<summary>`) are used in Markdown reports (for GitHub rendering) but excluded from HTML reports, since email clients do not support them. Per-repo stargazer lists and forecast tables are displayed flat in HTML.
- **System fonts**: The font stack uses `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif` - safe system fonts that render consistently everywhere.
- **`max-width: 600px`**: The report container is capped at 600px, the standard width for email layouts.
- **No external CSS frameworks**: No Bootstrap, Tailwind, or similar. Every pixel of styling is self-contained in the HTML string.
- **Charts as QuickChart PNGs**: Email reports use QuickChart PNG images instead of SVGs because email clients strip `<style>` blocks, which would break SVG animations and dark mode theming.

### What may vary across clients

| Feature | Gmail | Outlook | Apple Mail |
|:--------|:------|:--------|:-----------|
| Inline styles | Supported | Mostly supported | Supported |
| External images (charts) | Blocked by default, click to load | Blocked by default | Loaded automatically |
| `border-radius` (avatar circles) | Supported | Ignored (renders square) | Supported |
| `flex` layout (stargazer rows) | Supported | Partially supported | Supported |

---

## 📅 Snapshot Granularity

### Limitation

Star data is captured **once per workflow run**. If the action runs daily, there is one data point per day. Intra-day changes (e.g., a repo gaining and then losing 5 stars within the same day) are invisible.

> **Note:** This per-run snapshot granularity applies to the report delta tables and notification thresholds. Charts no longer plot one point per run - when charts are enabled (the default), the action fetches each repo's stargazers and reconstructs the real historical star curve from their `starred_at` dates, so the chart timeline reflects true history regardless of how often the action runs.

### Why

The action is designed to run as a GitHub Actions workflow, which is triggered by a cron schedule (typically daily or weekly) or manually. Each run produces exactly one snapshot containing the current star count for every tracked repository. There is no continuous monitoring or webhook-based approach.

### Approach

- **One snapshot per run**: The `trackStars` function reads the current state of all repos, compares against the last stored snapshot, and appends a new entry to the history.
- **History rotation**: Old snapshots are pruned via `maxHistory` (default: 52, i.e., ~1 year of weekly runs). This prevents unbounded growth of `stars-data.json`.
- **Timestamp precision**: Each snapshot is timestamped with `new Date().toISOString()`, providing millisecond precision for the moment the run occurred.

### Increasing granularity

This applies only to the report delta tables and notification thresholds, not to charts - chart resolution comes from the reconstructed real star history, so running more often does not add chart points. If finer delta/notification granularity is needed, increase the workflow schedule frequency:

```yaml
on:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours
```

Keep in mind that more frequent runs consume more API calls and produce more snapshots. Adjust `max-history` accordingly to avoid storing excessive data.

---

## 🔒 Stargazer Data Privacy

### Limitation

When `track-stargazers` is enabled, **usernames and avatar URLs** of people who starred your repos are stored in `stargazers.json` on the data branch. This data is publicly visible if the repository is public.

### Why

To compute the diff between runs (who is new since last time), the action needs to persist the previous list of stargazer logins. The diff is login-based: `current_logins - previous_logins = new_stargazers`.

### Approach

- **Minimal data stored**: `stargazers.json` contains only `{ "owner/repo": ["login1", "login2"] }` - login names, no avatars, no dates. Full user details (avatar, profile URL, starred_at) are only shown in reports, not persisted.
- **Data branch isolation**: Stargazer data is stored on a separate `star-tracker-data` branch, not on `main`. This keeps the main branch clean.
- **Opt-in only**: `track-stargazers` defaults to `false`. Users must explicitly enable it.
- **No new exposure for you**: the action stores the same information you can already see as the repository's admin. Note that since GitHub's [2026 API restrictions](https://github.blog/changelog/2026-06-30-upcoming-access-restrictions-to-public-api-endpoints-and-ui-views/), stargazer lists are no longer publicly accessible (only admins and collaborators can list them), so publishing `stargazers.json` on a public data branch does re-expose those login names. Keep the data branch in a private repository or leave `track-stargazers` disabled if that is a concern.

---

## 📚 Additional Resources

- **[Configuration](Configuration)** - All available options and settings
- **[API Reference](API-Reference)** - Complete inputs and outputs documentation
- **[Troubleshooting](Troubleshooting)** - Common issues and solutions
- **[Star Trend Charts](Star-Trend-Charts)** - Chart visualization setup
- **[Email Notifications](Email-Notifications)** - Email configuration guide
