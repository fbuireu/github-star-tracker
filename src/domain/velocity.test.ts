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
});
