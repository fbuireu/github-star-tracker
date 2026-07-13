import type { ForecastData } from '@domain/forecast';
import { ForecastMethod } from '@domain/forecast';
import type { StargazerDiffResult } from '@domain/stargazers';
import { makeComparisonResults, makeHistory, makeMultiRepoHistory } from '@test-utils';
import { describe, expect, it } from 'vitest';
import { generateMarkdownReport } from './markdown';
import type { GenerateReportParams } from './shared';

function renderMarkdown(overrides: Partial<GenerateReportParams> = {}): string {
  return generateMarkdownReport({
    results: makeComparisonResults(),
    previousTimestamp: '2026-01-01T00:00:00Z',
    locale: 'en',
    ...overrides,
  });
}

describe('generateMarkdownReport', () => {
  it('includes total star count and delta', () => {
    const report = renderMarkdown();

    expect(report).toContain('**23 stars**');
    expect(report).toContain('+3');
  });

  it('includes repository table rows', () => {
    const report = renderMarkdown();

    expect(report).toContain('user/repo-a');
    expect(report).toContain('user/repo-b');
    expect(report).toContain('+5');
    expect(report).toContain('-2');
  });

  const velocityHistory = makeHistory([100, 200], { startMs: Date.UTC(2025, 0, 1), stepDays: 10 });

  it('renders the velocity section when velocity-metrics is enabled', () => {
    const report = renderMarkdown({ history: velocityHistory, velocityMetrics: true });

    expect(report).toContain('Growth Velocity');
    expect(report).toContain('Stars per day');
    expect(report).toContain('Growth');
  });

  it('omits the velocity section by default', () => {
    const report = renderMarkdown({ history: velocityHistory });

    expect(report).not.toContain('Growth Velocity');
  });

  it('renders velocity with only the daily rate when growth and projection are unavailable', () => {
    const flatHistory = makeHistory([0, 0], { startMs: Date.UTC(2025, 0, 1), stepDays: 10 });

    const report = renderMarkdown({ history: flatHistory, velocityMetrics: true });

    expect(report).toContain('Growth Velocity');
    expect(report).toContain('Stars per day');
    expect(report).not.toContain('**Growth:**');
  });

  it('shows negative growth without a plus sign', () => {
    const decliningHistory = makeHistory([200, 150], {
      startMs: Date.UTC(2025, 0, 1),
      stepDays: 10,
    });

    const report = renderMarkdown({ history: decliningHistory, velocityMetrics: true });

    expect(report).toContain('-25%');
    expect(report).not.toContain('+-25%');
  });

  it('nests velocity under the forecast section when both are present', () => {
    const forecastData: ForecastData = {
      aggregate: {
        forecasts: [
          {
            method: ForecastMethod.LINEAR_REGRESSION,
            points: [
              { weekOffset: 1, predicted: 25 },
              { weekOffset: 2, predicted: 27 },
              { weekOffset: 3, predicted: 29 },
              { weekOffset: 4, predicted: 31 },
            ],
          },
        ],
      },
      repos: [],
    };

    const report = renderMarkdown({
      history: velocityHistory,
      velocityMetrics: true,
      forecastData,
    });

    expect(report).toContain('\n### 🚀 Growth Velocity\n');
    expect(report).not.toContain('\n## 🚀 Growth Velocity\n');
    expect(report.indexOf('Growth Forecast')).toBeLessThan(report.indexOf('Growth Velocity'));
    expect(report.indexOf('Growth Velocity')).toBeLessThan(report.indexOf('Aggregate Forecast'));
  });

  it('handles first run with no previous timestamp', () => {
    const report = renderMarkdown({ previousTimestamp: null });

    expect(report).not.toContain('Compared to snapshot from');
  });

  it('shows NEW badge for new repos', () => {
    const results = makeComparisonResults();
    results.repos[0].isNew = true;

    const report = renderMarkdown({ results });

    expect(report).toContain('`NEW`');
  });

  it('includes removed repos section', () => {
    const results = makeComparisonResults();
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

    const report = renderMarkdown({ results });

    expect(report).toContain('Removed Repositories');
    expect(report).toContain('user/old-repo');
  });

  it('includes footer with generator link', () => {
    const report = renderMarkdown({ previousTimestamp: null });

    expect(report).toContain('GitHub Star Tracker');
  });

  it('includes charts when history has multiple snapshots', () => {
    const history = makeMultiRepoHistory([{ 'user/repo-a': 20 }, { 'user/repo-a': 23 }], {
      stepDays: 1,
    });

    const report = renderMarkdown({ history, includeCharts: true });

    expect(report).toContain('Star Trend');
    expect(report).toContain('![Star History](./charts/star-history.svg)');
  });

  it('includes comparison chart in markdown', () => {
    const history = makeMultiRepoHistory(
      [
        { 'user/repo-a': 10, 'user/repo-b': 10 },
        { 'user/repo-a': 15, 'user/repo-b': 10 },
      ],
      { stepDays: 1 },
    );

    const report = renderMarkdown({ history, includeCharts: true });

    expect(report).toContain('Top Repositories');
    expect(report).toContain('![Top Repositories](./charts/comparison.svg)');
  });

  it('includes individual repo charts in collapsible section', () => {
    const history = makeMultiRepoHistory(
      [
        { 'user/repo-a': 10, 'user/repo-b': 10 },
        { 'user/repo-a': 15, 'user/repo-b': 10 },
      ],
      { stepDays: 1 },
    );

    const report = renderMarkdown({ history, includeCharts: true });

    expect(report).toContain('<details>');
    expect(report).toContain('<summary>Individual Repository Charts</summary>');
    expect(report).toContain('#### user/repo-a');
    expect(report).toContain('![user/repo-a](./charts/user-repo-a.svg)');
    expect(report).toContain('#### user/repo-b');
    expect(report).toContain('![user/repo-b](./charts/user-repo-b.svg)');
    expect(report).toContain('</details>');
  });

  it('includes stargazer section with new stargazers', () => {
    const stargazerDiff: StargazerDiffResult = {
      entries: [
        {
          repoFullName: 'user/repo-a',
          newStargazers: [
            {
              login: 'alice',
              avatarUrl: 'https://avatars.githubusercontent.com/alice',
              profileUrl: 'https://github.com/alice',
              starredAt: '2026-01-15T10:00:00Z',
            },
          ],
        },
      ],
      totalNew: 1,
    };

    const report = renderMarkdown({ stargazerDiff });

    expect(report).toContain('New Stargazers');
    expect(report).toContain('alice');
    expect(report).toContain('user/repo-a');
    expect(report).toContain('2026-01-15');
    expect(report).toContain('<details>');
  });

  it('shows no-new-stargazers message when diff is empty', () => {
    const stargazerDiff: StargazerDiffResult = {
      entries: [],
      totalNew: 0,
    };

    const report = renderMarkdown({ stargazerDiff });

    expect(report).toContain('New Stargazers');
    expect(report).toContain('No new stargazers since last run');
  });

  it('excludes stargazer section when stargazerDiff is null', () => {
    const report = renderMarkdown({ stargazerDiff: null });

    expect(report).not.toContain('New Stargazers');
  });

  it('renders the sampled note alongside new stargazers', () => {
    const stargazerDiff: StargazerDiffResult = {
      entries: [
        {
          repoFullName: 'user/repo-a',
          newStargazers: [
            {
              login: 'alice',
              avatarUrl: 'https://avatars.githubusercontent.com/alice',
              profileUrl: 'https://github.com/alice',
              starredAt: '2026-01-15T10:00:00Z',
            },
          ],
        },
      ],
      totalNew: 1,
      sampledRepos: ['user/huge'],
    };

    const report = renderMarkdown({ stargazerDiff });

    expect(report).toContain('sampled repositories: user/huge');
  });

  it('renders the sampled note when all repos are sampled (no new stargazers)', () => {
    const stargazerDiff: StargazerDiffResult = {
      entries: [],
      totalNew: 0,
      sampledRepos: ['user/huge', 'user/big'],
    };

    const report = renderMarkdown({ stargazerDiff });

    expect(report).toContain('New Stargazers');
    expect(report).toContain('sampled repositories: user/huge, user/big');
  });

  it('includes forecast section with tables', () => {
    const forecastData: ForecastData = {
      aggregate: {
        forecasts: [
          {
            method: ForecastMethod.LINEAR_REGRESSION,
            points: [
              { weekOffset: 1, predicted: 25 },
              { weekOffset: 2, predicted: 27 },
              { weekOffset: 3, predicted: 29 },
              { weekOffset: 4, predicted: 31 },
            ],
          },
          {
            method: ForecastMethod.WEIGHTED_MOVING_AVERAGE,
            points: [
              { weekOffset: 1, predicted: 24 },
              { weekOffset: 2, predicted: 25 },
              { weekOffset: 3, predicted: 26 },
              { weekOffset: 4, predicted: 27 },
            ],
          },
        ],
      },
      repos: [
        {
          repoFullName: 'user/repo-a',
          forecasts: [
            {
              method: ForecastMethod.LINEAR_REGRESSION,
              points: [
                { weekOffset: 1, predicted: 17 },
                { weekOffset: 2, predicted: 19 },
                { weekOffset: 3, predicted: 21 },
                { weekOffset: 4, predicted: 23 },
              ],
            },
            {
              method: ForecastMethod.WEIGHTED_MOVING_AVERAGE,
              points: [
                { weekOffset: 1, predicted: 16 },
                { weekOffset: 2, predicted: 17 },
                { weekOffset: 3, predicted: 18 },
                { weekOffset: 4, predicted: 19 },
              ],
            },
          ],
        },
      ],
    };

    const report = renderMarkdown({ forecastData });

    expect(report).toContain('Growth Forecast');
    expect(report).toContain('Linear Regression');
    expect(report).toContain('Weighted Moving Average');
    expect(report).toContain('Week 1');
    expect(report).toContain('25');
    expect(report).toContain('user/repo-a');
  });

  it('renders unknown forecast method name as-is', () => {
    const forecastData: ForecastData = {
      aggregate: {
        forecasts: [
          {
            method: 'custom-method' as ForecastMethod,
            points: [
              { weekOffset: 1, predicted: 25 },
              { weekOffset: 2, predicted: 27 },
              { weekOffset: 3, predicted: 29 },
              { weekOffset: 4, predicted: 31 },
            ],
          },
        ],
      },
      repos: [],
    };

    const report = renderMarkdown({ forecastData });

    expect(report).toContain('custom-method');
  });

  it('excludes forecast section when forecastData is null', () => {
    const report = renderMarkdown({ forecastData: null });

    expect(report).not.toContain('Growth Forecast');
  });
});
