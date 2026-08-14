import type { ChartRange } from '@config/types';
import { STAR_MILESTONES } from '@domain/constants';
import type { ForecastData } from '@domain/forecast';
import { buildAxisLabels, formatDate } from '@domain/formatting';
import { repoStarSeries } from '@domain/snapshot';
import type { History, Snapshot } from '@domain/types';
import { getTranslations, interpolate, type Locale } from '@i18n';
import { CHART, CHART_COMPARISON_COLORS, MIN_SNAPSHOTS_FOR_CHART, TREND_WINDOW } from './constants';
import { buildForecastChartSeries, movingAverageSeries, selectChartSnapshots } from './shared';
import type { ColorPalette } from './types';

export const AxisLabels = {
  THINNED: 'thinned',
  DATES: 'dates',
} as const;

export type AxisLabels = (typeof AxisLabels)[keyof typeof AxisLabels];

export const SeriesDash = {
  NONE: 'none',
  TREND: 'trend',
  LINEAR_REGRESSION: 'linear-regression',
  WEIGHTED_MOVING_AVERAGE: 'weighted-moving-average',
} as const;

export type SeriesDash = (typeof SeriesDash)[keyof typeof SeriesDash];

export const SeriesWeight = {
  PRIMARY: 'primary',
  SECONDARY: 'secondary',
  HIDDEN: 'hidden',
} as const;

export type SeriesWeight = (typeof SeriesWeight)[keyof typeof SeriesWeight];

export interface ChartSeries {
  label: string;
  data: (number | null)[];
  color: string;
  fill: boolean;
  dash: SeriesDash;
  weight: SeriesWeight;
}

export interface ChartSpec {
  labels: string[];
  series: ChartSeries[];
  title: string;
  showLegend: boolean;
  milestones: readonly number[];
}

interface WindowParams {
  history: History;
  locale: Locale;
  range?: ChartRange;
  maxPoints?: number;
  axisLabels: AxisLabels;
}

interface Window {
  snapshots: Snapshot[];
  labels: string[];
}

function selectWindow({ history, locale, range, maxPoints, axisLabels }: WindowParams): Window {
  const snapshots = selectChartSnapshots({ snapshots: history.snapshots, range, maxPoints });
  const timestamps = snapshots.map((snapshot) => snapshot.timestamp);

  return {
    snapshots,
    labels:
      axisLabels === AxisLabels.THINNED
        ? buildAxisLabels({ timestamps, locale })
        : timestamps.map((timestamp) => formatDate({ timestamp, locale })),
  };
}

function resolveMilestones(customMilestones?: readonly number[]): readonly number[] {
  return customMilestones && customMilestones.length > 0 ? customMilestones : STAR_MILESTONES;
}

interface VisibleMilestonesParams {
  series: ChartSeries[];
  thresholds: readonly number[];
}

function visibleMilestones({ series, thresholds }: VisibleMilestonesParams): readonly number[] {
  const values = series.flatMap((entry) =>
    entry.data.filter((value): value is number => value !== null),
  );

  if (values.length === 0) return [];

  const min = Math.min(...values);
  const max = Math.max(...values);

  return thresholds.filter((milestone) => milestone > min && milestone < max);
}

interface StarHistorySpecParams extends WindowParams {
  title: string;
  palette: ColorPalette;
  lineColor?: string;
  milestones?: boolean;
  customMilestones?: readonly number[];
  trendLine?: boolean;
}

function starHistorySpec({
  title,
  palette,
  lineColor,
  milestones = true,
  customMilestones,
  trendLine = false,
  ...window
}: StarHistorySpecParams): ChartSpec | null {
  if (window.history.snapshots.length < MIN_SNAPSHOTS_FOR_CHART) return null;

  const t = getTranslations(window.locale);
  const { snapshots, labels } = selectWindow(window);
  const data = snapshots.map((snapshot) => snapshot.totalStars);
  const series: ChartSeries[] = [
    {
      label: 'Stars',
      data,
      color: lineColor ?? palette.accent,
      fill: true,
      dash: SeriesDash.NONE,
      weight: SeriesWeight.PRIMARY,
    },
  ];

  if (trendLine) {
    series.push({
      label: t.report.trendLine,
      data: movingAverageSeries({ values: data, window: TREND_WINDOW }),
      color: palette.neutral,
      fill: false,
      dash: SeriesDash.TREND,
      weight: SeriesWeight.HIDDEN,
    });
  }

  return {
    labels,
    series,
    title,
    showLegend: false,
    milestones: milestones
      ? visibleMilestones({ series, thresholds: resolveMilestones(customMilestones) })
      : [],
  };
}

interface PerRepoSpecParams extends WindowParams {
  repoFullName: string;
  title: string;
  palette: ColorPalette;
  lineColor?: string;
}

function perRepoSpec({
  repoFullName,
  title,
  palette,
  lineColor,
  ...window
}: PerRepoSpecParams): ChartSpec | null {
  if (window.history.snapshots.length < MIN_SNAPSHOTS_FOR_CHART) return null;

  const { snapshots, labels } = selectWindow(window);

  return {
    labels,
    series: [
      {
        label: 'Stars',
        data: repoStarSeries({ snapshots, repoFullName }),
        color: lineColor ?? palette.accent,
        fill: true,
        dash: SeriesDash.NONE,
        weight: SeriesWeight.PRIMARY,
      },
    ],
    title,
    showLegend: false,
    milestones: [],
  };
}

interface ComparisonSpecParams extends WindowParams {
  repoNames: string[];
  title: string;
}

