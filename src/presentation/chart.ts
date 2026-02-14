import type { ForecastData } from '@domain/forecast';
import { formatDate } from '@domain/formatting';
import type { History } from '@domain/types';
import { getTranslations, interpolate, type Locale } from '@i18n';
import { CHART, CHART_COMPARISON_COLORS, COLORS } from './constants';

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
  data: number[];
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

export const MILESTONE_THRESHOLDS = [10, 50, 100, 500, 1_000, 5_000, 10_000] as const;

interface BuildMilestoneAnnotationsParams {
  minStars: number;
  maxStars: number;
}

export function buildMilestoneAnnotations({
  minStars,
  maxStars,
}: BuildMilestoneAnnotationsParams): AnnotationPlugin | null {
  const visible = MILESTONE_THRESHOLDS.filter((m) => m > minStars && m < maxStars);

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
    labels: snapshots.map((s) => formatDate({ timestamp: s.timestamp, locale })),
    data: snapshots.map((s) => s.totalStars),
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
}

export function generateChartUrl({
  history,
  title,
  locale,
}: GenerateChartUrlParams): string | null {
  if (!history.snapshots || history.snapshots.length < 2) {
    return null;
  }

  const t = getTranslations(locale);
  const chartTitle = title ?? t.report.starHistory;
  const { labels, data } = prepareChartData({ history, locale });

  const datasets: Dataset[] = [
    {
      label: 'Stars',
      data,
      borderColor: COLORS.accent,
      backgroundColor: `${COLORS.accent}33`,
      fill: true,
      tension: 0.4,
      pointRadius: 3,
      pointHoverRadius: 6,
    },
  ];

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
}

export function generatePerRepoChartUrl({
  history,
  repoFullName,
  title,
  locale,
}: GeneratePerRepoChartUrlParams): string | null {
  if (!history.snapshots || history.snapshots.length < 2) {
    return null;
  }

  const snapshots = [...history.snapshots].slice(-CHART.maxDataPoints);
  const labels = snapshots.map((s) => formatDate({ timestamp: s.timestamp, locale }));
  const data = snapshots.map((s) => {
    const repo = s.repos.find((r) => r.fullName === repoFullName);
    return repo?.stars ?? 0;
  });

  const chartTitle = title ?? `${repoFullName} Star History`;
  const datasets: Dataset[] = [
    {
      label: 'Stars',
      data,
      borderColor: COLORS.accent,
      backgroundColor: `${COLORS.accent}33`,
      fill: true,
      tension: 0.4,
      pointRadius: 3,
      pointHoverRadius: 6,
    },
  ];

  const config = buildChartConfig({ labels, datasets, title: chartTitle, showLegend: false });
  return buildChartUrl(config);
}

interface GenerateComparisonChartUrlParams {
  history: History;
  repoNames: string[];
  title?: string;
  locale: Locale;
}

export function generateComparisonChartUrl({
  history,
  repoNames,
  title,
  locale,
}: GenerateComparisonChartUrlParams): string | null {
  if (!history.snapshots || history.snapshots.length < 2 || repoNames.length === 0) {
    return null;
  }

  const t = getTranslations(locale);
  const chartTitle = title ?? t.report.topRepositories;
  const snapshots = [...history.snapshots].slice(-CHART.maxDataPoints);
  const labels = snapshots.map((s) => formatDate({ timestamp: s.timestamp, locale }));

  const capped = repoNames.slice(0, CHART.maxComparison);
  const owners = new Set(capped.map((name) => name.split('/')[0]));
  const useShortLabels = owners.size === 1;

  const datasets: Dataset[] = capped.map((repoName, index) => {
    const data = snapshots.map((s) => {
      const repo = s.repos.find((r) => r.fullName === repoName);
      return repo?.stars ?? 0;
    });

    const color = CHART_COMPARISON_COLORS[index % CHART_COMPARISON_COLORS.length];

    return {
      label: useShortLabels ? repoName.split('/')[1] : repoName,
      data,
      borderColor: color,
      backgroundColor: `${color}33`,
      fill: false,
      tension: 0.4,
      pointRadius: 2,
      pointHoverRadius: 5,
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
}

export function generateForecastChartUrl({
  history,
  forecastData,
  locale,
  title,
}: GenerateForecastChartUrlParams): string | null {
  if (!history.snapshots || history.snapshots.length < 2) {
    return null;
  }

  const t = getTranslations(locale);
  const chartTitle = title ?? t.forecast.sectionTitle;
  const snapshots = [...history.snapshots].slice(-CHART.maxDataPoints);

  const historicalLabels = snapshots.map((s) => formatDate({ timestamp: s.timestamp, locale }));
  const historicalData = snapshots.map((s) => s.totalStars);

  const forecastLabels = forecastData.aggregate.forecasts[0].points.map((p) =>
    interpolate({ template: t.forecast.week, params: { n: p.weekOffset } }),
  );

  const allLabels = [...historicalLabels, ...forecastLabels];

  const lrForecast = forecastData.aggregate.forecasts.find((f) => f.method === 'linear-regression');
  const wmaForecast = forecastData.aggregate.forecasts.find(
    (f) => f.method === 'weighted-moving-average',
  );

  const lastHistorical = historicalData.at(-1) ?? 0;
  const padLength = historicalData.length;

  const datasets: Dataset[] = [
    {
      label: t.report.starHistory,
      data: [...historicalData, ...Array(forecastLabels.length).fill(null)],
      borderColor: COLORS.accent,
      backgroundColor: `${COLORS.accent}33`,
      fill: true,
      tension: 0.4,
      pointRadius: 3,
      pointHoverRadius: 6,
    },
    {
      label: t.forecast.linearRegression,
      data: [
        ...Array(padLength - 1).fill(null),
        lastHistorical,
        ...(lrForecast?.points.map((p) => p.predicted) ?? []),
      ],
      borderColor: COLORS.positive,
      backgroundColor: 'transparent',
      fill: false,
      tension: 0.4,
      pointRadius: 2,
      pointHoverRadius: 5,
      borderDash: [8, 4],
    },
    {
      label: t.forecast.weightedMovingAverage,
      data: [
        ...Array(padLength - 1).fill(null),
        lastHistorical,
        ...(wmaForecast?.points.map((p) => p.predicted) ?? []),
      ],
      borderColor: COLORS.negative,
      backgroundColor: 'transparent',
      fill: false,
      tension: 0.4,
      pointRadius: 2,
      pointHoverRadius: 5,
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
