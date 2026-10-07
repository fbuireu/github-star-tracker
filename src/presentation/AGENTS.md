# src/presentation

Turns already-computed domain data into the Artefacts the action publishes (markdown and HTML reports, CSV,
SVG line charts, an SVG badge) and the QuickChart image URLs the email embeds.

## The chart modules

There are separate chart modules rather than one library call for two reasons: the SVG is emitted by hand so it
stays self-contained and theme-aware ([ADR 0006](../../docs/adr/0006-hand-rendered-svg-charts.md)), and the
email path goes through QuickChart because mail clients will not display inline SVG
([ADR 0010](../../docs/adr/0010-quickchart-renders-the-email-charts.md)).

- **[`chart-spec.ts`](./chart-spec.ts) decides what a Chart is**, and names which one is wanted. A `ChartRequest` is a
  discriminated union over the `ChartKind`s [GLOSSARY.md](../../GLOSSARY.md) lists (star history, per repo, comparison,
  forecast, per-repo forecast), carrying the `history` to plot, an optional `title` and only that kind's own
  inputs (`repoFullName`, `repoNames`, `forecastData`, `lineColor`, the star-history Milestone and trend
  options). `buildChartSpec({ request, locale,
  palette, axisLabels, range, maxPoints })` maps one onto a `ChartSpec`: labels, an ordered list of series
  with a resolved colour, the title, whether to show a legend, and **the Milestones to draw, already
  resolved, already filtered to the visible ones and already labelled**. It returns `null` when `isPlottable`
  says the History is too short to draw, the one answer to that question: [`charts.ts`](./charts.ts) and
  [`report-model.ts`](./report-model.ts) ask it too instead of counting Snapshots. The spec builders behind it are
  module-private
  ([ADR 0014](../../docs/adr/0014-charts-are-built-as-a-spec-and-rendered-by-adapters.md)).
- **The two forecast kinds mirror the two star-history kinds.** `FORECAST` is to `PER_REPO_FORECAST` what
  `STAR_HISTORY` is to `PER_REPO`: the aggregate plots `forecastData.aggregate` over `snapshot.totalStars`,
  the per-repo one plots the named repository's own `RepoForecast` over `repoStarSeries`, and the per-repo one
  returns `null` for a name the Forecast does not cover. Both builders are thin wrappers over one private
  `forecastChartSpec`, which owns the guard, the dated x-axis, the week labels and the series layout, so
  the two kinds cannot drift apart in anything but which series they read. A single kind with an optional
  `repoFullName` would have saved that helper and buried the aggregate/per-repo split inside one `case`.
- **Milestone visibility is decided once, in `starHistorySpec`.** The extremes are taken over **every series
  in the spec**, not just the primary one, and the comparison is **strict** (`> min && < max`), so a Milestone
  equal to an extreme is never drawn. They are the raw data extremes, not the padded axis bounds. `milestones`
  is `[]` and never `null` when `chart-milestones` is off, for a kind that has none, or when everything
  filtered out; the adapters draw exactly what they are given.
- **A `ChartMilestone` carries its own `label`.** The text is formatted once, in `visibleMilestones`, with
  `formatCount` and the requested Locale, and both adapters draw the string they are handed. The one number an
  adapter formats is a y-axis tick, because each adapter picks its own ticks: `svg-chart.ts` formats the values
  `niceAxisSteps` picks with `formatCount`, and Chart.js formats the email's, in the Run's Locale because
  `chartImageUrl` sets `options.locale` to the Intl code `intlCode` returns. The email prints the tick in full
  (`12,000`) where the SVG compacts it (`12K`).
- **[`charts.ts`](./charts.ts) orchestrates.** `buildChartFiles` reads `Config`, builds the shared style object once, binds
  it into a local `renderChart(request)`, and returns `{ filename, svg }[]`. It renders nothing itself and
  returns `[]` when charts are off or the aggregate History is not `isPlottable`.
- **A per-repo Forecast Chart is drawn only for a repository the Forecast fitted to its own history.**
  `buildChartFiles` walks `forecastData.repos`, keeps the ones whose `source` is `ForecastSource.OWN`, and
  plots each over `chartHistories.reconstructedForRepo(name)`: the very History `@domain/forecast` fitted, so
  the observed curve and the Forecast continuing it cannot describe different series. A repository fitted to
  the Snapshots of the aggregate that hold it (`ForecastSource.AGGREGATE`) gets its Forecast table and no Chart,
  because the aggregate's timeline would draw the stretch before the repository joined under its name.
