import type { History } from '@domain/types';
import { describe, expect, it } from 'vitest';
import type { ForecastData, SeriesPoint } from './forecast';
import {
  computeForecast,
  ForecastMethod,
  linearRegression,
  weightedMovingAverage,
} from './forecast';

function expectForecast(result: ForecastData | null): ForecastData {
  expect(result).not.toBeNull();
  return result ?? { aggregate: { forecasts: [] }, repos: [] };
}

function series(values: number[], step = 1): SeriesPoint[] {
  return values.map((value, index) => ({ day: index * step, value }));
}

describe('linearRegression', () => {
  it('returns slope=0 for constant values', () => {
    const result = linearRegression(series([10, 10, 10, 10]));

    expect(result.slope).toBeCloseTo(0);
    expect(result.intercept).toBeCloseTo(10);
  });

  it('computes correct slope for linear growth', () => {
    const result = linearRegression(series([10, 20, 30, 40]));

    expect(result.slope).toBeCloseTo(10);
    expect(result.intercept).toBeCloseTo(10);
  });

  it('computes correct slope for decreasing values', () => {
    const result = linearRegression(series([40, 30, 20, 10]));

    expect(result.slope).toBeCloseTo(-10);
    expect(result.intercept).toBeCloseTo(40);
  });

  it('handles single value', () => {
    const result = linearRegression(series([42]));

    expect(result.slope).toBe(0);
    expect(result.intercept).toBe(42);
  });

  it('normalizes slope by real day spacing', () => {
    const result = linearRegression(series([10, 20, 30, 40], 10));

    expect(result.slope).toBeCloseTo(1);
    expect(result.intercept).toBeCloseTo(10);
  });
});

describe('weightedMovingAverage', () => {
  it('returns 0 for fewer than 2 values', () => {
    expect(weightedMovingAverage(series([10]))).toBe(0);
    expect(weightedMovingAverage(series([]))).toBe(0);
  });

  it('computes weighted average for constant deltas', () => {
    const result = weightedMovingAverage(series([10, 20, 30, 40]));

    expect(result).toBeCloseTo(10);
  });

  it('weights recent deltas more heavily (accelerating)', () => {
    const result = weightedMovingAverage(series([10, 11, 13, 18]));

    expect(result).toBeGreaterThan(2);
  });

  it('weights recent deltas more heavily (decelerating)', () => {
    const resultAccel = weightedMovingAverage(series([10, 20, 25, 26]));
    const resultConst = weightedMovingAverage(series([10, 14, 18, 22]));

    expect(resultAccel).toBeLessThan(resultConst);
  });

  it('normalizes the rate by real day spacing', () => {
    const result = weightedMovingAverage(series([10, 20, 30, 40], 10));

    expect(result).toBeCloseTo(1);
  });

  it('skips zero-duration intervals', () => {
    const result = weightedMovingAverage([
      { day: 0, value: 10 },
      { day: 0, value: 20 },
      { day: 1, value: 30 },
    ]);

    expect(result).toBeCloseTo(10);
  });
});

describe('computeForecast', () => {
  it('returns null with fewer than 3 snapshots', () => {
    const history: History = {
      snapshots: [
        { timestamp: '2026-01-01', totalStars: 10, repos: [] },
        { timestamp: '2026-01-08', totalStars: 20, repos: [] },
      ],
    };

    const result = computeForecast({ history, topRepoNames: [] });

    expect(result).toBeNull();
  });

  it('computes aggregate forecast with known linear data', () => {
    const history: History = {
      snapshots: [
        { timestamp: '2026-01-01', totalStars: 100, repos: [] },
        { timestamp: '2026-01-08', totalStars: 110, repos: [] },
        { timestamp: '2026-01-15', totalStars: 120, repos: [] },
      ],
    };

    const result = expectForecast(computeForecast({ history, topRepoNames: [] }));

    expect(result.aggregate.forecasts).toHaveLength(2);

    const lrForecast = result.aggregate.forecasts.find(
      (forecast) => forecast.method === ForecastMethod.LINEAR_REGRESSION,
    );
    expect(lrForecast).toBeDefined();
    expect(lrForecast?.points).toHaveLength(4);
    expect(lrForecast?.points[0].predicted).toBe(130);
    expect(lrForecast?.points[1].predicted).toBe(140);

    const wmaForecast = result.aggregate.forecasts.find(
      (forecast) => forecast.method === ForecastMethod.WEIGHTED_MOVING_AVERAGE,
    );
    expect(wmaForecast).toBeDefined();
    expect(wmaForecast?.points[0].predicted).toBe(130);
  });

  it('computes per-repo forecasts', () => {
    const history: History = {
      snapshots: [
        {
          timestamp: '2026-01-01',
          totalStars: 100,
          repos: [{ fullName: 'user/repo-a', name: 'repo-a', owner: 'user', stars: 50 }],
        },
        {
          timestamp: '2026-01-08',
          totalStars: 110,
          repos: [{ fullName: 'user/repo-a', name: 'repo-a', owner: 'user', stars: 55 }],
        },
        {
          timestamp: '2026-01-15',
          totalStars: 120,
          repos: [{ fullName: 'user/repo-a', name: 'repo-a', owner: 'user', stars: 60 }],
        },
      ],
    };

    const result = expectForecast(computeForecast({ history, topRepoNames: ['user/repo-a'] }));

    expect(result.repos).toHaveLength(1);
    expect(result.repos[0].repoFullName).toBe('user/repo-a');
    expect(result.repos[0].forecasts).toHaveLength(2);
  });

  it('handles repo missing from some snapshots', () => {
    const history: History = {
      snapshots: [
        {
          timestamp: '2026-01-01',
          totalStars: 100,
          repos: [{ fullName: 'user/repo-a', name: 'repo-a', owner: 'user', stars: 50 }],
        },
        {
          timestamp: '2026-01-08',
          totalStars: 110,
          repos: [],
        },
        {
          timestamp: '2026-01-15',
          totalStars: 120,
          repos: [{ fullName: 'user/repo-a', name: 'repo-a', owner: 'user', stars: 60 }],
        },
      ],
    };

    const result = expectForecast(computeForecast({ history, topRepoNames: ['user/repo-a'] }));
    expect(result.repos[0].forecasts).toHaveLength(2);
    for (const forecast of result.repos[0].forecasts) {
      for (const point of forecast.points) {
        expect(point.predicted).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('projects calendar weeks regardless of snapshot spacing (#143)', () => {
    const history: History = {
      snapshots: [
        { timestamp: '2026-01-01', totalStars: 100, repos: [] },
        { timestamp: '2026-01-29', totalStars: 380, repos: [] },
        { timestamp: '2026-02-26', totalStars: 660, repos: [] },
      ],
    };

    const result = expectForecast(computeForecast({ history, topRepoNames: [] }));

    for (const forecast of result.aggregate.forecasts) {
      expect(forecast.points[0].predicted).toBe(730);
      expect(forecast.points[3].predicted).toBe(940);
    }
  });

  it('clamps predictions to non-negative integers', () => {
    const history: History = {
      snapshots: [
        { timestamp: '2026-01-01', totalStars: 5, repos: [] },
        { timestamp: '2026-01-08', totalStars: 3, repos: [] },
        { timestamp: '2026-01-15', totalStars: 1, repos: [] },
      ],
    };

    const result = expectForecast(computeForecast({ history, topRepoNames: [] }));

    for (const forecast of result.aggregate.forecasts) {
      for (const point of forecast.points) {
        expect(point.predicted).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(point.predicted)).toBe(true);
      }
    }
  });
});
