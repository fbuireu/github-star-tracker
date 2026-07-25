import type { CompareAgainst, NotificationMode } from '@domain/types';
import type { Locale } from '@i18n';

export type { Locale } from '@i18n';
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

export const ChartTheme = {
  AUTO: 'auto',
  LIGHT: 'light',
  DARK: 'dark',
} as const;

export type ChartTheme = (typeof ChartTheme)[keyof typeof ChartTheme];

export const ChartRange = {
  D30: '30d',
  D90: '90d',
  Y1: '1y',
  ALL: 'all',
} as const;

export type ChartRange = (typeof ChartRange)[keyof typeof ChartRange];

export const ChartCurve = {
  CATMULL_ROM: 'catmull-rom',
  MONOTONE: 'monotone',
  CUBIC_BEZIER: 'cubic-bezier',
  ROUNDED_STEP: 'rounded-step',
} as const;

export type ChartCurve = (typeof ChartCurve)[keyof typeof ChartCurve];

export { CompareAgainst, NotificationMode } from '@domain/types';

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
  compareAgainst: CompareAgainst;
  readOnly: boolean;
  sendOnNoChanges: boolean;
  includeCharts: boolean;
  locale: Locale;
  notificationThreshold: number | 'auto';
  notificationMode: NotificationMode;
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
  chartCurve: ChartCurve;
  chartShowPoints: boolean;
  chartAnimation: boolean;
  chartMilestones: boolean;
  chartBeginAtZero: boolean;
  chartTheme: ChartTheme;
  chartCustomMilestones: number[];
  chartRange: ChartRange;
  chartTrendLine: boolean;
  velocityMetrics: boolean;
}