- **`resolveChartHistories` owns the Reconstructed History for the Tracked Set and for a single repository,
  and owns the instant.** It reconstructs via `@domain/star-history` and resolves each result against the
  Stored History (reconstruction wins at >= 2 snapshots, otherwise the fallback), exposing `.aggregate` for the
  Tracked Set and `.forRepo(name)` for one Repository, which falls back for a name outside the set. With
  `include-charts` off it reconstructs nothing, so `.aggregate` and every `.forRepo(name)` are the Stored
  History. `now` defaults to a `Date` it creates, and both paths reconstruct through one private `reconstruct`
  closure over it, so every chart in a run ends on the same moment without the caller threading one.
- **`reconstructedForRepo` reconstructs each repository once and remembers the answer**, `null` included,
  in a `Map` private to the closure; `forRepo` reads through it. Several consumers ask for the same repository
  in one run (the Forecast hook, the per-repo charts, and the model lists that carry their
  histories), and `buildStarHistory` buckets every `starred_at` each time it is called, so without the
  memo a run with `top-repos: 10` over large repositories would redo that work once per consumer. The cache is
  correct because the closure captures every input (`repos`, `repoStargazers`, `config`, `now`), so nothing
  a second call could see differs from the first.
- **[`svg-chart.ts`](./svg-chart.ts) draws.** `renderSvgChart({ request, locale, ...style })` is its only export: it builds the
  spec with year-thinned axis labels and maps the series onto `SvgDataset`s. One private `renderSvg` does all
  the drawing.
- **[`chart.ts`](./chart.ts) is the email path.** `chartImageUrl({ request, locale, ...style })` is its only chart export,
  producing `quickchart.io` URLs consumed by [`html.ts`](./html.ts). It is a parallel, lower-fidelity rendering of the
  *same* spec, never an input to the SVG files. A series' fill is its colour at a translucent alpha, written by
  `translucent` from any of the four hex forms `chart-line-color` accepts (`#rgb`, `#rgba`, `#rrggbb`,
  `#rrggbbaa`), scaling the alpha a colour already carries; the line itself keeps the colour as configured. Every
  URL names Chart.js 4 (`v=` from `CHART.chartJsVersion`), the version the config is written for: QuickChart's
  default, 2.9.4, ignores `plugins.title`, `plugins.legend` and `scales.x`.

Default titles come from `buildChartSpec`, each of them one bundle key: `report.starHistory`,
`report.topRepositories` and `forecast.sectionTitle`, and for one repository `report.repoChartTitle` and
`forecast.repoChartTitle`, whose `{name}` a translation puts where its language wants it. The star-history and
per-repo series are labelled `report.stars`.

`CHART_CHROME` ([`constants.ts`](./constants.ts)) holds the title and milestone font sizes, the milestone stroke width
and its dash pattern, which `SVG_CHART` and `chart.ts`'s `CHART_STYLE` both read; the SVG side turns the dash array
into its `'6,6'` string. The **series** dash patterns are per adapter: the SVG uses one dash for every dashed series,
Chart.js a pattern per series kind.

`CHART_DEFAULTS` (`constants.ts`) holds the defaults of the style options both adapters share: `smoothing`,
`curve`, `showPoints`, `beginAtZero` and `theme`. Each adapter writes its own `option = CHART_DEFAULTS.option`,
because a destructured default cannot be spread. `yAxisSide` and `animate` are SVG
only, two of the options [ADR 0010](../../docs/adr/0010-quickchart-renders-the-email-charts.md) lists as dropped by the email: a PNG cannot animate, and
`chartImageUrl` takes no axis side, so the email's Y axis stays where Chart.js puts it. `range` is **not**
email-only; `charts.ts` passes it too, and both adapters window on it.

