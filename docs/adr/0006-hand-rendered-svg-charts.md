# 6. SVG charts are hand-rendered rather than drawn with a charting library

Date: 2026-07-26

## Status

Accepted. Its "the two renderers are independent" consequence was narrowed by
[ADR 0014](./0014-charts-are-built-as-a-spec-and-rendered-by-adapters.md): both now read one `ChartSpec`, so
neither can re-derive the window, colours, labels, titles or Milestones. They still differ where
[ADR 0010](./0010-quickchart-renders-the-email-charts.md) says they must — the point cap and the curve modes —
and on appearance, which is what this decision is about.

## Context

A Chart has to be a single self-contained SVG file that renders correctly embedded in a GitHub README and in any plain SVG viewer, and that follows the reader's light or dark preference without executing anything. Charting libraries assume a DOM or a canvas at render time and ship far more than this needs.

## Decision

The SVG is emitted directly, so the action carries no charting dependency, and the file carries its own stylesheet — which is the only reason theme adaptation is possible at all. The email path is deliberately not served by this renderer: mail clients do not reliably display inline SVG, so the HTML report embeds third-party QuickChart image URLs instead ([ADR 0010](./0010-quickchart-renders-the-email-charts.md)).

## Consequences

- Charts have two independent renderers, and a change to one does not change the other. The QuickChart path is a lower-fidelity approximation of the same options through Chart.js semantics.
- Everything a charting library normally provides — axis scaling, tick selection, curve interpolation, legends, label collision — is bespoke code that has to be maintained and tested here. Anything that looks like a rendering bug is ours.
