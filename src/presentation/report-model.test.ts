import { FORECAST_WEEKS } from '@domain/constants';
import type { ForecastData } from '@domain/forecast';
import { ForecastMethod } from '@domain/forecast';
import type { StargazerDiffResult } from '@domain/stargazers';
import { getTranslations } from '@i18n';
import { makeComparisonResults, makeHistory, makeRepoResult } from '@shared/tests';
import { describe, expect, it } from 'vitest';
import { buildForecastTable, buildReportModel, StargazerOutcome } from './report-model';
import type { ReportParams } from './shared';

const forecastData: ForecastData = {
  aggregate: {
    forecasts: [
      { method: ForecastMethod.LINEAR_REGRESSION, points: [{ weekOffset: 1, predicted: 160 }] },
      {
        method: ForecastMethod.WEIGHTED_MOVING_AVERAGE,
        points: [{ weekOffset: 1, predicted: 155 }],
      },
    ],
  },
  repos: [],
};

function modelOf(overrides: Partial<ReportParams> = {}) {
  return buildReportModel({
    results: makeComparisonResults(),
    previousTimestamp: '2026-01-01T00:00:00Z',
    locale: 'en',
    ...overrides,
  });
}

describe('buildReportModel', () => {
  describe('run identity', () => {
    it('dates the run and the baseline it is measured against', () => {
      const model = modelOf();

      expect(model.prev).toBe('2026-01-01');
      expect(model.now).toBe(new Date().toISOString().split('T')[0]);
      expect(model.isFirstRun).toBe(false);
    });

    it('marks a missing baseline as the first run', () => {
      const model = modelOf({ previousTimestamp: null });

      expect(model.isFirstRun).toBe(true);
      expect(model.prev).toBe(getTranslations('en').report.firstRun);
    });
  });

  describe('Top Repositories', () => {
    const results = makeComparisonResults({
      repos: [
        makeRepoResult('small', { current: 5 }),
        makeRepoResult('large', { current: 90 }),
        makeRepoResult('gone', { current: 0, isRemoved: true }),
        makeRepoResult('middling', { current: 40 }),
      ],
    });

    it('ranks by Star Count and drops Removed Repositories', () => {
      const model = modelOf({ results });

      expect(model.sorted.map((repo) => repo.name)).toEqual(['large', 'middling', 'small']);
      expect(model.topRepos).toEqual(['user/large', 'user/middling', 'user/small']);
      expect(model.removedRepos.map((repo) => repo.name)).toEqual(['gone']);
    });

    it('cuts the set at the requested limit', () => {
      expect(modelOf({ results, topRepos: 2 }).topRepos).toEqual(['user/large', 'user/middling']);
    });

    it('does not reorder the results it was handed', () => {
      const names = results.repos.map((repo) => repo.name);
      modelOf({ results });

      expect(results.repos.map((repo) => repo.name)).toEqual(names);
    });
  });

  describe('chart history', () => {
    it('is plottable only with charts on and at least two snapshots', () => {
      const history = makeHistory([10, 20]);
      const outcomes = [
        modelOf({ history, includeCharts: true }),
        modelOf({ history, includeCharts: false }),
        modelOf({ history: makeHistory([10]), includeCharts: true }),
        modelOf({ history: null, includeCharts: true }),
      ].map((model) => [model.hasChartHistory, model.chartHistory]);

      expect(outcomes).toEqual([
        [true, history],
        [false, null],
        [false, null],
        [false, null],
      ]);
    });
  });

  describe('Stargazers', () => {
    const entry = {
      repoFullName: 'user/repo-a',
      newStargazers: [
        { login: 'ada', avatarUrl: '', profileUrl: '', starredAt: '2026-01-02T00:00:00Z' },
      ],
    };

    it('omits the section entirely when tracking is off', () => {
      expect(modelOf().stargazers).toBeNull();
      expect(modelOf({ stargazerDiff: null }).stargazers).toBeNull();
    });

    it('reports NEW when anything arrived and NONE when nothing did', () => {
      const withNew = modelOf({
        stargazerDiff: { entries: [entry], totalNew: 1 } satisfies StargazerDiffResult,
      });
      const withNone = modelOf({ stargazerDiff: { entries: [], totalNew: 0 } });

      expect(withNew.stargazers).toEqual({
        outcome: StargazerOutcome.NEW,
        totalNew: 1,
        entries: [entry],
        sampledRepos: [],
      });
      expect(withNone.stargazers?.outcome).toBe(StargazerOutcome.NONE);
    });

    it('carries the Sampled Repositories through', () => {
      const model = modelOf({
        stargazerDiff: { entries: [], totalNew: 0, sampledRepos: ['user/huge'] },
      });

      expect(model.stargazers?.sampledRepos).toEqual(['user/huge']);
    });
  });

  describe('Velocity', () => {
    const velocityHistory = makeHistory([100, 200]);

    it('is absent unless the metrics are enabled and a stored history is supplied', () => {
      expect(modelOf({ velocityHistory }).velocity).toBeNull();
      expect(modelOf({ velocityMetrics: true }).velocity).toBeNull();
      expect(modelOf({ velocityMetrics: true, velocityHistory }).velocity).not.toBeNull();
    });

    it('resolves the projection to a single present-or-absent value', () => {
      const model = modelOf({ velocityMetrics: true, velocityHistory });

      expect(model.velocity).toMatchObject({
        starsPerDay: expect.any(Number),
        growthPercent: 100,
        projection: { days: expect.any(Number), milestone: expect.any(Number) },
      });
    });

    it('nests under the forecast only when there is a forecast', () => {
      expect(modelOf().velocityIsNested).toBe(false);
      expect(modelOf({ forecastData }).velocityIsNested).toBe(true);
    });
  });
});

describe('buildForecastTable', () => {
  it('names every Forecast Method and always spans the full horizon', () => {
    const t = getTranslations('en');
    const table = buildForecastTable({
      title: 'Aggregate',
      forecasts: forecastData.aggregate.forecasts,
      t,
    });

    expect(table.title).toBe('Aggregate');
    expect(table.weekHeaders).toHaveLength(FORECAST_WEEKS);
    expect(table.rows).toEqual([
      { method: t.forecast.linearRegression, predicted: [160] },
      { method: t.forecast.weightedMovingAverage, predicted: [155] },
    ]);
  });
});
