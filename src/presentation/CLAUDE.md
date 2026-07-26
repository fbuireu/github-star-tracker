# src/presentation — pure rendering: data in, string out

This layer turns already-computed domain data into the artifacts the action publishes: Markdown and HTML reports, CSV, SVG line charts, an SVG badge, and QuickChart image URLs for email. Every function here is synchronous and side-effect free — it returns a string (or `null`), never writes a file, never calls the network, never touches `@actions/core`. Deciding *what* to render is the caller's job (`@application/tracker`); deciding *how many stars a repo gained* is the domain's. This layer only formats.

Two decisions explain why there are two chart renderers in here rather than one library call: the SVG is emitted by hand so it stays self-contained and theme-aware ([ADR 0006](../../docs/adr/0006-hand-rendered-svg-charts.md)), and the email path goes through QuickChart because mail clients will not display inline SVG ([ADR 0010](../../docs/adr/0010-quickchart-renders-the-email-charts.md)).

## Files

| File | Responsibility |
| --- | --- |
| `types.ts` | `ColorPalette` — the single colour contract every renderer reads from. |
| `constants.ts` | Palettes, chart geometry, badge metrics, chart filenames, section icons. The milestone ladder lives in `@domain/constants` (`STAR_MILESTONES`). |
| `shared.ts` | Cross-renderer helpers: palette/theme resolution, snapshot windowing + downsampling, moving average, report data prep, forecast series padding. |
| `markdown.ts` | `README.md`-style report: headings, tables, `<details>` blocks, relative `./charts/*.svg` image links. |
| `html.ts` | Self-contained inline-styled HTML document for the email notification; embeds QuickChart `<img>` URLs. |
| `csv.ts` | Flat `repository,owner,name,stars,previous,delta,status` export. |
| `badge.ts` | Shields-style "Total Stars" SVG badge. |
| `svg-chart.ts` | The SVG renderer: path/curve maths, axes, grid, milestones, legend, CSS animation. Builds every `.svg` chart. |
| `charts.ts` | Orchestrator: maps `Config` to chart style, decides **which** chart files exist and their filenames. |
| `chart.ts` | QuickChart (`quickchart.io`) URL builder — Chart.js JSON config encoded into an image URL. Emits **no** SVG. |

### The chart trio, plainly

- **`charts.ts` is the orchestrator / file-set decider.** `buildChartFiles` reads `Config`, builds the shared style object once, and returns `{ filename, svg }[]`: `star-history.svg`, one `<owner>-<name>.svg` per top repo, `comparison.svg`, `forecast.svg`. It renders nothing itself.
- **`svg-chart.ts` builds the SVG primitives.** One private `renderSvg` does all drawing; the four exported generators only shape datasets/labels and delegate to it.
- **`chart.ts` is the email path.** It produces `https://quickchart.io/chart?...` URLs consumed by `html.ts`. It is a parallel, lower-fidelity rendering of the same options through Chart.js semantics — never an input to the SVG files.

## Public API

### `charts.ts` (consumed by `@application/tracker`)
- `buildChartFiles({ config, history, fallbackHistory, forecastData, topRepoNames, repoTotals, repoStargazers, now }: BuildChartFilesParams): ChartFile[]` — the only entry point for producing chart files. Returns `[]` when `config.includeCharts` is false or `history.snapshots.length < 2`.
- `resolveChartHistory({ candidate, fallback }: ResolveChartHistoryParams): History` — picks `candidate` when it has >= 2 snapshots, otherwise `fallback`. Used both here and by the tracker before calling `buildChartFiles`.

### `markdown.ts` / `html.ts` (consumed by `@application/tracker`)
- `generateMarkdownReport(params: GenerateReportParams): string`
- `generateHtmlReport(params: GenerateReportParams): string`

Both take the same `GenerateReportParams` object; the tracker builds it once and passes it to both.

### `csv.ts`, `badge.ts` (consumed by `@application/tracker`)
- `generateCsvReport({ repos }: ComparisonResults): string`
- `generateBadge({ totalStars, locale }: GenerateBadgeParams): string` — the count is rendered in `locale`.
- `NEW_LINE = '\n'` — exported for the row separator; only `csv.test.ts` consumes it externally.

