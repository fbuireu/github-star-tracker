import { ChartAxisSide, ChartCurve, type ChartRange, ChartTheme } from '@config/types';
import { formatCount } from '@domain/formatting';
import type { Locale } from '@i18n';
import type { ChartMilestone, ChartRequest } from './chart-spec';
import { AxisLabels, buildChartSpec, SeriesDash } from './chart-spec';
import { CHART, CHART_DEFAULTS, CHART_TENSION, DARK_PALETTE, SVG_CHART } from './constants';
import { EscapeDialect, escapeFor } from './escaping';
import { resolvePalette } from './shared';

const escapeXml = escapeFor(EscapeDialect.XML);

const BEZIER_CONTROL_DIVISOR = 3;
const MONOTONE_TANGENT_LIMIT = 3;
const TANGENT_AVERAGE_DIVISOR = 2;
const ROUNDED_STEP_RADIUS = 16;
const ROUNDED_STEP_RADIUS_DIVISOR = 2;
const MIN_POINTS_FOR_ROUNDED_CORNERS = 3;
const PATH_LENGTH_SAFETY_FACTOR = 1.5;
const Y_AXIS_PADDING_RATIO = 0.1;
const Y_AXIS_MIN_PADDING = 1;
const AXIS_STEP_BOUNDARY_TOLERANCE = 0.5;
const NICE_AXIS_STEPS = {
  thresholds: [
    { maxResidual: 1.5, multiplier: 1 },
    { maxResidual: 3.5, multiplier: 2 },
    { maxResidual: 7.5, multiplier: 5 },
  ],
  largestMultiplier: 10,
} as const;

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

function straightPath(points: Point[]): string {
  let path = `M${points[0].x},${points[0].y}`;
  for (let index = 1; index < points.length; index++) {
    path += ` L${points[index].x},${points[index].y}`;
  }

  return path;
}

interface ClampParams {
  clampMinY: number;
  clampMaxY: number;
}

function catmullRomPath(points: Point[], { clampMinY, clampMaxY }: ClampParams): string {
  const tension = CHART_TENSION.smooth;
  let path = `M${points[0].x},${points[0].y}`;

  for (let index = 0; index < points.length - 1; index++) {
    const previousPoint = points[Math.max(0, index - 1)];
    const startPoint = points[index];
    const endPoint = points[index + 1];
    const nextPoint = points[Math.min(points.length - 1, index + 2)];

    const cp1x = startPoint.x + ((endPoint.x - previousPoint.x) * tension) / BEZIER_CONTROL_DIVISOR;
    const cp2x = endPoint.x - ((nextPoint.x - startPoint.x) * tension) / BEZIER_CONTROL_DIVISOR;

    const cp1y = Math.min(
      clampMaxY,
      Math.max(
        clampMinY,
        startPoint.y + ((endPoint.y - previousPoint.y) * tension) / BEZIER_CONTROL_DIVISOR,
      ),
    );
    const cp2y = Math.min(
      clampMaxY,
      Math.max(
        clampMinY,
        endPoint.y - ((nextPoint.y - startPoint.y) * tension) / BEZIER_CONTROL_DIVISOR,
      ),
    );

    path += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${endPoint.x},${endPoint.y}`;
  }

  return path;
}

function monotonePath(points: Point[]): string {
  const count = points.length;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let index = 0; index < count - 1; index++) {
    const deltaX = points[index + 1].x - points[index].x;
    dx.push(deltaX);
    slope.push(deltaX === 0 ? 0 : (points[index + 1].y - points[index].y) / deltaX);
  }

  const tangent: number[] = new Array(count);
  tangent[0] = slope[0];
  tangent[count - 1] = slope[count - 2];
  for (let index = 1; index < count - 1; index++) {
    tangent[index] =
      slope[index - 1] * slope[index] <= 0
        ? 0
        : (slope[index - 1] + slope[index]) / TANGENT_AVERAGE_DIVISOR;
  }

  for (let index = 0; index < count - 1; index++) {
    if (slope[index] === 0) {
      tangent[index] = 0;
      tangent[index + 1] = 0;
      continue;
    }
    const alpha = tangent[index] / slope[index];
    const beta = tangent[index + 1] / slope[index];
    const magnitude = Math.hypot(alpha, beta);
    if (magnitude > MONOTONE_TANGENT_LIMIT) {
      const factor = MONOTONE_TANGENT_LIMIT / magnitude;
      tangent[index] = factor * alpha * slope[index];
      tangent[index + 1] = factor * beta * slope[index];
    }
  }

  let path = `M${points[0].x},${points[0].y}`;
  for (let index = 0; index < count - 1; index++) {
    const start = points[index];
    const end = points[index + 1];
    const cp1x = start.x + dx[index] / BEZIER_CONTROL_DIVISOR;
    const cp1y = start.y + (tangent[index] * dx[index]) / BEZIER_CONTROL_DIVISOR;
    const cp2x = end.x - dx[index] / BEZIER_CONTROL_DIVISOR;
    const cp2y = end.y - (tangent[index + 1] * dx[index]) / BEZIER_CONTROL_DIVISOR;
    path += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${end.x},${end.y}`;
  }

  return path;
}

