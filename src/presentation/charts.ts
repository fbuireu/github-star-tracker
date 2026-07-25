import type { Config } from '@config/types';
import type { ForecastData } from '@domain/forecast';
import { buildStarHistory } from '@domain/star-history';
import type { RepoStargazers } from '@domain/stargazers';
import type { History, SnapshotRepo } from '@domain/types';
import { getTranslations } from '@i18n';
import { CHART_FILES, MIN_SNAPSHOTS_FOR_CHART } from './constants';
import { perRepoChartFile } from './shared';
import {
  generateComparisonSvgChart,
  generateForecastSvgChart,
  generatePerRepoSvgChart,
  generateSvgChart,
} from './svg-chart';

interface ChartFile {
  filename: string;
  svg: string;
}

interface ResolveChartHistoryParams {
  candidate: History;
  fallback: History;
}

export function resolveChartHistory({ candidate, fallback }: ResolveChartHistoryParams): History {
  return candidate.snapshots.length >= MIN_SNAPSHOTS_FOR_CHART ? candidate : fallback;
}

interface BuildChartFilesParams {
  config: Config;
  history: History;
  fallbackHistory: History;
  forecastData: ForecastData | null;
  topRepoNames: string[];
  repoTotals: SnapshotRepo[];
  repoStargazers: RepoStargazers[];
  now: Date;
}

export function buildChartFiles({
  config,
  history,
  fallbackHistory,
  forecastData,
  topRepoNames,
  repoTotals,
  repoStargazers,
  now,
}: BuildChartFilesParams): ChartFile[] {
  if (!config.includeCharts || history.snapshots.length < MIN_SNAPSHOTS_FOR_CHART) {
    return [];
  }

  const t = getTranslations(config.locale);
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
  const files: ChartFile[] = [];

  const starHistoryChart = generateSvgChart({
    ...style,
    history,
    title: t.report.starHistory,
    lineColor: config.chartLineColor,
    milestones: config.chartMilestones,
    customMilestones: config.chartCustomMilestones,
    trendLine: config.chartTrendLine,
  });

  if (starHistoryChart) {
    files.push({ filename: CHART_FILES.starHistory, svg: starHistoryChart });
  }

  for (const repoFullName of topRepoNames) {
    const repoTotal = repoTotals.find((repo) => repo.fullName === repoFullName);
    const repoStarHistory = repoTotal
      ? buildStarHistory({
          repoStargazers: repoStargazers.filter(
            (stargazerEntry) => stargazerEntry.repoFullName === repoFullName,
          ),
          repos: [repoTotal],
          maxPoints: config.chartMaxPoints,
          now,
        })
      : { snapshots: [] };
    const repoChart = generatePerRepoSvgChart({
      ...style,
      history: resolveChartHistory({ candidate: repoStarHistory, fallback: fallbackHistory }),
      repoFullName,
      lineColor: config.chartLineColor,
    });

    if (repoChart) {
      files.push({ filename: perRepoChartFile(repoFullName), svg: repoChart });
    }
  }

  if (topRepoNames.length > 0) {
    const comparisonChart = generateComparisonSvgChart({
      ...style,
      history,
      repoNames: topRepoNames,
      title: t.report.topRepositories,
    });

    if (comparisonChart) {
      files.push({ filename: CHART_FILES.comparison, svg: comparisonChart });
    }
  }

  if (forecastData) {
    const forecastChart = generateForecastSvgChart({
      ...style,
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
