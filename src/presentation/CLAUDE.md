# src/presentation

Turns already-computed domain data into the artifacts the action publishes: markdown and HTML reports, CSV,
SVG line charts, an SVG badge, and QuickChart image URLs for email. Every function is synchronous and
side-effect free — it returns a string or `null`, never writes a file, never calls the network, never touches
`@actions/core`. Deciding *what* to render is the caller's job; deciding *how many stars a repo gained* is
the domain's.

## The chart trio

There are three chart modules rather than one library call for two reasons: the SVG is emitted by hand so it
stays self-contained and theme-aware ([ADR 0006](../../docs/adr/0006-hand-rendered-svg-charts.md)), and the
email path goes through QuickChart because mail clients will not display inline SVG
([ADR 0010](../../docs/adr/0010-quickchart-renders-the-email-charts.md)).

- **`charts.ts` orchestrates.** `buildChartFiles` reads `Config`, builds the shared style object once, and
  returns `{ filename, svg }[]`. It renders nothing itself and returns `[]` when charts are off or the
  history has fewer than 2 snapshots.
- **`svg-chart.ts` draws.** One private `renderSvg` does all the drawing; the four exported generators only
  shape datasets and labels, then delegate.
- **`chart.ts` is the email path**, producing `quickchart.io` URLs consumed by `html.ts`. It is a parallel,
  lower-fidelity rendering — never an input to the SVG files.

The other modules are one per format: `markdown.ts`, `html.ts`, `csv.ts`, `badge.ts`, with `shared.ts` for
cross-renderer helpers and `constants.ts` / `types.ts` for palettes, geometry and the `ColorPalette` contract.

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

- `svg-chart.ts` has its own `escapeXml` (`& < > "`, not `'`, because every attribute uses double quotes),
  applied to **exactly three** things: the chart title, x-axis labels and legend labels. If you interpolate
  user text into a new attribute, wrap it.
- `html.ts` escapes every GitHub-sourced string it interpolates — repo names, logins, avatar and profile URLs
  — through `escapeHtml`. `markdown.ts` interpolates raw, which is safe only because its output is markdown
  on a data branch; treat any new field from a less-constrained source as needing an escaper.
- `csv.ts` escapes CSV delimiters **and** neutralises spreadsheet formula injection: a field starting with
  `=`, `+`, `-` or `@` is prefixed with `'` and quoted.
- `chart.ts` needs no escaper — the whole config goes through `JSON.stringify` + `encodeURIComponent`.
  `badge.ts` performs none; its only dynamic values are an i18n label and a formatted count.

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
  "returns null for non-existent repository" actually asserts `"data":[0,0,0]`.
- `charts.ts` is the only logic-bearing file here without a colocated test; it is covered indirectly by
  `tracker.test.ts`, which mocks `@presentation/svg-chart` but not `@presentation/charts`.
- `chart.ts` maps `rounded-step` to Chart.js `monotone` and both `catmull-rom` and `cubic-bezier` to a plain
  tension spline — email charts are deliberately an approximation.
- `escapeXml`'s pattern is a module-level `/g` literal used with `replaceAll`, which resets `lastIndex`. Safe
  as written; do not switch it to `.exec`/`.test`.

Every `chart-*` option is documented for users in
[`docs/wiki/Configuration.md`](../../docs/wiki/Configuration.md) and shown as a rendered before/after in
[`examples/README.md`](../../examples/README.md) — all of them except `chart-trend-line` and
`chart-animation`, which have no sample SVG. `charts.ts` is where an input becomes a style parameter, and
`svg-chart.ts` is where that parameter becomes geometry.