**A set of options is projected from `Config` twice.** `charts.ts` builds the SVG bag inline, `emailChartStyle`
in [`shared.ts`](./shared.ts) builds the email one, and `smoothing`, `curve`, `showPoints`, `beginAtZero`, `range` and
`lineWidth` appear in both. An option both chart systems honour gets a row in the shared-option table in
[`run.test.ts`](./run.test.ts), which renders a run twice per row and asserts the change reaches **both** systems,
pinning the `rounded-step` collapse as the one deliberate exception; a style option also goes into both
projections. Read the chart style case of
[ADR 0022](../../docs/adr/0022-a-concept-earns-a-type-when-it-crosses-a-boundary.md) before merging the two.

`SeriesDash` and `SeriesWeight` are emphasis, not pixels: `chart.ts` maps both through its own tables
(`DASH_PATTERNS`, `POINT_SIZES`), and `svg-chart.ts` reads only `SeriesDash`, as a `dashed` boolean, drawing
every undashed series with one point radius.

**`AxisLabels` is an adapter constant, not a per-call choice**: `svg-chart.ts` always asks for `THINNED` and
`chart.ts` always for `DATES`. The forecast spec overrides whatever it is given with `DATES`, and its params
type `Omit`s the field so the caller cannot believe otherwise. `maxPoints` is likewise passed only by
`renderSvgChart`, which is what fixes email charts at 30 points.

## The layer's front door

`renderRun` ([`src/presentation/run.ts`](./run.ts)) is what `@application` calls: one function in, one `RenderedRun` out,
carrying markdown, html, csv, badge and the chart files.

- **It builds the `ReportModel` once and hands the same one to both dialects, and there is exactly one clock
  read per render.** `now` is injectable, defaults to `new Date()` here, reaches `prepareReportData`, and
  yields both `model.now` (the `YYYY-MM-DD` the header shows) and `model.generatedAt` (the ISO stamp both
  footers show), so a Run crossing midnight dates the markdown Report and the HTML Report alike.
- **`topRepoNames` is not a parameter, and the linked set is the *drawn* set.** `renderRun` takes the names
  from `topRepositories`, draws the charts first, then builds the model with `drawn`, the set of filenames
  it actually got back. `model.perRepoCharts` is therefore the repositories that have a chart, and both
  dialects iterate it. Ranking alone is not enough: `renderSvgChart` returns `null` for a Top Repository whose
  `forRepo` History is too short to draw (neither its reconstruction nor the Stored History fallback reaches
  `MIN_SNAPSHOTS_FOR_CHART`), and linking by rank would point [`markdown.ts`](./markdown.ts) at an image no Run wrote.
- **`ChartHistories` exposes two per-repo accessors, `forRepo` and `reconstructedForRepo`, and they are not
  interchangeable.** A star-history Chart takes `forRepo`; a Forecast, its figures *and* its Chart alike, must
  take `reconstructedForRepo`; [`../domain/AGENTS.md`](../domain/AGENTS.md) carries the rule and its reason.
  So the two charts a Report shows for one repository can plot different curves: the star-history one falls
  back to the Stored History when nothing could be reconstructed, the Forecast one is never drawn in that
  case at all.
- **`drawn` is one `ReadonlySet<string>` of filenames, filled only here, and the model composes the names
  it asks about.** `buildReportModel` calls `perRepoChartFile` and `perRepoForecastChartFile` itself and
  tests membership. Absent `drawn` (the dialect tests build a model without rendering charts) every
  candidate counts as drawn.
- **`model.perRepoCharts` carries the History each chart was drawn from**, so the email chart and the
  data-branch SVG plot the same series. Per-repo and aggregate are not interchangeable here:
  `buildStarHistory` anchors its earliest edge to the earliest Star among the repositories it is handed, so
  the aggregate gives a young repository a long flat lead-in that its own chart does not have.
- **It takes `chartHistories` and `storedHistory`, not two `History` values.** `ReportParams` carries
  `history` and `velocityHistory` as adjacent, same-typed and **not** interchangeable fields (swapping them
  turns Velocity into an average over a chart bucket), and `renderRun` is the one production caller that
  fills them, deriving `history` from `chartHistories.aggregate`, so the hazard is confined to this file
  rather than exposed at every call site.
- `generateMarkdownReport` and `generateHtmlReport` take `{ model, config }`: the model is the data, the config
  is which options that dialect honours.
- **`renderRun` also renders the Notification subject** (`emailSubject` on `RenderedRun`) and
  `renderEmptyRun(config)` renders the whole no-repositories Run, so `@application` composes no Report or
  Notification text.

