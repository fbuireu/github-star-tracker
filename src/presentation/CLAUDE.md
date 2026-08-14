# src/presentation

Turns already-computed domain data into the artifacts the action publishes: markdown and HTML reports, CSV,
SVG line charts, an SVG badge, and QuickChart image URLs for email. Every function is synchronous and
side-effect free — it returns a string or `null`, never writes a file, never calls the network, never touches
`@actions/core`. Deciding *what* to render is the caller's job; deciding *how many stars a repo gained* is
the domain's.

## The chart quartet

There are four chart modules rather than one library call for two reasons: the SVG is emitted by hand so it
stays self-contained and theme-aware ([ADR 0006](../../docs/adr/0006-hand-rendered-svg-charts.md)), and the
email path goes through QuickChart because mail clients will not display inline SVG
([ADR 0010](../../docs/adr/0010-quickchart-renders-the-email-charts.md)).

- **`chart-spec.ts` decides what a Chart is**, and names which one is wanted. A `ChartRequest` is a
  discriminated union over the four `ChartKind`s CONTEXT.md lists — star history, per repo, comparison,
  forecast — carrying only that kind's own inputs (`repoFullName`, `repoNames`, `forecastData`, the
  star-history Milestone and trend flags) plus an optional `title`. `buildChartSpec({ request, locale,
  palette, axisLabels, range, maxPoints })` maps one onto a `ChartSpec` — labels, an ordered list of series
  with a resolved colour, the title, whether to show a legend, and the Milestone thresholds — or `null` when
  there is too little history. The four spec builders behind it are module-private; both renderers read the
  spec and neither re-derives it
  ([ADR 0014](../../docs/adr/0014-charts-are-built-as-a-spec-and-rendered-by-adapters.md)).
- **`charts.ts` orchestrates.** `buildChartFiles` reads `Config`, builds the shared style object once, binds
  it into a local `renderChart(request)`, and returns `{ filename, svg }[]`. It renders nothing itself and
  returns `[]` when charts are off or the history has fewer than 2 snapshots.
- **`svg-chart.ts` draws.** `renderSvgChart({ request, locale, ...style })` is its only export: it builds the
  spec with year-thinned axis labels and maps the series onto `SvgDataset`s. One private `renderSvg` does all
  the drawing.
- **`chart.ts` is the email path.** `chartImageUrl({ request, locale, ...style })` is its only chart export,
  producing `quickchart.io` URLs consumed by `html.ts`. It is a parallel, lower-fidelity rendering of the
  *same* spec — never an input to the SVG files.

**Default titles live in `buildChartSpec`, not in the adapters**, so the SVG and the email chart of the same
kind are always named the same thing and both are localized. Only the per-repo default is composed rather
than translated (`` `${repoFullName} Star History` ``).

`SeriesDash` and `SeriesWeight` are emphasis, not pixels: each adapter maps them through its own table
(`DASH_PATTERNS` / `POINT_SIZES` in `chart.ts`, a `dashed` boolean in `svg-chart.ts`). Keep dash arrays and
point radii out of the spec.

**`AxisLabels` is an adapter constant, not a per-call choice**: `svg-chart.ts` always asks for `THINNED` and
`chart.ts` always for `DATES`. The forecast spec overrides whatever it is given with `DATES` — its params
type `Omit`s the field so the caller cannot believe otherwise. `maxPoints` is likewise passed only by
`renderSvgChart`, which is what fixes email charts at 30 points.

The report modules are one per format: `markdown.ts`, `html.ts`, `csv.ts`, `badge.ts`, over a shared
`report-model.ts`; with `escaping.ts` for every dialect's escaper, `shared.ts` for cross-renderer helpers and
`constants.ts` / `types.ts` for palettes, geometry and the `ColorPalette` contract.

## The report model

`buildReportModel` (`src/presentation/report-model.ts`) decides **which sections a Report has and what is in
them**, once. `markdown.ts` and `html.ts` are dialects over it and own only markup. `report-model.test.ts` is
its spec — assert a section rule there, not through one dialect's markup.

- The model resolves `hasChartHistory`, `chartHistory` (the history *only* when it is plottable, so the
  dialects narrow on `!== null`), `topRepos`, `isFirstRun`, the Velocity figures and the three-way Stargazer
  outcome. A dialect that recomputes any of these has reintroduced the drift this module exists to stop.
- **`topRepos` is not derived here.** It calls `topRepositories` in `@domain/comparison`, the same function
  `@application/tracker` uses for the charts and the Forecast, so the Report and the Charts cannot rank the
  Tracked Set differently. `prepareReportData`'s `sorted` is that module's `rankByStars`.