function comparisonSpec({ repoNames, title, ...window }: ComparisonSpecParams): ChartSpec | null {
  if (window.history.snapshots.length < MIN_SNAPSHOTS_FOR_CHART || repoNames.length === 0) {
    return null;
  }

  const { snapshots, labels } = selectWindow(window);
  const capped = repoNames.slice(0, CHART.maxComparison);
  const owners = new Set(capped.map((name) => name.split('/')[0]));
  const useShortLabels = owners.size === 1;

  return {
    labels,
    series: capped.map((repoName, index) => ({
      label: useShortLabels ? repoName.split('/')[1] : repoName,
      data: repoStarSeries({ snapshots, repoFullName: repoName }),
      color: CHART_COMPARISON_COLORS[index % CHART_COMPARISON_COLORS.length],
      fill: false,
      dash: SeriesDash.NONE,
      weight: SeriesWeight.SECONDARY,
    })),
    title,
    showLegend: true,
    milestones: [],
  };
}

interface ForecastSpecParams extends Omit<WindowParams, 'axisLabels'> {
  forecastData: ForecastData;
  title: string;
  palette: ColorPalette;
  lineColor?: string;
}

function forecastSpec({
  forecastData,
  title,
  palette,
  lineColor,
  ...window
}: ForecastSpecParams): ChartSpec | null {
  if (window.history.snapshots.length < MIN_SNAPSHOTS_FOR_CHART) return null;

  const t = getTranslations(window.locale);
  const { snapshots, labels: historicalLabels } = selectWindow({
    ...window,
    axisLabels: AxisLabels.DATES,
  });
  const historicalData = snapshots.map((snapshot) => snapshot.totalStars);
  const forecastLabels = forecastData.aggregate.forecasts[0].points.map((point) =>
    interpolate({ template: t.forecast.week, params: { n: point.weekOffset } }),
  );
  const series = buildForecastChartSeries({ historicalData, forecastData });

  return {
    labels: [...historicalLabels, ...forecastLabels],
    series: [
      {
        label: t.report.starHistory,
        data: series.historical,
        color: lineColor ?? palette.accent,
        fill: true,
        dash: SeriesDash.NONE,
        weight: SeriesWeight.PRIMARY,
      },
      {
        label: t.forecast.linearRegression,
        data: series.linearRegression,
        color: palette.positive,
        fill: false,
        dash: SeriesDash.LINEAR_REGRESSION,
        weight: SeriesWeight.SECONDARY,
      },
      {
        label: t.forecast.weightedMovingAverage,
        data: series.weightedMovingAverage,
        color: palette.negative,
        fill: false,
        dash: SeriesDash.WEIGHTED_MOVING_AVERAGE,
        weight: SeriesWeight.SECONDARY,
      },
    ],
    title,
    showLegend: true,
    milestones: [],
  };
}

export const ChartKind = {
  STAR_HISTORY: 'star-history',
  PER_REPO: 'per-repo',
  COMPARISON: 'comparison',
  FORECAST: 'forecast',
} as const;

export type ChartKind = (typeof ChartKind)[keyof typeof ChartKind];

interface ChartRequestBase {
  history: History;
  title?: string;
}

export interface StarHistoryChartRequest extends ChartRequestBase {
  kind: typeof ChartKind.STAR_HISTORY;
  lineColor?: string;
  milestones?: boolean;
  customMilestones?: readonly number[];
  trendLine?: boolean;
}

export interface PerRepoChartRequest extends ChartRequestBase {
  kind: typeof ChartKind.PER_REPO;
  repoFullName: string;
  lineColor?: string;
}

export interface ComparisonChartRequest extends ChartRequestBase {
  kind: typeof ChartKind.COMPARISON;
  repoNames: string[];
}

export interface ForecastChartRequest extends ChartRequestBase {
  kind: typeof ChartKind.FORECAST;
  forecastData: ForecastData;
  lineColor?: string;
}

export type ChartRequest =
  | StarHistoryChartRequest
  | PerRepoChartRequest
  | ComparisonChartRequest
  | ForecastChartRequest;

interface BuildChartSpecParams {
  request: ChartRequest;
  locale: Locale;
  palette: ColorPalette;
  axisLabels: AxisLabels;
  range?: ChartRange;
  maxPoints?: number;
}

export function buildChartSpec({
  request,
  locale,
  palette,
  axisLabels,
  range,
  maxPoints,
}: BuildChartSpecParams): ChartSpec | null {
  const t = getTranslations(locale);
  const window = { history: request.history, locale, range, maxPoints, axisLabels };

  switch (request.kind) {
    case ChartKind.STAR_HISTORY:
      return starHistorySpec({
        ...window,
        title: request.title ?? t.report.starHistory,
        palette,
        lineColor: request.lineColor,
        milestones: request.milestones,
        customMilestones: request.customMilestones,
        trendLine: request.trendLine,
      });
    case ChartKind.PER_REPO:
      return perRepoSpec({
        ...window,
        repoFullName: request.repoFullName,
        title: request.title ?? `${request.repoFullName} Star History`,
        palette,
        lineColor: request.lineColor,
      });
    case ChartKind.COMPARISON:
      return comparisonSpec({
        ...window,
        repoNames: request.repoNames,
        title: request.title ?? t.report.topRepositories,
      });
    case ChartKind.FORECAST:
      return forecastSpec({
        ...window,
        forecastData: request.forecastData,
        title: request.title ?? t.forecast.sectionTitle,
        palette,
        lineColor: request.lineColor,
      });
  }
}
