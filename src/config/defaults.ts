import type { Config, Locale } from './types';
import { Visibility } from './types';

export const LOCALE_MAP = {
  en: 'en-US',
  es: 'es-ES',
  ca: 'ca-ES',
  it: 'it-IT',
} as const;

export const LOCALES = Object.keys(LOCALE_MAP) as (keyof typeof LOCALE_MAP)[];

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
  minStars: 0,
  dataBranch: 'star-tracker-data',
  maxHistory: 52,
  sendOnNoChanges: false,
  includeCharts: true,
  locale: 'en' as Locale,
  notificationThreshold: 'auto',
  trackStargazers: false,
  topRepos: 10,
};
