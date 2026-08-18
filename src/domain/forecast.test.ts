import type { History } from '@domain/types';
import { describe, expect, it } from 'vitest';
import type { ForecastData } from './forecast';
import { computeForecast, ForecastMethod } from './forecast';

function expectForecast(result: ForecastData | null): ForecastData {
  expect(result).not.toBeNull();
  return result ?? { aggregate: { forecasts: [] }, repos: [] };
}

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

  it('fits a Top Repository to its own history, not to the aggregate lead-in', () => {
    const day = (index: number): string => new Date(Date.UTC(2020, 0, 1 + index)).toISOString();
    const young = 'user/young';
    const aggregate: History = {
      snapshots: Array.from({ length: 6 }, (_, index) => ({
        timestamp: day(index * 400),
        totalStars: index === 5 ? 300 : 0,
        repos: [{ fullName: young, name: 'young', owner: 'user', stars: index === 5 ? 300 : 0 }],
      })),
    };
    const own: History = {
      snapshots: Array.from({ length: 6 }, (_, index) => ({
        timestamp: day(2000 + index * 12),
        totalStars: index * 60,
        repos: [{ fullName: young, name: 'young', owner: 'user', stars: index * 60 }],
      })),
    };

    const fromAggregate = expectForecast(
      computeForecast({ history: aggregate, topRepoNames: [young] }),
    );
    const fromOwn = expectForecast(
      computeForecast({ history: aggregate, topRepoNames: [young], historyForRepo: () => own }),
    );

    const weekFour = (data: ForecastData): number => data.repos[0].forecasts[0].points[3].predicted;

    expect(weekFour(fromAggregate)).toBeLessThan(320);
    expect(weekFour(fromOwn)).toBeGreaterThan(400);
  });

  it('falls back to the aggregate when a repository has too little history of its own', () => {
    const history: History = {
      snapshots: [
        { timestamp: '2026-01-01', totalStars: 10, repos: [] },
        { timestamp: '2026-01-08', totalStars: 20, repos: [] },
        { timestamp: '2026-01-15', totalStars: 30, repos: [] },
      ],
    };
    const thin: History = { snapshots: [history.snapshots[0], history.snapshots[1]] };

    const withFallback = expectForecast(
      computeForecast({ history, topRepoNames: ['user/a'], historyForRepo: () => thin }),
    );
    const withoutHook = expectForecast(computeForecast({ history, topRepoNames: ['user/a'] }));

    expect(withFallback.repos[0]).toEqual(withoutHook.repos[0]);
  });
});
