import type { ForecastData } from '@domain/forecast';
import { formatDate } from '@domain/formatting';
import type { History } from '@domain/types';
import { getTranslations, interpolate, type Locale } from '@i18n';
import {
  CHART,
  CHART_COMPARISON_COLORS,
  CHART_POINT,
  CHART_TENSION,
  COLORS,
  MILESTONE_THRESHOLDS,
  MIN_SNAPSHOTS_FOR_CHART,
} from './constants';
import { buildForecastChartSeries } from './shared';

function tensionFor(smoothing: boolean): number {
  return smoothing ? CHART_TENSION.smooth : CHART_TENSION.straight;
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
}

export function buildMilestoneAnnotations({
  minStars,
  maxStars,
}: BuildMilestoneAnnotationsParams): AnnotationPlugin | null {
  const visible = MILESTONE_THRESHOLDS.filter(
    (milestone) => milestone > minStars && milestone < maxStars,
  );

  if (visible.length === 0) return null;

  const annotations: Record<string, MilestoneAnnotation> = {};

  for (const milestone of visible) {
    annotations[`milestone${milestone}`] = {
      type: 'line',
      yMin: milestone,
      yMax: milestone,
      borderColor: COLORS.neutral,
      borderWidth: 1,
      borderDash: [6, 6],
      label: {
        display: true,
        content: `${milestone.toLocaleString('en-US')} ★`,
        position: 'start',
        backgroundColor: `${COLORS.neutral}33`,
        color: COLORS.neutral,
        font: { size: 10 },
      },
    };
  }

  return { annotations };
}

interface BuildChartOptionsParams {
  title: string;
  showLegend: boolean;
  annotation?: AnnotationPlugin | null;
}

function buildChartOptions({
  title,
  showLegend,
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
          color: COLORS.text,
          font: { size: showLegend ? 11 : 12 },
        },
      },
      title: {
        display: true,
        text: title,
        color: COLORS.text,
        font: { size: 16, weight: 'bold' },
      },
      ...(annotation ? { annotation } : {}),
    },
    scales: {
      x: {
        grid: { color: COLORS.cellBorder },
        ticks: { color: COLORS.neutral },
      },
      y: {
        grid: { color: COLORS.cellBorder },
        ticks: { color: COLORS.neutral },
        beginAtZero: false,
      },
    },
  };
}

interface BuildStarsDatasetParams {
  data: number[];
  tension: number;
  showPoints: boolean;
}

function buildStarsDataset({ data, tension, showPoints }: BuildStarsDatasetParams): Dataset {
  return {
    label: 'Stars',
    data,
    borderColor: COLORS.accent,
    backgroundColor: `${COLORS.accent}33`,
    fill: true,
    tension,
    pointRadius: showPoints ? CHART_POINT.primaryRadius : CHART_POINT.hidden,
    pointHoverRadius: CHART_POINT.primaryHoverRadius,
  };
}

function buildChartUrl(config: ChartConfig): string {
  const encodedConfig = encodeURIComponent(JSON.stringify(config));

  return `https://quickchart.io/chart?w=${CHART.width}&h=${CHART.height}&c=${encodedConfig}`;
}

interface PrepareChartDataParams {
  history: History;
  locale: Locale;
}

function prepareChartData({ history, locale }: PrepareChartDataParams): {
  labels: string[];
  data: number[];
} {
  const snapshots = [...history.snapshots].slice(-CHART.maxDataPoints);

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
  annotation?: AnnotationPlugin | null;
}

function buildChartConfig({
  labels,
  datasets,
  title,
  showLegend,
  annotation,
}: BuildChartConfigParams): ChartConfig {
  return {
    type: 'line',
    data: { labels, datasets },
    options: buildChartOptions({ title, showLegend, annotation }),
  };
}

interface GenerateChartUrlParams {
  history: History;
  title?: string;
  locale: Locale;
  smoothing?: boolean;
  showPoints?: boolean;
}

export function generateChartUrl({
  history,
  title,
  locale,
  smoothing = true,
  showPoints = true,
}: GenerateChartUrlParams): string | null {
  if (!history.snapshots || history.snapshots.length < MIN_SNAPSHOTS_FOR_CHART) {
    return null;
  }

  const t = getTranslations(locale);
  const tension = tensionFor(smoothing);
  const chartTitle = title ?? t.report.starHistory;
  const { labels, data } = prepareChartData({ history, locale });
  const datasets: Dataset[] = [buildStarsDataset({ data, tension, showPoints })];
  const minStars = Math.min(...data);
  const maxStars = Math.max(...data);
  const annotation = buildMilestoneAnnotations({ minStars, maxStars });
  const config = buildChartConfig({
    labels,
    datasets,
    title: chartTitle,
    showLegend: false,
    annotation,
  });

  return buildChartUrl(config);
}

