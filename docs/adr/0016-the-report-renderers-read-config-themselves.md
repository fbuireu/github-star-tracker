# 16. The report renderers read Config themselves

Date: 2026-08-17

## Status

Accepted

## Context

`@application/tracker` built a 21-field object literal and handed it to both Report renderers:

```ts
const reportParams = { results, previousTimestamp, locale: config.locale, /* …18 more… */ };
const markdownReport = generateMarkdownReport(reportParams);
const htmlReport = generateHtmlReport({ ...reportParams, theme: config.emailTheme });
```

Fifteen of those fields were `config.<something>` copied across by hand, eleven of them chart style. The
orchestrator therefore had to know what a curve, a Milestone and a trend line were in order to relay them,
and the git history shows the cost plainly: `chart-show-points`, `chart-animation`, `chart-milestones`,
`chart-range`, `chart-trend-line`, `chart-curve` and `chart-line-color`/`chart-line-width` each arrived as a
`feat:` commit that edited `tracker.ts` — a file with no stake in any of them. `tracker.ts` is the most
churned source file in the repository.

Two defects came out of the same shape. `ReportParams` declared ten fields and `GenerateHtmlReportParams`
twenty-one, so the split was real at the declaration — but `reportParams` was a *variable*, which switches
off TypeScript's excess-property check, so the markdown renderer silently accepted and discarded eleven
chart-style fields it does not read. The whole guarantee rested on one spread on one line, and
`src/application/CLAUDE.md` had to carry a written warning naming it as the regression to watch for. It had
already happened once, leaving dark-mode readers a white chart background.

`@presentation/charts` was already doing the opposite thing, and doing it well: `buildChartFiles({ config,
… })` takes the whole `Config` and projects the style itself. So the layer had two conventions for the same
job, and only one of them made a new chart option free.

Widening `ReportParams` further, or generating the projection, were the alternatives. Both keep the
orchestrator in the business of relaying options it does not understand.

## Decision

`ReportParams` carries the run's data plus the `Config` it was produced under:

```ts
export interface ReportParams {
  config: Config;
  results: ComparisonResults;
  previousTimestamp: string | null;
  history?: History | null;
  velocityHistory?: History | null;
  stargazerDiff?: StargazerDiffResult | null;
  forecastData?: ForecastData | null;
}
```

`locale`, `includeCharts`, `topRepos` and `velocityMetrics` are read off `config` inside `buildReportModel`.
The email chart style is projected inside `html.ts` by `emailChartStyle(config)`, which is also where
`emailTheme` is read — so the Notification picks its own theme rather than being handed one.

`GenerateHtmlReportParams` and the flattened `EmailChartStyle` fields are gone. **Both renderers now take the
same type**, so `tracker.ts` passes one object to both with no spread, and the excess-property hole closes
because there is nothing left to spread.

`@presentation` importing `@config/types` is not new — `shared.ts` already did, and
[ADR 0004](./0004-layered-source-structure.md) permits it. What is new is that it imports `Config` whole
rather than the enums alone.

## Consequences

- **A new chart option costs zero edits in `@application`.** Add the input, add the `Config` field, read it
  in the renderer that needs it. The orchestrator never learns the option exists.
- **The two renderers can no longer be given different data.** They take one type; the only remaining
  difference is which `Config` fields each chooses to read. `generateMarkdownReport` reads no chart style at
  all, which is what "markdown has no use for chart styling" always meant.
- **`emailTheme` vs `chartTheme` is now a presentation rule, tested in `html.test.ts`** against the rendered
  `color-scheme` and palette, rather than in `tracker.test.ts` against the shape of a mock call. The tracker
  test that pinned `theme` on a params object it did not read is gone.
- **`@presentation` now depends on the whole `Config` shape**, not on a hand-picked subset. That is the cost:
  a renderer's interface no longer states which options it honours, so the layer's `CLAUDE.md` has to. In
  exchange the shell stops restating a list that was wrong the moment anyone added to it.
- **Test helpers take `config: Partial<Config>`** and build it with `makeConfig` from `@shared/tests`, so a
  test that cares about one option names that option rather than a flattened alias for it.
- `chartLineWidth` now always reaches `chartImageUrl`, so the email chart always emits `borderWidth`. That
  was already true in production — the tracker always passed it — but `html.test.ts` had a case asserting
  its absence, which only an incomplete params object could produce.
- Where this bites is recorded in [`src/presentation/CLAUDE.md`](../../src/presentation/CLAUDE.md) and
  [`src/application/CLAUDE.md`](../../src/application/CLAUDE.md).
