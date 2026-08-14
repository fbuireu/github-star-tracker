# 14. Charts are built as a spec and rendered by adapters

Date: 2026-08-14

## Status

Accepted

## Context

The same Chart is rendered twice by design: hand-written SVG for the Data Branch
([ADR 0006](./0006-hand-rendered-svg-charts.md)) and a QuickChart URL for the email, because mail clients
will not display inline SVG ([ADR 0010](./0010-quickchart-renders-the-email-charts.md)). Both decisions are
still right and neither is being revisited.

What went wrong is that "rendered twice" had become "decided twice". Each renderer independently selected
the window of Snapshots, derived the axis labels, capped the comparison set at ten repositories, applied the
single-Owner short-label heuristic, assigned the comparison colours by index, built the Forecast series, and
resolved which Milestones were visible. The `< 2 snapshots` guard was written eight times. `ChartCurve` was
interpreted twice — into four hand-written path generators on one side and onto two Chart.js shapes on the
other, lossily.

The consequence was drift with no test that could catch it: a fix to the comparison cap or the label
heuristic landed on whichever side the author was editing, and the README chart and the email chart quietly
stopped agreeing. `charts.ts`, which projects `Config` onto the shared style, had no colocated test at all
and was carried indirectly by the tracker's suite.

Collapsing the two renderers into one was never an option — that is what ADR 0006 and ADR 0010 already
rejected. Extracting only the small helpers (`selectChartSnapshots`, `movingAverageSeries`) had already been
done, and it is precisely the part that did *not* drift; what drifted was everything built on top of them.

## Decision

`@presentation/chart-spec` decides **what** a Chart is; the two renderers decide **how** it looks.

`starHistorySpec`, `perRepoSpec`, `comparisonSpec` and `forecastSpec` each return a `ChartSpec` — axis
labels, an ordered list of series with a resolved colour, and the Milestone thresholds, or `null` when there
is too little history to plot. `svg-chart.ts` and `chart.ts` are adapters over that seam: each maps a
`ChartSpec` onto its own dialect and owns nothing else about the Chart's content.

The dialect-specific facts stay in the adapters, because they are genuinely not shared: the SVG path
geometry and animation, Chart.js option names, and the two defaults that differ. Where a difference is a
*deliberate* one it is passed into the spec rather than hidden inside a renderer — `AxisLabels` picks
year-thinned labels for the SVG and plain dates for the email, and `maxPoints` is passed only on the SVG
side, which is what keeps email charts fixed at 30 points.

`SeriesDash` and `SeriesWeight` describe a series' emphasis rather than its pixels, so the spec never names
a dash array or a point radius. Each adapter maps them through its own table.

## Consequences

- **The spec must stay free of dialect vocabulary.** No SVG attributes, no Chart.js option names, no
  `borderDash` arrays. The moment one leaks in, the other adapter has to work around it and the seam stops
  paying for itself.
- **A new chart kind is a new spec builder plus two small mappings**, not two parallel implementations. A new
  *style* option is one field on `ChartSpec` and one line in each adapter.
- **The two renderers can no longer drift on content** — window, cap, colours, labels and Milestone
  visibility are computed once. They can still drift on appearance, which is the point.
- **The cost is a layer of indirection and a vocabulary to learn** (`ChartSpec`, `AxisLabels`, `SeriesDash`,
  `SeriesWeight`) before either renderer makes sense. Reading `svg-chart.ts` alone no longer tells you where
  its data came from.
- `charts.ts` now has a colocated `charts.test.ts`, so the `Config`-to-style projection and the
  per-repo history fallback are asserted directly rather than through the tracker.
- Where this bites is recorded in [`src/presentation/CLAUDE.md`](../../src/presentation/CLAUDE.md).
