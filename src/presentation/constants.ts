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

export const TOP_REPOS_COUNT = 10;

export const MIN_SNAPSHOTS_FOR_CHART = 2;
