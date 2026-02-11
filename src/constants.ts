import type { Config } from './types';

export const DATA_DIR = '.star-tracker-data';

export const DEFAULTS: Config = {
  visibility: 'public',
  includeArchived: false,
  includeForks: false,
  excludeRepos: [],
  onlyRepos: [],
  minStars: 0,
  dataBranch: 'star-tracker-data',
  maxHistory: 52,
  sendOnNoChanges: false,
  locale: 'en',
};

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
