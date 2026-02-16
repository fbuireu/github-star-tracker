import type { ForecastData } from '@domain/forecast';
import { ForecastMethod } from '@domain/forecast';
import { formatDate } from '@domain/formatting';
import type { History } from '@domain/types';
import { getTranslations, interpolate, type Locale } from '@i18n';
import { MILESTONE_THRESHOLDS } from './chart';
import {
  CHART,
  CHART_COMPARISON_COLORS,
  COLORS,
  DARK_PALETTE,
  LIGHT_PALETTE,
  SVG_CHART,
} from './constants';

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

function generateSmoothPath(points: Point[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M${points[0].x},${points[0].y}`;

  const tension = 0.4;
  let d = `M${points[0].x},${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1.x + ((p2.x - p0.x) * tension) / 3;
    const cp1y = p1.y + ((p2.y - p0.y) * tension) / 3;
    const cp2x = p2.x - ((p3.x - p1.x) * tension) / 3;
    const cp2y = p2.y - ((p3.y - p1.y) * tension) / 3;

    d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }

  return d;
}

function calculatePathLength(points: Point[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
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
  for (let v = niceMin; v <= max + niceStep * 0.5; v += niceStep) {
    if (v >= min - niceStep * 0.5) {
      steps.push(Math.round(v));
    }
  }

  return steps;
}

function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
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
}

function renderSvg({
  labels,
  datasets,
  title,
  showLegend,
  milestones = false,
}: RenderSvgParams): string {
  const { margin, pointRadius, lineWidth, gridOpacity, fontSize, animation, font } = SVG_CHART;
  const chartWidth = CHART.width - margin.left - margin.right;
  const chartHeight = CHART.height - margin.top - margin.bottom;

  const allValues = datasets.flatMap((ds) => ds.data.filter((v): v is number => v !== null));
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
    <text x="${margin.left - 8}" y="${y + 4}" text-anchor="end" class="chart-muted" font-size="${fontSize.label}" font-family="${font}">${value.toLocaleString('en-US')}</text>`;
    })
    .join('\n    ');

  const milestoneLines = milestones
    ? MILESTONE_THRESHOLDS.filter((m) => m > minData && m < maxData)
        .map((value) => {
          const y = scaleY({ value, minValue, maxValue, chartTop: margin.top, chartHeight });
          return `<line x1="${margin.left}" y1="${y}" x2="${CHART.width - margin.right}" y2="${y}" class="chart-axis" stroke-width="1" stroke-dasharray="6,6" />
    <text x="${margin.left + 4}" y="${y - 4}" class="chart-muted" font-size="${fontSize.milestone}" font-family="${font}">${value.toLocaleString('en-US')} ★</text>`;
        })
        .join('\n    ')
    : '';

  const maxLabels = 10;
  const labelStep = Math.max(1, Math.ceil(labels.length / maxLabels));
  const xLabels = labels
    .map((label, i) => {
      if (i % labelStep !== 0 && i !== labels.length - 1) return '';
      const x = margin.left + (i / Math.max(1, labels.length - 1)) * chartWidth;
      return `<text x="${x}" y="${CHART.height - margin.bottom + 20}" text-anchor="middle" class="chart-muted" font-size="${fontSize.label}" font-family="${font}">${escapeXml(label)}</text>`;
    })
    .filter(Boolean)
    .join('\n    ');

  const datasetSvg = datasets.map((ds, dsIndex) => {
    const validSegments: { points: Point[]; startIndex: number }[] = [];
    let currentSegment: Point[] = [];
    let segmentStart = -1;

    for (let i = 0; i < ds.data.length; i++) {
      const value = ds.data[i];
      if (value !== null) {
        if (currentSegment.length === 0) segmentStart = i;
        currentSegment.push({
          x: margin.left + (i / Math.max(1, labels.length - 1)) * chartWidth,
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
        const pathD = generateSmoothPath(segment.points);
        const pathLength = calculatePathLength(segment.points);

        const fillArea =
          ds.fill !== false && !ds.dashed
            ? (() => {
                const first = segment.points[0];
                const last = segment.points.at(-1) as Point;
                const bottomY = CHART.height - margin.bottom;
                return `<path d="${pathD} L${last.x},${bottomY} L${first.x},${bottomY} Z" fill="${ds.color}" fill-opacity="0.1" />`;
              })()
            : '';

        const dashAttr = ds.dashed ? ' stroke-dasharray="8,4"' : '';
        const lineClass = ds.dashed ? '' : ` class="data-line-${dsIndex}"`;
        const pathEl = `<path d="${pathD}" fill="none" stroke="${ds.color}" stroke-width="${lineWidth}"${dashAttr}${lineClass} />`;

        const circles = ds.dashed
          ? ''
          : segment.points
              .map(
                (p, i) =>
                  `<circle cx="${p.x}" cy="${p.y}" r="${pointRadius}" fill="${ds.color}" class="data-point" style="animation-delay: ${((segment.startIndex + i) * animation.pointStagger + animation.pointDelay).toFixed(2)}s" />`,
              )
              .join('\n    ');

        const animationStyle = ds.dashed
          ? ''
          : `
    .data-line-${dsIndex} {
      stroke-dasharray: ${pathLength};
      stroke-dashoffset: ${pathLength};
      animation: drawLine ${animation.lineDuration}s ease-out forwards;
    }`;

        return { fillArea, pathEl, circles, animationStyle };
      })
      .reduce(
        (acc, seg) => ({
          fillArea: acc.fillArea + seg.fillArea,
          pathEl: acc.pathEl + seg.pathEl,
          circles: acc.circles + (seg.circles ? `\n    ${seg.circles}` : ''),
          animationStyle: acc.animationStyle + seg.animationStyle,
        }),
        { fillArea: '', pathEl: '', circles: '', animationStyle: '' },
      );
  });

  const allAnimationStyles = datasetSvg.map((ds) => ds.animationStyle).join('');
  const allFills = datasetSvg.map((ds) => ds.fillArea).join('\n  ');
  const allPaths = datasetSvg.map((ds) => ds.pathEl).join('\n  ');
  const allCircles = datasetSvg
    .map((ds) => ds.circles)
    .filter(Boolean)
    .join('\n    ');

  const legendSection = showLegend
    ? (() => {
        const legendY = margin.top - 20;
        const itemWidth = 120;
        const totalWidth = datasets.length * itemWidth;
        const startX = (CHART.width - totalWidth) / 2;
        return datasets
          .map((ds, i) => {
            const x = startX + i * itemWidth;
            const dashAttr = ds.dashed ? ' stroke-dasharray="4,2"' : '';
            const rectAttr = ds.dashed ? ' rx="1"' : '';
            return `<rect x="${x}" y="${legendY - 5}" width="12" height="3" fill="${ds.color}"${rectAttr} />
    <line x1="${x}" y1="${legendY - 3.5}" x2="${x + 12}" y2="${legendY - 3.5}" stroke="${ds.color}" stroke-width="2"${dashAttr} />
    <text x="${x + 16}" y="${legendY}" class="chart-text" font-size="10" font-family="${font}">${escapeXml(ds.label)}</text>`;
          })
          .join('\n    ');
      })()
    : '';

  const titleY = showLegend ? margin.top - 36 : margin.top - 16;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CHART.width} ${CHART.height}" width="${CHART.width}" height="${CHART.height}">
  <style>
    @keyframes drawLine {
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
    .chart-bg { fill: ${LIGHT_PALETTE.white}; }
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
  <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${CHART.height - margin.bottom}" class="chart-axis" stroke-width="1" />
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
}

export function generateSvgChart({
  history,
  title,
  locale,
}: GenerateSvgChartParams): string | null {
  if (!history.snapshots || history.snapshots.length < 2) {
    return null;
  }

  const snapshots = [...history.snapshots].slice(-CHART.maxDataPoints);
  const labels = snapshots.map((s) => formatDate({ timestamp: s.timestamp, locale }));
  const data = snapshots.map((s) => s.totalStars);

  return renderSvg({
    labels,
    datasets: [{ label: 'Stars', data, color: COLORS.accent }],
    title: title ?? 'Star History',
    showLegend: false,
    milestones: true,
  });
}

interface GeneratePerRepoSvgChartParams {
  history: History;
  repoFullName: string;
  title?: string;
  locale: Locale;
}

export function generatePerRepoSvgChart({
  history,
  repoFullName,
  title,
  locale,
}: GeneratePerRepoSvgChartParams): string | null {
  if (!history.snapshots || history.snapshots.length < 2) {
    return null;
  }

  const snapshots = [...history.snapshots].slice(-CHART.maxDataPoints);
  const labels = snapshots.map((s) => formatDate({ timestamp: s.timestamp, locale }));
  const data = snapshots.map((s) => {
    const repo = s.repos.find((r) => r.fullName === repoFullName);
    return repo?.stars ?? 0;
  });

  return renderSvg({
    labels,
    datasets: [{ label: 'Stars', data, color: COLORS.accent }],
    title: title ?? `${repoFullName} Star History`,
    showLegend: false,
    milestones: false,
  });
}

interface GenerateComparisonSvgChartParams {
  history: History;
  repoNames: string[];
  title?: string;
  locale: Locale;
}

export function generateComparisonSvgChart({
  history,
  repoNames,
  title,
  locale,
}: GenerateComparisonSvgChartParams): string | null {
  if (!history.snapshots || history.snapshots.length < 2 || repoNames.length === 0) {
    return null;
  }

  const t = getTranslations(locale);
  const snapshots = [...history.snapshots].slice(-CHART.maxDataPoints);
  const labels = snapshots.map((s) => formatDate({ timestamp: s.timestamp, locale }));

  const capped = repoNames.slice(0, CHART.maxComparison);
  const owners = new Set(capped.map((name) => name.split('/')[0]));
  const useShortLabels = owners.size === 1;

  const datasets: SvgDataset[] = capped.map((repoName, index) => {
    const data = snapshots.map((s) => {
      const repo = s.repos.find((r) => r.fullName === repoName);
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
  });
}

interface GenerateForecastSvgChartParams {
  history: History;
  forecastData: ForecastData;
  locale: Locale;
  title?: string;
}

export function generateForecastSvgChart({
  history,
  forecastData,
  locale,
  title,
}: GenerateForecastSvgChartParams): string | null {
  if (!history.snapshots || history.snapshots.length < 2) {
    return null;
  }

  const t = getTranslations(locale);
  const snapshots = [...history.snapshots].slice(-CHART.maxDataPoints);

  const historicalLabels = snapshots.map((s) => formatDate({ timestamp: s.timestamp, locale }));
  const historicalData = snapshots.map((s) => s.totalStars);

  const forecastLabels = forecastData.aggregate.forecasts[0].points.map((p) =>
    interpolate({ template: t.forecast.week, params: { n: p.weekOffset } }),
  );

  const allLabels = [...historicalLabels, ...forecastLabels];

  const lrForecast = forecastData.aggregate.forecasts.find(
    (f) => f.method === ForecastMethod.LINEAR_REGRESSION,
  );
  const wmaForecast = forecastData.aggregate.forecasts.find(
    (f) => f.method === ForecastMethod.WEIGHTED_MOVING_AVERAGE,
  );

  const lastHistorical = historicalData.at(-1) ?? 0;
  const padLength = historicalData.length;

  const datasets: SvgDataset[] = [
    {
      label: t.report.starHistory,
      data: [...historicalData, ...new Array(forecastLabels.length).fill(null)],
      color: COLORS.accent,
      fill: true,
    },
    {
      label: t.forecast.linearRegression,
      data: [
        ...new Array(padLength - 1).fill(null),
        lastHistorical,
        ...(lrForecast?.points.map((p) => p.predicted) ?? []),
      ],
      color: COLORS.positive,
      dashed: true,
      fill: false,
    },
    {
      label: t.forecast.weightedMovingAverage,
      data: [
        ...new Array(padLength - 1).fill(null),
        lastHistorical,
        ...(wmaForecast?.points.map((p) => p.predicted) ?? []),
      ],
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
  });
}
