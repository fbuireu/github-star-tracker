import { type ChartCurve, type ChartRange, ChartTheme, type Config } from '@config/types';
import { rankByStars } from '@domain/comparison';
import { FORECAST_WEEKS } from '@domain/constants';
import { type ForecastData, ForecastMethod } from '@domain/forecast';
import type { StargazerDiffResult } from '@domain/stargazers';
import type { ComparisonResults, History, RepoResult } from '@domain/types';
import { getTranslations, interpolate, type Locale, type Translations } from '@i18n';
import { DARK_PALETTE, LIGHT_PALETTE } from './constants';
import type { ReportModel } from './report-model';
import type { ChartHistories, ColorPalette } from './types';

export interface ReportParams {
  config: Config;
  results: ComparisonResults;
  previousTimestamp: string | null;
  history?: History | null;
  velocityHistory?: History | null;
  stargazerDiff?: StargazerDiffResult | null;
  forecastData?: ForecastData | null;
  now?: Date;
  chartHistories?: ChartHistories | null;
  hasChartFile?: (repoFullName: string) => boolean;
}

export interface RenderReportParams {
  model: ReportModel;
  config: Config;
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

export interface ReportData {
  activeRepos: RepoResult[];
  newRepos: RepoResult[];
  removedRepos: RepoResult[];
  sorted: RepoResult[];
  now: string;
  prev: string;
  generatedAt: string;
}

export interface PrepareReportDataParams {
  results: ComparisonResults;
  previousTimestamp: string | null;
  locale: Locale;
  now?: Date;
}

export function prepareReportData({
  results,
  previousTimestamp,
  locale,
  now = new Date(),
}: PrepareReportDataParams): ReportData {
  const { repos } = results;
  const t = getTranslations(locale);
  const generatedAt = now.toISOString();

  return {
    activeRepos: repos.filter((repo) => !repo.isRemoved),
    newRepos: repos.filter((repo) => repo.isNew),
    removedRepos: repos.filter((repo) => repo.isRemoved),
    sorted: rankByStars(repos),
    now: generatedAt.split('T')[0],
    prev: previousTimestamp ? previousTimestamp.split('T')[0] : t.report.firstRun,
    generatedAt,
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
