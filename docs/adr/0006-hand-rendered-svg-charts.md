# 6. SVG charts are hand-rendered rather than drawn with a charting library

Date: 2026-07-26

## Status

Accepted.

## Context

A Chart has to be a single self-contained SVG file that renders correctly embedded in a GitHub README and in any plain SVG viewer, and that follows the reader's light or dark preference without executing anything. Charting libraries assume a DOM or a canvas at render time and ship far more than this needs.

## Decision

The SVG is emitted directly, so the action carries no charting dependency, and the file carries its own stylesheet — which is the only reason theme adaptation is possible at all. The email path is deliberately not served by this renderer: mail clients do not reliably display inline SVG, so the HTML report embeds third-party QuickChart image URLs instead ([ADR 0010](./0010-quickchart-renders-the-email-charts.md)).

## Consequences

- Charts have two independent renderers, and a change to one does not change the other. The QuickChart path is a lower-fidelity approximation of the same options through Chart.js semantics.
- Everything a charting library normally provides — axis scaling, tick selection, curve interpolation, legends, label collision — is bespoke code that has to be maintained and tested here. Anything that looks like a rendering bug is ours.
