import { ChartCurve, ChartRange, ChartTheme } from '@config/types';
import type { Locale } from '@i18n';
import type { ChartMilestone, ChartRequest, ChartSeries } from './chart-spec';
import { AxisLabels, buildChartSpec, SeriesDash, SeriesWeight } from './chart-spec';
import { CHART, CHART_POINT, CHART_TENSION } from './constants';
import { resolvePalette } from './shared';
import type { ColorPalette } from './types';

const CHART_STYLE = {
  translucentAlpha: '33',
  titleFontSize: 16,
  legendFontSize: 11,
  legendHiddenFontSize: 12,
  milestoneBorderWidth: 1,
  milestoneFontSize: 10,
  milestoneDash: [6, 6] as [number, number],
  trendDash: [6, 4],
  linearRegressionDash: [8, 4],
  weightedMovingAverageDash: [4, 4],
};

interface CurveProps {
  tension: number;
  cubicInterpolationMode?: typeof ChartCurve.MONOTONE;
}

const CURVE_PROPS: Record<ChartCurve, CurveProps> = {
  [ChartCurve.CATMULL_ROM]: { tension: CHART_TENSION.smooth },
  [ChartCurve.CUBIC_BEZIER]: { tension: CHART_TENSION.smooth },
  [ChartCurve.MONOTONE]: {
    tension: CHART_TENSION.smooth,
    cubicInterpolationMode: ChartCurve.MONOTONE,
  },
  [ChartCurve.ROUNDED_STEP]: {
    tension: CHART_TENSION.smooth,
    cubicInterpolationMode: ChartCurve.MONOTONE,
  },
};

interface CurvePropsForParams {
  smoothing: boolean;
  curve: ChartCurve;
}

function curvePropsFor({ smoothing, curve }: CurvePropsForParams): CurveProps {
  return smoothing ? CURVE_PROPS[curve] : { tension: CHART_TENSION.straight };
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
  cubicInterpolationMode?: typeof ChartCurve.MONOTONE;
  pointRadius: number;
  pointHoverRadius: number;
  borderDash?: number[];
  borderWidth?: number;
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
  milestones: readonly ChartMilestone[];
  palette: ColorPalette;
}

function buildMilestoneAnnotations({
  milestones,
  palette,
}: BuildMilestoneAnnotationsParams): AnnotationPlugin | null {
  if (milestones.length === 0) return null;

  const annotations: Record<string, MilestoneAnnotation> = {};

  for (const milestone of milestones) {
    annotations[`milestone${milestone.value}`] = {
      type: 'line',
      yMin: milestone.value,
      yMax: milestone.value,
      borderColor: palette.neutral,
      borderWidth: CHART_STYLE.milestoneBorderWidth,
      borderDash: CHART_STYLE.milestoneDash,
      label: {
        display: true,
        content: milestone.label,
        position: 'start',
        backgroundColor: `${palette.neutral}${CHART_STYLE.translucentAlpha}`,
        color: palette.neutral,
        font: { size: CHART_STYLE.milestoneFontSize },
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
          font: {
            size: showLegend ? CHART_STYLE.legendFontSize : CHART_STYLE.legendHiddenFontSize,
          },
        },
      },
      title: {
        display: true,
        text: title,
        color: palette.text,
        font: { size: CHART_STYLE.titleFontSize, weight: 'bold' },
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

interface BuildChartUrlParams {
  config: ChartConfig;
  palette: ColorPalette;
}

function buildChartUrl({ config, palette }: BuildChartUrlParams): string {
  const encodedConfig = encodeURIComponent(JSON.stringify(config));
  const backgroundColor = encodeURIComponent(palette.white);

  return `https://quickchart.io/chart?w=${CHART.width}&h=${CHART.height}&backgroundColor=${backgroundColor}&c=${encodedConfig}`;
}

const DASH_PATTERNS: Record<SeriesDash, number[] | null> = {
  [SeriesDash.NONE]: null,
  [SeriesDash.TREND]: CHART_STYLE.trendDash,
  [SeriesDash.LINEAR_REGRESSION]: CHART_STYLE.linearRegressionDash,
  [SeriesDash.WEIGHTED_MOVING_AVERAGE]: CHART_STYLE.weightedMovingAverageDash,
};

const POINT_SIZES: Record<SeriesWeight, { radius: number; hoverRadius: number }> = {
  [SeriesWeight.PRIMARY]: {
    radius: CHART_POINT.primaryRadius,
    hoverRadius: CHART_POINT.primaryHoverRadius,
  },
  [SeriesWeight.SECONDARY]: {
    radius: CHART_POINT.secondaryRadius,
    hoverRadius: CHART_POINT.secondaryHoverRadius,
  },
  [SeriesWeight.HIDDEN]: { radius: CHART_POINT.hidden, hoverRadius: CHART_POINT.hidden },
};

interface ToDatasetParams {
  series: ChartSeries;
  curveProps: CurveProps;
  showPoints: boolean;
  lineWidth?: number;
}

function toDataset({ series, curveProps, showPoints, lineWidth }: ToDatasetParams): Dataset {
  const dash = DASH_PATTERNS[series.dash];
  const point = POINT_SIZES[series.weight];

  return {
    label: series.label,
    data: series.data,
    borderColor: series.color,
    backgroundColor:
      series.dash === SeriesDash.NONE
        ? `${series.color}${CHART_STYLE.translucentAlpha}`
        : 'transparent',
    fill: series.fill,
    ...curveProps,
    pointRadius:
      series.weight === SeriesWeight.HIDDEN
        ? CHART_POINT.hidden
        : pointRadiusFor({ showPoints, radius: point.radius }),
    pointHoverRadius: point.hoverRadius,
    ...(dash ? { borderDash: dash } : {}),
    ...(lineWidth ? { borderWidth: lineWidth } : {}),
  };
}

interface ChartImageUrlParams {
  request: ChartRequest;
  locale: Locale;
  smoothing?: boolean;
  curve?: ChartCurve;
  showPoints?: boolean;
  beginAtZero?: boolean;
  theme?: ChartTheme;
  range?: ChartRange;
  lineWidth?: number;
}

export function chartImageUrl({
  request,
  locale,
  smoothing = true,
  curve = ChartCurve.MONOTONE,
  showPoints = true,
  beginAtZero = false,
  theme = ChartTheme.AUTO,
  range = ChartRange.ALL,
  lineWidth,
}: ChartImageUrlParams): string | null {
  const palette = resolvePalette(theme);
  const spec = buildChartSpec({
    request,
    locale,
    palette,
    axisLabels: AxisLabels.DATES,
    range,
  });

  if (spec === null) return null;

  const curveProps = curvePropsFor({ smoothing, curve });
  const datasets = spec.series.map((series) =>
    toDataset({ series, curveProps, showPoints, lineWidth }),
  );
  const annotation = buildMilestoneAnnotations({ milestones: spec.milestones, palette });

  return buildChartUrl({
    config: buildChartConfig({
      labels: spec.labels,
      datasets,
      title: spec.title,
      showLegend: spec.showLegend,
      beginAtZero,
      palette,
      annotation,
    }),
    palette,
  });
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
