# 10. Email charts are rendered by QuickChart, not by our own SVG renderer

Date: 2026-07-26

## Status

Accepted. Its "the two renderers are independent" consequence was narrowed by
[ADR 0014](./0014-charts-are-built-as-a-spec-and-rendered-by-adapters.md): the window, colours, labels, titles
and Milestones are computed once and both adapters read them, so a change there changes both. The differences
this ADR records survive, and this ADR is the only place they are enumerated;
[ADR 0006](./0006-hand-rendered-svg-charts.md) defers to the list below rather than keeping its own copy.

> **Amended after this decision.** The list below gained a sixth difference, the Y-axis numbers, which the email
> printed in Chart.js's own locale without the list saying so. The email fill now follows `chart-line-color` in every
> hex form the input accepts, which the closing rule of that list requires. The request also names the Chart.js
> version its config is written for: QuickChart draws with Chart.js 2.9.4 unless told otherwise, and 2.9.4 reads
> none of `plugins.title`, `plugins.legend` and `scales.x`, so every email chart had lost its title, its legend
> settings and its axis settings.

## Context

Mail clients do not reliably display inline SVG, so the hand-written renderer that produces every Chart on the Data Branch ([ADR 0006](./0006-hand-rendered-svg-charts.md)) cannot serve the email Report. Three ways out were available:

- **Inline the SVG in the email**, the obvious choice, and the reason this decision is surprising. Gmail and Outlook strip or refuse inline SVG, so the chart simply disappears for most recipients.
- **Rasterise the SVG ourselves and attach it**, which needs a headless browser or a native rasteriser in the Action: a heavy dependency for a tool whose actual work takes seconds.
- **Omit charts from email entirely**, when the charts are the most valuable part of the digest.

## Decision

The HTML Report embeds `quickchart.io` image URLs built from a Chart.js config, which the reader's mail client fetches at open time.

## Consequences

- Charts have **two independent renderers** with different capabilities, and a change to one does not change the other. The QuickChart path is a deliberate lower-fidelity approximation, and this is the whole list of what it drops:
  1. It is fixed at 30 points regardless of `chart-max-points`, spread across the selected range rather than taken from the end, because `chartImageUrl` in [`src/presentation/chart.ts`](../../src/presentation/chart.ts) never passes `maxPoints` and `buildChartSpec` falls back to `CHART.maxDataPoints`.
  2. It collapses the `ChartCurve` types onto fewer Chart.js shapes: `CURVE_PROPS` maps `monotone` and `rounded-step` onto a monotone cubic interpolation and `catmull-rom` and `cubic-bezier` onto a plain smooth tension.
  3. It ignores `chart-animation`, because a PNG cannot animate. `chartImageUrl` has no `animate` parameter at all.
  4. It ignores `chart-y-axis-side`. `chartImageUrl` has no `yAxisSide` parameter, so the email chart's Y axis is always where Chart.js puts it.
  5. It labels the x-axis with plain dates where the SVG thins them to years, the `AxisLabels` choice [ADR 0014](./0014-charts-are-built-as-a-spec-and-rendered-by-adapters.md) records.
  6. It writes the Y-axis numbers in full (`12,000`) where the SVG compacts them (`12K`), because Chart.js picks the email's ticks and formats them itself. Both are in the Run's Locale: `chartImageUrl` sets Chart.js's `options.locale` to the Locale's Intl code.

  Everything else, including `chart-line-color` and `chart-line-width`, which Chart.js expresses exactly, must match the SVG renderer. A difference in an option or in content outside that list is a bug, not an expected approximation; how the two draw the same content may differ ([ADR 0014](./0014-charts-are-built-as-a-spec-and-rendered-by-adapters.md)).
- **The email charts cannot follow the reader's colour scheme.** A rasterised chart carries its background as pixels, so the `prefers-color-scheme` media query that makes the Data Branch charts theme-aware has nothing to act on. A recipient reading in dark mode sees a light chart pasted onto a body the mail client has darkened. `email-theme` is the escape hatch: it forces the palette baked into the QuickChart request and the HTML body independently of `chart-theme`, and defaults to inheriting it, but it is a choice made once for every recipient, not per reader.
- An unrelated third party receives a request, carrying the chart data in the query string, whenever a recipient opens the email.
- **The request pins Chart.js 4** (`v=` from `CHART.chartJsVersion`), the version the config is written for. QuickChart's own default is 2.9.4, whose options live elsewhere, and it would draw the chart while silently dropping the title, the legend settings and the axis settings. A Chart.js upgrade of the config moves that constant with it.
- If `quickchart.io` is down or blocked, email charts render as broken images while the Data Branch charts are unaffected. This is the only external service the action depends on besides GitHub itself, and the one dependency a self-hosted or air-gapped user cannot satisfy.