### `svg-chart.ts` (consumed by `charts.ts`; mocked wholesale in `tracker.test.ts`)
- `generateSvgChart({ history, title?, locale, lineColor?, maxPoints?, milestones?, customMilestones?, range?, trendLine?, ...style }: GenerateSvgChartParams): string | null`
- `generatePerRepoSvgChart({ history, repoFullName, title?, locale, lineColor?, maxPoints?, range?, ...style }): string | null`
- `generateComparisonSvgChart({ history, repoNames, title?, locale, maxPoints?, range?, ...style }): string | null`
- `generateForecastSvgChart({ history, forecastData, locale, title?, lineColor?, maxPoints?, range?, ...style }): string | null`

`...style` is `SvgChartStyle` (see below). All four return `null` rather than an empty chart.

### `chart.ts` (used only by `html.ts` inside this folder)
- `generateChartUrl(params: GenerateChartUrlParams): string | null`
- `generatePerRepoChartUrl(params: GeneratePerRepoChartUrlParams): string | null`
- `generateComparisonChartUrl(params: GenerateComparisonChartUrlParams): string | null`
- `generateForecastChartUrl(params: GenerateForecastChartUrlParams): string | null`
- `buildMilestoneAnnotations({ minStars, maxStars, palette?, thresholds? }): AnnotationPlugin | null` — exported for its test only.

### `shared.ts` (folder-internal; nothing outside `src/presentation` imports it)
- `resolvePalette(theme?: ChartTheme): ColorPalette`, `colorSchemeFor(theme: ChartTheme): string`
- `selectChartSnapshots<T extends { timestamp: string }>({ snapshots, range?, maxPoints? }): T[]`
- `movingAverageSeries({ values, window }): number[]`
- `prepareReportData({ results, previousTimestamp, locale }): ReportData`
- `escapeHtml(text: string): string` — escapes `& < > " '` for the HTML report.
- `perRepoChartFile(repoFullName: string): string`
- `buildForecastWeekHeaders(t: Translations): string[]`, `forecastMethodLabel({ method, t }): string`
- `buildForecastChartSeries({ historicalData, forecastData }): ForecastChartSeries`

## Key types

- `ColorPalette` (`types.ts`): `accent, positive, negative, neutral, link, text, white, shadow, muted, tableHeaderBg, tableHeaderBorder, cellBorder, gradientStart`. `white` is the *background* colour — it is `#0d1117` in `DARK_PALETTE`, not white.
- `GenerateReportParams` (`shared.ts`): `results, previousTimestamp, locale` (required) plus optional `history, velocityHistory, includeCharts, stargazerDiff, forecastData, topRepos, smoothing, curve, showPoints, milestones, beginAtZero, theme, customMilestones, range, trendLine, velocityMetrics`.
- `ReportData` (`shared.ts`): `activeRepos, newRepos, removedRepos, sorted, now, prev`.
- `SvgChartStyle` (`svg-chart.ts`): `lineWidth?, yAxisSide?, smoothing?, curve?, showPoints?, animate?, beginAtZero?, theme?` — the style slice `charts.ts` spreads into all four generators.
- `SvgDataset` (`svg-chart.ts`): `label, data: (number | null)[], color, dashed?, fill?`. `dashed` implies no fill, no points, no draw animation.
- `ForecastChartSeries` (`shared.ts`): `historical, linearRegression, weightedMovingAverage`, each `(number | null)[]`. Lengths only match when `forecasts` contains both methods — a missing method yields a series short by `forecastLength`, because `projectFromLast(undefined)` appends no predictions.

## Chart option surface

Config input (`action.yml`) → parameter → effect. Sample SVGs in `examples/` (see `examples/README.md`).

| Input | Param | Effect | Example SVG |
| --- | --- | --- | --- |
| `chart-curve` | `curve: ChartCurve` | `monotone` (default), `catmull-rom`, `cubic-bezier`, `rounded-step` | `curve-*.svg` |
| `chart-smoothing` | `smoothing` | `false` → straight `L` segments, curve ignored | `option-line-straight.svg` |
| `chart-show-points` | `showPoints` | `false` → no `<circle>` markers | `option-points-hidden.svg` |
| `chart-milestones` | `milestones` | dashed reference lines on the star-history chart only | `option-milestones-off.svg` |
| `chart-custom-milestones` | `customMilestones` | replaces `STAR_MILESTONES` (`@domain/constants`); empty array falls back to defaults | `option-custom-milestones.svg` |
| `chart-begin-at-zero` | `beginAtZero` | Y domain floor 0 instead of `min - padding` | `option-begin-at-zero.svg` |
| `chart-theme` | `theme: ChartTheme` | `auto` (light + media query), `light`, `dark` | `option-theme-dark.svg` |
| `chart-y-axis-side` | `yAxisSide: ChartAxisSide` | axis line x=60 / x=770, labels anchored `end` / `start` | `option-y-axis-right.svg` |
| `chart-line-color` | `lineColor` | primary series only (star-history, per-repo, forecast historical) | `option-line-color.svg` |
| `chart-line-width` | `lineWidth` | `stroke-width` on data paths, default `2.5` | `option-line-width.svg` |
| `chart-range` | `range: ChartRange` | `30d`/`90d`/`1y`/`all`, measured back from the newest snapshot | `option-range-*.svg` |
| `chart-max-points` | `maxPoints` | resolution: evenly spaced points across the range window; `0` = keep all | `option-maxpoints-*.svg` |
| `chart-trend-line` | `trendLine` | dashed 7-point moving average overlay on star-history | — |
| `chart-animation` | `animate` | `false` strips `@keyframes` and `stroke-dashoffset` | — |

