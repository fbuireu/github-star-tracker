import { ChartAxisSide } from '@config/types';
import type { ForecastData } from '@domain/forecast';
import { buildAxisLabels, formatCount, formatDate } from '@domain/formatting';
import type { History } from '@domain/types';
import { getTranslations, interpolate, type Locale } from '@i18n';
import {
  CHART,
  CHART_COMPARISON_COLORS,
  COLORS,
  DARK_PALETTE,
  LIGHT_PALETTE,
  MILESTONE_THRESHOLDS,
  MIN_SNAPSHOTS_FOR_CHART,
  SVG_CHART,
} from './constants';
import { buildForecastChartSeries } from './shared';

const XML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

interface Point {
  x: number;
  y: number;
}

interface ScaleYParams {
  value: number;
  minValue: number;
  maxValue: number;
  chartTop: number;
  chartHeight: number;
}

function scaleY({ value, minValue, maxValue, chartTop, chartHeight }: ScaleYParams): number {
  if (maxValue === minValue) return chartTop + chartHeight / 2;

  return chartTop + chartHeight - ((value - minValue) / (maxValue - minValue)) * chartHeight;
}

interface GenerateSmoothPathParams {
  points: Point[];
  smooth?: boolean;
}

function generateSmoothPath({ points, smooth = true }: GenerateSmoothPathParams): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M${points[0].x},${points[0].y}`;

  let path = `M${points[0].x},${points[0].y}`;

  if (!smooth) {
    for (let index = 1; index < points.length; index++) {
      path += ` L${points[index].x},${points[index].y}`;
    }

    return path;
  }

  const tension = 0.4;

  for (let index = 0; index < points.length - 1; index++) {
    const previousPoint = points[Math.max(0, index - 1)];
    const startPoint = points[index];
    const endPoint = points[index + 1];
    const nextPoint = points[Math.min(points.length - 1, index + 2)];

    const cp1x = startPoint.x + ((endPoint.x - previousPoint.x) * tension) / 3;
    const cp2x = endPoint.x - ((nextPoint.x - startPoint.x) * tension) / 3;

    const segMinY = Math.min(startPoint.y, endPoint.y);
    const segMaxY = Math.max(startPoint.y, endPoint.y);
    const cp1y = Math.min(
      segMaxY,
      Math.max(segMinY, startPoint.y + ((endPoint.y - previousPoint.y) * tension) / 3),
    );
    const cp2y = Math.min(
      segMaxY,
      Math.max(segMinY, endPoint.y - ((nextPoint.y - startPoint.y) * tension) / 3),
    );

    path += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${endPoint.x},${endPoint.y}`;
  }

  return path;
}

function calculatePathLength(points: Point[]): number {
  let length = 0;

  for (let index = 1; index < points.length; index++) {
    const dx = points[index].x - points[index - 1].x;
    const dy = points[index].y - points[index - 1].y;
    length += Math.hypot(dx, dy);
  }

  return Math.ceil(length * 1.5);
}

interface NiceAxisStepsParams {
  min: number;
  max: number;
  count: number;
}

