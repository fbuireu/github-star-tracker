import { ChartTheme } from '@config/types';
import type { ComparisonResults } from '@domain/types';
import { makeComparisonResults, makeRepoResult } from '@shared/testing';
import { describe, expect, it, vi } from 'vitest';
import { colorSchemeFor, prepareReportData } from './shared';

function makeResults(overrides: Partial<ComparisonResults> = {}): ComparisonResults {
  return makeComparisonResults({
    repos: [
      makeRepoResult('repo-a', { current: 15, previous: 10, delta: 5 }),
      makeRepoResult('repo-b', { current: 8, previous: 10, delta: -2 }),
      makeRepoResult('repo-c', { current: 0, previous: 3, delta: -3, isRemoved: true }),
      makeRepoResult('repo-d', { current: 5, previous: null, delta: 5, isNew: true }),
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
  });
}

describe('colorSchemeFor', () => {
  it('allows both schemes for the auto theme', () => {
    expect(colorSchemeFor(ChartTheme.AUTO)).toBe('light dark');
  });

  it('locks to the forced theme otherwise', () => {
    expect(colorSchemeFor(ChartTheme.DARK)).toBe('dark');
    expect(colorSchemeFor(ChartTheme.LIGHT)).toBe('light');
  });
});

describe('prepareReportData', () => {
  it('filters out removed repos from activeRepos', () => {
    const { activeRepos } = prepareReportData({
      results: makeResults(),
      previousTimestamp: '2026-01-01T00:00:00Z',
      locale: 'en',
    });

    expect(activeRepos).toHaveLength(3);
    expect(activeRepos.every((repo) => !repo.isRemoved)).toBe(true);
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

    expect(sorted.map((repo) => repo.current)).toEqual([15, 8, 5]);
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