function cubicBezierPath(points: Point[]): string {
  let path = `M${points[0].x},${points[0].y}`;
  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index];
    const end = points[index + 1];
    const offset = (end.x - start.x) / BEZIER_CONTROL_DIVISOR;
    path += ` C${start.x + offset},${start.y} ${end.x - offset},${end.y} ${end.x},${end.y}`;
  }

  return path;
}

function roundedStepPath(points: Point[], radius: number): string {
  if (points.length < MIN_POINTS_FOR_ROUNDED_CORNERS) return straightPath(points);

  let path = `M${points[0].x},${points[0].y}`;
  for (let index = 1; index < points.length - 1; index++) {
    const before = points[index - 1];
    const vertex = points[index];
    const after = points[index + 1];
    const lengthBefore = Math.hypot(vertex.x - before.x, vertex.y - before.y);
    const lengthAfter = Math.hypot(after.x - vertex.x, after.y - vertex.y);

    if (lengthBefore === 0 || lengthAfter === 0) {
      path += ` L${vertex.x},${vertex.y}`;
      continue;
    }

    const radiusBefore = Math.min(radius, lengthBefore / ROUNDED_STEP_RADIUS_DIVISOR);
    const radiusAfter = Math.min(radius, lengthAfter / ROUNDED_STEP_RADIUS_DIVISOR);
    const entryX = vertex.x + ((before.x - vertex.x) / lengthBefore) * radiusBefore;
    const entryY = vertex.y + ((before.y - vertex.y) / lengthBefore) * radiusBefore;
    const exitX = vertex.x + ((after.x - vertex.x) / lengthAfter) * radiusAfter;
    const exitY = vertex.y + ((after.y - vertex.y) / lengthAfter) * radiusAfter;
    path += ` L${entryX},${entryY} Q${vertex.x},${vertex.y} ${exitX},${exitY}`;
  }

  const last = points[points.length - 1];
  path += ` L${last.x},${last.y}`;

  return path;
}

const CURVE_PATHS: Record<ChartCurve, (points: Point[], clamp: ClampParams) => string> = {
  [ChartCurve.CATMULL_ROM]: (points, clamp) => catmullRomPath(points, clamp),
  [ChartCurve.MONOTONE]: (points) => monotonePath(points),
  [ChartCurve.CUBIC_BEZIER]: (points) => cubicBezierPath(points),
  [ChartCurve.ROUNDED_STEP]: (points) => roundedStepPath(points, ROUNDED_STEP_RADIUS),
};

interface GenerateCurvePathParams {
  points: Point[];
  smoothing: boolean;
  curve: ChartCurve;
  clampMinY?: number;
  clampMaxY?: number;
}

