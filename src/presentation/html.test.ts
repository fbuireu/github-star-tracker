import { DEFAULTS } from '@config/defaults';
import type { Config } from '@config/types';
import { ChartTheme } from '@config/types';
import type { ForecastData } from '@domain/forecast';
import { ForecastMethod } from '@domain/forecast';
import { DOWN_ARROW, UP_ARROW } from '@domain/formatting';
import type { StargazerDiffResult } from '@domain/stargazers';
import type { History } from '@domain/types';
import {
  makeComparisonResults,
  makeConfig,
  makeHistory,
  makeMultiRepoHistory,
} from '@shared/tests';
import { describe, expect, it } from 'vitest';
import { COLORS, DARK_PALETTE, LIGHT_PALETTE } from './constants';
import { generateHtmlReport } from './html';
import { buildReportModel } from './report-model';
import type { ReportParams } from './shared';

const QUICKCHART_CONFIG = /https:\/\/quickchart\.io\/chart\?[^"]*&c=([^"]+)/g;

interface RenderHtml extends Partial<Omit<ReportParams, 'config'>> {
  config?: Partial<Config>;
}

function renderHtml({ config, ...overrides }: RenderHtml = {}): string {
  const resolved = makeConfig(config);

  return generateHtmlReport({
    config: resolved,
    model: buildReportModel({
      config: resolved,
      results: makeComparisonResults(),
      previousTimestamp: '2026-01-01T00:00:00Z',
      chartHistories: overrides.history
        ? { aggregate: overrides.history, forRepo: () => overrides.history as History }
        : null,
      ...overrides,
    }),
  });
}

