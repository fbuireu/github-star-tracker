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
  with a resolved colour, the title, whether to show a legend, and **the Milestones to draw, already resolved,
  already filtered to the visible ones and already labelled** — or `null` when there is too little history.
  The four spec builders behind it are module-private; both renderers read the spec and neither re-derives it
  ([ADR 0014](../../docs/adr/0014-charts-are-built-as-a-spec-and-rendered-by-adapters.md)).
- **Milestone visibility is decided once, in `starHistorySpec`.** The extremes are taken over **every series
  in the spec**, not just the primary one, and the comparison is **strict** (`> min && < max`), so a Milestone
  equal to an extreme is never drawn. They are the raw data extremes, not the padded axis bounds. `milestones`
  is `[]` — never `null` — when `chart-milestones` is off, for a kind that has none, or when everything
  filtered out; the adapters draw exactly what they are given and neither owns a threshold list any more.
- **A `ChartMilestone` carries its own `label`.** The text is formatted once, in `visibleMilestones`, with
  `formatCount` and the requested Locale; both adapters draw the string they are handed and neither formats a
  number. `chart.ts` used to call `toLocaleString('en-US')` while `svg-chart.ts` used `formatCount`, so the
  same Milestone read `1,000 ★` in the Notification and `1K ★` on the Data Branch — content drift of exactly
  the kind [ADR 0014](../../docs/adr/0014-charts-are-built-as-a-spec-and-rendered-by-adapters.md) exists to
  prevent, which survived because label *text* had been filed as appearance.
- **`charts.ts` orchestrates.** `buildChartFiles` reads `Config`, builds the shared style object once, binds
  it into a local `renderChart(request)`, and returns `{ filename, svg }[]`. It renders nothing itself and
  returns `[]` when charts are off or the history has fewer than 2 snapshots.
- **`resolveChartHistories` owns the Reconstructed History at both altitudes, and owns the instant.** It
  reconstructs via `@domain/star-history` and resolves each result against the Stored History — reconstruction
  wins at >= 2 snapshots, otherwise the fallback — exposing `.aggregate` for the Tracked Set and
  `.forRepo(name)` for one Repository, which falls back for a name outside the set. `now` defaults to a
  `Date` it creates, so every chart in a run ends on the same moment without the caller threading one.
  `resolveChartHistory` is private: the aggregate and the per-repo resolution used to happen in two layers,
  with `@application` doing one and `charts.ts` the other, sharing a `Date` by convention.
- **`svg-chart.ts` draws.** `renderSvgChart({ request, locale, ...style })` is its only export: it builds the
  spec with year-thinned axis labels and maps the series onto `SvgDataset`s. One private `renderSvg` does all
  the drawing.
- **`chart.ts` is the email path.** `chartImageUrl({ request, locale, ...style })` is its only chart export,
  producing `quickchart.io` URLs consumed by `html.ts`. It is a parallel, lower-fidelity rendering of the
  *same* spec — never an input to the SVG files.

**Default titles live in `buildChartSpec`, not in the adapters**, so the SVG and the email chart of the same
kind are always named the same thing and both are localized. Only the per-repo default is composed rather
than translated (`` `${repoFullName} Star History` ``).

**The chrome both adapters draw identically lives in `CHART_CHROME`** (`constants.ts`): the title and
milestone font sizes, the milestone stroke width and its dash pattern. Both charts are the same 800x400
canvas, so those are one visual decision, not two — `SVG_CHART` and `chart.ts`'s `CHART_STYLE` both read
them, and the SVG side turns the dash array into its `'6,6'` string. The **series** dash patterns stay
per-adapter on purpose: the SVG uses one dash for every dashed series, Chart.js uses three.

**The style options both adapters share default in `CHART_DEFAULTS`** (`constants.ts`): `smoothing`,
`curve`, `showPoints`, `beginAtZero` and `theme`. Each adapter still writes its own
`option = CHART_DEFAULTS.option`, because a destructured default cannot be spread — but the *values* live in
one place, so the two cannot drift the way five duplicated literals could. `yAxisSide` and `animate` are SVG
only — a PNG has no axis side to choose and cannot animate. `range` is **not** email-only: `charts.ts` passes
it too, and both adapters window on it.

