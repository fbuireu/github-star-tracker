import { type ChartCurve, ChartRange, ChartTheme, type Config } from '@config/types';
import { rankByStars } from '@domain/comparison';
import { FORECAST_WEEKS, MS_PER_DAY } from '@domain/constants';
import { type ForecastData, ForecastMethod } from '@domain/forecast';
import type { StargazerDiffResult } from '@domain/stargazers';
import { toEpochMs } from '@domain/time';
import type { ComparisonResults, History, RepoResult } from '@domain/types';
import { getTranslations, interpolate, type Locale } from '@i18n';
import { CHART, DARK_PALETTE, LIGHT_PALETTE } from './constants';
import type { ColorPalette } from './types';

type Translations = ReturnType<typeof getTranslations>;

export interface ReportParams {
  config: Config;
  results: ComparisonResults;
  previousTimestamp: string | null;
  history?: History | null;
  velocityHistory?: History | null;
  stargazerDiff?: StargazerDiffResult | null;
  forecastData?: ForecastData | null;
}

export interface EmailChartStyle {
  smoothing: boolean;
  curve: ChartCurve;
  showPoints: boolean;
  beginAtZero: boolean;
  range: ChartRange;
  lineWidth: number;
}

export function emailChartStyle(config: Config): EmailChartStyle {
  return {
    smoothing: config.chartSmoothing,
    curve: config.chartCurve,
    showPoints: config.chartShowPoints,
    beginAtZero: config.chartBeginAtZero,
    range: config.chartRange,
    lineWidth: config.chartLineWidth,
  };
}

const THEME_CONFIG: Record<ChartTheme, { palette: ColorPalette; colorScheme: string }> = {
  [ChartTheme.AUTO]: { palette: LIGHT_PALETTE, colorScheme: 'light dark' },
  [ChartTheme.LIGHT]: { palette: LIGHT_PALETTE, colorScheme: ChartTheme.LIGHT },
  [ChartTheme.DARK]: { palette: DARK_PALETTE, colorScheme: ChartTheme.DARK },
};

export function resolvePalette(theme: ChartTheme = ChartTheme.AUTO): ColorPalette {
  return THEME_CONFIG[theme].palette;
}

export function colorSchemeFor(theme: ChartTheme): string {
  return THEME_CONFIG[theme].colorScheme;
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

function filterSnapshotsByRange<T extends { timestamp: string }>({
  snapshots,
  range = ChartRange.ALL,
}: FilterSnapshotsByRangeParams<T>): T[] {
  const days = CHART_RANGE_DAYS[range];
  if (!Number.isFinite(days) || snapshots.length === 0) return snapshots;

  const lastTimestamp = toEpochMs(snapshots[snapshots.length - 1].timestamp);
  if (lastTimestamp === null) return snapshots;

  const cutoff = lastTimestamp - days * MS_PER_DAY;

  return snapshots.filter((snapshot) => {
    const timestamp = toEpochMs(snapshot.timestamp);

    return timestamp !== null && timestamp >= cutoff;
  });
}

interface SelectChartSnapshotsParams<T> {
  snapshots: T[];
  range?: ChartRange;
  maxPoints?: number;
}

export function selectChartSnapshots<T extends { timestamp: string }>({
  snapshots,
  range,
  maxPoints,
}: SelectChartSnapshotsParams<T>): T[] {
  const windowed = filterSnapshotsByRange({ snapshots, range });
  const limit = maxPoints ?? CHART.maxDataPoints;

  if (limit <= 0 || windowed.length <= limit) return [...windowed];
  if (limit === 1) return windowed.slice(-1);

  const step = (windowed.length - 1) / (limit - 1);

  return Array.from({ length: limit }, (_, index) => windowed[Math.round(index * step)]);
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

  return {
    activeRepos: repos.filter((repo) => !repo.isRemoved),
    newRepos: repos.filter((repo) => repo.isNew),
    removedRepos: repos.filter((repo) => repo.isRemoved),
    sorted: rankByStars(repos),
    now: new Date().toISOString().split('T')[0],
    prev: previousTimestamp ? previousTimestamp.split('T')[0] : t.report.firstRun,
  };
}

export function perRepoChartFile(repoFullName: string): string {
  return `${repoFullName.replace('/', '-')}.svg`;
}

export function buildForecastWeekHeaders(t: Translations): string[] {
  return Array.from({ length: FORECAST_WEEKS }, (_, index) =>
    interpolate({ template: t.forecast.week, params: { n: index + 1 } }),
  );
}

const FORECAST_METHOD_LABELS: Record<ForecastMethod, 'linearRegression' | 'weightedMovingAverage'> =
  {
    [ForecastMethod.LINEAR_REGRESSION]: 'linearRegression',
    [ForecastMethod.WEIGHTED_MOVING_AVERAGE]: 'weightedMovingAverage',
  };

interface ForecastMethodLabelParams {
  method: ForecastMethod;
  t: Translations;
}

export function forecastMethodLabel({ method, t }: ForecastMethodLabelParams): string {
  return t.forecast[FORECAST_METHOD_LABELS[method]];
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
  const forecastLength = forecastData.aggregate.forecasts[0]?.points.length ?? 0;
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