describe('generateHtmlReport', () => {
  const velocityHistory = makeHistory([100, 200], { startMs: Date.UTC(2025, 0, 1), stepDays: 10 });

  it('renders the velocity section when velocity-metrics is enabled', () => {
    const html = renderHtml({ velocityHistory, config: { velocityMetrics: true } });

    expect(html).toContain('Growth Velocity');
    expect(html).toContain('Stars per day');
  });

  it('omits the velocity section by default', () => {
    const html = renderHtml({ velocityHistory });

    expect(html).not.toContain('Growth Velocity');
  });

  it('renders velocity with only the daily rate when growth and projection are unavailable', () => {
    const flatHistory = makeHistory([0, 0], { startMs: Date.UTC(2025, 0, 1), stepDays: 10 });

    const html = renderHtml({ velocityHistory: flatHistory, config: { velocityMetrics: true } });

    expect(html).toContain('Growth Velocity');
    expect(html).toContain('Stars per day');
    expect(html).not.toContain('Growth:</strong>');
  });

  it('shows negative growth without a plus sign', () => {
    const decliningHistory = makeHistory([200, 150], {
      startMs: Date.UTC(2025, 0, 1),
      stepDays: 10,
    });

    const html = renderHtml({
      velocityHistory: decliningHistory,
      config: { velocityMetrics: true },
    });

    expect(html).toContain('-25%');
    expect(html).not.toContain('+-25%');
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

    const html = renderHtml({
      velocityHistory,
      forecastData,
      config: { velocityMetrics: true },
    });

    expect(html).toContain('<h3 style="font-size:16px;margin-bottom:8px;">🚀 Growth Velocity</h3>');
    expect(html).not.toContain(
      '<h2 style="font-size:18px;margin-bottom:12px;">🚀 Growth Velocity</h2>',
    );
    expect(html.indexOf('Growth Forecast')).toBeLessThan(html.indexOf('Growth Velocity'));
    expect(html.indexOf('Growth Velocity')).toBeLessThan(html.indexOf('Aggregate Forecast'));
  });

  it('dresses the document from email-theme, never from chart-theme', () => {
    const html = renderHtml({
      config: { chartTheme: ChartTheme.LIGHT, emailTheme: ChartTheme.DARK },
    });

    expect(html).toContain('<meta name="color-scheme" content="dark">');
    expect(html).toContain(DARK_PALETTE.white);
    expect(html).not.toContain(LIGHT_PALETTE.white);
  });

  it('generates valid HTML structure', () => {
    const html = renderHtml();

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
    expect(html).toContain('<table');
  });

  it('includes repo links', () => {
    const html = renderHtml();

    expect(html).toContain('href="https://github.com/user/repo-a"');
  });

  it('uses green color for positive deltas', () => {
    const html = renderHtml();

    expect(html).toContain(COLORS.positive);
  });

  it('uses red color for negative deltas', () => {
    const html = renderHtml();

    expect(html).toContain(COLORS.negative);
  });

  it('includes summary stats', () => {
    const html = renderHtml();

    expect(html).toContain('23');
    expect(html).toContain('Total Stars');
    expect(html).toContain('Net change');
  });

  it('gives the repository table a trend column', () => {
    const html = renderHtml();

    expect(html).toContain('>Trend</th>');
    expect(html).toContain(UP_ARROW);
    expect(html).toContain(DOWN_ARROW);
  });

  it('lists new repositories with their Star Count', () => {
    const results = makeComparisonResults();

    results.repos.push({
      name: 'fresh',
      fullName: 'user/fresh',
      owner: 'user',
      current: 7,
      previous: null,
      delta: 0,
      isNew: true,
      isRemoved: false,
    });

    const html = renderHtml({ results });

    expect(html).toContain('New Repositories');
    expect(html).toContain('href="https://github.com/user/fresh"');
    expect(html).toContain('7 stars');
  });

  it('omits the new repositories section when nothing entered the tracked set', () => {
    expect(renderHtml()).not.toContain('New Repositories');
  });

  it('shows removed repos section when applicable', () => {
    const results = makeComparisonResults();

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

    const html = renderHtml({ results });

    expect(html).toContain('Removed Repositories');
  });

  it('includes charts when history has multiple snapshots', () => {
    const history = makeMultiRepoHistory([{ 'user/repo-a': 20 }, { 'user/repo-a': 23 }], {
      stepDays: 1,
    });

    const html = renderHtml({ history, config: { includeCharts: true } });

    expect(html).toContain('Star Trend');
    expect(html).toContain('https://quickchart.io/chart');
  });

  it('includes comparison chart for top repositories', () => {
    const history = makeMultiRepoHistory(
      [
        { 'user/repo-a': 10, 'user/repo-b': 10 },
        { 'user/repo-a': 15, 'user/repo-b': 10 },
      ],
      { stepDays: 1 },
    );

    const html = renderHtml({ history, config: { includeCharts: true } });

    expect(html).toContain('By Repository');
    expect(html).toContain('Top Repositories');
  });

  it('includes individual repo charts section', () => {
    const history = makeMultiRepoHistory(
      [
        { 'user/repo-a': 10, 'user/repo-b': 10 },
        { 'user/repo-a': 15, 'user/repo-b': 10 },
      ],
      { stepDays: 1 },
    );

    const html = renderHtml({ history, config: { includeCharts: true } });

    expect(html).toContain('Individual Repository Charts');
    expect(html).toContain('alt="user/repo-a"');
    expect(html).toContain('alt="user/repo-b"');
    expect(html).not.toContain('<details>');
  });

  it('heads each individual repo chart with its Star Count and Delta', () => {
    const history = makeMultiRepoHistory(
      [
        { 'user/repo-a': 10, 'user/repo-b': 10 },
        { 'user/repo-a': 15, 'user/repo-b': 8 },
      ],
      { stepDays: 1 },
    );

    const html = renderHtml({ history, config: { includeCharts: true } });

    expect(html).toContain(`user/repo-a — 15 ★ (<span style="color:${COLORS.positive}`);
    expect(html).toContain('+5</span>)');
    expect(html).toContain(`user/repo-b — 8 ★ (<span style="color:${COLORS.negative}`);
    expect(html).toContain('-2</span>)');
  });

  it('applies chart-line-color to the star history, per-repo and forecast charts', () => {
    const history = makeMultiRepoHistory(
      [
        { 'user/repo-a': 10, 'user/repo-b': 10 },
        { 'user/repo-a': 15, 'user/repo-b': 10 },
        { 'user/repo-a': 22, 'user/repo-b': 12 },
      ],
      { stepDays: 1 },
    );
    const forecastData: ForecastData = {
      aggregate: {
        forecasts: [
          {
            method: ForecastMethod.LINEAR_REGRESSION,
            points: [{ weekOffset: 1, predicted: 40 }],
          },
        ],
      },
      repos: [],
    };

    const html = renderHtml({
      history,
      forecastData,
      config: { includeCharts: true, chartLineColor: '#6b63ff' },
    });
    const configs = [...html.matchAll(QUICKCHART_CONFIG)].map((match) =>
      decodeURIComponent(match[1]),
    );

    expect(configs.filter((config) => config.includes('#6b63ff')).length).toBeGreaterThanOrEqual(3);
    expect(configs[0]).not.toContain(COLORS.accent);
  });

  it('applies chart-line-width to the email chart data lines', () => {
    const history = makeMultiRepoHistory([{ 'user/repo-a': 20 }, { 'user/repo-a': 23 }], {
      stepDays: 1,
    });
    const configsOf = (html: string): string[] =>
      [...html.matchAll(QUICKCHART_CONFIG)].map((match) => decodeURIComponent(match[1]));

    const styled = configsOf(
      renderHtml({ history, config: { includeCharts: true, chartLineWidth: 5 } }),
    );
    const plain = configsOf(renderHtml({ history, config: { includeCharts: true } }));

    expect(styled.every((config) => config.includes('"borderWidth":5'))).toBe(true);
    expect(
      plain.every((config) => config.includes(`"borderWidth":${DEFAULTS.chartLineWidth}`)),
    ).toBe(true);
  });

  it('does not include charts when includeCharts is false', () => {
    const history = makeMultiRepoHistory([{ 'user/repo-a': 20 }, { 'user/repo-a': 23 }], {
      stepDays: 1,
    });

    const html = renderHtml({ history, config: { includeCharts: false } });

    expect(html).not.toContain('Star Trend');
    expect(html).not.toContain('quickchart.io');
  });

  it('does not include charts when history has only one snapshot', () => {
    const history = makeMultiRepoHistory([{ 'user/repo-a': 20 }]);

    const html = renderHtml({ history, config: { includeCharts: true } });

    expect(html).not.toContain('Star Trend');
  });

  it('includes stargazer section with avatars', () => {
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

    const html = renderHtml({ stargazerDiff });

    expect(html).toContain('New Stargazers');
    expect(html).toContain('alice');
    expect(html).toContain('width="32" height="32"');
    expect(html).toContain('border-radius:50%');
    expect(html).toContain('2026-01-15');
  });

  it('shows no-new-stargazers message when diff is empty', () => {
    const stargazerDiff: StargazerDiffResult = {
      entries: [],
      totalNew: 0,
    };

    const html = renderHtml({ stargazerDiff });

    expect(html).toContain('New Stargazers');
    expect(html).toContain('No new stargazers since last run');
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

    const html = renderHtml({ stargazerDiff });

    expect(html).toContain('sampled repositories: user/huge');
  });

  it('renders the sampled note when all repos are sampled (no new stargazers)', () => {
    const stargazerDiff: StargazerDiffResult = {
      entries: [],
      totalNew: 0,
      sampledRepos: ['user/huge', 'user/big'],
    };

    const html = renderHtml({ stargazerDiff });

    expect(html).toContain('New Stargazers');
    expect(html).toContain('sampled repositories: user/huge, user/big');
  });

  it('excludes stargazer section when stargazerDiff is null', () => {
    const html = renderHtml({ stargazerDiff: null });

    expect(html).not.toContain('New Stargazers');
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

    const html = renderHtml({ forecastData });

    expect(html).toContain('Growth Forecast');
    expect(html).toContain('Linear Regression');
    expect(html).toContain('Weighted Moving Average');
    expect(html).toContain('Week 1');
    expect(html).toContain('25');
    expect(html).toContain('By Repository');
    expect(html).toContain('user/repo-a');
    expect(html).not.toContain('<details>');
  });

  it('uses neutral color for zero delta', () => {
    const html = renderHtml({
      results: makeComparisonResults({
        repos: [
          {
            name: 'repo-a',
            fullName: 'user/repo-a',
            owner: 'user',
            current: 10,
            previous: 10,
            delta: 0,
            isNew: false,
            isRemoved: false,
          },
        ],
        summary: {
          totalStars: 10,
          totalPrevious: 10,
          totalDelta: 0,
          newStars: 0,
          lostStars: 0,
          changed: false,
        },
      }),
    });

    expect(html).toContain(COLORS.neutral);
  });

  it('renders a translated label for every forecast method', () => {
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
              { weekOffset: 2, predicted: 26 },
              { weekOffset: 3, predicted: 28 },
              { weekOffset: 4, predicted: 30 },
            ],
          },
        ],
      },
      repos: [],
    };

    const html = renderHtml({ forecastData });

    expect(html).toContain('Linear Regression');
    expect(html).toContain('Weighted Moving Average');
    expect(html).not.toContain(ForecastMethod.LINEAR_REGRESSION);
    expect(html).not.toContain(ForecastMethod.WEIGHTED_MOVING_AVERAGE);
  });

  it('excludes forecast section when forecastData is null', () => {
    const html = renderHtml({ forecastData: null });

    expect(html).not.toContain('Growth Forecast');
  });

  it('includes explicit background-color on body', () => {
    const html = renderHtml();

    expect(html).toContain(`background-color:${COLORS.white}`);
  });
});
