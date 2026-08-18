import { ChartCurve, type Config } from '@config/types';
import { EMPTY_SUMMARY } from '@domain/comparison';
import type { ForecastData } from '@domain/forecast';
import { ForecastMethod } from '@domain/forecast';
import { deltaIndicator } from '@domain/formatting';
import type { StargazerDiffResult } from '@domain/stargazers';
import { getTranslations } from '@i18n';
import {
  makeComparisonResults,
  makeConfig,
  makeMultiRepoHistory,
  makeRepoResult,
} from '@shared/tests';
import { describe, expect, it } from 'vitest';
import type { ChartHistories } from './charts';
import { generateCsvReport } from './csv';
import { renderEmptyRun, renderRun } from './run';

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

  it('stamps both footers from the same clock read', () => {
    const rendered = render();
    const stampIn = (report: string): string | undefined =>
      report.match(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/)?.[0];

    expect(stampIn(rendered.markdown)).toBeDefined();
    expect(stampIn(rendered.markdown)).toBe(stampIn(rendered.html));
  });

  it('dates the header and the footer from that one read, so they cannot straddle midnight', () => {
    const now = new Date('2026-03-04T23:59:59.999Z');
    const rendered = renderRun({
      config: makeConfig({ includeCharts: true, topRepos: 2 }),
      results: makeComparisonResults(),
      previousTimestamp: '2026-01-01T00:00:00Z',
      chartHistories: chartHistories(),
      storedHistory: STORED,
      forecastData: null,
      now,
    });

    for (const report of [rendered.markdown, rendered.html]) {
      expect(report).toContain('2026-03-04T23:59:59.999Z');
      expect(report).toContain('2026-03-04');
      expect(report).not.toContain('2026-03-05');
    }
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

  it('draws the per-repo email chart from that repo, not from the aggregate', () => {
    const config = makeConfig({ includeCharts: true, topRepos: 2 });
    const params = {
      config,
      results: makeComparisonResults(),
      previousTimestamp: '2026-01-01T00:00:00Z',
      storedHistory: STORED,
      forecastData: null,
      now: new Date('2026-03-04T12:00:00Z'),
    };
    const shared = renderRun({ ...params, chartHistories: chartHistories() });
    const perRepo = renderRun({
      ...params,
      chartHistories: { aggregate: RECONSTRUCTED, forRepo: () => STORED },
    });

    expect(perRepo.html).not.toBe(shared.html);
  });

  it('never links a per-repo Chart the run did not draw', () => {
    const rendered = renderRun({
      config: makeConfig({ includeCharts: true, topRepos: 2 }),
      results: makeComparisonResults(),
      previousTimestamp: '2026-01-01T00:00:00Z',
      chartHistories: { aggregate: RECONSTRUCTED, forRepo: () => ({ snapshots: [] }) },
      storedHistory: STORED,
      forecastData: null,
    });
    const drawn = rendered.charts.map((chart) => chart.filename);

    expect(drawn).not.toContain('user-repo-a.svg');
    expect(rendered.markdown).toContain('star-history.svg');
    expect(rendered.markdown).not.toContain('user-repo-a.svg');
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

describe('the two Report dialects stay in step', () => {
  const t = getTranslations('en');
  const stargazerDiff: StargazerDiffResult = {
    totalNew: 1,
    entries: [
      {
        repoFullName: 'user/repo-a',
        newStargazers: [
          { login: 'ada', avatarUrl: '', profileUrl: '', starredAt: '2026-01-02T00:00:00Z' },
        ],
      },
    ],
  };
  const forecastData: ForecastData = {
    aggregate: {
      forecasts: [
        { method: ForecastMethod.LINEAR_REGRESSION, points: [{ weekOffset: 1, predicted: 70 }] },
        {
          method: ForecastMethod.WEIGHTED_MOVING_AVERAGE,
          points: [{ weekOffset: 1, predicted: 68 }],
        },
      ],
    },
    repos: [],
  };
  const withRemoved = makeComparisonResults({
    repos: [
      makeRepoResult('kept', { current: 60, delta: 10 }),
      makeRepoResult('fresh', { current: 7, previous: null, isNew: true }),
      makeRepoResult('gone', { current: 0, previous: 3, delta: -3, isRemoved: true }),
    ],
  });

  const SECTIONS = [
    { name: 'new repositories', heading: t.report.newRepositories, results: withRemoved },
    { name: 'removed repositories', heading: t.report.removedRepositories, results: withRemoved },
    { name: 'star trend', heading: t.report.starTrend },
    { name: 'comparison chart', heading: t.report.byRepository },
    { name: 'per-repo charts', heading: t.report.individualRepoCharts },
    { name: 'stargazers', heading: t.stargazers.sectionTitle, stargazerDiff },
    { name: 'forecast', heading: t.forecast.sectionTitle, forecastData },
    {
      name: 'velocity',
      heading: t.velocity.sectionTitle,
      config: makeConfig({ includeCharts: true, topRepos: 2, velocityMetrics: true }),
    },
  ];

  it.each(SECTIONS)(
    'renders the $name section in both the markdown and the HTML report',
    ({ heading, results, stargazerDiff: diff, forecastData: forecast, config }) => {
      const rendered = renderRun({
        config: config ?? makeConfig({ includeCharts: true, topRepos: 2 }),
        results: results ?? makeComparisonResults(),
        previousTimestamp: '2026-01-01T00:00:00Z',
        chartHistories: chartHistories(),
        storedHistory: STORED,
        stargazerDiff: diff,
        forecastData: forecast ?? null,
      });

      expect(rendered.markdown).toContain(heading);
      expect(rendered.html).toContain(heading);
    },
  );

  it('omits every optional section from both when the model says it is absent', () => {
    const rendered = renderRun({
      config: makeConfig({ includeCharts: false }),
      results: makeComparisonResults(),
      previousTimestamp: '2026-01-01T00:00:00Z',
      chartHistories: chartHistories({ snapshots: [] }),
      storedHistory: { snapshots: [] },
      forecastData: null,
    });

    for (const heading of [
      t.report.starTrend,
      t.stargazers.sectionTitle,
      t.forecast.sectionTitle,
      t.velocity.sectionTitle,
    ]) {
      expect(rendered.markdown).not.toContain(heading);
      expect(rendered.html).not.toContain(heading);
    }
  });
});

describe('renderEmptyRun', () => {
  it('says why there is nothing to report, in the run locale', () => {
    const english = renderEmptyRun(makeConfig());
    const spanish = renderEmptyRun(makeConfig({ locale: 'es' }));

    expect(english.markdown).toBe(getTranslations('en').report.noRepositories);
    expect(spanish.markdown).toBe(getTranslations('es').report.noRepositories);
    expect(english.html).toContain(getTranslations('en').report.noRepositories);
  });

  it('emits a CSV header, so report-csv has one shape on every path', () => {
    expect(renderEmptyRun(makeConfig()).csv).toBe(
      generateCsvReport({ repos: [], summary: EMPTY_SUMMARY }),
    );
  });

  it('draws no charts and a zero badge', () => {
    const rendered = renderEmptyRun(makeConfig());

    expect(rendered.charts).toEqual([]);
    expect(rendered.badge).toContain('<svg');
  });
});

describe('the Notification subject', () => {
  it('carries the total and the signed delta', () => {
    const { summary } = makeComparisonResults();
    const rendered = render();

    expect(rendered.emailSubject).toContain(getTranslations('en').email.subject);
    expect(rendered.emailSubject).toContain(String(summary.totalStars));
    expect(rendered.emailSubject).toContain(deltaIndicator(summary.totalDelta));
  });

  it('follows the run locale', () => {
    const spanish = renderRun({
      config: makeConfig({ includeCharts: true, locale: 'es' }),
      results: makeComparisonResults(),
      previousTimestamp: '2026-01-01T00:00:00Z',
      chartHistories: chartHistories(),
      storedHistory: STORED,
      forecastData: null,
    });

    expect(spanish.emailSubject).toContain(getTranslations('es').email.subject);
    expect(spanish.emailSubject).not.toContain(getTranslations('en').email.subject);
  });
});

describe('both chart systems honour the options they share', () => {
  const SHARED_OPTIONS: { name: string; changed: Partial<Config> }[] = [
    { name: 'chart-smoothing', changed: { chartSmoothing: false } },
    { name: 'chart-curve', changed: { chartCurve: ChartCurve.CATMULL_ROM } },
    { name: 'chart-show-points', changed: { chartShowPoints: false } },
    { name: 'chart-begin-at-zero', changed: { chartBeginAtZero: true } },
    { name: 'chart-line-width', changed: { chartLineWidth: 7 } },
    { name: 'chart-line-color', changed: { chartLineColor: '#6b63ff' } },
  ];

  function outputs(overrides: Partial<Config>) {
    const rendered = renderRun({
      config: makeConfig({ includeCharts: true, topRepos: 1, ...overrides }),
      results: makeComparisonResults(),
      previousTimestamp: '2026-01-01T00:00:00Z',
      chartHistories: chartHistories(),
      storedHistory: STORED,
      forecastData: null,
    });

    return {
      svg: rendered.charts.map((chart) => chart.svg).join(''),
      email: [...rendered.html.matchAll(/quickchart\.io\/chart\?[^"]+/g)]
        .map((match) => decodeURIComponent(match[0]))
        .join(''),
    };
  }

  it.each(SHARED_OPTIONS)(
    '$name reaches the data-branch SVG and the email chart alike',
    ({ changed }) => {
      const base = outputs({});
      const altered = outputs(changed);

      expect(altered.svg).not.toBe(base.svg);
      expect(altered.email).not.toBe(base.email);
    },
  );

  it('collapses rounded-step onto monotone for email, and only for email', () => {
    const monotone = outputs({ chartCurve: ChartCurve.MONOTONE });
    const roundedStep = outputs({ chartCurve: ChartCurve.ROUNDED_STEP });

    expect(roundedStep.svg).not.toBe(monotone.svg);
    expect(roundedStep.email).toBe(monotone.email);
  });
});