The report modules are one per format: `markdown.ts` and `html.ts` over a shared
[`report-model.ts`](./report-model.ts), [`csv.ts`](./csv.ts) over the comparison results and [`badge.ts`](./badge.ts) over the total; with
[`escaping.ts`](./escaping.ts) for every dialect's escaper, `shared.ts` for the report params, the theme projection,
`emailChartStyle`, `prepareReportData`, the Forecast table labels and the per-repo Chart filenames `charts.ts` writes
and the Reports link, `constants.ts` for palettes and geometry, and [`types.ts`](./types.ts) for the `ColorPalette`
contract and the shapes the model and the charts share (`ChartHistories`, `TopRepo`, `PerRepoChart`, `PerRepoForecast`).
Chart windowing and series maths (`selectChartSnapshots`, `movingAverageSeries`, `buildForecastChartSeries`)
are private to `chart-spec.ts`, their only consumer.

## The report model

`buildReportModel` (`src/presentation/report-model.ts`) decides which sections a Report has and what is in them;
`markdown.ts` and `html.ts` are dialects over it, and neither decides whether a section exists.
[`report-model.test.ts`](./report-model.test.ts) is its spec. The repository table and the Summary are on every
Report, a quiet Run and a Run with no active repository included, so the model carries them without a condition and
no dialect adds one.

- The model resolves `chartHistory` (the history *only* when it is plottable, so the dialects narrow on
  `!== null`), `showComparisonChart`, `topRepos`, `isFirstRun`, the Velocity figures and the
  Stargazer outcome.
- `isFirstRun` comes from `prepareReportData` alongside `baselineSnapshotDate`: that is the *rendered* Baseline
  Snapshot date, or the locale bundle's `report.firstRun` string when there is no Baseline Snapshot, and both are
  decided from the same `baselineSnapshotTimestamp`.
- **`ReportModel` exposes `chartHistory` and no `hasChartHistory` field**, because the flag would be
  `chartHistory !== null` by construction and two public spellings of one rule let the dialects pick
  different ones. `hasChartHistory` is only a local in `report-model.ts`; it is **not** in `markdown.ts`,
  whose nearest local is `hasComparisonChart` (a straight read of `model.showComparisonChart`), and `html.ts`
  renames the field on destructure, so its guard reads `history !== null && model.showComparisonChart`. Those
  `!== null` tests are TypeScript narrowing, not the rule: `showComparisonChart` is the model's answer to "is
  there a comparison Chart".
- `topRepos` comes from `topRepositories` in `@domain/comparison` ([`../domain/AGENTS.md`](../domain/AGENTS.md)),
  and `prepareReportData`'s `sorted` is that same module's `rankByStars`.
- **`topRepos` is a `TopRepo[]`, not a list of names**: each entry carries the `fullName` the chart request
  needs *and* the Star Count and Delta the per-repo chart heading shows. `toTopRepos` takes the *membership*
  from `topRepositories` as a Set and reads the figures off `sorted`, so there is no "repo not found" branch
  to cover, no second ranking, and no way for name and figures to drift apart. A caller that only wants
  identities maps to `fullName`, as `html.ts` does for the comparison chart's `repoNames`.
- `StargazerOutcome` is `NEW` or `NONE`; the section is omitted entirely when `stargazers` is `null`, which
  is what "`track-stargazers` is off" looks like.
- `VelocitySection.nextMilestone` is already `null`-or-present, so neither dialect repeats the
  `nextMilestone !== null && daysToNextMilestone !== null` pair.
- `buildForecastTable` returns headers and rows; each dialect wraps them in its own table markup. Headers are
  always `FORECAST_WEEKS` long regardless of how many points a forecast carries.
- `model.perRepoForecasts` is the list both dialects iterate for the per-repo half of the Forecast section,
  and each entry carries `chartHistory`: the History its Chart was drawn from, or `null` when the Run drew
  none. `model.forecast` carries the whole `ForecastData` for the aggregate table. Same shape as
  `chartHistory`: `null` means "no Chart", not "no data".
- Both dialects take `RenderReportParams` (`{ model, config }`) and read the options they honour off `config`
  ([ADR 0016](../../docs/adr/0016-the-report-renderers-read-config-themselves.md)). Markdown emits relative
  `./charts/*.svg` links and reads no chart style at all; `html.ts` reads `config.emailTheme` and never
  `chartTheme`, because a QuickChart PNG bakes its background in. A new report or chart option is an input, a
  `Config` field and one read in the renderer that wants it, plus, when both chart systems honour it, the two
  projections and the `run.test.ts` row described above.
