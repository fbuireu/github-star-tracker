import { CompareAgainst, NotificationMode } from '@domain/types';
import type { Locale } from '@i18n';
import type { Config } from './types';
import { ChartAxisSide, ChartCurve, ChartRange, ChartTheme, Visibility } from './types';

interface VisibilityApiParams {
  visibility: Exclude<Visibility, typeof Visibility.OWNED>;
  affiliation?: string;
}

export const VISIBILITY_CONFIG: Record<Visibility, VisibilityApiParams> = {
  [Visibility.PUBLIC]: { visibility: Visibility.PUBLIC },
  [Visibility.PRIVATE]: { visibility: Visibility.PRIVATE },
  [Visibility.ALL]: { visibility: Visibility.ALL },
  [Visibility.OWNED]: { visibility: Visibility.ALL, affiliation: 'owner' },
};

export const DEFAULTS: Config = {
  visibility: Visibility.ALL,
  includeArchived: false,
  includeForks: false,
  excludeRepos: [],
  onlyRepos: [],
  excludeOrgs: [],
  onlyOrgs: [],
  minStars: 0,
  dataBranch: 'star-tracker-data',
  maxHistory: 52,
  compareAgainst: CompareAgainst.LAST_RUN,
  readOnly: false,
  sendOnNoChanges: false,
  includeCharts: true,
  locale: 'en' as Locale,
  notificationThreshold: 0,
  notificationMode: NotificationMode.NET,
  trackStargazers: false,
  topRepos: 10,
  smartSampling: false,
  smartSamplingThreshold: 1500,
  smartSamplingPages: 30,
  chartLineColor: '#dfb317',
  chartLineWidth: 2.5,
  chartMaxPoints: 30,
  chartYAxisSide: ChartAxisSide.LEFT,
  chartSmoothing: true,
  chartCurve: ChartCurve.MONOTONE,
  chartShowPoints: true,
  chartAnimation: true,
  chartMilestones: true,
  chartBeginAtZero: false,
  chartTheme: ChartTheme.AUTO,
  chartCustomMilestones: [],
  chartRange: ChartRange.ALL,
  chartTrendLine: false,
  velocityMetrics: false,
} as const;
