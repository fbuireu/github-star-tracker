import { ChartRange, ChartTheme } from '@config/types';
import type { ComparisonResults } from '@domain/types';
import { makeComparisonResults, makeRepoResult } from '@shared/tests';
import { describe, expect, it, vi } from 'vitest';
import { colorSchemeFor, escapeHtml, prepareReportData, selectChartSnapshots } from './shared';

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

describe('escapeHtml', () => {
  it('neutralises every character that could break out of an attribute or a tag', () => {
    expect(escapeHtml(`<img src="x" onerror='y'>&`)).toBe(
      '&lt;img src=&quot;x&quot; onerror=&#39;y&#39;&gt;&amp;',
    );
  });
});

describe('selectChartSnapshots', () => {
  const snapshots = [
    { timestamp: '2026-01-01T00:00:00Z' },
    { timestamp: '2026-02-01T00:00:00Z' },
    { timestamp: '2026-03-01T00:00:00Z' },
  ];

  it('keeps every snapshot when the range is unbounded', () => {
    expect(selectChartSnapshots({ snapshots, range: ChartRange.ALL })).toHaveLength(3);
  });

  it('drops snapshots outside the range window', () => {
    const windowed = selectChartSnapshots({ snapshots, range: ChartRange.D30 });

    expect(windowed).toEqual([{ timestamp: '2026-02-01T00:00:00Z' }, snapshots[2]]);
  });

  it('downsamples across the window instead of keeping only the tail', () => {
    expect(selectChartSnapshots({ snapshots, maxPoints: 2 })).toEqual([snapshots[0], snapshots[2]]);
  });

  it('spans the whole window at evenly spaced points, keeping both endpoints', () => {
    const dense = Array.from({ length: 100 }, (_, index) => ({
      timestamp: new Date(Date.UTC(2026, 0, 1) + index * 86_400_000).toISOString(),
    }));

    const picked = selectChartSnapshots({ snapshots: dense, maxPoints: 5 });

    expect(picked).toHaveLength(5);
    expect(picked[0]).toBe(dense[0]);
    expect(picked.at(-1)).toBe(dense.at(-1));
  });

  it('keeps chart-range meaningful once the window exceeds maxPoints', () => {
    const dense = Array.from({ length: 400 }, (_, index) => ({
      timestamp: new Date(Date.UTC(2025, 0, 1) + index * 86_400_000).toISOString(),
    }));

    const year = selectChartSnapshots({ snapshots: dense, range: ChartRange.Y1, maxPoints: 30 });
    const everything = selectChartSnapshots({
      snapshots: dense,
      range: ChartRange.ALL,
      maxPoints: 30,
    });

    expect(year[0]).not.toBe(everything[0]);
  });

  it('returns only the newest entry when maxPoints is 1', () => {
    expect(selectChartSnapshots({ snapshots, maxPoints: 1 })).toEqual([snapshots[2]]);
  });

  it('copies rather than aliases when maxPoints is 0', () => {
    const result = selectChartSnapshots({ snapshots, maxPoints: 0 });

    expect(result).toEqual(snapshots);
    expect(result).not.toBe(snapshots);
  });

  it('skips a snapshot whose timestamp cannot be parsed', () => {
    const withCorrupt = [{ timestamp: 'not-a-date' }, ...snapshots];

    expect(selectChartSnapshots({ snapshots: withCorrupt, range: ChartRange.D30 })).toEqual([
      snapshots[1],
      snapshots[2],
    ]);
  });

  it('leaves the series unfiltered when the newest timestamp is unparseable', () => {
    const trailingCorrupt = [...snapshots, { timestamp: 'not-a-date' }];

    expect(selectChartSnapshots({ snapshots: trailingCorrupt, range: ChartRange.D30 })).toEqual(
      trailingCorrupt,
    );
  });
});

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
