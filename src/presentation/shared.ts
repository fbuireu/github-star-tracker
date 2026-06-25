import { FORECAST_WEEKS, type ForecastData, ForecastMethod } from '@domain/forecast';
import type { StargazerDiffResult } from '@domain/stargazers';
import type { ComparisonResults, History, RepoResult } from '@domain/types';
import { getTranslations, interpolate, type Locale } from '@i18n';

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
  const activeRepos = repos.filter((r) => !r.isRemoved);

  return {
    activeRepos,
    newRepos: repos.filter((r) => r.isNew),
    removedRepos: repos.filter((r) => r.isRemoved),
    sorted: [...activeRepos].sort((a, b) => b.current - a.current),
    now: new Date().toISOString().split('T')[0],
    prev: previousTimestamp ? previousTimestamp.split('T')[0] : t.report.firstRun,
  };
}

export function buildForecastWeekHeaders(t: Translations): string[] {
  return Array.from({ length: FORECAST_WEEKS }, (_, i) =>
    interpolate({ template: t.forecast.week, params: { n: i + 1 } }),
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
    forecastData.aggregate.forecasts.find((f) => f.method === method)?.points;
  const lastHistorical = historicalData.at(-1) ?? 0;
  const padLength = historicalData.length;
  const projectFromLast = (points: { predicted: number }[] | undefined): (number | null)[] => [
    ...new Array(padLength - 1).fill(null),
    lastHistorical,
    ...(points?.map((p) => p.predicted) ?? []),
  ];

  return {
    historical: [...historicalData, ...new Array(forecastLength).fill(null)],
    linearRegression: projectFromLast(findPoints(ForecastMethod.LINEAR_REGRESSION)),
    weightedMovingAverage: projectFromLast(findPoints(ForecastMethod.WEIGHTED_MOVING_AVERAGE)),
  };
}
