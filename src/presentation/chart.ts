import { ChartRange, ChartTheme } from '@config/types';
import type { ForecastData } from '@domain/forecast';
import { formatDate } from '@domain/formatting';
import type { History } from '@domain/types';
import { getTranslations, interpolate, type Locale } from '@i18n';
import {
  CHART,
  CHART_COMPARISON_COLORS,
  CHART_POINT,
  CHART_TENSION,
  LIGHT_PALETTE,
  MILESTONE_THRESHOLDS,
  MIN_SNAPSHOTS_FOR_CHART,
  TREND_WINDOW,
} from './constants';
import {
  buildForecastChartSeries,
  filterSnapshotsByRange,
  movingAverageSeries,
  resolvePalette,
} from './shared';
import type { ColorPalette } from './types';

function tensionFor(smoothing: boolean): number {
  return smoothing ? CHART_TENSION.smooth : CHART_TENSION.straight;
}

interface PointRadiusForParams {
  showPoints: boolean;
  radius: number;
}

function pointRadiusFor({ showPoints, radius }: PointRadiusForParams): number {
  return showPoints ? radius : CHART_POINT.hidden;
}

interface ChartConfig {
  type: 'line';
  data: {
    labels: string[];
    datasets: Dataset[];
  };
  options: ChartOptions;
}

interface Dataset {
  label: string;
  data: (number | null)[];
  borderColor: string;
  backgroundColor: string;
  fill: boolean;
  tension: number;
  pointRadius: number;
  pointHoverRadius: number;
  borderDash?: number[];
}

interface MilestoneAnnotation {
  type: 'line';
  yMin: number;
  yMax: number;
  borderColor: string;
  borderWidth: number;
  borderDash: [number, number];
  label: {
    display: boolean;
    content: string;
    position: 'start';
    backgroundColor: string;
    color: string;
    font: { size: number };
  };
}

interface AnnotationPlugin {
  annotations: Record<string, MilestoneAnnotation>;
}

interface ChartOptions {
  responsive: boolean;
  maintainAspectRatio: boolean;
  plugins: {
    legend: {
      display: boolean;
      position: 'top';
      labels: {
        color: string;
        font: { size: number };
      };
    };
    title: {
      display: boolean;
      text: string;
      color: string;
      font: { size: number; weight: 'bold' };
    };
    annotation?: AnnotationPlugin;
  };
  scales: {
    x: {
      grid: { color: string };
      ticks: { color: string };
    };
    y: {
      grid: { color: string };
      ticks: { color: string };
      beginAtZero: boolean;
    };
  };
}

interface BuildMilestoneAnnotationsParams {
  minStars: number;
  maxStars: number;
  palette?: ColorPalette;
  thresholds?: readonly number[];
}

export function buildMilestoneAnnotations({
  minStars,
  maxStars,
  palette = LIGHT_PALETTE,
  thresholds = MILESTONE_THRESHOLDS,
}: BuildMilestoneAnnotationsParams): AnnotationPlugin | null {
  const visible = thresholds.filter((milestone) => milestone > minStars && milestone < maxStars);

  if (visible.length === 0) return null;

  const annotations: Record<string, MilestoneAnnotation> = {};

  for (const milestone of visible) {
    annotations[`milestone${milestone}`] = {
      type: 'line',
      yMin: milestone,
      yMax: milestone,
      borderColor: palette.neutral,
      borderWidth: 1,
      borderDash: [6, 6],
      label: {
        display: true,
        content: `${milestone.toLocaleString('en-US')} ★`,
        position: 'start',
        backgroundColor: `${palette.neutral}33`,
        color: palette.neutral,
        font: { size: 10 },
      },
    };
  }

  return { annotations };
}

interface BuildChartOptionsParams {
  title: string;
  showLegend: boolean;
  beginAtZero: boolean;
  palette: ColorPalette;
  annotation?: AnnotationPlugin | null;
}

