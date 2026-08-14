# 10. Email charts are rendered by QuickChart, not by our own SVG renderer

Date: 2026-07-26

## Status

Accepted.

## Context

Mail clients do not reliably display inline SVG, so the hand-written renderer that produces every Chart on the Data Branch ([ADR 0006](./0006-hand-rendered-svg-charts.md)) cannot serve the email Report. Three ways out were available:

- **Inline the SVG in the email** — the obvious choice, and the reason this decision is surprising. Gmail and Outlook strip or refuse inline SVG, so the chart simply disappears for most recipients.
- **Rasterise the SVG ourselves and attach it** — needs a headless browser or a native rasteriser in the Action, which is a heavy dependency for a tool whose actual work takes seconds.
- **Omit charts from email entirely** — the charts are the most valuable part of the digest.

## Decision

The HTML Report embeds `quickchart.io` image URLs built from a Chart.js config, which the reader's mail client fetches at open time.

## Consequences

- Charts have **two independent renderers** with different capabilities, and a change to one does not change the other. The QuickChart path is a deliberate lower-fidelity approximation, and this is the whole list of what it drops: it is fixed at 30 points regardless of `chart-max-points` (spread across the selected range, not taken from the end), it collapses the four curve types onto two Chart.js modes, it ignores `chart-animation` because a PNG cannot animate, and it ignores `chart-y-axis-side`. Everything else — including `chart-line-color` and `chart-line-width`, which Chart.js expresses exactly — must match the SVG renderer. A rendering difference outside that list is a bug, not an expected approximation.
- **The email charts cannot follow the reader's colour scheme.** A rasterised chart carries its background as pixels, so the `prefers-color-scheme` media query that makes the Data Branch charts theme-aware has nothing to act on. A recipient reading in dark mode sees a light chart pasted onto a body the mail client has darkened. `email-theme` is the escape hatch — it forces the palette baked into the QuickChart request and the HTML body independently of `chart-theme`, and defaults to inheriting it — but it is a choice made once for every recipient, not per reader.
- An unrelated third party receives a request, carrying the chart data in the query string, whenever a recipient opens the email.
- If `quickchart.io` is down or blocked, email charts render as broken images while the Data Branch charts are unaffected. This is the only external service the action depends on besides GitHub itself, and the one dependency a self-hosted or air-gapped user cannot satisfy.
