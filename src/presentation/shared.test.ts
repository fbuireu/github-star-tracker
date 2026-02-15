import type { ComparisonResults } from '@domain/types';
import { describe, expect, it, vi } from 'vitest';
import { prepareReportData } from './shared';

function makeResults(overrides: Partial<ComparisonResults> = {}): ComparisonResults {
  return {
    repos: [
      {
        name: 'repo-a',
        fullName: 'user/repo-a',
        owner: 'user',
        current: 15,
        previous: 10,
        delta: 5,
        isNew: false,
        isRemoved: false,
      },
      {
        name: 'repo-b',
        fullName: 'user/repo-b',
        owner: 'user',
        current: 8,
        previous: 10,
        delta: -2,
        isNew: false,
        isRemoved: false,
      },
      {
        name: 'repo-c',
        fullName: 'user/repo-c',
        owner: 'user',
        current: 0,
        previous: 3,
        delta: -3,
        isNew: false,
        isRemoved: true,
      },
      {
        name: 'repo-d',
        fullName: 'user/repo-d',
        owner: 'user',
        current: 5,
        previous: null,
        delta: 5,
        isNew: true,
        isRemoved: false,
      },
    ],
    summary: {
      totalStars: 28,
      totalPrevious: 23,
      totalDelta: 5,
      newStars: 10,
      lostStars: 5,
      changed: true,
    },
    ...overrides,
  };
}

describe('prepareReportData', () => {
  it('filters out removed repos from activeRepos', () => {
    const { activeRepos } = prepareReportData({
      results: makeResults(),
      previousTimestamp: '2026-01-01T00:00:00Z',
      locale: 'en',
    });

    expect(activeRepos).toHaveLength(3);
    expect(activeRepos.every((r) => !r.isRemoved)).toBe(true);
  });

  it('identifies new repos', () => {
    const { newRepos } = prepareReportData({
      results: makeResults(),
      previousTimestamp: '2026-01-01T00:00:00Z',
      locale: 'en',
    });

    expect(newRepos).toHaveLength(1);
    expect(newRepos[0].fullName).toBe('user/repo-d');
  });

  it('identifies removed repos', () => {
    const { removedRepos } = prepareReportData({
      results: makeResults(),
      previousTimestamp: '2026-01-01T00:00:00Z',
      locale: 'en',
    });

    expect(removedRepos).toHaveLength(1);
    expect(removedRepos[0].fullName).toBe('user/repo-c');
  });

  it('sorts active repos by current stars descending', () => {
    const { sorted } = prepareReportData({
      results: makeResults(),
      previousTimestamp: '2026-01-01T00:00:00Z',
      locale: 'en',
    });

    expect(sorted.map((r) => r.current)).toEqual([15, 8, 5]);
  });

  it('formats current date as YYYY-MM-DD', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));

    const { now } = prepareReportData({
      results: makeResults(),
      previousTimestamp: '2026-01-01T00:00:00Z',
      locale: 'en',
    });

    expect(now).toBe('2026-06-15');
    vi.useRealTimers();
  });

  it('formats previous timestamp as date only', () => {
    const { prev } = prepareReportData({
      results: makeResults(),
      previousTimestamp: '2026-01-01T00:00:00Z',
      locale: 'en',
    });

    expect(prev).toBe('2026-01-01');
  });

  it('uses first run label when previousTimestamp is null', () => {
    const { prev } = prepareReportData({
      results: makeResults(),
      previousTimestamp: null,
      locale: 'en',
    });

    expect(prev).toBe('first run');
  });

  it('uses localized first run label', () => {
    const { prev } = prepareReportData({
      results: makeResults(),
      previousTimestamp: null,
      locale: 'es',
    });

    expect(prev).toBe('primera ejecución');
  });
});