- `StargazerOutcome` is `NEW` or `NONE`; the section is omitted entirely when `stargazers` is `null`, which
  is what "`track-stargazers` is off" looks like.
- `VelocitySection.projection` is already `null`-or-present, so neither dialect repeats the
  `nextMilestone !== null && daysToNextMilestone !== null` pair.
- `buildForecastTable` returns headers and rows; each dialect wraps them in its own table markup. Headers are
  always `FORECAST_WEEKS` long regardless of how many points a forecast carries.
- **The two dialects take different params.** `generateMarkdownReport` takes `ReportParams`;
  `generateHtmlReport` takes `GenerateHtmlReportParams`, which adds `EmailChartStyle`. Markdown emits
  relative `./charts/*.svg` links and has no use for chart styling, and the types now say so.
- **`EmailChartStyle`'s fields split two ways at the call site**, and `html.ts` is the only place that knows
  which is which: `milestones`, `customMilestones` and `trendLine` become part of the star-history
  `ChartRequest`; `smoothing`, `curve`, `showPoints`, `beginAtZero` and `range` are the adapter style and
  reach `chartImageUrl` **undefaulted**, because `chartImageUrl` owns those defaults. Only `theme` is
  defaulted in `html.ts`, because the document itself needs a resolved palette and a `color-scheme`. Do not
  reintroduce the other defaults here — the two sets drifting apart is the failure mode.

## Invariants & rules

- **Purity.** The only clock reads are `new Date().toISOString()` for the report date and footer. The one
  piece of date arithmetic is the range cutoff, which is **relative to the newest snapshot, not to
  `Date.now()`**. If that timestamp is unparseable the series is returned unfiltered.
- **`< 2` snapshots = `null`.** Every generator returns `null` rather than an empty chart. Comparison charts
  also return `null` for an empty repo list.
- **Windowing order is range-then-downsample.** `selectChartSnapshots` filters by `range` first, then picks
  `maxPoints` **evenly spaced** entries across the whole window, always keeping the first and the last. It
  must not become a tail slice: with a tail slice, any window larger than `maxPoints` collapses to the same
  recent points and `chart-range` silently stops having any effect. `maxPoints <= 0` and an
  already-small window both return a **copy**, never the caller's array.
- **`chart.ts` never receives `maxPoints`**, so email charts are fixed at 30 points regardless of
  `chart-max-points`. Those 30 are spread across the selected range, so an email chart covers the same span
  as its SVG counterpart at lower resolution.
- **Velocity reads `velocityHistory`, never `history`.** `history` is the chart history, whose consecutive
  snapshots are buckets spaced by `chart-max-points`. Passing only `history` renders no velocity section
  at all.
- **The SVG canvas is fixed**: `viewBox="0 0 800 400"`, margins `{top:50,right:30,bottom:50,left:60}`,
  plot area 710x300, baseline y=350. Tests assert these literals.
- **Y domain**: `padding = max(1, ceil((maxData - minData) * 0.1))`, floor is `beginAtZero ? 0 : max(0, minData - padding)`
  — never negative. Ticks are de-duplicated after rounding, so a small range yields fewer than 5 ticks rather
  than repeating one.
- **Only `catmull-rom` is clamped** to the plot box, because it is the only overshooting curve; the other
  three are non-overshooting by construction.
- **`null` splits a series into segments**, each drawn as its own path/fill/circle group. Only a segment
  starting at index 0 that is filled and not dashed is anchored to the baseline. Dashed datasets get no fill,
  no circles and no draw animation.
- **Theme rendering is asymmetric.** `auto` emits light values *plus* a `prefers-color-scheme: dark` override
  block; `light` and `dark` emit exactly one palette and **no** media query.
- **Milestone visibility uses raw data extremes** (`> minData && < maxData`), not the padded axis bounds — a
  milestone equal to the max is never drawn.
- **Empty x-axis labels are ticks that must not render.** `buildAxisLabels` returns `''` for suppressed
  positions; `renderSvg` filters those out, thins the rest to at most 10, and always keeps the last non-empty
  index.
- **`markdown.ts` section order is fixed**: header, comparison note, charts, repo table, new, removed,
  summary, stargazers, forecast, velocity, footer. Velocity nests as an `h3` inside the forecast section when
  a forecast exists, otherwise it is a top-level `h2`; both levels are asserted.