function niceAxisSteps({ min, max, count }: NiceAxisStepsParams): number[] {
  const range = max - min;
  if (range === 0) return [min];

  const rawStep = range / (count - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const residual = rawStep / magnitude;

  let niceStep: number;

  if (residual <= 1.5) niceStep = magnitude;
  else if (residual <= 3.5) niceStep = 2 * magnitude;
  else if (residual <= 7.5) niceStep = 5 * magnitude;
  else niceStep = 10 * magnitude;

  const niceMin = Math.floor(min / niceStep) * niceStep;
  const steps: number[] = [];

  for (let step = niceMin; step <= max + niceStep * 0.5; step += niceStep) {
    if (step >= min - niceStep * 0.5) {
      steps.push(Math.round(step));
    }
  }

  return steps;
}
function escapeXml(text: string): string {
  return text.replaceAll(/[&<>"]/g, (char) => XML_ESCAPE_MAP[char]);
}

interface SliceForChartParams<T> {
  items: T[];
  maxPoints?: number;
}

function sliceForChart<T>({ items, maxPoints }: SliceForChartParams<T>): T[] {
  const limit = maxPoints ?? CHART.maxDataPoints;

  return limit > 0 ? items.slice(-limit) : [...items];
}

interface SvgDataset {
  label: string;
  data: (number | null)[];
  color: string;
  dashed?: boolean;
  fill?: boolean;
}

interface RenderSvgParams {
  labels: string[];
  datasets: SvgDataset[];
  title: string;
  showLegend: boolean;
  milestones?: boolean;
  milestoneThresholds?: readonly number[];
  lineWidth?: number;
  yAxisSide?: ChartAxisSide;
  smoothing?: boolean;
  showPoints?: boolean;
  animate?: boolean;
}

function renderSvg({
  labels,
  datasets,
  title,
  showLegend,
  milestones = false,
  milestoneThresholds = MILESTONE_THRESHOLDS,
  lineWidth: lineWidthParam,
  yAxisSide = ChartAxisSide.LEFT,
  smoothing = true,
  showPoints = true,
  animate = true,
}: RenderSvgParams): string {
  const { margin, pointRadius, gridOpacity, fontSize, animation, font } = SVG_CHART;
  const lineWidth = lineWidthParam ?? SVG_CHART.lineWidth;
  const chartWidth = CHART.width - margin.left - margin.right;
  const chartHeight = CHART.height - margin.top - margin.bottom;
  const isRightAxis = yAxisSide === ChartAxisSide.RIGHT;
  const yAxisX = isRightAxis ? CHART.width - margin.right : margin.left;
  const yLabelX = isRightAxis ? CHART.width - margin.right + 8 : margin.left - 8;
  const yLabelAnchor = isRightAxis ? 'start' : 'end';
  const allValues = datasets.flatMap((dataset) =>
    dataset.data.filter((value): value is number => value !== null),
  );
  const minData = Math.min(...allValues);
  const maxData = Math.max(...allValues);
  const padding = Math.max(1, Math.ceil((maxData - minData) * 0.1));
  const minValue = Math.max(0, minData - padding);
  const maxValue = maxData + padding;
  const ySteps = niceAxisSteps({ min: minValue, max: maxValue, count: 5 });

  const gridLines = ySteps
    .map((value) => {
      const y = scaleY({ value, minValue, maxValue, chartTop: margin.top, chartHeight });
      return `<line x1="${margin.left}" y1="${y}" x2="${CHART.width - margin.right}" y2="${y}" class="chart-grid" stroke-opacity="${gridOpacity}" />
    <text x="${yLabelX}" y="${y + 4}" text-anchor="${yLabelAnchor}" class="chart-muted" font-size="${fontSize.label}" font-family="${font}">${formatCount(value)}</text>`;
    })
    .join('\n    ');

  const milestoneLines = milestones
    ? milestoneThresholds
        .filter((milestone) => milestone > minData && milestone < maxData)
        .map((value) => {
          const y = scaleY({ value, minValue, maxValue, chartTop: margin.top, chartHeight });
          return `<line x1="${margin.left}" y1="${y}" x2="${CHART.width - margin.right}" y2="${y}" class="chart-axis" stroke-width="1" stroke-dasharray="6,6" />
    <text x="${margin.left + 4}" y="${y - 4}" class="chart-muted" font-size="${fontSize.milestone}" font-family="${font}">${formatCount(value)} ★</text>`;
        })
        .join('\n    ')
    : '';

  const maxLabels = 10;
  const nonEmptyLabelIndices = labels.reduce<number[]>((indices, label, labelIndex) => {
    if (label !== '') indices.push(labelIndex);
    return indices;
  }, []);
  const labelStep = Math.max(1, Math.ceil(nonEmptyLabelIndices.length / maxLabels));
  const lastLabelIndex = nonEmptyLabelIndices.at(-1);
  const xLabels = nonEmptyLabelIndices
    .filter((labelIndex, position) => position % labelStep === 0 || labelIndex === lastLabelIndex)
    .map((labelIndex) => {
      const x = margin.left + (labelIndex / Math.max(1, labels.length - 1)) * chartWidth;
      return `<text x="${x}" y="${CHART.height - margin.bottom + 20}" text-anchor="middle" class="chart-muted" font-size="${fontSize.label}" font-family="${font}">${escapeXml(labels[labelIndex])}</text>`;
    })
    .join('\n    ');

  const datasetSvg = datasets.map((dataset, datasetIndex) => {
    const validSegments: { points: Point[]; startIndex: number }[] = [];
    let currentSegment: Point[] = [];
    let segmentStart = -1;

    for (let pointIndex = 0; pointIndex < dataset.data.length; pointIndex++) {
      const value = dataset.data[pointIndex];
      if (value !== null) {
        if (currentSegment.length === 0) segmentStart = pointIndex;
        currentSegment.push({
          x: margin.left + (pointIndex / Math.max(1, labels.length - 1)) * chartWidth,
          y: scaleY({ value, minValue, maxValue, chartTop: margin.top, chartHeight }),
        });
      } else if (currentSegment.length > 0) {
        validSegments.push({ points: currentSegment, startIndex: segmentStart });
        currentSegment = [];
      }
    }
    if (currentSegment.length > 0) {
      validSegments.push({ points: currentSegment, startIndex: segmentStart });
    }

    return validSegments
      .map((segment) => {
        const bottomY = CHART.height - margin.bottom;
        // Anchor the main line to the baseline at its very first point so it rises
        // from zero instead of starting mid-air. Only the primary filled line, and
        // only when it begins at the chart's left edge.
        const startsFromBaseline =
          dataset.fill !== false && !dataset.dashed && segment.startIndex === 0;
        const firstPoint = segment.points[0];
        const smoothPath = generateSmoothPath({ points: segment.points, smooth: smoothing });
        const pathD = startsFromBaseline
          ? `M${firstPoint.x},${bottomY} L${firstPoint.x},${firstPoint.y}${smoothPath.slice(`M${firstPoint.x},${firstPoint.y}`.length)}`
          : smoothPath;
        const pathLength = calculatePathLength(
          startsFromBaseline
            ? [{ x: firstPoint.x, y: bottomY }, ...segment.points]
            : segment.points,
        );

        const fillArea =
          dataset.fill !== false && !dataset.dashed
            ? (() => {
                const first = segment.points[0];
                const last = segment.points.at(-1) as Point;
                return `<path d="${pathD} L${last.x},${bottomY} L${first.x},${bottomY} Z" fill="${dataset.color}" fill-opacity="0.1" />`;
              })()
            : '';

        const dashAttr = dataset.dashed ? ' stroke-dasharray="8,4"' : '';
        const lineClass = dataset.dashed ? '' : ` class="data-line-${datasetIndex}"`;
        const pathEl = `<path d="${pathD}" fill="none" stroke="${dataset.color}" stroke-width="${lineWidth}"${dashAttr}${lineClass} />`;

        const circles =
          dataset.dashed || !showPoints
            ? ''
            : segment.points
                .map(
                  (point, pointIndex) =>
                    `<circle cx="${point.x}" cy="${point.y}" r="${pointRadius}" fill="${dataset.color}" class="data-point" style="animation-delay: ${((segment.startIndex + pointIndex) * animation.pointStagger + animation.pointDelay).toFixed(2)}s" />`,
                )
                .join('\n    ');

        const animationStyle =
          dataset.dashed || !animate
            ? ''
            : `
    .data-line-${datasetIndex} {
      stroke-dasharray: ${pathLength};
      stroke-dashoffset: ${pathLength};
      animation: drawLine ${animation.lineDuration}s ease-out forwards;
    }`;

        return { fillArea, pathEl, circles, animationStyle };
      })
      .reduce(
        (accumulated, segment) => ({
          fillArea: accumulated.fillArea + segment.fillArea,
          pathEl: accumulated.pathEl + segment.pathEl,
          circles: accumulated.circles + (segment.circles ? `\n    ${segment.circles}` : ''),
          animationStyle: accumulated.animationStyle + segment.animationStyle,
        }),
        { fillArea: '', pathEl: '', circles: '', animationStyle: '' },
      );
  });

  const allAnimationStyles = datasetSvg.map((dataset) => dataset.animationStyle).join('');
  const allFills = datasetSvg.map((dataset) => dataset.fillArea).join('\n  ');
  const allPaths = datasetSvg.map((dataset) => dataset.pathEl).join('\n  ');
  const allCircles = datasetSvg
    .map((dataset) => dataset.circles)
    .filter(Boolean)
    .join('\n    ');

  const legendSection = showLegend
    ? (() => {
        const legendY = margin.top - SVG_CHART.header.legendOffset;
        const itemWidth = 120;
        const totalWidth = datasets.length * itemWidth;
        const startX = (CHART.width - totalWidth) / 2;
        return datasets
          .map((dataset, datasetIndex) => {
            const x = startX + datasetIndex * itemWidth;
            const dashAttr = dataset.dashed ? ' stroke-dasharray="4,2"' : '';
            const rectAttr = dataset.dashed ? ' rx="1"' : '';
            return `<rect x="${x}" y="${legendY - 5}" width="12" height="3" fill="${dataset.color}"${rectAttr} />
    <line x1="${x}" y1="${legendY - 3.5}" x2="${x + 12}" y2="${legendY - 3.5}" stroke="${dataset.color}" stroke-width="2"${dashAttr} />
    <text x="${x + 16}" y="${legendY}" class="chart-text" font-size="10" font-family="${font}">${escapeXml(dataset.label)}</text>`;
          })
          .join('\n    ');
      })()
    : '';

  const titleY =
    margin.top -
    (showLegend ? SVG_CHART.header.titleWithLegendOffset : SVG_CHART.header.titleOffset);

  const animationDefs = animate
    ? `@keyframes drawLine {
      to { stroke-dashoffset: 0; }
    }
    @keyframes fadeInPoint {
      from { opacity: 0; }
      to { opacity: 1; }
    }${allAnimationStyles}
    .data-point {
      opacity: 0;
      animation: fadeInPoint ${animation.pointDuration}s ease-out forwards;
    }
    `
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CHART.width} ${CHART.height}" width="${CHART.width}" height="${CHART.height}">
  <style>
    ${animationDefs}.chart-bg { fill: ${LIGHT_PALETTE.white}; }
    .chart-text { fill: ${LIGHT_PALETTE.text}; }
    .chart-muted { fill: ${LIGHT_PALETTE.neutral}; }
    .chart-grid { stroke: ${LIGHT_PALETTE.cellBorder}; }
    .chart-axis { stroke: ${LIGHT_PALETTE.neutral}; }
    @media (prefers-color-scheme: dark) {
      .chart-bg { fill: ${DARK_PALETTE.white}; }
      .chart-text { fill: ${DARK_PALETTE.text}; }
      .chart-muted { fill: ${DARK_PALETTE.neutral}; }
      .chart-grid { stroke: ${DARK_PALETTE.cellBorder}; }
      .chart-axis { stroke: ${DARK_PALETTE.neutral}; }
    }
  </style>
  <rect width="${CHART.width}" height="${CHART.height}" class="chart-bg" />
  <text x="${CHART.width / 2}" y="${titleY}" text-anchor="middle" class="chart-text" font-size="${fontSize.title}" font-weight="bold" font-family="${font}">${escapeXml(title)}</text>
  ${legendSection ? `<g class="legend">\n    ${legendSection}\n  </g>` : ''}
  <g class="grid">
    ${gridLines}
  </g>
  <g class="milestones">
    ${milestoneLines}
  </g>
  <g class="x-axis">
    ${xLabels}
  </g>
  <line x1="${yAxisX}" y1="${margin.top}" x2="${yAxisX}" y2="${CHART.height - margin.bottom}" class="chart-axis" stroke-width="1" />
  <line x1="${margin.left}" y1="${CHART.height - margin.bottom}" x2="${CHART.width - margin.right}" y2="${CHART.height - margin.bottom}" class="chart-axis" stroke-width="1" />
  ${allFills}
  ${allPaths}
  <g class="points">
    ${allCircles}
  </g>
</svg>`;
}

interface GenerateSvgChartParams {
  history: History;
  title?: string;
  locale: Locale;
  lineColor?: string;
  lineWidth?: number;
  maxPoints?: number;
  yAxisSide?: ChartAxisSide;
  smoothing?: boolean;
  showPoints?: boolean;
  animate?: boolean;
  milestones?: boolean;
  customMilestones?: readonly number[];
}

export function generateSvgChart({
  history,
  title,
  locale,
  lineColor,
  lineWidth,
  maxPoints,
  yAxisSide,
  smoothing,
  showPoints,
  animate,
  milestones = true,
  customMilestones,
}: GenerateSvgChartParams): string | null {
  if (!history.snapshots || history.snapshots.length < MIN_SNAPSHOTS_FOR_CHART) {
    return null;
  }

  const snapshots = sliceForChart({ items: history.snapshots, maxPoints });
  const labels = buildAxisLabels({
    timestamps: snapshots.map((snapshot) => snapshot.timestamp),
    locale,
  });
  const data = snapshots.map((snapshot) => snapshot.totalStars);

  return renderSvg({
    labels,
    datasets: [{ label: 'Stars', data, color: lineColor ?? COLORS.accent }],
    title: title ?? 'Star History',
    showLegend: false,
    milestones,
    milestoneThresholds:
      customMilestones && customMilestones.length > 0 ? customMilestones : MILESTONE_THRESHOLDS,
    lineWidth,
    yAxisSide,
    smoothing,
    showPoints,
    animate,
  });
}

interface GeneratePerRepoSvgChartParams {
  history: History;
  repoFullName: string;
  title?: string;
  locale: Locale;
  lineColor?: string;
  lineWidth?: number;
  maxPoints?: number;
  yAxisSide?: ChartAxisSide;
  smoothing?: boolean;
  showPoints?: boolean;
  animate?: boolean;
}

export function generatePerRepoSvgChart({
  history,
  repoFullName,
  title,
  locale,
  lineColor,
  lineWidth,
  maxPoints,
  yAxisSide,
  smoothing,
  showPoints,
  animate,
}: GeneratePerRepoSvgChartParams): string | null {
  if (!history.snapshots || history.snapshots.length < MIN_SNAPSHOTS_FOR_CHART) {
    return null;
  }

  const snapshots = sliceForChart({ items: history.snapshots, maxPoints });
  const labels = buildAxisLabels({
    timestamps: snapshots.map((snapshot) => snapshot.timestamp),
    locale,
  });
  const data = snapshots.map((snapshot) => {
    const repo = snapshot.repos.find((candidate) => candidate.fullName === repoFullName);
    return repo?.stars ?? 0;
  });

  return renderSvg({
    labels,
    datasets: [{ label: 'Stars', data, color: lineColor ?? COLORS.accent }],
    title: title ?? `${repoFullName} Star History`,
    showLegend: false,
    milestones: false,
    lineWidth,
    yAxisSide,
    smoothing,
    showPoints,
    animate,
  });
}

interface GenerateComparisonSvgChartParams {
  history: History;
  repoNames: string[];
  title?: string;
  locale: Locale;
  lineWidth?: number;
  maxPoints?: number;
  yAxisSide?: ChartAxisSide;
  smoothing?: boolean;
  showPoints?: boolean;
  animate?: boolean;
}

export function generateComparisonSvgChart({
  history,
  repoNames,
  title,
  locale,
  lineWidth,
  maxPoints,
  yAxisSide,
  smoothing,
  showPoints,
  animate,
}: GenerateComparisonSvgChartParams): string | null {
  if (
    !history.snapshots ||
    history.snapshots.length < MIN_SNAPSHOTS_FOR_CHART ||
    repoNames.length === 0
  ) {
    return null;
  }

  const t = getTranslations(locale);
  const snapshots = sliceForChart({ items: history.snapshots, maxPoints });
  const labels = buildAxisLabels({
    timestamps: snapshots.map((snapshot) => snapshot.timestamp),
    locale,
  });
  const capped = repoNames.slice(0, CHART.maxComparison);
  const owners = new Set(capped.map((name) => name.split('/')[0]));
  const useShortLabels = owners.size === 1;
  const datasets: SvgDataset[] = capped.map((repoName, index) => {
    const data = snapshots.map((snapshot) => {
      const repo = snapshot.repos.find((candidate) => candidate.fullName === repoName);
      return repo?.stars ?? 0;
    });

    const color = CHART_COMPARISON_COLORS[index % CHART_COMPARISON_COLORS.length];

    return {
      label: useShortLabels ? repoName.split('/')[1] : repoName,
      data,
      color,
      fill: false,
    };
  });

  return renderSvg({
    labels,
    datasets,
    title: title ?? t.report.topRepositories,
    showLegend: true,
    milestones: false,
    lineWidth,
    yAxisSide,
    smoothing,
    showPoints,
    animate,
  });
}

interface GenerateForecastSvgChartParams {
  history: History;
  forecastData: ForecastData;
  locale: Locale;
  title?: string;
  lineColor?: string;
  lineWidth?: number;
  maxPoints?: number;
  yAxisSide?: ChartAxisSide;
  smoothing?: boolean;
  showPoints?: boolean;
  animate?: boolean;
}

export function generateForecastSvgChart({
  history,
  forecastData,
  locale,
  title,
  lineColor,
  lineWidth,
  maxPoints,
  yAxisSide,
  smoothing,
  showPoints,
  animate,
}: GenerateForecastSvgChartParams): string | null {
  if (!history.snapshots || history.snapshots.length < MIN_SNAPSHOTS_FOR_CHART) {
    return null;
  }

  const t = getTranslations(locale);
  const snapshots = sliceForChart({ items: history.snapshots, maxPoints });
  const historicalLabels = snapshots.map((snapshot) =>
    formatDate({ timestamp: snapshot.timestamp, locale }),
  );
  const historicalData = snapshots.map((snapshot) => snapshot.totalStars);
  const forecastLabels = forecastData.aggregate.forecasts[0].points.map((point) =>
    interpolate({ template: t.forecast.week, params: { n: point.weekOffset } }),
  );
  const allLabels = [...historicalLabels, ...forecastLabels];
  const series = buildForecastChartSeries({ historicalData, forecastData });
  const datasets: SvgDataset[] = [
    {
      label: t.report.starHistory,
      data: series.historical,
      color: lineColor ?? COLORS.accent,
      fill: true,
    },
    {
      label: t.forecast.linearRegression,
      data: series.linearRegression,
      color: COLORS.positive,
      dashed: true,
      fill: false,
    },
    {
      label: t.forecast.weightedMovingAverage,
      data: series.weightedMovingAverage,
      color: COLORS.negative,
      dashed: true,
      fill: false,
    },
  ];

  return renderSvg({
    labels: allLabels,
    datasets,
    title: title ?? t.forecast.sectionTitle,
    showLegend: true,
    milestones: false,
    lineWidth,
    yAxisSide,
    smoothing,
    showPoints,
    animate,
  });
}
