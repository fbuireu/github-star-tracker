import { ChartTheme } from '@config/types';
import type { ForecastData } from '@domain/forecast';
import { ForecastMethod } from '@domain/forecast';
import type { History, SnapshotRepo } from '@domain/types';
import { makeConfig, makeMultiRepoHistory, makeStargazerSeries } from '@shared/tests';
import { describe, expect, it } from 'vitest';
import { buildChartFiles, resolveChartHistory } from './charts';

const NOW = new Date('2026-03-01T00:00:00Z');

const REPO_TOTALS: SnapshotRepo[] = [
  { fullName: 'user/repo-a', name: 'repo-a', owner: 'user', stars: 60 },
  { fullName: 'user/repo-b', name: 'repo-b', owner: 'user', stars: 40 },
];

const HISTORY = makeMultiRepoHistory([
  { 'user/repo-a': 40, 'user/repo-b': 20 },
  { 'user/repo-a': 50, 'user/repo-b': 30 },
  { 'user/repo-a': 60, 'user/repo-b': 40 },
]);

const FORECAST: ForecastData = {
  aggregate: {
    forecasts: [
      { method: ForecastMethod.LINEAR_REGRESSION, points: [{ weekOffset: 1, predicted: 110 }] },
      {
        method: ForecastMethod.WEIGHTED_MOVING_AVERAGE,
        points: [{ weekOffset: 1, predicted: 105 }],
      },
    ],
  },
  repos: [],
};

function build(overrides: Partial<Parameters<typeof buildChartFiles>[0]> = {}) {
  return buildChartFiles({
    config: makeConfig({ includeCharts: true, topRepos: 2 }),
    history: HISTORY,
    fallbackHistory: HISTORY,
    forecastData: null,
    topRepoNames: ['user/repo-a', 'user/repo-b'],
    repoTotals: REPO_TOTALS,
    repoStargazers: [],
    now: NOW,
    ...overrides,
  });
}

function filenames(files: { filename: string }[]): string[] {
  return files.map((file) => file.filename);
}

describe('buildChartFiles', () => {
  it('renders nothing when charts are turned off', () => {
    expect(build({ config: makeConfig({ includeCharts: false }) })).toEqual([]);
  });

  it('renders nothing when the history is too short to plot', () => {
    const single = makeMultiRepoHistory([{ 'user/repo-a': 40 }]);

    expect(build({ history: single })).toEqual([]);
  });

  it('renders the star history chart', () => {
    expect(filenames(build())).toContain('star-history.svg');
  });

  it('renders one chart per top repository, named after it', () => {
    expect(filenames(build())).toEqual(
      expect.arrayContaining(['user-repo-a.svg', 'user-repo-b.svg']),
    );
  });

  it('renders the comparison chart only when there are top repositories', () => {
    expect(filenames(build())).toContain('comparison.svg');
    expect(filenames(build({ topRepoNames: [] }))).not.toContain('comparison.svg');
  });

  it('renders the forecast chart only when there is forecast data', () => {
    expect(filenames(build({ forecastData: FORECAST }))).toContain('forecast.svg');
    expect(filenames(build())).not.toContain('forecast.svg');
  });

  it('returns non-empty SVG for every file it lists', () => {
    for (const file of build({ forecastData: FORECAST })) {
      expect(file.svg).toContain('<svg');
    }
  });

  it('projects the configured theme onto every chart it renders', () => {
    const dark = build({
      config: makeConfig({ includeCharts: true, chartTheme: ChartTheme.DARK }),
    });
    const auto = build({
      config: makeConfig({ includeCharts: true, chartTheme: ChartTheme.AUTO }),
    });

    expect(dark[0].svg).not.toContain('prefers-color-scheme');
    expect(auto[0].svg).toContain('prefers-color-scheme');
  });

  it('projects the configured line colour onto the star history chart', () => {
    const files = build({
      config: makeConfig({ includeCharts: true, chartLineColor: '#ff0000' }),
    });

    expect(files[0].svg).toContain('#ff0000');
  });

  it('draws a per-repo chart from that repo own reconstructed history when stargazers are known', () => {
    const files = build({
      topRepoNames: ['user/repo-a'],
      repoStargazers: [
        {
          repoFullName: 'user/repo-a',
          stargazers: makeStargazerSeries({
            count: 60,
            startMs: Date.UTC(2026, 0, 1),
            stepDays: 1,
          }),
        },
      ],
    });

    expect(filenames(files)).toContain('user-repo-a.svg');
  });

  it('falls back to the stored history for a repo with no reconstructed series', () => {
    const files = build({ topRepoNames: ['user/repo-a'], repoStargazers: [] });

    expect(filenames(files)).toContain('user-repo-a.svg');
  });

  it('skips a top repository that is absent from the repo totals', () => {
    const files = build({
      topRepoNames: ['user/ghost'],
      fallbackHistory: { snapshots: [] },
    });

    expect(filenames(files)).not.toContain('user-ghost.svg');
  });
});

describe('resolveChartHistory', () => {
  const fallback: History = makeMultiRepoHistory([
    { 'user/repo-a': 1 },
    { 'user/repo-a': 2 },
    { 'user/repo-a': 3 },
  ]);

  it('prefers the reconstruction once it has enough snapshots to plot', () => {
    const candidate = makeMultiRepoHistory([{ 'user/repo-a': 9 }, { 'user/repo-a': 10 }]);

    expect(resolveChartHistory({ candidate, fallback })).toBe(candidate);
  });

  it('falls back when the reconstruction has too few snapshots', () => {
    const candidate = makeMultiRepoHistory([{ 'user/repo-a': 9 }]);

    expect(resolveChartHistory({ candidate, fallback })).toBe(fallback);
  });

  it('falls back when the reconstruction is empty', () => {
    expect(resolveChartHistory({ candidate: { snapshots: [] }, fallback })).toBe(fallback);
  });
});
