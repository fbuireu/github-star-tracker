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
- Fine-grained: `Repository access → All repositories` with `Metadata: Read-only` **and `Contents: Read and
  write`**. The action pushes the data branch with this same token, so a metadata-only token fails at the push

See **[Personal Access Token (PAT)](<Personal-Access-Token-(PAT)>)** for a step-by-step setup guide.

---

## ⚡ Stargazer API Rate Limits

### Limitation

When `track-stargazers` is enabled, fetching stargazers is **API-intensive**. Each repository requires `ceil(stars / 100)` API calls. A repo with 1,500 stars needs 15 API calls just for stargazers. With many high-star repos, the authenticated rate limit of **5,000 requests/hour** can be approached or exceeded.

### Why

The GitHub Stargazers API (`GET /repos/{owner}/{repo}/stargazers`) paginates at 100 results per page. There is no endpoint to fetch only "recent" or "new" stargazers - the action must retrieve the full list and diff against the previously stored map to determine who's new.

Additionally, stargazers are fetched **sequentially per repo** (not in parallel) to be rate-limit friendly and avoid triggering GitHub's secondary abuse limits.

### Approach

- **Fetched by default for charts**: `track-stargazers` defaults to `false`, but stargazers are now also fetched whenever charts are enabled (`include-charts: true`, the default) in order to build the Reconstructed History. So the stargazer API cost in this table applies to any run with charts on, not only when `track-stargazers` is enabled. To avoid this cost entirely, set `include-charts: false`. Use `smart-sampling` (with `smart-sampling-threshold` / `smart-sampling-pages`) to cap requests for high-star repos.
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

### Limitation

GitHub's stargazers API only lists up to ~40,000 stargazers per repository, oldest first. The Reconstructed History behind every chart is built from those listed stargazers' `starred_at` dates, so for a repository above ~40,000 stars only its oldest ~40,000 stars are reachable and their dates stop well before today.

### Why

The listing is paginated at 100 per page and GitHub stops answering past page 400. There is no way to page from the newest end, so the unreachable stretch is always the recent one.

### Approach

The reachable stretch is drawn accurately, scaled to the reachable count, and the unreachable recent tail is bridged with a straight ramp up to the repository's true current total. The final point always equals the true star count, so the chart no longer flattens out at the cutoff date. Repositories within the 40,000 window are unaffected.