function generateCurvePath({
  points,
  smoothing,
  curve,
  clampMinY = Number.NEGATIVE_INFINITY,
  clampMaxY = Number.POSITIVE_INFINITY,
}: GenerateCurvePathParams): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M${points[0].x},${points[0].y}`;
  if (!smoothing) return straightPath(points);

  return CURVE_PATHS[curve](points, { clampMinY, clampMaxY });
}

function calculatePathLength(points: Point[]): number {
  let length = 0;

  for (let index = 1; index < points.length; index++) {
    const dx = points[index].x - points[index - 1].x;
    const dy = points[index].y - points[index - 1].y;
    length += Math.hypot(dx, dy);
  }

  return Math.ceil(length * PATH_LENGTH_SAFETY_FACTOR);
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

  const multiplier =
    NICE_AXIS_STEPS.thresholds.find((threshold) => residual <= threshold.maxResidual)?.multiplier ??
    NICE_AXIS_STEPS.largestMultiplier;
  const niceStep = multiplier * magnitude;

  const niceMin = Math.floor(min / niceStep) * niceStep;
  const steps: number[] = [];
  const tolerance = niceStep * AXIS_STEP_BOUNDARY_TOLERANCE;

  for (let step = niceMin; step <= max + tolerance; step += niceStep) {
    if (step >= min - tolerance) {
      steps.push(Math.round(step));
    }
  }

  return [...new Set(steps)];
}

interface SvgDataset {
  label: string;
  data: (number | null)[];
  color: string;
  dashed?: boolean;
  fill?: boolean;
}

interface SvgChartStyle {
  lineWidth?: number;
  yAxisSide?: ChartAxisSide;
  smoothing?: boolean;
  curve?: ChartCurve;
  showPoints?: boolean;
  animate?: boolean;
  beginAtZero?: boolean;
  theme?: ChartTheme;
}

interface RenderSvgParams extends SvgChartStyle {
  labels: string[];
  datasets: SvgDataset[];
  title: string;
  showLegend: boolean;
  locale: Locale;
  milestones: readonly ChartMilestone[];
}

function renderSvg({
  labels,
  datasets,
  title,
  showLegend,
  locale,
  milestones,
  lineWidth: lineWidthParam,
  yAxisSide = ChartAxisSide.LEFT,
  smoothing = CHART_DEFAULTS.smoothing,
  curve = CHART_DEFAULTS.curve,
  showPoints = CHART_DEFAULTS.showPoints,
  animate = true,
  beginAtZero = CHART_DEFAULTS.beginAtZero,
  theme = CHART_DEFAULTS.theme,
}: RenderSvgParams): string | null {
  const {
    margin,
    pointRadius,
    gridOpacity,
    fillOpacity,
    axisStrokeWidth,
    fontSize,
    animation,
    font,
    yAxis,
    xAxis,
    milestone: milestoneStyle,
    dash,
    legend: legendStyle,
  } = SVG_CHART;
  const lineWidth = lineWidthParam ?? SVG_CHART.lineWidth;
  const chartWidth = CHART.width - margin.left - margin.right;
  const chartHeight = CHART.height - margin.top - margin.bottom;
  const isRightAxis = yAxisSide === ChartAxisSide.RIGHT;
  const yAxisX = isRightAxis ? CHART.width - margin.right : margin.left;
  const yLabelX = isRightAxis
    ? CHART.width - margin.right + yAxis.labelGap
    : margin.left - yAxis.labelGap;
  const yLabelAnchor = isRightAxis ? 'start' : 'end';
  const allValues = datasets.flatMap((dataset) =>
    dataset.data.filter((value): value is number => value !== null),
  );
  if (allValues.length === 0) return null;

  const minData = Math.min(...allValues);
  const maxData = Math.max(...allValues);
  const padding = Math.max(
    Y_AXIS_MIN_PADDING,
    Math.ceil((maxData - minData) * Y_AXIS_PADDING_RATIO),
  );
  const baseMin = beginAtZero ? 0 : Math.max(0, minData - padding);
  const baseMax = maxData + padding;
  const ySteps = niceAxisSteps({ min: baseMin, max: baseMax, count: yAxis.stepCount });
  const minValue = Math.min(baseMin, ySteps.at(0) ?? baseMin);
  const maxValue = Math.max(baseMax, ySteps.at(-1) ?? baseMax);

  const gridLines = ySteps
    .map((value) => {
      const y = scaleY({ value, minValue, maxValue, chartTop: margin.top, chartHeight });
      return `<line x1="${margin.left}" y1="${y}" x2="${CHART.width - margin.right}" y2="${y}" class="chart-grid" stroke-opacity="${gridOpacity}" />
    <text x="${yLabelX}" y="${y + yAxis.labelBaselineOffset}" text-anchor="${yLabelAnchor}" class="chart-muted" font-size="${fontSize.label}" font-family="${font}">${formatCount({ count: value, locale })}</text>`;
    })
    .join('\n    ');

  const milestoneLines = milestones
    .map(({ value, label }) => {
      const y = scaleY({ value, minValue, maxValue, chartTop: margin.top, chartHeight });
      return `<line x1="${margin.left}" y1="${y}" x2="${CHART.width - margin.right}" y2="${y}" class="chart-axis" stroke-width="${milestoneStyle.strokeWidth}" stroke-dasharray="${milestoneStyle.dashArray}" />
    <text x="${margin.left + milestoneStyle.labelXOffset}" y="${y - milestoneStyle.labelYOffset}" class="chart-muted" font-size="${fontSize.milestone}" font-family="${font}">${escapeXml(label)}</text>`;
    })
    .join('\n    ');

  const maxLabels = xAxis.maxLabels;
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
      return `<text x="${x}" y="${CHART.height - margin.bottom + xAxis.labelOffset}" text-anchor="middle" class="chart-muted" font-size="${fontSize.label}" font-family="${font}">${escapeXml(labels[labelIndex])}</text>`;
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
        const startsFromBaseline =
          dataset.fill !== false && !dataset.dashed && segment.startIndex === 0;
        const firstPoint = segment.points[0];
        const smoothPath = generateCurvePath({
          points: segment.points,
          smoothing,
          curve,
          clampMinY: margin.top,
          clampMaxY: bottomY,
        });
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
                return `<path d="${pathD} L${last.x},${bottomY} L${first.x},${bottomY} Z" fill="${dataset.color}" fill-opacity="${fillOpacity}" />`;
              })()
            : '';

        const dashAttr = dataset.dashed ? ` stroke-dasharray="${dash.line}"` : '';
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
        const itemWidth = legendStyle.itemWidth;
        const totalWidth = datasets.length * itemWidth;
        const startX = (CHART.width - totalWidth) / 2;
        return datasets
          .map((dataset, datasetIndex) => {
            const x = startX + datasetIndex * itemWidth;
            const dashAttr = dataset.dashed ? ` stroke-dasharray="${dash.legend}"` : '';
            const rectAttr = dataset.dashed ? ` rx="${legendStyle.rectBorderRadius}"` : '';
            return `<rect x="${x}" y="${legendY - legendStyle.markerYOffset}" width="${legendStyle.markerWidth}" height="${legendStyle.markerHeight}" fill="${dataset.color}"${rectAttr} />
    <line x1="${x}" y1="${legendY - legendStyle.lineYOffset}" x2="${x + legendStyle.markerWidth}" y2="${legendY - legendStyle.lineYOffset}" stroke="${dataset.color}" stroke-width="${legendStyle.lineStrokeWidth}"${dashAttr} />
    <text x="${x + legendStyle.labelGap}" y="${legendY}" class="chart-text" font-size="${fontSize.legend}" font-family="${font}">${escapeXml(dataset.label)}</text>`;
          })
          .join('\n    ');
      })()
    : '';

  const titleY = margin.top - SVG_CHART.header.titleOffset;

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

  const basePalette = resolvePalette(theme);
  const darkModeStyles =
    theme === ChartTheme.AUTO
      ? `
    @media (prefers-color-scheme: dark) {
      .chart-bg { fill: ${DARK_PALETTE.white}; }
      .chart-text { fill: ${DARK_PALETTE.text}; }
      .chart-muted { fill: ${DARK_PALETTE.neutral}; }
      .chart-grid { stroke: ${DARK_PALETTE.cellBorder}; }
      .chart-axis { stroke: ${DARK_PALETTE.neutral}; }
    }`
      : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CHART.width} ${CHART.height}" width="${CHART.width}" height="${CHART.height}">
  <style>
    ${animationDefs}.chart-bg { fill: ${basePalette.white}; }
    .chart-text { fill: ${basePalette.text}; }
    .chart-muted { fill: ${basePalette.neutral}; }
    .chart-grid { stroke: ${basePalette.cellBorder}; }
    .chart-axis { stroke: ${basePalette.neutral}; }${darkModeStyles}
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
  <line x1="${yAxisX}" y1="${margin.top}" x2="${yAxisX}" y2="${CHART.height - margin.bottom}" class="chart-axis" stroke-width="${axisStrokeWidth}" />
  <line x1="${margin.left}" y1="${CHART.height - margin.bottom}" x2="${CHART.width - margin.right}" y2="${CHART.height - margin.bottom}" class="chart-axis" stroke-width="${axisStrokeWidth}" />
  ${allFills}
  ${allPaths}
  <g class="points">
    ${allCircles}
  </g>
</svg>`;
}

interface RenderSvgChartParams extends SvgChartStyle {
  request: ChartRequest;
  locale: Locale;
  maxPoints?: number;
  range?: ChartRange;
}

export function renderSvgChart({
  request,
  locale,
  maxPoints,
  range,
  ...style
}: RenderSvgChartParams): string | null {
  const spec = buildChartSpec({
    request,
    locale,
    palette: resolvePalette(style.theme),
    axisLabels: AxisLabels.THINNED,
    range,
    maxPoints,
  });

  if (spec === null) return null;

  return renderSvg({
    locale,
    ...style,
    labels: spec.labels,
    datasets: spec.series.map((series) => ({
      label: series.label,
      data: series.data,
      color: series.color,
      dashed: series.dash !== SeriesDash.NONE,
      fill: series.fill,
    })),
    title: spec.title,
    showLegend: spec.showLegend,
    milestones: spec.milestones,
  });
}
