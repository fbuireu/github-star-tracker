import type { History } from '@domain/types';
import { describe, expect, it } from 'vitest';
import type { ForecastData } from './forecast';
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

describe('linearRegression', () => {
  it('returns slope=0 for constant values', () => {
    const result = linearRegression([10, 10, 10, 10]);
    expect(result.slope).toBeCloseTo(0);
    expect(result.intercept).toBeCloseTo(10);
  });

  it('computes correct slope for linear growth', () => {
    const result = linearRegression([10, 20, 30, 40]);
    expect(result.slope).toBeCloseTo(10);
    expect(result.intercept).toBeCloseTo(10);
  });

  it('computes correct slope for decreasing values', () => {
    const result = linearRegression([40, 30, 20, 10]);
    expect(result.slope).toBeCloseTo(-10);
    expect(result.intercept).toBeCloseTo(40);
  });

  it('handles single value', () => {
    const result = linearRegression([42]);
    expect(result.slope).toBe(0);
    expect(result.intercept).toBe(42);
  });
});

describe('weightedMovingAverage', () => {
  it('returns 0 for fewer than 2 values', () => {
    expect(weightedMovingAverage([10])).toBe(0);
    expect(weightedMovingAverage([])).toBe(0);
  });

  it('computes weighted average for constant deltas', () => {
    const result = weightedMovingAverage([10, 20, 30, 40]);
    expect(result).toBeCloseTo(10);
  });

  it('weights recent deltas more heavily (accelerating)', () => {
    const result = weightedMovingAverage([10, 11, 13, 18]);
    expect(result).toBeGreaterThan(2);
  });

  it('weights recent deltas more heavily (decelerating)', () => {
    const resultAccel = weightedMovingAverage([10, 20, 25, 26]);
    const resultConst = weightedMovingAverage([10, 14, 18, 22]);
    expect(resultAccel).toBeLessThan(resultConst);
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
      (f) => f.method === ForecastMethod.LINEAR_REGRESSION,
    );
    expect(lrForecast).toBeDefined();
    expect(lrForecast?.points).toHaveLength(4);
    expect(lrForecast?.points[0].predicted).toBe(130);
    expect(lrForecast?.points[1].predicted).toBe(140);

    const wmaForecast = result.aggregate.forecasts.find(
      (f) => f.method === ForecastMethod.WEIGHTED_MOVING_AVERAGE,
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