**Six options are projected from `Config` twice** — `charts.ts` builds the SVG bag inline, `emailChartStyle`
in `shared.ts` builds the email one, and `smoothing`, `curve`, `showPoints`, `beginAtZero`, `range` and
`lineWidth` appear in both. That has drifted twice in the past: `chart-smoothing`, and later
`chart-line-color`/`chart-line-width`, shipped honoured by the SVG alone and needed a later `fix:` to reach
the email. **Do not merge the two projections into one shared type.** It would save one line per new option
and assert a parity that is false: `chart.ts` collapses `rounded-step` onto Chart.js `monotone` and both
`catmull-rom` and `cubic-bezier` onto a plain tension spline, and `theme` diverges deliberately
(`chartTheme` for the SVG, `emailTheme` for the email). What guards the drift instead is `run.test.ts`,
which renders a run twice per shared option and asserts the change reaches **both** systems — and pins the
`rounded-step` collapse as the one deliberate exception.

`SeriesDash` and `SeriesWeight` are emphasis, not pixels: each adapter maps them through its own table
(`DASH_PATTERNS` / `POINT_SIZES` in `chart.ts`, a `dashed` boolean in `svg-chart.ts`). Keep dash arrays and
point radii out of the spec.

**`AxisLabels` is an adapter constant, not a per-call choice**: `svg-chart.ts` always asks for `THINNED` and
`chart.ts` always for `DATES`. The forecast spec overrides whatever it is given with `DATES` — its params
type `Omit`s the field so the caller cannot believe otherwise. `maxPoints` is likewise passed only by
`renderSvgChart`, which is what fixes email charts at 30 points.

## The layer's front door

`renderRun` (`src/presentation/run.ts`) is what `@application` calls: one function in, one `RenderedRun` out
— markdown, html, csv, badge and the chart files. Every other layer already had a single entry point
(`measureRun` for `@domain`, `withDataBranch` for `@infrastructure`); this one had five, and the shell was
assembling the params for each.

- **It builds the `ReportModel` once and hands the same one to both dialects.** They used to build their
  own, and `prepareReportData` read `new Date()` — so a run crossing midnight could date the markdown
  Report and the HTML Report differently. One model also means one Top Repositories list.
- **`now` is injectable and there is exactly one clock read per render.** It defaults to `new Date()` here,
  reaches `prepareReportData`, and yields both `model.now` (the `YYYY-MM-DD` the header shows) and
  `model.generatedAt` (the ISO stamp both footers show). The two dialects used to call `new Date()` in their
  own footers, which left the *same* midnight hazard the bullet above describes open one layer down — the
  header agreed and the footers did not. Never read the clock in a renderer; take it off the model.
- **`topRepoNames` is not a parameter, and the linked set is the *drawn* set.** `renderRun` takes the names
  from `topRepositories` — the same domain rule `toTopRepos` uses for `model.topRepos` — draws the charts
  first, then builds the model with a `hasChartFile` predicate closed over the filenames it actually got
  back. `model.perRepoCharts` is therefore the repositories that have a chart, and both dialects iterate it.
  Ranking alone was not enough: `renderSvgChart` also returns `null` for a top repository whose own
  Reconstructed History is too short, so `markdown.ts` used to link an image no run had written.
- **`ChartHistories` exposes two per-repo accessors, and they are not interchangeable.** `forRepo` resolves
  to the Stored History when a repository has no usable reconstruction — right for a Chart, which would
  otherwise have nothing to draw. `reconstructedForRepo` returns `null` instead. A Forecast must use the
  second: the Stored History yields `0` for Snapshots predating the repository, which a curve reads as real
  growth, while a Chart merely plots it.
