import { describe, expect, it } from 'vitest';
import type { History } from './types';
import { computeVelocity } from './velocity';

const makeHistory = (points: { day: number; totalStars: number }[]): History => ({
  snapshots: points.map(({ day, totalStars }) => ({
    timestamp: new Date(2025, 0, 1 + day).toISOString(),
    totalStars,
    repos: [],
  })),
});

describe('computeVelocity', () => {
  const HOUR_MS = 3_600_000;

  it('ignores a pair closer together than the minimum rate interval', () => {
    const base = Date.UTC(2026, 0, 10);
    const history: History = {
      snapshots: [
        { timestamp: new Date(base).toISOString(), totalStars: 1000, repos: [] },
        { timestamp: new Date(base + 2 * HOUR_MS).toISOString(), totalStars: 1001, repos: [] },
      ],
    };

    expect(computeVelocity({ history })).toBeNull();
  });

  it('falls back to the newest snapshot far enough back instead of the adjacent one', () => {
    const base = Date.UTC(2026, 0, 10);
    const history: History = {
      snapshots: [
        { timestamp: new Date(base).toISOString(), totalStars: 1000, repos: [] },
        { timestamp: new Date(base + 24 * HOUR_MS).toISOString(), totalStars: 1010, repos: [] },
        { timestamp: new Date(base + 25 * HOUR_MS).toISOString(), totalStars: 1011, repos: [] },
      ],
    };

    const velocity = computeVelocity({ history });

    expect(velocity?.starsPerDay).toBeCloseTo(10.56, 2);
  });

  it('returns null instead of NaN when a timestamp is unparseable', () => {
    const history: History = {
      snapshots: [
        { timestamp: 'not-a-date', totalStars: 100, repos: [] },
        { timestamp: '2026-01-08T00:00:00Z', totalStars: 150, repos: [] },
      ],
    };

    expect(computeVelocity({ history })).toBeNull();
  });

  it('returns null with fewer than two snapshots', () => {
    expect(computeVelocity({ history: { snapshots: [] } })).toBeNull();
    expect(computeVelocity({ history: makeHistory([{ day: 0, totalStars: 100 }]) })).toBeNull();
  });

  it('returns null when no time has elapsed', () => {
    const history = makeHistory([
      { day: 0, totalStars: 100 },
      { day: 0, totalStars: 120 },
    ]);

    expect(computeVelocity({ history })).toBeNull();
  });

  it('computes stars per day and growth percent', () => {
    const history = makeHistory([
      { day: 0, totalStars: 100 },
      { day: 10, totalStars: 200 },
    ]);

    const result = computeVelocity({ history });

    expect(result?.starsPerDay).toBe(10);
    expect(result?.growthPercent).toBe(100);
  });

  it('measures growth over the latest period, not the all-time baseline', () => {
    const history = makeHistory([
      { day: 0, totalStars: 1 },
      { day: 100, totalStars: 40_000 },
      { day: 107, totalStars: 40_500 },
    ]);

    const result = computeVelocity({ history });

    expect(result?.starsPerDay).toBeCloseTo(71.43, 2);
    expect(result?.growthPercent).toBeCloseTo(1.3, 1);
  });

  it('uses only the two most recent snapshots', () => {
    const history = makeHistory([
      { day: 0, totalStars: 100 },
      { day: 5, totalStars: 1_000 },
      { day: 15, totalStars: 1_100 },
    ]);

    const result = computeVelocity({ history });

    expect(result?.starsPerDay).toBe(10);
    expect(result?.growthPercent).toBe(10);
  });

  it('projects days to the next milestone', () => {
    const history = makeHistory([
      { day: 0, totalStars: 400 },
      { day: 10, totalStars: 450 },
    ]);

    const result = computeVelocity({ history });

    expect(result?.nextMilestone).toBe(500);
    expect(result?.daysToNextMilestone).toBe(10);
  });

  it('omits the projection when there is no growth', () => {
    const history = makeHistory([
      { day: 0, totalStars: 400 },
      { day: 10, totalStars: 400 },
    ]);

    const result = computeVelocity({ history });

    expect(result?.starsPerDay).toBe(0);
    expect(result?.daysToNextMilestone).toBeNull();
  });

  it('omits growth percent when the baseline is zero', () => {
    const history = makeHistory([
      { day: 0, totalStars: 0 },
      { day: 10, totalStars: 50 },
    ]);

    const result = computeVelocity({ history });

    expect(result?.growthPercent).toBeNull();
  });

  it('returns null when the newest snapshot is the unparseable one', () => {
    const history: History = {
      snapshots: [
        { timestamp: '2026-01-01T00:00:00Z', totalStars: 100, repos: [] },
        { timestamp: '2026-01-11T00:00:00Z', totalStars: 200, repos: [] },
        { timestamp: 'not-a-date', totalStars: 300, repos: [] },
      ],
    };

    expect(computeVelocity({ history })).toBeNull();
  });
});
