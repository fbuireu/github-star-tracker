import type { LOCALE_MAP } from './defaults';

export type Locale = keyof typeof LOCALE_MAP;
export const Visibility = {
  PUBLIC: 'public',
  PRIVATE: 'private',
  ALL: 'all',
  OWNED: 'owned',
} as const;

export type Visibility = (typeof Visibility)[keyof typeof Visibility];

export const ChartAxisSide = {
  LEFT: 'left',
  RIGHT: 'right',
} as const;

export type ChartAxisSide = (typeof ChartAxisSide)[keyof typeof ChartAxisSide];

export interface Config {
  visibility: Visibility;
  includeArchived: boolean;
  includeForks: boolean;
  excludeRepos: string[];
  onlyRepos: string[];
  excludeOrgs: string[];
  onlyOrgs: string[];
  minStars: number;
  dataBranch: string;
  maxHistory: number;
  sendOnNoChanges: boolean;
  includeCharts: boolean;
  locale: Locale;
  notificationThreshold: number | 'auto';
  trackStargazers: boolean;
  topRepos: number;
  smartSampling: boolean;
  smartSamplingThreshold: number;
  smartSamplingPages: number;
  chartLineColor: string;
  chartLineWidth: number;
  chartMaxPoints: number;
  chartYAxisSide: ChartAxisSide;
  chartSmoothing: boolean;
  chartShowPoints: boolean;
  chartAnimation: boolean;
}