- **`model.perRepoCharts` carries the History each chart was drawn from.** `charts.ts` drew the per-repo SVG
  from `chartHistories.forRepo(name)` while `html.ts` drew the same chart from the aggregate. Those are not
  the same series — `buildStarHistory` anchors its earliest edge to the earliest Star among the repositories
  it is handed, so the aggregate gives a young repository a long flat lead-in the SVG does not have. The
  model now hands each dialect the per-repo History, so the email chart and the data-branch SVG plot the
  same thing.
- **It takes `chartHistories` and `storedHistory`, not two `History` values.** `ReportParams` still carries
  `history` and `velocityHistory` as adjacent, same-typed and **not** interchangeable fields — swapping them
  turns Velocity into an average over a chart bucket — but `renderRun` is now the only thing that fills them,
  deriving `history` from `chartHistories.aggregate`. The hazard is confined to this file rather than exposed
  at every call site.
- It renders; it decides nothing about **whether** to render. Charts still come back `[]` when charts are
  off, and the report renderers still read `config` for the options they honour.
- The individual renderers stay exported and stay tested — they are internal seams within this layer, the
  same way `@domain`'s five are behind `measureRun`. `generateMarkdownReport` and `generateHtmlReport` take
  `{ model, config }`: the model is the data, the config is which options that dialect honours.
- **`renderRun` also renders the Notification subject** (`emailSubject` on `RenderedRun`) and
  `renderEmptyRun(config)` renders the whole no-repositories run. Both were English literals built in the
  shell; the subject is the one user-facing string `@application` used to compose itself.
- `run.test.ts` is where the front door's own contract lives — one date across both Reports, Velocity read
  from the stored History, the charted set matching the linked set, and **dialect parity**: a table-driven
  case asserts every section the model can switch on appears in *both* Reports. That invariant used to be
  prose here, and one commit had to close four gaps in the HTML report at once.

The report modules are one per format: `markdown.ts`, `html.ts`, `csv.ts`, `badge.ts`, over a shared
`report-model.ts`; with `escaping.ts` for every dialect's escaper, `shared.ts` for the report params, the
theme projection and `prepareReportData`, and `constants.ts` / `types.ts` for palettes, geometry and the
`ColorPalette` contract. Chart windowing and series maths (`selectChartSnapshots`, `movingAverageSeries`,
`buildForecastChartSeries`) live in `chart-spec.ts`, their only consumer — they were in `shared.ts` when
"shared" meant "imported by more than one file" rather than a concept.

## The report model

`buildReportModel` (`src/presentation/report-model.ts`) decides **which sections a Report has and what is in
them**, once. `markdown.ts` and `html.ts` are dialects over it and own only markup. `report-model.test.ts` is
its spec — assert a section rule there, not through one dialect's markup.

- The model resolves `chartHistory` (the history *only* when it is plottable, so the dialects narrow on
  `!== null`), `showComparisonChart`, `topRepos`, `isFirstRun`, the Velocity figures and the three-way
  Stargazer outcome. A dialect that recomputes any of these has reintroduced the drift this module exists to
  stop.
- **`ReportModel` no longer exposes `hasChartHistory`.** It was `chartHistory !== null` by construction and
  both were public, so the two dialects picked different ones and expressed the same rule two ways. The name
  survives as a local in `report-model.ts` and `markdown.ts`; what went is the second *public* field. Likewise
  `showComparisonChart` is the model's answer to "is there a comparison Chart", which both dialects used to
  compute themselves from `chartHistory` and `topRepos.length`. In `html.ts` a `chartHistory !== null &&`
  still sits beside it — that is TypeScript narrowing, not the rule.
- **`topRepos` is not derived here.** It calls `topRepositories` in `@domain/comparison`, the same function
  `@application/tracker` uses for the charts and the Forecast, so the Report and the Charts cannot rank the
  Tracked Set differently. `prepareReportData`'s `sorted` is that module's `rankByStars`.
- **`topRepos` is a `TopRepo[]`, not a list of names**: each entry carries the `fullName` the chart request
  needs *and* the Star Count and Delta the per-repo chart heading shows. The figures are looked up in
  `sorted` rather than recomputed, and the list is still cut by `topRepositories`, so name and figures cannot
  drift apart the way two parallel arrays would. A caller that only wants identities maps to `fullName` —
  `html.ts` does exactly that for the comparison chart's `repoNames`. `toTopRepos` takes the *membership* from
  `topRepositories` as a Set and reads the figures off `sorted`, so there is no "repo not found" branch to
  cover and no second ranking.