function buildChartOptions({
  title,
  showLegend,
  beginAtZero,
  palette,
  annotation,
}: BuildChartOptionsParams): ChartOptions {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: showLegend,
        position: 'top',
        labels: {
          color: palette.text,
          font: { size: showLegend ? 11 : 12 },
        },
      },
      title: {
        display: true,
        text: title,
        color: palette.text,
        font: { size: 16, weight: 'bold' },
      },
      ...(annotation ? { annotation } : {}),
    },
    scales: {
      x: {
        grid: { color: palette.cellBorder },
        ticks: { color: palette.neutral },
      },
      y: {
        grid: { color: palette.cellBorder },
        ticks: { color: palette.neutral },
        beginAtZero,
      },
    },
  };
}

interface BuildStarsDatasetParams {
  data: number[];
  tension: number;
  showPoints: boolean;
  palette: ColorPalette;
}

function buildStarsDataset({
  data,
  tension,
  showPoints,
  palette,
}: BuildStarsDatasetParams): Dataset {
  return {
    label: 'Stars',
    data,
    borderColor: palette.accent,
    backgroundColor: `${palette.accent}33`,
    fill: true,
    tension,
    pointRadius: pointRadiusFor({ showPoints, radius: CHART_POINT.primaryRadius }),
    pointHoverRadius: CHART_POINT.primaryHoverRadius,
  };
}

interface BuildChartUrlParams {
  config: ChartConfig;
  palette: ColorPalette;
}

function buildChartUrl({ config, palette }: BuildChartUrlParams): string {
  const encodedConfig = encodeURIComponent(JSON.stringify(config));
  const backgroundColor = encodeURIComponent(palette.white);

  return `https://quickchart.io/chart?w=${CHART.width}&h=${CHART.height}&backgroundColor=${backgroundColor}&c=${encodedConfig}`;
}

interface PrepareChartDataParams {
  history: History;
  locale: Locale;
  range?: ChartRange;
}

function prepareChartData({ history, locale, range }: PrepareChartDataParams): {
  labels: string[];
  data: number[];
} {
  const snapshots = filterSnapshotsByRange({ snapshots: history.snapshots, range }).slice(
    -CHART.maxDataPoints,
  );

  return {
    labels: snapshots.map((snapshot) => formatDate({ timestamp: snapshot.timestamp, locale })),
    data: snapshots.map((snapshot) => snapshot.totalStars),
  };
}

interface BuildChartConfigParams {
  labels: string[];
  datasets: Dataset[];
  title: string;
  showLegend: boolean;
  beginAtZero: boolean;
  palette: ColorPalette;
  annotation?: AnnotationPlugin | null;
}

function buildChartConfig({
  labels,
  datasets,
  title,
  showLegend,
  beginAtZero,
  palette,
  annotation,
}: BuildChartConfigParams): ChartConfig {
  return {
    type: 'line',
    data: { labels, datasets },
    options: buildChartOptions({ title, showLegend, beginAtZero, palette, annotation }),
  };
}

interface GenerateChartUrlParams {
  history: History;
  title?: string;
  locale: Locale;
  smoothing?: boolean;
  showPoints?: boolean;
  milestones?: boolean;
  beginAtZero?: boolean;
  theme?: ChartTheme;
  customMilestones?: readonly number[];
  range?: ChartRange;
  trendLine?: boolean;
}

