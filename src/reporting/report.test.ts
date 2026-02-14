import { describe, expect, it } from 'vitest';
import type { ComparisonResults } from '../types';
import { deltaIndicator, trendIcon } from '../utils';
import { generateHtmlReport, generateMarkdownReport } from './report';

describe('deltaIndicator', () => {
  it('prefixes positive numbers with +', () => {
    expect(deltaIndicator(5)).toBe('+5');
  });

  it('keeps negative sign on negative numbers', () => {
    expect(deltaIndicator(-3)).toBe('-3');
  });

  it('returns "0" for zero', () => {
    expect(deltaIndicator(0)).toBe('0');
  });
});

describe('trendIcon', () => {
  it('returns up arrow for positive delta', () => {
    expect(trendIcon(1)).toBe('\u2B06\uFE0F');
  });

  it('returns down arrow for negative delta', () => {
    expect(trendIcon(-1)).toBe('\u2B07\uFE0F');
  });

  it('returns dash for zero', () => {
    expect(trendIcon(0)).toBe('\u2796');
  });
});

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
    expect(report).toContain('**23**');
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