That ramp is an admitted approximation: its shape carries no information, only its endpoints do. It is drawn deliberately rather than left flat ([ADR 0007](https://github.com/fbuireu/github-star-tracker/blob/main/docs/adr/0007-bridge-unreachable-history-with-a-ramp.md)).

A repository above the cap is also left out of **new-stargazer detection**, and the run log says so. The reachable window is the oldest 40,000 stargazers, so it never moves as new stars arrive: diffing it against the previous run would report zero new stargazers every time and would be reporting an artefact of the cap rather than a fact about the repository. Its stored entry is kept rather than overwritten, on the same reasoning as [ADR 0012](https://github.com/fbuireu/github-star-tracker/blob/main/docs/adr/0012-unreadable-stargazer-lists-keep-their-previous-logins.md). Charts are unaffected: the ramp above still runs.

Pair high-star repositories with `smart-sampling` to keep within rate limits. That costs those repositories their new-stargazer list too, for a separate reason: [ADR 0008](https://github.com/fbuireu/github-star-tracker/blob/main/docs/adr/0008-sampled-repositories-are-excluded-from-stargazer-diffing.md).

---

## 🔐 Stargazers API Access Restriction (2026)

### Limitation

GitHub [restricted](https://github.blog/changelog/2026-06-30-upcoming-access-restrictions-to-public-api-endpoints-and-ui-views/) the stargazers list endpoint (`GET /repos/{owner}/{repo}/stargazers`) to repository **admins and collaborators**. Anyone else receives empty responses or `403` errors, which is why third-party tools that chart stars for repositories they don't own (Star History, Starchart.cc, etc.) stop working.

The restriction is evaluated on the **user's role on the repository, not on token scopes**: the endpoint accepts any scope (`x-accepted-oauth-scopes` is empty), so adding scopes to a classic token neither helps nor hurts. A classic PAT carries its owner's full role, including **implicit admin through organization ownership**, which has been verified to keep stargazers access. In practice the affected cases are:

- **Organization repositories where you are a member with read access only** (neither admin nor direct collaborator).
- **Fine-grained PATs without an explicit grant on the repository's organization.** Fine-grained tokens are granted per resource owner: a token that can *list* a public repository (and therefore track its star count) may still lack the `Metadata (read)` grant that the stargazers endpoint checks.

For those repos the stargazers list comes back **`404`, `403` or empty (`200 []`)**. The empty case is silent at the API level, so the action logs a warning naming each starred repository whose list came back empty. Charts for affected repos fall back to the Stored History instead of the Reconstructed History, and stargazer tracking degrades there. Star counts and delta reports keep working everywhere, since `stargazers_count` is not part of the restriction.

> [!NOTE]
> **Rollout instability (July 2026).** During the restriction's initial rollout the endpoint was observed over-restricting intermittently, returning `404` or empty lists **even to repository admins** ([community report](https://github.com/orgs/community/discussions/201178)). The same window also produced transient `5xx` errors on deep pagination of very large repos, which is a different fault with the same symptom. The run log now always carries the HTTP status and transient server errors are retried, so a real restriction (`403`/`404`) and a passing failure are easy to tell apart. If a chart degraded during an episode like that, re-run once access behaves: the history is reconstructed from scratch on every run.

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

When charts are enabled (the default), forecasts extrapolate from the Reconstructed History built from stargazers' `starred_at` dates; otherwise they use the Stored History. In either case the action has no external signals (social media mentions, download counts, contributor activity) that could improve predictions. Adding external data sources would introduce API dependencies and configuration complexity disproportionate to the value.

### Approach

Two complementary methods are provided, each with different strengths:

**Linear Regression** fits a straight line through the whole observed series using least squares. It is resilient to noise and captures long-term trends, but it reacts slowly to recent changes.

```
predicted(week) = lastValue + slope * week * 7
```

The fitted line supplies the *slope* only. Both methods anchor the projection on the **last observed
value**, never on the fitted one, so the first predicted point continues from where the curve actually is.

**Weighted Moving Average** computes deltas between consecutive snapshots and weights recent deltas higher. It is more responsive to recent acceleration or deceleration, but more sensitive to short-term noise.

```
predicted(week) = lastValue + weightedDailyRate * week * 7
```

The weighted rate is **per day**, so the week offset is multiplied by seven like the regression slope.

Both methods clamp predictions to non-negative integers via `Math.max(0, Math.round(...))` to avoid nonsensical outputs (e.g., -3 stars).

Forecasts require a minimum of **3 points** in the series they are fitted to (`MIN_SNAPSHOTS_FOR_FORECAST = 3`) and project **4 weeks ahead** (`FORECAST_WEEKS = 4`). That series is the Reconstructed History when charts are on, and it already carries around 30 points on the very first run. The three-point floor therefore bites only when no reconstruction is available, meaning `include-charts` is off or no `starred_at` date was reachable, and the Stored History is all there is. The thresholds are intentionally conservative: below them any extrapolation would be unreliable.

### Interpretation guide

| Scenario | LR says | WMA says | Interpretation |
|:---------|:--------|:---------|:---------------|
| Steady growth | +10/week | +10/week | Consistent trend, both agree |
| Recent acceleration | +8/week | +15/week | WMA detects recent surge, LR is more conservative |
| Recent slowdown | +12/week | +5/week | WMA detects deceleration, LR still reflects historical average |
| Stagnation | +0/week | +0/week | No growth trend detected |

---

## 🌗 Dark / Light Mode

### Limitation

Under the default `chart-theme: auto`, a chart's **chrome** follows the reader's colour scheme but its **data series do not**. A dark-mode reader gets dark chrome around light-palette lines.

### Why

The chrome is styled by CSS carried inside the SVG, which a `prefers-color-scheme` media query can override at view time. Series strokes are inline attributes resolved once at render time, when there is no reader and therefore no scheme to consult, so `auto` resolves them from the light palette.

### Approach

Set [`chart-theme`](Configuration#chart-theme) to `light` or `dark` explicitly. That drops the media query, picks the palette before rendering and recolours the series along with the chrome. What is not available is a single file that recolours its data per reader.

The badge ([`stars-badge.svg`](https://github.com/fbuireu/github-star-tracker/blob/main/examples/stars-badge.svg)) has no theming at all, in either direction: it is always the light palette. Its fixed dark label with an accent-coloured value is legible on both backgrounds, which is why it was left alone.

How the two palettes differ, and where the media query reaches at all, is in
**[Star Trend Charts](Star-Trend-Charts#dark--light-mode)**.

---

## 📊 Chart Rendering

### Limitation

The action produces two types of charts:

1. **Animated SVG charts** - generated locally, committed to the data branch. Support dark/light mode via CSS media queries. No external dependencies.
2. **QuickChart PNG charts** - generated via [QuickChart.io](https://quickchart.io), used in HTML email reports. Static images that follow [`email-theme`](Configuration#email-theme) rather than the reader's own colour scheme, and dependent on an external service.

There is no interactive zooming, panning, tooltips, or click-to-drill-down in either format.

### Why

GitHub Markdown and HTML emails do not support JavaScript. This rules out client-side chart libraries (Chart.js, D3, Highcharts, etc.) in the report output.

SVG charts are the primary output: they are self-contained, support CSS animations and dark mode, and require no external service. QuickChart PNGs are used as a fallback in HTML email reports because email clients strip `<style>` blocks, making SVG theming and animations non-functional.

### Implications

- SVG charts have **no external dependency** - they render even offline.
- An email chart is a URL carrying its whole configuration, so it is capped at 30 points and 10 comparison
  series to stay inside browser and mail-client URL limits. Those caps are not configurable.
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
- **Explicit background**: The `<body>` carries an explicit `background-color` so it renders consistently whatever the client's own background is. It follows [`email-theme`](Configuration#email-theme), which defaults to `auto` (inherit `chart-theme`, resolving to light); set it to `dark` for a dark digest, charts included. What email *cannot* do is follow the reader's system theme, because the media query is stripped and the chart images are PNGs with the background baked in.
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

**Intra-day movement is invisible to the delta tables and the notification threshold.** A repository that gains five stars and loses them again between two runs looks unchanged, because the tracker only ever sees the totals at the moments it happens to run.

### Why

There is no continuous monitoring and no webhook: the action is a scheduled workflow, and one run observes one instant.

### Approach

Run more often if you need finer delta and notification granularity, and raise `max-history` to match so the extra snapshots are not immediately pruned:

```yaml
on:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours
```

This does not affect the **charts**, whose resolution comes from the Reconstructed History rather than from how often the tracker ran. Running more often adds no chart detail, only API calls. How a snapshot is taken, stored and rotated is in **[Data Management](Data-Management)**.

---

## 🔒 Stargazer Data Privacy

### Limitation

When `track-stargazers` is enabled, the **usernames** of people who starred your repos are stored in `stargazers.json` on the data branch. This data is publicly visible if the repository is public.

### Why

To compute the diff between runs (who is new since last time), the action needs to persist the previous list of stargazer logins. The diff is login-based: `current_logins - previous_logins = new_stargazers`.

### Approach

- **Minimal data stored**: `stargazers.json` contains only `{ "owner/repo": ["login1", "login2"] }` - login names, no avatars, no dates. Full user details (avatar, profile URL, starred_at) are only shown in reports, not persisted.
- **Data branch isolation**: Stargazer data is stored on a separate `star-tracker-data` branch, not on `main`. This keeps the main branch clean.
- **Opt-in only**: `track-stargazers` defaults to `false`. Users must explicitly enable it.
- **No new exposure for you**: the action stores the same information you can already see as the repository's admin. Note that since GitHub's [2026 API restrictions](https://github.blog/changelog/2026-06-30-upcoming-access-restrictions-to-public-api-endpoints-and-ui-views/), stargazer lists are no longer publicly accessible (only admins and collaborators can list them), so publishing `stargazers.json` on a public data branch does re-expose those login names. Keep the data branch in a private repository or leave `track-stargazers` disabled if that is a concern.
- **Entries are never pruned**: once a repository has an entry, it keeps it even after the repository leaves
  the tracked set, whether through a `min-stars` boundary, an edited filter or a spell archived. That is deliberate: a
  repository that drops out for one run and returns would otherwise have every existing stargazer reported as
  new. It does mean untracking a repository does not withdraw its published logins; removing them is a manual
  edit of `stargazers.json` on the data branch.

---

## 📚 Additional Resources

- **[Configuration](Configuration)** - All available options and settings
- **[API Reference](API-Reference)** - Complete inputs and outputs documentation
- **[Troubleshooting](Troubleshooting)** - Common issues and solutions
- **[Star Trend Charts](Star-Trend-Charts)** - Chart visualization setup
- **[Email Notifications](Email-Notifications)** - Email configuration guide