## Invariants & rules

- **Purity.** No `fs`, no network, no `@actions/*`. The only clock reads are `new Date().toISOString()` for the report date and footer timestamp; the one piece of date arithmetic is the range cutoff in `shared.ts` (`lastTimestamp - days * MS_PER_DAY`), which is relative to the data, not the clock. `chart.ts` and `html.ts` *reference* `quickchart.io` URLs but never fetch them.
- **`< 2` snapshots = `null`.** Every generator in `svg-chart.ts` and `chart.ts` returns `null` below `MIN_SNAPSHOTS_FOR_CHART` (2). `generateComparisonSvgChart` / `generateComparisonChartUrl` also return `null` for an empty `repoNames`.
- **Windowing order is range-then-downsample.** `selectChartSnapshots` filters by `range` first, then picks
  `maxPoints` **evenly spaced** entries across the whole window, always keeping the first and the last.
  `maxPoints ?? 30`; `maxPoints <= 0` and a window already at or below the limit both return a **copy**
  (`[...windowed]`), never the caller's array; `maxPoints === 1` returns the newest entry.
  It must not be a tail slice: with a tail slice, any range window larger than `maxPoints` collapses to the
  same recent points and `chart-range` silently stops having any effect.
- **Range cutoff is relative to the newest snapshot**, not to `Date.now()`. If the newest timestamp is unparseable, the series is returned unfiltered; individual unparseable timestamps are dropped.
- **`chart.ts` never receives `maxPoints`** — it always calls `selectChartSnapshots` without it, so QuickChart/email charts are fixed at 30 points regardless of `chart-max-points`. Those 30 are now spread across the selected range rather than taken from the end, so an email chart covers the same span as its SVG counterpart at lower resolution. This matches the `action.yml` wording.
- **`prepareReportData` does not mutate.** `sorted` is `[...activeRepos]` sorted by `current` descending (ties keep input order — `Array.prototype.sort` is stable). `now` is UTC `YYYY-MM-DD` from `toISOString()`; `prev` is the date part of `previousTimestamp`, or the localized `t.report.firstRun` string.
- **`movingAverageSeries` is trailing and partial-window.** Index `i` averages `values[max(0, i-window+1)..i]`, `Math.round`ed. Output length always equals input length. `TREND_WINDOW` is 7.
- **Forecast series are anchored.** `buildForecastChartSeries` pads each projection with `padLength - 1` nulls, then repeats the last historical value, then the predictions — so forecast lines visually start on the last real point. `historical` is padded with trailing nulls to the same total length. `forecastLength` is read from `forecasts[0]`.
- **SVG canvas is fixed**: `viewBox="0 0 800 400"`, margins `{top:50,right:30,bottom:50,left:60}` → plot area 710x300, baseline y=350, top y=50. Tests assert these literals.
- **Y domain**: `padding = max(1, ceil((maxData - minData) * 0.1))`; floor is `beginAtZero ? 0 : max(0, minData - padding)` — never negative. Ticks come from `niceAxisSteps` (1/2/5/10 multipliers, 5 steps), de-duplicated after rounding — a small range whose nice step is fractional yields fewer than 5 ticks rather than repeating one. When `min === max` a single step is produced and `scaleY` centres the line vertically.
- **Curves must not leave the plot box.** Only `catmull-rom` is clamped (`clampMinY = margin.top`, `clampMaxY = 350`) because it is the only overshooting curve; `monotone`, `cubic-bezier` and `rounded-step` are non-overshooting by construction. `svg-chart.test.ts` pins `max(pathY) <= 350` and `min(pathY) >= 50` for spikes and valleys.
- **`null` splits a series into segments.** Each segment is drawn as its own path/fill/circle group. Only a segment with `startIndex === 0`, `fill !== false` and `dashed !== true` is anchored down to the baseline.
- **Dashed datasets get no fill, no circles and no draw animation**; their stroke dash is `8,4` and their legend marker dash is `4,2`.
- **Point animation delay** is `(globalPointIndex * 0.05 + 1.5).toFixed(2)` seconds — two decimals, asserted verbatim (`animation-delay: 1.50s`).
- **Theme rendering is asymmetric.** `auto` emits light values as defaults *plus* a `@media (prefers-color-scheme: dark)` override block; `light` and `dark` emit exactly one palette and **no** media query. `resolvePalette(AUTO)` is the light palette; `colorSchemeFor(AUTO)` is `'light dark'`.
- **Milestone visibility is strict and uses raw data extremes** (`> minData && < maxData`), not the padded axis bounds — a milestone equal to the max is never drawn. SVG labels use `formatCount` (compact, e.g. `1.5K`); QuickChart labels use `toLocaleString('en-US')` regardless of locale.
- **Velocity reads `velocityHistory`, never `history`.** `history` is the chart history, which is the
  reconstructed star curve whenever it has enough points, so its consecutive snapshots are chart buckets
  whose spacing follows `chart-max-points`. `velocityHistory` carries the stored per-run history, so
  `starsPerDay` stays "stars since the previous run / days elapsed". Passing only `history` renders no
  velocity section at all.