export function generateChartUrl({
  history,
  title,
  locale,
  smoothing = true,
  showPoints = true,
  milestones = true,
  beginAtZero = false,
  theme = ChartTheme.AUTO,
  customMilestones,
  range = ChartRange.ALL,
  trendLine = false,
}: GenerateChartUrlParams): string | null {
  if (!history.snapshots || history.snapshots.length < MIN_SNAPSHOTS_FOR_CHART) {
    return null;
  }

  const t = getTranslations(locale);
  const palette = resolvePalette(theme);
  const tension = tensionFor(smoothing);
  const chartTitle = title ?? t.report.starHistory;
  const { labels, data } = prepareChartData({ history, locale, range });
  const datasets: Dataset[] = [buildStarsDataset({ data, tension, showPoints, palette })];

  if (trendLine) {
    datasets.push({
      label: t.report.trendLine,
      data: movingAverageSeries({ values: data, window: TREND_WINDOW }),
      borderColor: palette.neutral,
      backgroundColor: 'transparent',
      fill: false,
      tension,
      pointRadius: CHART_POINT.hidden,
      pointHoverRadius: CHART_POINT.hidden,
      borderDash: [6, 4],
    });
  }

  const minStars = Math.min(...data);
  const maxStars = Math.max(...data);
  const thresholds =
    customMilestones && customMilestones.length > 0 ? customMilestones : MILESTONE_THRESHOLDS;
  const annotation = milestones
    ? buildMilestoneAnnotations({ minStars, maxStars, palette, thresholds })
    : null;
  const config = buildChartConfig({
    labels,
    datasets,
    title: chartTitle,
    showLegend: false,
    beginAtZero,
    palette,
    annotation,
  });

  return buildChartUrl({ config, palette });
}

interface GeneratePerRepoChartUrlParams {
  history: History;
  repoFullName: string;
  title?: string;
  locale: Locale;
  smoothing?: boolean;
  showPoints?: boolean;
  beginAtZero?: boolean;
  theme?: ChartTheme;
  range?: ChartRange;
}

export function generatePerRepoChartUrl({
  history,
  repoFullName,
  title,
  locale,
  smoothing = true,
  showPoints = true,
  beginAtZero = false,
  theme = ChartTheme.AUTO,
  range = ChartRange.ALL,
}: GeneratePerRepoChartUrlParams): string | null {
  if (!history.snapshots || history.snapshots.length < MIN_SNAPSHOTS_FOR_CHART) {
    return null;
  }

  const palette = resolvePalette(theme);
  const tension = tensionFor(smoothing);
  const snapshots = filterSnapshotsByRange({ snapshots: history.snapshots, range }).slice(
    -CHART.maxDataPoints,
  );
  const labels = snapshots.map((snapshot) => formatDate({ timestamp: snapshot.timestamp, locale }));
  const data = snapshots.map((snapshot) => {
    const repo = snapshot.repos.find((candidate) => candidate.fullName === repoFullName);

    return repo?.stars ?? 0;
  });
  const chartTitle = title ?? `${repoFullName} Star History`;
  const datasets: Dataset[] = [buildStarsDataset({ data, tension, showPoints, palette })];

  const config = buildChartConfig({
    labels,
    datasets,
    title: chartTitle,
    showLegend: false,
    beginAtZero,
    palette,
  });

  return buildChartUrl({ config, palette });
}

interface GenerateComparisonChartUrlParams {
  history: History;
  repoNames: string[];
  title?: string;
  locale: Locale;
  smoothing?: boolean;
  showPoints?: boolean;
  beginAtZero?: boolean;
  theme?: ChartTheme;
  range?: ChartRange;
}

export function generateComparisonChartUrl({
  history,
  repoNames,
  title,
  locale,
  smoothing = true,
  showPoints = true,
  beginAtZero = false,
  theme = ChartTheme.AUTO,
  range = ChartRange.ALL,
}: GenerateComparisonChartUrlParams): string | null {
  if (
    !history.snapshots ||
    history.snapshots.length < MIN_SNAPSHOTS_FOR_CHART ||
    repoNames.length === 0
  ) {
    return null;
  }

  const t = getTranslations(locale);
  const palette = resolvePalette(theme);
  const tension = tensionFor(smoothing);
  const chartTitle = title ?? t.report.topRepositories;
  const snapshots = filterSnapshotsByRange({ snapshots: history.snapshots, range }).slice(
    -CHART.maxDataPoints,
  );
  const labels = snapshots.map((snapshot) => formatDate({ timestamp: snapshot.timestamp, locale }));
  const capped = repoNames.slice(0, CHART.maxComparison);
  const owners = new Set(capped.map((name) => name.split('/')[0]));
  const useShortLabels = owners.size === 1;
  const datasets: Dataset[] = capped.map((repoName, index) => {
    const data = snapshots.map((snapshot) => {
      const repo = snapshot.repos.find((candidate) => candidate.fullName === repoName);
      return repo?.stars ?? 0;
    });
    const color = CHART_COMPARISON_COLORS[index % CHART_COMPARISON_COLORS.length];

    return {
      label: useShortLabels ? repoName.split('/')[1] : repoName,
      data,
      borderColor: color,
      backgroundColor: `${color}33`,
      fill: false,
      tension,
      pointRadius: pointRadiusFor({ showPoints, radius: CHART_POINT.secondaryRadius }),
      pointHoverRadius: CHART_POINT.secondaryHoverRadius,
    };
  });
  const config = buildChartConfig({
    labels,
    datasets,
    title: chartTitle,
    showLegend: true,
    beginAtZero,
    palette,
  });

  return buildChartUrl({ config, palette });
}

