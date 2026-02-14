import type { ComparisonResults } from '@domain/types';
import { describe, expect, it } from 'vitest';
import { generateMarkdownReport } from './markdown';

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
    ],
    summary: {
      totalStars: 23,
      totalPrevious: 20,
      totalDelta: 3,
      newStars: 5,
      lostStars: 2,
      changed: true,
    },
    ...overrides,
  };
}

describe('generateMarkdownReport', () => {
  it('includes total star count and delta', () => {
    const report = generateMarkdownReport({
      results: makeResults(),
      previousTimestamp: '2026-01-01T00:00:00Z',
      locale: 'en',
    });
    expect(report).toContain('**23 stars**');
    expect(report).toContain('+3');
  });

  it('includes repository table rows', () => {
    const report = generateMarkdownReport({
      results: makeResults(),
      previousTimestamp: '2026-01-01T00:00:00Z',
      locale: 'en',
    });
    expect(report).toContain('user/repo-a');
    expect(report).toContain('user/repo-b');
    expect(report).toContain('+5');
    expect(report).toContain('-2');
  });

  it('handles first run with no previous timestamp', () => {
    const report = generateMarkdownReport({
      results: makeResults(),
      previousTimestamp: null,
      locale: 'en',
    });
    expect(report).not.toContain('Compared to snapshot from');
  });

  it('shows NEW badge for new repos', () => {
    const results = makeResults();
    results.repos[0].isNew = true;
    const report = generateMarkdownReport({
      results,
      previousTimestamp: '2026-01-01T00:00:00Z',
      locale: 'en',
    });
    expect(report).toContain('`NEW`');
  });

  it('includes removed repos section', () => {
    const results = makeResults();
    results.repos.push({
      name: 'old-repo',
      fullName: 'user/old-repo',
      owner: 'user',
      current: 0,
      previous: 5,
      delta: -5,
      isNew: false,
      isRemoved: true,
    });
    const report = generateMarkdownReport({
      results,
      previousTimestamp: '2026-01-01T00:00:00Z',
      locale: 'en',
    });
    expect(report).toContain('Removed Repositories');
    expect(report).toContain('user/old-repo');
  });

  it('includes footer with generator link', () => {
    const report = generateMarkdownReport({
      results: makeResults(),
      previousTimestamp: null,
      locale: 'en',
    });
    expect(report).toContain('GitHub Star Tracker');
  });

  it('includes charts when history has multiple snapshots', () => {
    const history = {
      snapshots: [
        {
          timestamp: '2026-01-01T00:00:00Z',
          totalStars: 20,
          repos: [{ name: 'repo-a', owner: 'user', fullName: 'user/repo-a', stars: 20 }],
        },
        {
          timestamp: '2026-01-02T00:00:00Z',
          totalStars: 23,
          repos: [{ name: 'repo-a', owner: 'user', fullName: 'user/repo-a', stars: 23 }],
        },
      ],
    };

    const report = generateMarkdownReport({
      results: makeResults(),
      previousTimestamp: '2026-01-01T00:00:00Z',
      locale: 'en',
      history,
      includeCharts: true,
    });

    expect(report).toContain('Star Trend');
    expect(report).toContain('![Star History]');
  });

  it('includes comparison chart in markdown', () => {
    const history = {
      snapshots: [
        {
          timestamp: '2026-01-01T00:00:00Z',
          totalStars: 20,
          repos: [
            { name: 'repo-a', owner: 'user', fullName: 'user/repo-a', stars: 10 },
            { name: 'repo-b', owner: 'user', fullName: 'user/repo-b', stars: 10 },
          ],
        },
        {
          timestamp: '2026-01-02T00:00:00Z',
          totalStars: 25,
          repos: [
            { name: 'repo-a', owner: 'user', fullName: 'user/repo-a', stars: 15 },
            { name: 'repo-b', owner: 'user', fullName: 'user/repo-b', stars: 10 },
          ],
        },
      ],
    };

    const report = generateMarkdownReport({
      results: makeResults(),
      previousTimestamp: '2026-01-01T00:00:00Z',
      locale: 'en',
      history,
      includeCharts: true,
    });

    expect(report).toContain('Top Repositories');
  });
});