- **The HTML report must contain no `<details>`** — email clients do not support it. Pinned by `html.test.ts`.
- **Markdown chart links are relative** (`./charts/<file>`), matching the directory
  `@infrastructure/persistence` writes into.

## Escaping & injection safety

**Every escaper in this layer lives in `src/presentation/escaping.ts`,** behind one function. A renderer
binds the dialect it needs once at module load — `const escapeHtml = escapeFor(EscapeDialect.MARKUP);` — and
uses that everywhere. Do not write a second escape map.

| Dialect | Escapes | Used by |
| --- | --- | --- |
| `MARKUP` | `& < > " '` | `html.ts` throughout; `markdown.ts` for values landing inside its raw HTML |
| `XML` | `& < > "` — not `'`, because every attribute uses double quotes | `svg-chart.ts`, `badge.ts` |
| `MARKDOWN` | `& < >` plus `[ ] ( ) \`` | `markdown.ts` for link text, link targets and headings |
| `CSV` | delimiter, quote, newline, **and** the `= + - @` formula prefix | `csv.ts` |

- `svg-chart.ts` wraps **exactly three** things: the chart title, x-axis labels and legend labels. If you
  interpolate user text into a new attribute, wrap it.
- `badge.ts` measures the **raw** label and value to compute its widths and escapes only at interpolation.
  Escaping first would let a single `&` widen the badge by four characters.
- `markdown.ts` escapes every GitHub-sourced string: repo names, logins, avatar and profile URLs. It emits
  raw HTML (`<details>`, `<img>`) around them, so a login is markup-escaped inside a tag and
  markdown-escaped inside `[...](...)`. It used to interpolate raw — that is the divergence this table
  exists to prevent recurring.
- `chart.ts` needs no escaper — the whole config goes through `JSON.stringify` + `encodeURIComponent`.

## Gotchas

- `COLORS` is an alias for `LIGHT_PALETTE` and `badge.ts` uses it unconditionally, so **the badge is always
  light-themed** and ignores `chart-theme` — though its number *is* localized.
- In `ColorPalette`, `white` is the *background* colour: it is `#0d1117` in the dark palette, not white.
- **`theme` means different things to the two chart paths.** `svg-chart.ts` can honour `auto` because CSS
  travels with the SVG; `chart.ts` cannot, because `buildChartUrl` bakes `palette.white` into the QuickChart
  `backgroundColor` query parameter and a PNG has one background forever. `auto` there resolves to
  `LIGHT_PALETTE` (`resolvePalette` in `shared.ts`), so a reader in dark mode gets a white slab whose
  surroundings the mail client has darkened. `email-theme` exists so that path can be forced independently of
  `chart-theme`; `html.ts` receives it as its `theme`.
- `perRepoChartFile` replaces only the **first** `/`, so a nested-looking name would keep later slashes and
  produce an invalid filename.
- `repoStarSeries` returns `0`, not `null`, for a repo missing from a snapshot, so a per-repo chart for an
  unknown repo renders a flat zero line rather than returning `null`. The `chart.test.ts` case named
  "renders a flat zero series for a repository absent from every snapshot" asserts exactly that.
- `charts.ts` now has a colocated `charts.test.ts` covering the `Config`-to-style projection, the per-repo
  reconstruction fallback and which files a run produces. `tracker.test.ts` still runs it unmocked, so a
  break there shows up twice.
- **`chart-spec.test.ts` is where a Chart's *content* is asserted** — the `< 2` guard, default titles, the
  comparison cap and short-label heuristic, Milestone resolution, the Forecast series layout, windowing.
  `svg-chart.test.ts` and `chart.test.ts` are for *appearance*; adding a content assertion there means the
  rule is now pinned twice, in the dialect that happened to be open.
- **`escapeXml`'s pattern is built from the dialect's map** in `escaping.ts` and used with `replaceAll`,
  which resets `lastIndex`. Safe as written; do not switch it to `.exec`/`.test`.
- `chart.ts` maps `rounded-step` to Chart.js `monotone` and both `catmull-rom` and `cubic-bezier` to a plain
  tension spline — email charts are deliberately an approximation.

Every `chart-*` option is documented for users in
[`docs/wiki/Configuration.md`](../../docs/wiki/Configuration.md) and shown as a rendered before/after in
[`examples/README.md`](../../examples/README.md) — all of them except `chart-trend-line` and
`chart-animation`, which have no sample SVG. `charts.ts` is where an input becomes a style parameter, and
`svg-chart.ts` is where that parameter becomes geometry.