interface GeneratePerRepoChartUrlParams {
  history: History;
  repoFullName: string;
  title?: string;
  locale: Locale;
  smoothing?: boolean;
  showPoints?: boolean;
}

export function generatePerRepoChartUrl({
  history,
  repoFullName,
  title,
  locale,
  smoothing = true,
  showPoints = true,
}: GeneratePerRepoChartUrlParams): string | null {
  if (!history.snapshots || history.snapshots.length < MIN_SNAPSHOTS_FOR_CHART) {
    return null;
  }

  const tension = tensionFor(smoothing);
  const snapshots = [...history.snapshots].slice(-CHART.maxDataPoints);
  const labels = snapshots.map((snapshot) => formatDate({ timestamp: snapshot.timestamp, locale }));
  const data = snapshots.map((snapshot) => {
    const repo = snapshot.repos.find((candidate) => candidate.fullName === repoFullName);

    return repo?.stars ?? 0;
  });
  const chartTitle = title ?? `${repoFullName} Star History`;
  const datasets: Dataset[] = [buildStarsDataset({ data, tension, showPoints })];

  const config = buildChartConfig({ labels, datasets, title: chartTitle, showLegend: false });

  return buildChartUrl(config);
}

interface GenerateComparisonChartUrlParams {
  history: History;
  repoNames: string[];
  title?: string;
  locale: Locale;
  smoothing?: boolean;
  showPoints?: boolean;
}

export function generateComparisonChartUrl({
  history,
  repoNames,
  title,
  locale,
  smoothing = true,
  showPoints = true,
}: GenerateComparisonChartUrlParams): string | null {
  if (
    !history.snapshots ||
    history.snapshots.length < MIN_SNAPSHOTS_FOR_CHART ||
    repoNames.length === 0
  ) {
    return null;
  }

  const t = getTranslations(locale);
  const tension = tensionFor(smoothing);
  const chartTitle = title ?? t.report.topRepositories;
  const snapshots = [...history.snapshots].slice(-CHART.maxDataPoints);
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
      pointRadius: showPoints ? CHART_POINT.secondaryRadius : CHART_POINT.hidden,
      pointHoverRadius: CHART_POINT.secondaryHoverRadius,
    };
  });
  const config = buildChartConfig({ labels, datasets, title: chartTitle, showLegend: true });

  return buildChartUrl(config);
}

interface GenerateForecastChartUrlParams {
  history: History;
  forecastData: ForecastData;
  locale: Locale;
  title?: string;
  smoothing?: boolean;
  showPoints?: boolean;
}

export function generateForecastChartUrl({
  history,
  forecastData,
  locale,
  title,
  smoothing = true,
  showPoints = true,
}: GenerateForecastChartUrlParams): string | null {
  if (!history.snapshots || history.snapshots.length < MIN_SNAPSHOTS_FOR_CHART) {
    return null;
  }

  const t = getTranslations(locale);
  const tension = tensionFor(smoothing);
  const chartTitle = title ?? t.forecast.sectionTitle;
  const snapshots = [...history.snapshots].slice(-CHART.maxDataPoints);
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
      borderColor: COLORS.accent,
      backgroundColor: `${COLORS.accent}33`,
      fill: true,
      tension,
      pointRadius: showPoints ? CHART_POINT.primaryRadius : CHART_POINT.hidden,
      pointHoverRadius: CHART_POINT.primaryHoverRadius,
    },
    {
      label: t.forecast.linearRegression,
      data: series.linearRegression,
      borderColor: COLORS.positive,
      backgroundColor: 'transparent',
      fill: false,
      tension,
      pointRadius: showPoints ? CHART_POINT.secondaryRadius : CHART_POINT.hidden,
      pointHoverRadius: CHART_POINT.secondaryHoverRadius,
      borderDash: [8, 4],
    },
    {
      label: t.forecast.weightedMovingAverage,
      data: series.weightedMovingAverage,
      borderColor: COLORS.negative,
      backgroundColor: 'transparent',
      fill: false,
      tension,
      pointRadius: showPoints ? CHART_POINT.secondaryRadius : CHART_POINT.hidden,
      pointHoverRadius: CHART_POINT.secondaryHoverRadius,
      borderDash: [4, 4],
    },
  ];

  const config = buildChartConfig({
    labels: allLabels,
    datasets,
    title: chartTitle,
    showLegend: true,
  });

  return buildChartUrl(config);
}
