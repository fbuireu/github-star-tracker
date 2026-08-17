import { makeComparisonResults, makeConfig, makeMultiRepoHistory } from '@shared/tests';
import { describe, expect, it } from 'vitest';
import type { ChartHistories } from './charts';
import { renderRun } from './run';

const STORED = makeMultiRepoHistory(
  [
    { 'user/repo-a': 10, 'user/repo-b': 5 },
    { 'user/repo-a': 60, 'user/repo-b': 40 },
  ],
  { stepDays: 10 },
);

const RECONSTRUCTED = makeMultiRepoHistory(
  [
    { 'user/repo-a': 20, 'user/repo-b': 10 },
    { 'user/repo-a': 40, 'user/repo-b': 20 },
    { 'user/repo-a': 60, 'user/repo-b': 40 },
  ],
  { stepDays: 1 },
);

function chartHistories(aggregate = RECONSTRUCTED): ChartHistories {
  return { aggregate, forRepo: () => aggregate };
}

function render(config = makeConfig({ includeCharts: true, topRepos: 2 })) {
  return renderRun({
    config,
    results: makeComparisonResults(),
    previousTimestamp: '2026-01-01T00:00:00Z',
    chartHistories: chartHistories(),
    storedHistory: STORED,
    forecastData: null,
  });
}

describe('renderRun', () => {
  it('returns every artefact a run publishes', () => {
    const rendered = render();

    expect(rendered.markdown).toContain('#');
    expect(rendered.html).toContain('<!DOCTYPE html>');
    expect(rendered.csv).toContain('repository');
    expect(rendered.badge).toContain('<svg');
    expect(rendered.charts.length).toBeGreaterThan(0);
  });

  it('dates the two Reports identically, because both read one model', () => {
    const rendered = render();
    const dateIn = (report: string): string | undefined => report.match(/\d{4}-\d{2}-\d{2}/)?.[0];

    expect(dateIn(rendered.markdown)).toBe(dateIn(rendered.html));
  });

  it('measures Velocity from the stored history, never from the chart history', () => {
    const config = makeConfig({ includeCharts: true, velocityMetrics: true });
    const fromStored = renderRun({
      config,
      results: makeComparisonResults(),
      previousTimestamp: '2026-01-01T00:00:00Z',
      chartHistories: chartHistories(),
      storedHistory: STORED,
      forecastData: null,
    });
    const asIfItUsedTheChartHistory = renderRun({
      config,
      results: makeComparisonResults(),
      previousTimestamp: '2026-01-01T00:00:00Z',
      chartHistories: chartHistories(),
      storedHistory: RECONSTRUCTED,
      forecastData: null,
    });

    expect(fromStored.markdown).toContain('Growth Velocity');
    expect(fromStored.markdown).not.toBe(asIfItUsedTheChartHistory.markdown);
  });

  it('charts exactly the Top Repositories the Report names, with no list passed in', () => {
    const rendered = render(makeConfig({ includeCharts: true, topRepos: 1 }));
    const perRepoCharts = rendered.charts
      .map((chart) => chart.filename)
      .filter((filename) => filename.startsWith('user-'));

    expect(perRepoCharts).toHaveLength(1);
    expect(rendered.markdown).toContain(perRepoCharts[0]);
  });

  it('agrees between the two Reports on whether the comparison Chart appears', () => {
    const withTopRepos = render();
    const withoutTopRepos = renderRun({
      config: makeConfig({ includeCharts: true, topRepos: 2 }),
      results: makeComparisonResults({ repos: [] }),
      previousTimestamp: '2026-01-01T00:00:00Z',
      chartHistories: chartHistories(),
      storedHistory: STORED,
      forecastData: null,
    });

    expect(withTopRepos.markdown).toContain('comparison.svg');
    expect(withTopRepos.html).toContain('quickchart.io');
    expect(withoutTopRepos.markdown).not.toContain('comparison.svg');
    expect(withoutTopRepos.charts.map((chart) => chart.filename)).not.toContain('comparison.svg');
  });

  it('produces no charts when they are turned off', () => {
    expect(render(makeConfig({ includeCharts: false })).charts).toEqual([]);
  });
});
