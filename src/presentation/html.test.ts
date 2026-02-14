import type { ComparisonResults } from '@domain/types';
import { describe, expect, it } from 'vitest';
import { generateHtmlReport } from './html';

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

describe('generateHtmlReport', () => {
  it('generates valid HTML structure', () => {
    const html = generateHtmlReport({
      results: makeResults(),
      previousTimestamp: '2026-01-01T00:00:00Z',
      locale: 'en',
    });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
    expect(html).toContain('<table');
  });

  it('includes repo links', () => {
    const html = generateHtmlReport({
      results: makeResults(),
      previousTimestamp: '2026-01-01T00:00:00Z',
      locale: 'en',
    });
    expect(html).toContain('href="https://github.com/user/repo-a"');
  });

  it('uses green color for positive deltas', () => {
    const html = generateHtmlReport({
      results: makeResults(),
      previousTimestamp: '2026-01-01T00:00:00Z',
      locale: 'en',
    });
    expect(html).toContain('#28a745');
  });

  it('uses red color for negative deltas', () => {
    const html = generateHtmlReport({
      results: makeResults(),
      previousTimestamp: '2026-01-01T00:00:00Z',
      locale: 'en',
    });
    expect(html).toContain('#d73a49');
  });

  it('includes summary stats', () => {
    const html = generateHtmlReport({
      results: makeResults(),
      previousTimestamp: '2026-01-01T00:00:00Z',
      locale: 'en',
    });
    expect(html).toContain('23');
    expect(html).toContain('Total Stars');
    expect(html).toContain('Net change');
  });

  it('shows removed repos section when applicable', () => {
    const results = makeResults();
    results.repos.push({
      name: 'gone',
      fullName: 'user/gone',
      owner: 'user',
      current: 0,
      previous: 3,
      delta: -3,
      isNew: false,
      isRemoved: true,
    });
    const html = generateHtmlReport({
      results,
      previousTimestamp: '2026-01-01T00:00:00Z',
      locale: 'en',
    });
    expect(html).toContain('Removed Repositories');
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

    const html = generateHtmlReport({
      results: makeResults(),
      previousTimestamp: '2026-01-01T00:00:00Z',
      locale: 'en',
      history,
      includeCharts: true,
    });

    expect(html).toContain('Star Trend');
    expect(html).toContain('https://quickchart.io/chart');
  });

  it('includes comparison chart for top repositories', () => {
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

    const html = generateHtmlReport({
      results: makeResults(),
      previousTimestamp: '2026-01-01T00:00:00Z',
      locale: 'en',
      history,
      includeCharts: true,
    });

    expect(html).toContain('By Repository');
    expect(html).toContain('Top Repositories');
  });

  it('includes individual repo charts section', () => {
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

    const html = generateHtmlReport({
      results: makeResults(),
      previousTimestamp: '2026-01-01T00:00:00Z',
      locale: 'en',
      history,
      includeCharts: true,
    });

    expect(html).toContain('Individual Repository Charts');
    expect(html).toContain('alt="user/repo-a"');
    expect(html).toContain('alt="user/repo-b"');
    expect(html).not.toContain('<details>');
  });

  it('does not include charts when includeCharts is false', () => {
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

    const html = generateHtmlReport({
      results: makeResults(),
      previousTimestamp: '2026-01-01T00:00:00Z',
      locale: 'en',
      history,
      includeCharts: false,
    });

    expect(html).not.toContain('Star Trend');
    expect(html).not.toContain('quickchart.io');
  });

  it('does not include charts when history has only one snapshot', () => {
    const history = {
      snapshots: [
        {
          timestamp: '2026-01-01T00:00:00Z',
          totalStars: 20,
          repos: [{ name: 'repo-a', owner: 'user', fullName: 'user/repo-a', stars: 20 }],
        },
      ],
    };

    const html = generateHtmlReport({
      results: makeResults(),
      previousTimestamp: '2026-01-01T00:00:00Z',
      locale: 'en',
      history,
      includeCharts: true,
    });

    expect(html).not.toContain('Star Trend');
  });
});
