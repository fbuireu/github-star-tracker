import type { Config } from '@config/types';
import type { ForecastData } from '@domain/forecast';
import { buildStarHistory } from '@domain/star-history';
import type { RepoStargazers } from '@domain/stargazers';
import type { History, SnapshotRepo } from '@domain/types';
import type { ChartRequest } from './chart-spec';
import { ChartKind } from './chart-spec';
import { CHART_FILES, MIN_SNAPSHOTS_FOR_CHART } from './constants';
import { perRepoChartFile } from './shared';
import { renderSvgChart } from './svg-chart';

export interface ChartFile {
  filename: string;
  svg: string;
}

interface ResolveChartHistoryParams {
  candidate: History;
  fallback: History;
}

function resolveChartHistory({ candidate, fallback }: ResolveChartHistoryParams): History {
  return candidate.snapshots.length >= MIN_SNAPSHOTS_FOR_CHART ? candidate : fallback;
}

export interface ChartHistories {
  aggregate: History;
  forRepo: (repoFullName: string) => History;
}

interface ResolveChartHistoriesParams {
  config: Config;
  storedHistory: History;
  repos: SnapshotRepo[];
  repoStargazers: RepoStargazers[];
  now?: Date;
}

export function resolveChartHistories({
  config,
  storedHistory,
  repos,
  repoStargazers,
  now = new Date(),
}: ResolveChartHistoriesParams): ChartHistories {
  const reconstruct = (subset: SnapshotRepo[], stargazers: RepoStargazers[]): History =>
    config.includeCharts
      ? buildStarHistory({
          repoStargazers: stargazers,
          repos: subset,
          maxPoints: config.chartMaxPoints,
          now,
        })
      : { snapshots: [] };

  return {
    aggregate: resolveChartHistory({
      candidate: reconstruct(repos, repoStargazers),
      fallback: storedHistory,
    }),
    forRepo: (repoFullName) => {
      const repo = repos.find((candidate) => candidate.fullName === repoFullName);

      return resolveChartHistory({
        candidate: repo
          ? reconstruct(
              [repo],
              repoStargazers.filter((entry) => entry.repoFullName === repoFullName),
            )
          : { snapshots: [] },
        fallback: storedHistory,
      });
    },
  };
}

interface BuildChartFilesParams {
  config: Config;
  chartHistories: ChartHistories;
  forecastData: ForecastData | null;
  topRepoNames: string[];
}

export function buildChartFiles({
  config,
  chartHistories,
  forecastData,
  topRepoNames,
}: BuildChartFilesParams): ChartFile[] {
  const history = chartHistories.aggregate;

  if (!config.includeCharts || history.snapshots.length < MIN_SNAPSHOTS_FOR_CHART) {
    return [];
  }

  const style = {
    locale: config.locale,
    lineWidth: config.chartLineWidth,
    maxPoints: config.chartMaxPoints,
    yAxisSide: config.chartYAxisSide,
    smoothing: config.chartSmoothing,
    curve: config.chartCurve,
    showPoints: config.chartShowPoints,
    animate: config.chartAnimation,
    beginAtZero: config.chartBeginAtZero,
    theme: config.chartTheme,
    range: config.chartRange,
  };
  const renderChart = (request: ChartRequest): string | null =>
    renderSvgChart({ ...style, request });
  const files: ChartFile[] = [];

  const starHistoryChart = renderChart({
    kind: ChartKind.STAR_HISTORY,
    history,
    lineColor: config.chartLineColor,
    milestones: config.chartMilestones,
    customMilestones: config.chartCustomMilestones,
    trendLine: config.chartTrendLine,
  });

  if (starHistoryChart) {
    files.push({ filename: CHART_FILES.starHistory, svg: starHistoryChart });
  }

  for (const repoFullName of topRepoNames) {
    const repoChart = renderChart({
      kind: ChartKind.PER_REPO,
      history: chartHistories.forRepo(repoFullName),
      repoFullName,
      lineColor: config.chartLineColor,
    });

    if (repoChart) {
      files.push({ filename: perRepoChartFile(repoFullName), svg: repoChart });
    }
  }

  if (topRepoNames.length > 0) {
    const comparisonChart = renderChart({
      kind: ChartKind.COMPARISON,
      history,
      repoNames: topRepoNames,
    });

    if (comparisonChart) {
      files.push({ filename: CHART_FILES.comparison, svg: comparisonChart });
    }
  }

  if (forecastData) {
    const forecastChart = renderChart({
      kind: ChartKind.FORECAST,
      history,
      forecastData,
      lineColor: config.chartLineColor,
    });

    if (forecastChart) {
      files.push({ filename: CHART_FILES.forecast, svg: forecastChart });
    }
  }

  return files;
}
