export const COLORS = {
  accent: '#dfb317',
  positive: '#28a745',
  negative: '#d73a49',
  neutral: '#6a737d',
  link: '#0366d6',
  text: '#24292e',
  white: '#fff',
  shadow: '#010101',
  muted: '#555',
  tableHeaderBg: '#f6f8fa',
  tableHeaderBorder: '#e1e4e8',
  cellBorder: '#eee',
  gradientStart: '#bbb',
} as const;

export const CHART_COMPARISON_COLORS = [
  '#dfb317',
  '#28a745',
  '#e74c3c',
  '#3498db',
  '#9b59b6',
  '#e67e22',
  '#1abc9c',
  '#e84393',
  '#795548',
  '#00bcd4',
] as const;

export const CHART = {
  width: 800,
  height: 400,
  maxDataPoints: 30,
  maxComparison: 10,
} as const;

export const BADGE = {
  labelCharWidth: 6.5,
  valueCharWidth: 7,
  horizontalPadding: 12,
  height: 20,
  borderRadius: 3,
} as const;

export const SVG_CHART = {
  margin: { top: 50, right: 30, bottom: 50, left: 60 },
  pointRadius: 4,
  lineWidth: 2.5,
  gridOpacity: 0.3,
  fontSize: { title: 16, label: 11, milestone: 10 },
  animation: { lineDuration: 2, pointDuration: 0.5, pointStagger: 0.05, pointDelay: 1.5 },
  font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
} as const;

export const MIN_SNAPSHOTS_FOR_CHART = 2;

export const THRESHOLDS = [
  { limit: 50, value: 1 },
  { limit: 200, value: 5 },
  { limit: 500, value: 10 },
];

export const THRESHOLD_MAX_PACE = 20;
