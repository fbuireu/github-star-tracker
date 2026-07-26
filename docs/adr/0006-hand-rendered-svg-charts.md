# SVG charts are hand-rendered rather than drawn with a charting library

A Chart has to be a single self-contained SVG file that renders correctly embedded in a GitHub README and in any plain SVG viewer, and that follows the reader's light or dark preference without executing anything. Charting libraries assume a DOM or a canvas at render time and ship far more than this needs, so the SVG is emitted directly instead.

## Consequences

The action has no charting dependency, and theme adaptation is possible at all only because the SVG carries its own stylesheet.

The email path is deliberately not served by this renderer. Mail clients do not reliably display inline SVG, so the HTML report embeds third-party QuickChart image URLs instead — a lower-fidelity approximation of the same options through Chart.js semantics. Charts therefore have two independent renderers, and a change to one does not change the other.

In exchange, everything a charting library normally provides — axis scaling, tick selection, curve interpolation, legends, label collision — is bespoke code that has to be maintained and tested here. Anything that looks like a rendering bug is ours.