- **Comparison charts cap at 10 repos** (`CHART.maxComparison`) and cycle `CHART_COMPARISON_COLORS` modulo 10. Labels are short (`repo-a`) only when every capped repo shares one owner; otherwise full `owner/name`.
- **`lineColor` is single-series.** It overrides the accent on star-history, per-repo and the forecast *historical* line only. Comparison colours and the forecast trend colours (`positive`/`negative`) are never overridden.
- **X-axis labels: empty strings are ticks that must not render.** `buildAxisLabels` (`@domain/formatting`) returns `''` for suppressed positions on multi-year spans; `renderSvg` filters those out, thins the rest to at most 10 (`ceil(nonEmpty / 10)` step) and always keeps the last non-empty index.
- **`markdown.ts` section order is fixed**: header, comparison note, charts, repo table, new, removed, summary, stargazers, forecast, velocity, footer — joined with `\n`. The summary block is omitted when `summary.totalDelta === 0`; the "compared to" line is omitted on first run.
- **Velocity placement.** With `forecastData` present, velocity renders as an `h3`/`###` *inside* the forecast section, before the aggregate table; without it, as a top-level `h2`/`##`. Both `markdown.test.ts` and `html.test.ts` assert the heading level and the ordering.
- **The HTML report must contain no `<details>`** — email clients do not support it. Pinned by `html.test.ts`.
- **Markdown chart links are relative**: `./charts/<file>`, matching the `charts/` directory `@infrastructure/persistence/storage` writes into.
- **CSV escaping**: a field is quoted only when it contains `,`, `"` or `\n`; inner `"` is doubled. Numeric columns are never quoted; `previous === null` renders as an empty field. Rows preserve `results.repos` order (unsorted).

## Escaping & injection safety

- `svg-chart.ts` has its own escaper for SVG: `escapeXml` maps `& < > "` (not `'`, which is safe because every attribute uses double quotes). It is applied to **exactly three** things: the chart title, x-axis labels, and legend dataset labels. Colours, numbers and class names are generated internally and are not escaped — if you ever interpolate user text into a new attribute, wrap it in `escapeXml`.
- `chart.ts` needs no escaper: the whole Chart.js config goes through `JSON.stringify` + `encodeURIComponent`.
- `badge.ts` performs **no** escaping. Its only dynamic values are an i18n label and `formatCount(totalStars)`.
- `html.ts` escapes every GitHub-sourced string it interpolates — repo full names, stargazer logins, `avatarUrl` and `profileUrl` — through `escapeHtml` (`shared.ts`), which covers `& < > " '`. `markdown.ts` still interpolates raw; its output is markdown on a data branch, where the same values cannot form a tag, but treat any new field from a less-constrained source as requiring an escaper.
- `csv.ts` escapes CSV delimiters and neutralises spreadsheet formula injection: a field starting with `=`, `+`, `-` or `@` is prefixed with `'` and quoted.