- **`html.ts` splits `config` two ways, and it is the only place that knows which is which**:
  `chartMilestones`, `chartCustomMilestones`, `chartTrendLine` and `chartLineColor` become part of the
  `ChartRequest`; `emailChartStyle(config)` in `shared.ts` projects the adapter-style fields
  (`smoothing`, `curve`, `showPoints`, `beginAtZero`, `range`, `lineWidth`) that reach `chartImageUrl`. That
  projection is the email counterpart of the `style` object `charts.ts` builds for the SVG path.
- **`lineColor` and `lineWidth` reach the email charts too**, so the Notification and the Data Branch draw
  the same stroke. `lineColor` goes on the star-history, per-repo and forecast requests only, since the
  comparison chart has a per-series palette and takes none on both paths. `lineWidth` becomes Chart.js
  `borderWidth`, emitted **only when supplied**, and `emailChartStyle` always supplies it because
  `Config.chartLineWidth` always has a value. The optionality is there for direct callers of `chartImageUrl`.

## Invariants & rules

- **The range cutoff is relative to the newest snapshot, not to `Date.now()`**; when that snapshot's timestamp is
  unparseable the series is returned unfiltered.
- **`< 2` snapshots = `null`.** Every generator returns `null` rather than an empty chart. Comparison charts
  also return `null` for an empty repo list.
- **Windowing order is range-then-downsample.** `selectChartSnapshots` filters by `range` first, then picks
  `maxPoints` **evenly spaced** Snapshots across the whole window, keeping the first and the last (only the
  newest when `maxPoints` is 1). It must not become a tail slice: with a tail slice, any window larger than
  `maxPoints` collapses to the same recent points and `chart-range` silently stops having any effect.
  `maxPoints <= 0` and an already-small window both return a **copy**, never the caller's array.
- **`chart.ts` never receives `maxPoints`**, so email charts are fixed at 30 points regardless of
  `chart-max-points`. Those 30 are spread across the selected range, so an email chart covers the same span
  as its SVG counterpart at lower resolution.
- **Velocity reads `velocityHistory`, never `history`.** `history` is the chart history, whose consecutive
  snapshots are buckets spaced by `chart-max-points`. Passing only `history` renders no velocity section
  at all.
- **The SVG canvas is fixed**: `viewBox="0 0 800 400"`, margins `{top:50,right:30,bottom:50,left:60}`,
  plot area 710x300, baseline y=350. Tests assert these literals.
- **Y domain**: `padding = max(1, ceil((maxData - minData) * 0.1))`, floor is `beginAtZero ? 0 : max(0, minData - padding)`
  and never negative. Ticks are de-duplicated after rounding, so a small range yields fewer than 5 ticks
  rather than repeating one.
- **Only `catmull-rom` is clamped** to the plot box, because it is the only overshooting curve; the others
  are non-overshooting by construction.
- **`null` splits a series into segments**, each drawn as its own path/fill/circle group. Only a segment
  starting at index 0 that is filled and not dashed is anchored to the baseline. Dashed datasets get no fill,
  no circles and no draw animation.
- **Theme rendering is asymmetric.** `auto` emits light values *plus* a `prefers-color-scheme: dark` override
  block; `light` and `dark` emit exactly one palette and **no** media query.
- **Empty x-axis labels are ticks that must not render.** `buildAxisLabels` returns `''` for suppressed
  positions; `renderSvg` filters those out, thins the rest to a step of `ceil(count / 10)` and always keeps the
  last non-empty index, so up to 11 render.
- **The two dialects show the same sections.** Both carry a trend column in the repo table, both list New and
  Removed Repositories, both head the per-repo charts with `report.repoChartHeading` and both label the
  per-repo Forecast tables with `forecast.byRepository`. Markup and section *placement* differ: `html.ts`
  puts New and Removed after the charts, and renders the stat boxes where the markdown has a Summary
  section. A section present in one Report and absent from the other is a bug: [`run.test.ts`](./run.test.ts)
  renders the repository table and the Summary through both for a first run, a Run where nothing moved, a Run whose
  only movement is a rename (its net change is 0, its Stars lost are not) and a Run with no repositories.
