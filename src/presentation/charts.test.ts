import type { Config } from '@config/types';
import { ChartTheme } from '@config/types';
import type { ForecastData } from '@domain/forecast';
import { ForecastMethod } from '@domain/forecast';
import type { RepoStargazers } from '@domain/stargazers';
import type { History, SnapshotRepo } from '@domain/types';
import { makeConfig, makeMultiRepoHistory, makeStargazerSeries } from '@shared/tests';
import { describe, expect, it } from 'vitest';
import type { ChartHistories } from './charts';
import { buildChartFiles, resolveChartHistories } from './charts';

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

interface HistoriesOf {
  config?: Config;
  storedHistory?: History;
  repos?: SnapshotRepo[];
  repoStargazers?: RepoStargazers[];
}

function histories({
  config = makeConfig({ includeCharts: true, topRepos: 2 }),
  storedHistory = HISTORY,
  repos = REPO_TOTALS,
  repoStargazers = [],
}: HistoriesOf = {}): ChartHistories {
  return resolveChartHistories({ config, storedHistory, repos, repoStargazers, now: NOW });
}

interface Build extends HistoriesOf {
  forecastData?: ForecastData | null;
  topRepoNames?: string[];
  chartHistories?: ChartHistories;
}

function build({ forecastData = null, topRepoNames, chartHistories, ...rest }: Build = {}) {
  const config = rest.config ?? makeConfig({ includeCharts: true, topRepos: 2 });

  return buildChartFiles({
    config,
    chartHistories: chartHistories ?? histories({ ...rest, config }),
    forecastData,
    topRepoNames: topRepoNames ?? ['user/repo-a', 'user/repo-b'],
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

    expect(build({ storedHistory: single })).toEqual([]);
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
      storedHistory: { snapshots: [] },
    });

    expect(filenames(files)).not.toContain('user-ghost.svg');
  });
});

describe('resolveChartHistories', () => {
  const stored: History = makeMultiRepoHistory([
    { 'user/repo-a': 1 },
    { 'user/repo-a': 2 },
    { 'user/repo-a': 3 },
  ]);

  it('prefers the reconstruction once it has enough snapshots to plot', () => {
    const resolved = histories({
      storedHistory: stored,
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

    expect(resolved.aggregate).not.toBe(stored);
    expect(resolved.aggregate.snapshots.length).toBeGreaterThanOrEqual(2);
  });

  it('falls back to the stored history when nothing could be reconstructed', () => {
    expect(histories({ storedHistory: stored }).aggregate).toBe(stored);
  });

  it('reconstructs nothing at all when charts are off', () => {
    const resolved = histories({
      config: makeConfig({ includeCharts: false }),
      storedHistory: stored,
    });

    expect(resolved.aggregate).toBe(stored);
  });

  it('falls back for a repository that is not in the tracked set', () => {
    expect(histories({ storedHistory: stored }).forRepo('user/ghost')).toBe(stored);
  });

  it('reconstructs each repository from its own stargazers, on the same instant', () => {
    const resolved = histories({
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
    const perRepo = resolved.forRepo('user/repo-a');

    expect(perRepo.snapshots.at(-1)?.timestamp).toBe(NOW.toISOString());
    expect(resolved.aggregate.snapshots.at(-1)?.timestamp).toBe(NOW.toISOString());
  });
});