- `StargazerOutcome` is `NEW` or `NONE`; the section is omitted entirely when `stargazers` is `null`, which
  is what "`track-stargazers` is off" looks like.
- `VelocitySection.projection` is already `null`-or-present, so neither dialect repeats the
  `nextMilestone !== null && daysToNextMilestone !== null` pair.
- `buildForecastTable` returns headers and rows; each dialect wraps them in its own table markup. Headers are
  always `FORECAST_WEEKS` long regardless of how many points a forecast carries.
- **The two dialects take the same params.** `ReportParams` carries `config: Config` plus the run's data,
  and each dialect reads the options it honours ([ADR 0016](../../docs/adr/0016-the-report-renderers-read-config-themselves.md)).
  Markdown emits relative `./charts/*.svg` links and reads no chart style at all; `html.ts` reads
  `config.emailTheme` — never `chartTheme` — because a QuickChart PNG bakes its background in.
  **`@application` no longer relays chart options**, so a new one is an input, a `Config` field and one read
  in the renderer that wants it.
- **`html.ts` splits `config` two ways, and it is the only place that knows which is which**:
  `chartMilestones`, `chartCustomMilestones`, `chartTrendLine` and `chartLineColor` become part of the
  `ChartRequest`; `emailChartStyle(config)` in `shared.ts` projects the six adapter-style fields
  (`smoothing`, `curve`, `showPoints`, `beginAtZero`, `range`, `lineWidth`) that reach `chartImageUrl`. That
  projection is the email counterpart of the `style` object `charts.ts` builds for the SVG path; keep the
  two lists in step deliberately rather than by accident.
- **`lineColor` and `lineWidth` reach the email charts too**, so the Notification and the Data Branch draw
  the same stroke. `lineColor` goes on the star-history, per-repo and forecast requests only — the comparison
  chart has a per-series palette and takes none, on both paths. `lineWidth` becomes Chart.js `borderWidth`,
  emitted **only when supplied** — and `emailChartStyle` always supplies it, because `Config.chartLineWidth`
  always has a value, so in a real run the email chart always carries a `borderWidth`. The optionality is
  there for direct callers of `chartImageUrl`: it must not default to `SVG_CHART.lineWidth`, which is the SVG
  renderer's own fallback and would put the same literal in a third place. They used to be SVG-only while
  four documents said otherwise, which meant one run produced a purple README chart and a gold email chart.

## Invariants & rules

- **Purity.** The only clock read on the report path is `renderRun`'s injectable `now`, which both the
  report date and the footer stamp derive from; `resolveChartHistories` takes its own. The one
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
- **Empty x-axis labels are ticks that must not render.** `buildAxisLabels` returns `''` for suppressed
  positions; `renderSvg` filters those out, thins the rest to at most 10, and always keeps the last non-empty
  index.
- **The two dialects show the same sections.** Both carry a trend column in the repo table, both list New and
  Removed Repositories, both head the per-repo charts with `report.repoChartHeading` and both label the
  per-repo Forecast tables with `forecast.byRepository`. The HTML used to omit all four, so the email was a
  strictly poorer report than the markdown one for no stated reason. Markup and section *placement* still
  differ — `html.ts` puts New and Removed after the charts, and renders the stat boxes where the markdown has
  a Summary section — but a section present in one and absent from the other is a bug now.
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
- **The Reports print Star Counts raw; the Badge and the Charts compact them.** `formatCount` is a *compact*
  formatter (`1.2K`), which is right where space is fixed — a badge, an axis tick, a Milestone label — and
  wrong in a Report, where the table is the place a reader goes for the exact figure. So a run can show
  `1.2M` on the badge and `1234567` in the table beside it, and that is deliberate rather than drift. Do not
  "unify" them by putting `formatCount` in `markdown.ts` or `html.ts`: that trades precision for symmetry.
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