## Dependencies

Allowed: `@config/types` (the `ChartCurve` / `ChartTheme` / `ChartRange` / `ChartAxisSide` const-objects and `Config` **type**), `@domain/*` (`formatting`, `snapshot`, `forecast`, `velocity`, `star-history`, `stargazers`, `time`, `constants`, `types`), `@i18n`, and relative imports inside this folder. No external npm packages at all.

Forbidden: `@actions/core` and `@actions/github` (config/infrastructure own input and I/O), `@infrastructure/*` (would make rendering do I/O), `@application/*` (wrong direction), `node:fs` / `node:path` / anything network. Keeping this list empty is what lets every renderer be tested by calling it with a plain object and asserting on the returned string.

## Gotchas

- `constants.ts` and `types.ts` are **coverage-excluded** (`vitest.config.ts`), so changing a constant produces no coverage signal — but many tests assert the resulting literals (`viewBox="0 0 800 400"`, `stroke-width="2.5"`, `x="778"`, `<line x1="770"`, `animation-delay: 1.55s`, `stroke-dasharray="6,6"`). Expect failures far from the edit.
- `COLORS` in `constants.ts` is an alias for `LIGHT_PALETTE`. `badge.ts` uses `COLORS` unconditionally, so the badge is always light-themed and ignores `chart-theme` — though its number *is* localized.
- `perRepoChartFile` (`shared.ts`) replaces only the **first** `/`: `user/repo` → `user-repo.svg`. Nested-looking names would keep later slashes and produce an invalid filename.
- `repoStarSeries` (`@domain/snapshot`) returns `0`, not `null`, for a repo missing from a snapshot — so a per-repo chart for an unknown repo renders a flat zero line rather than returning `null`. The `chart.test.ts` case named "returns null for non-existent repository" actually asserts `"data":[0,0,0]`.
- `buildForecastChartSeries` reads `forecastData.aggregate.forecasts[0]?.points.length ?? 0`, so an empty `forecasts` array yields a zero-length projection instead of throwing.
- `renderSvg` returns `null` when every dataset value is `null`; previously `Math.min(...[])` yielded `Infinity`/`-Infinity` and emitted a chart with NaN coordinates.
- `chart.ts` maps `rounded-step` to Chart.js `cubicInterpolationMode: 'monotone'`, and `catmull-rom` / `cubic-bezier` both to a plain `tension: 0.6` spline — email charts are deliberately a lower-fidelity approximation of the SVG curves.
- `html.ts` builds QuickChart URLs at render time; the images are fetched by the mail client, not by the action. A very long history therefore lands in a very long URL.
- `charts.ts` is the only logic-bearing file in the folder without a colocated test (`constants.ts` and `types.ts` have none either, but hold no logic); it is covered indirectly by `src/application/tracker.test.ts`, which mocks `@presentation/svg-chart` but not `@presentation/charts`.
- `escapeXml`'s regex `XML_ESCAPABLE_CHAR_PATTERN` is a module-level `/g` literal used with `replaceAll`, which resets `lastIndex` — safe as written, but do not switch it to `.exec`/`.test`.

## Testing

| Test file | Pins down |
| --- | --- |
| `shared.test.ts` | range windowing, `maxPoints` copy semantics, unparseable timestamps, `colorSchemeFor`, `prepareReportData` sorting/date formatting/first-run label. |
| `svg-chart.test.ts` | geometry, baseline anchoring, curve overshoot bounds per `ChartCurve`, theme blocks, animation on/off, milestone filtering, axis side, `maxPoints`, comparison cap and labelling, forecast colours and dashes. |
| `chart.test.ts` | QuickChart URL shape, 30-point cap, dataset counts, `tension` / `cubicInterpolationMode` per curve, milestone annotations, legend/`beginAtZero`/`showPoints`/theme flags. |
| `markdown.test.ts` | section presence and ordering, velocity nesting level, `NEW` badge, chart link paths, stargazer `<details>` blocks, forecast tables. |
| `html.test.ts` | document structure, delta colours, absence of `<details>`, chart embedding gated on `includeCharts`, velocity nesting, explicit `background-color`. |
| `csv.test.ts` | header, status column, quoting rules, header-only output for an empty repo list. |
| `badge.test.ts` | SVG well-formedness, compact count formatting, `aria-label`. |

Run just this layer: `pnpm vitest run src/presentation` (single file: `pnpm vitest run src/presentation/svg-chart.test.ts`).
