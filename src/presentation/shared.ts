import { ChartRange, ChartTheme } from '@config/types';
import { FORECAST_WEEKS, MS_PER_DAY } from '@domain/constants';
import { type ForecastData, ForecastMethod } from '@domain/forecast';
import type { StargazerDiffResult } from '@domain/stargazers';
import type { ComparisonResults, History, RepoResult } from '@domain/types';
import { getTranslations, interpolate, type Locale } from '@i18n';
import { DARK_PALETTE, LIGHT_PALETTE } from './constants';
import type { ColorPalette } from './types';

type Translations = ReturnType<typeof getTranslations>;

export interface GenerateReportParams {
  results: ComparisonResults;
  previousTimestamp: string | null;
  locale: Locale;
  history?: History | null;
  includeCharts?: boolean;
  stargazerDiff?: StargazerDiffResult | null;
  forecastData?: ForecastData | null;
  topRepos?: number;
  smoothing?: boolean;
  showPoints?: boolean;
  milestones?: boolean;
  beginAtZero?: boolean;
  theme?: ChartTheme;
  customMilestones?: readonly number[];
  range?: ChartRange;
  trendLine?: boolean;
  velocityMetrics?: boolean;
}

export function resolvePalette(theme: ChartTheme = ChartTheme.AUTO): ColorPalette {
  return theme === ChartTheme.DARK ? DARK_PALETTE : LIGHT_PALETTE;
}

export function colorSchemeFor(theme: ChartTheme): string {
  return theme === ChartTheme.AUTO ? 'light dark' : theme;
}

const CHART_RANGE_DAYS: Record<ChartRange, number> = {
  [ChartRange.D30]: 30,
  [ChartRange.D90]: 90,
  [ChartRange.Y1]: 365,
  [ChartRange.ALL]: Number.POSITIVE_INFINITY,
};

interface FilterSnapshotsByRangeParams<T> {
  snapshots: T[];
  range?: ChartRange;
}

export function filterSnapshotsByRange<T extends { timestamp: string }>({
  snapshots,
  range = ChartRange.ALL,
}: FilterSnapshotsByRangeParams<T>): T[] {
  const days = CHART_RANGE_DAYS[range];
  if (!Number.isFinite(days) || snapshots.length === 0) return snapshots;

  const lastTimestamp = new Date(snapshots[snapshots.length - 1].timestamp).getTime();
  const cutoff = lastTimestamp - days * MS_PER_DAY;

  return snapshots.filter((snapshot) => new Date(snapshot.timestamp).getTime() >= cutoff);
}

interface MovingAverageSeriesParams {
  values: number[];
  window: number;
}

export function movingAverageSeries({ values, window }: MovingAverageSeriesParams): number[] {
  return values.map((_, index) => {
    const slice = values.slice(Math.max(0, index - window + 1), index + 1);
    const sum = slice.reduce((total, value) => total + value, 0);

    return Math.round(sum / slice.length);
  });
}

export interface ReportData {
  activeRepos: RepoResult[];
  newRepos: RepoResult[];
  removedRepos: RepoResult[];
  sorted: RepoResult[];
  now: string;
  prev: string;
}

export interface PrepareReportDataParams {
  results: ComparisonResults;
  previousTimestamp: string | null;
  locale: Locale;
}

export function prepareReportData({
  results,
  previousTimestamp,
  locale,
}: PrepareReportDataParams): ReportData {
  const { repos } = results;
  const t = getTranslations(locale);
  const activeRepos = repos.filter((repo) => !repo.isRemoved);

  return {
    activeRepos,
    newRepos: repos.filter((repo) => repo.isNew),
    removedRepos: repos.filter((repo) => repo.isRemoved),
    sorted: [...activeRepos].sort((repoA, repoB) => repoB.current - repoA.current),
    now: new Date().toISOString().split('T')[0],
    prev: previousTimestamp ? previousTimestamp.split('T')[0] : t.report.firstRun,
  };
}

export function buildForecastWeekHeaders(t: Translations): string[] {
  return Array.from({ length: FORECAST_WEEKS }, (_, index) =>
    interpolate({ template: t.forecast.week, params: { n: index + 1 } }),
  );
}

interface ForecastMethodLabelParams {
  method: string;
  t: Translations;
}

export function forecastMethodLabel({ method, t }: ForecastMethodLabelParams): string {
  if (method === ForecastMethod.LINEAR_REGRESSION) return t.forecast.linearRegression;
  if (method === ForecastMethod.WEIGHTED_MOVING_AVERAGE) return t.forecast.weightedMovingAverage;

  return method;
}

export interface ForecastChartSeries {
  historical: (number | null)[];
  linearRegression: (number | null)[];
  weightedMovingAverage: (number | null)[];
}

interface BuildForecastChartSeriesParams {
  historicalData: number[];
  forecastData: ForecastData;
}

export function buildForecastChartSeries({
  historicalData,
  forecastData,
}: BuildForecastChartSeriesParams): ForecastChartSeries {
  const forecastLength = forecastData.aggregate.forecasts[0].points.length;
  const findPoints = (method: string): { predicted: number }[] | undefined =>
    forecastData.aggregate.forecasts.find((forecast) => forecast.method === method)?.points;
  const lastHistorical = historicalData.at(-1) ?? 0;
  const padLength = historicalData.length;
  const projectFromLast = (points: { predicted: number }[] | undefined): (number | null)[] => [
    ...new Array(padLength - 1).fill(null),
    lastHistorical,
    ...(points?.map((point) => point.predicted) ?? []),
  ];

  return {
    historical: [...historicalData, ...new Array(forecastLength).fill(null)],
    linearRegression: projectFromLast(findPoints(ForecastMethod.LINEAR_REGRESSION)),
    weightedMovingAverage: projectFromLast(findPoints(ForecastMethod.WEIGHTED_MOVING_AVERAGE)),
  };
}