- **`markdown.ts` section order is fixed**: header, comparison note, charts, repo table, new, removed,
  summary, stargazers, forecast, velocity, footer. Velocity nests as an `h3` inside the forecast section when
  a forecast exists, otherwise it is a top-level `h2`; both levels are asserted.
- **The HTML report must contain no `<details>`**, which email clients do not support. Pinned by
  [`html.test.ts`](./html.test.ts).
- **Markdown chart links are relative** (`./charts/<file>`), matching the directory
  `@infrastructure/persistence` writes into.

## Escaping & injection safety

Every escaper lives in [`escaping.ts`](./escaping.ts), behind `escapeFor(dialect)`, and each renderer binds the dialect it
needs once at module load (`const escapeHtml = escapeFor(EscapeDialect.MARKUP);`).

| Dialect | Escapes |
| --- | --- |
| `MARKUP` | `& < > " '` |
| `XML` | `& < > "`, but not `'`, because every attribute uses double quotes |
| `MARKDOWN` | `& < >` plus `[ ] ( ) \`` |
| `CSV` | delimiter, quote, newline, **and** the `= + - @` formula prefix |

- `markdown.test.ts` and `html.test.ts` each have one case, "escapes every GitHub-sourced string it prints",
  that plants a marker in every GitHub-sourced field. A new field joins that fixture in both.

## Gotchas

- `COLORS` is an alias for `LIGHT_PALETTE` and `badge.ts` uses it unconditionally, so **the badge is always
  light-themed** and ignores `chart-theme`, though its number *is* localized.
- In `ColorPalette`, `white` is the *background* colour: it is `#0d1117` in the dark palette, not white. The
  Badge also draws its text in it, which holds only because the Badge stays on `LIGHT_PALETTE`.
- **`theme` means different things to the two chart paths.** `svg-chart.ts` can honour `auto` because CSS
  travels with the SVG; `chart.ts` cannot, because `buildChartUrl` bakes `palette.white` into the QuickChart
  `backgroundColor` query parameter and a PNG has one background forever. `auto` there resolves to
  `LIGHT_PALETTE` (`resolvePalette` in `shared.ts`), so a reader in dark mode gets a white slab whose
  surroundings the mail client has darkened. `email-theme` exists so that path can be forced independently of
  `chart-theme`; `html.ts` receives it as its `theme`.
- `perRepoChartFile` replaces only the **first** `/`, so a nested-looking name would keep later slashes and
  produce an invalid filename. `perRepoForecastChartFile` shares that stem and prefixes it, so a Forecast
  Chart is `forecast-<owner>-<repo>.svg`, beside the aggregate's `forecast.svg`. The prefix is deliberate:
  as a *suffix* it would collide with the star-history chart of any repository actually named `*-forecast`,
  which is a common enough name; the prefix only collides with an owner named `forecast-…`.
- `repoStarSeries` returns `0`, not `null`, for a repository missing from a Snapshot. A per-repo Chart over the
  Stored History fallback therefore plots `0` for every Snapshot before the repository joined the Tracked Set,
  and one for a repository in no Snapshot is a flat zero line rather than `null`, which the
  [`chart-spec.test.ts`](./chart-spec.test.ts) case "yields a flat zero series for a repository absent from every snapshot" pins.
- `charts.ts` has a colocated [`charts.test.ts`](./charts.test.ts) covering which files a run produces, the per-repo
  reconstruction fallback and the theme and line colour it projects. [`tracker.test.ts`](../application/tracker.test.ts) runs it
  unmocked for the #148 pin alone.
- Each map dialect's pattern (`MARKUP`, `XML`, `MARKDOWN`) is built once from its map, by `replacerFor` in
  `escaping.ts`, with the `g` flag, and used with `replaceAll`, which resets `lastIndex`; `.exec` or `.test` on
  it would carry `lastIndex` from one call into the next.
- `chart.ts` maps `rounded-step` to Chart.js `monotone` and both `catmull-rom` and `cubic-bezier` to a plain
  tension spline: email charts are deliberately an approximation.

`charts.ts` and `emailChartStyle` are where an input becomes a style parameter, and `svg-chart.ts` and
`chart.ts` are where it becomes geometry or a Chart.js option.
