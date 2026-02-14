import { formatDate } from '@domain/formatting';
import type { History } from '@domain/types';
import type { Locale } from '@i18n';
import { MILESTONE_THRESHOLDS } from './chart';
import { CHART, COLORS, SVG_CHART } from './constants';

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
    length += Math.sqrt(dx * dx + dy * dy);
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
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

  const { margin, pointRadius, lineWidth, gridOpacity, fontSize, animation, font } = SVG_CHART;
  const chartWidth = CHART.width - margin.left - margin.right;
  const chartHeight = CHART.height - margin.top - margin.bottom;
  const chartTitle = title ?? 'Star History';

  const minData = Math.min(...data);
  const maxData = Math.max(...data);
  const padding = Math.max(1, Math.ceil((maxData - minData) * 0.1));
  const minValue = Math.max(0, minData - padding);
  const maxValue = maxData + padding;

  const ySteps = niceAxisSteps({ min: minValue, max: maxValue, count: 5 });

  const points: Point[] = data.map((value, i) => ({
    x: margin.left + (i / Math.max(1, data.length - 1)) * chartWidth,
    y: scaleY({ value, minValue, maxValue, chartTop: margin.top, chartHeight }),
  }));

  const pathD = generateSmoothPath(points);
  const pathLength = calculatePathLength(points);

  const visibleMilestones = MILESTONE_THRESHOLDS.filter((m) => m > minData && m < maxData);

  const gridLines = ySteps
    .map((value) => {
      const y = scaleY({ value, minValue, maxValue, chartTop: margin.top, chartHeight });
      return `<line x1="${margin.left}" y1="${y}" x2="${CHART.width - margin.right}" y2="${y}" stroke="${COLORS.cellBorder}" stroke-opacity="${gridOpacity}" />
    <text x="${margin.left - 8}" y="${y + 4}" text-anchor="end" fill="${COLORS.neutral}" font-size="${fontSize.label}" font-family="${font}">${value.toLocaleString('en-US')}</text>`;
    })
    .join('\n    ');

  const milestoneLines = visibleMilestones
    .map((value) => {
      const y = scaleY({ value, minValue, maxValue, chartTop: margin.top, chartHeight });
      return `<line x1="${margin.left}" y1="${y}" x2="${CHART.width - margin.right}" y2="${y}" stroke="${COLORS.neutral}" stroke-width="1" stroke-dasharray="6,6" />
    <text x="${margin.left + 4}" y="${y - 4}" fill="${COLORS.neutral}" font-size="${fontSize.milestone}" font-family="${font}">${value.toLocaleString('en-US')} ★</text>`;
    })
    .join('\n    ');

  const maxLabels = 10;
  const labelStep = Math.max(1, Math.ceil(labels.length / maxLabels));
  const xLabels = labels
    .map((label, i) => {
      if (i % labelStep !== 0 && i !== labels.length - 1) return '';
      const x = margin.left + (i / Math.max(1, labels.length - 1)) * chartWidth;
      return `<text x="${x}" y="${CHART.height - margin.bottom + 20}" text-anchor="middle" fill="${COLORS.neutral}" font-size="${fontSize.label}" font-family="${font}">${escapeXml(label)}</text>`;
    })
    .filter(Boolean)
    .join('\n    ');

  const circles = points
    .map(
      (p, i) =>
        `<circle cx="${p.x}" cy="${p.y}" r="${pointRadius}" fill="${COLORS.accent}" class="data-point" style="animation-delay: ${(i * animation.pointStagger + animation.pointDelay).toFixed(2)}s" />`,
    )
    .join('\n    ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CHART.width} ${CHART.height}" width="${CHART.width}" height="${CHART.height}">
  <style>
    @keyframes drawLine {
      to { stroke-dashoffset: 0; }
    }
    @keyframes fadeInPoint {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    .data-line {
      stroke-dasharray: ${pathLength};
      stroke-dashoffset: ${pathLength};
      animation: drawLine ${animation.lineDuration}s ease-out forwards;
    }
    .data-point {
      opacity: 0;
      animation: fadeInPoint ${animation.pointDuration}s ease-out forwards;
    }
  </style>
  <rect width="${CHART.width}" height="${CHART.height}" fill="${COLORS.white}" />
  <text x="${CHART.width / 2}" y="${margin.top - 16}" text-anchor="middle" fill="${COLORS.text}" font-size="${fontSize.title}" font-weight="bold" font-family="${font}">${escapeXml(chartTitle)}</text>
  <g class="grid">
    ${gridLines}
  </g>
  <g class="milestones">
    ${milestoneLines}
  </g>
  <g class="x-axis">
    ${xLabels}
  </g>
  <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${CHART.height - margin.bottom}" stroke="${COLORS.neutral}" stroke-width="1" />
  <line x1="${margin.left}" y1="${CHART.height - margin.bottom}" x2="${CHART.width - margin.right}" y2="${CHART.height - margin.bottom}" stroke="${COLORS.neutral}" stroke-width="1" />
  <path d="${pathD}" fill="none" stroke="${COLORS.accent}" stroke-width="${lineWidth}" class="data-line" />
  <g class="points">
    ${circles}
  </g>
</svg>`;
}
