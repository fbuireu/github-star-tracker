import { formatDate } from '@domain/formatting';
import type { History } from '@domain/types';
import { getTranslations, type Locale } from '@i18n';
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

interface BuildChartOptionsParams {
  title: string;
  showLegend: boolean;
}

function buildChartOptions({ title, showLegend }: BuildChartOptionsParams): ChartOptions {
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
}

function buildChartConfig({
  labels,
  datasets,
  title,
  showLegend,
}: BuildChartConfigParams): ChartConfig {
  return {
    type: 'line',
    data: { labels, datasets },
    options: buildChartOptions({ title, showLegend }),
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

  const config = buildChartConfig({ labels, datasets, title: chartTitle, showLegend: false });
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

  const datasets: Dataset[] = repoNames.slice(0, CHART.maxComparison).map((repoName, index) => {
    const data = snapshots.map((s) => {
      const repo = s.repos.find((r) => r.fullName === repoName);
      return repo?.stars ?? 0;
    });

    const color = CHART_COMPARISON_COLORS[index % CHART_COMPARISON_COLORS.length];

    return {
      label: repoName,
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