interface GenerateForecastChartUrlParams {
  history: History;
  forecastData: ForecastData;
  locale: Locale;
  title?: string;
  smoothing?: boolean;
  showPoints?: boolean;
  beginAtZero?: boolean;
  theme?: ChartTheme;
  range?: ChartRange;
}

export function generateForecastChartUrl({
  history,
  forecastData,
  locale,
  title,
  smoothing = true,
  showPoints = true,
  beginAtZero = false,
  theme = ChartTheme.AUTO,
  range = ChartRange.ALL,
}: GenerateForecastChartUrlParams): string | null {
  if (!history.snapshots || history.snapshots.length < MIN_SNAPSHOTS_FOR_CHART) {
    return null;
  }

  const t = getTranslations(locale);
  const palette = resolvePalette(theme);
  const tension = tensionFor(smoothing);
  const chartTitle = title ?? t.forecast.sectionTitle;
  const snapshots = filterSnapshotsByRange({ snapshots: history.snapshots, range }).slice(
    -CHART.maxDataPoints,
  );
  const historicalLabels = snapshots.map((snapshot) =>
    formatDate({ timestamp: snapshot.timestamp, locale }),
  );
  const historicalData = snapshots.map((snapshot) => snapshot.totalStars);
  const forecastLabels = forecastData.aggregate.forecasts[0].points.map((point) =>
    interpolate({ template: t.forecast.week, params: { n: point.weekOffset } }),
  );
  const allLabels = [...historicalLabels, ...forecastLabels];
  const series = buildForecastChartSeries({ historicalData, forecastData });
  const datasets: Dataset[] = [
    {
      label: t.report.starHistory,
      data: series.historical,
      borderColor: palette.accent,
      backgroundColor: `${palette.accent}33`,
      fill: true,
      tension,
      pointRadius: pointRadiusFor({ showPoints, radius: CHART_POINT.primaryRadius }),
      pointHoverRadius: CHART_POINT.primaryHoverRadius,
    },
    {
      label: t.forecast.linearRegression,
      data: series.linearRegression,
      borderColor: palette.positive,
      backgroundColor: 'transparent',
      fill: false,
      tension,
      pointRadius: pointRadiusFor({ showPoints, radius: CHART_POINT.secondaryRadius }),
      pointHoverRadius: CHART_POINT.secondaryHoverRadius,
      borderDash: [8, 4],
    },
    {
      label: t.forecast.weightedMovingAverage,
      data: series.weightedMovingAverage,
      borderColor: palette.negative,
      backgroundColor: 'transparent',
      fill: false,
      tension,
      pointRadius: pointRadiusFor({ showPoints, radius: CHART_POINT.secondaryRadius }),
      pointHoverRadius: CHART_POINT.secondaryHoverRadius,
      borderDash: [4, 4],
    },
  ];

  const config = buildChartConfig({
    labels: allLabels,
    datasets,
    title: chartTitle,
    showLegend: true,
    beginAtZero,
    palette,
  });

  return buildChartUrl({ config, palette });
}
