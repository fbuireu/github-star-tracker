import type { Config, Locale } from './types';
import { Visibility } from './types';

export const LOCALES = ['en', 'es', 'ca', 'it'] as const;

export const LOCALE_MAP: Record<Locale, string> = {
  en: 'en-US',
  es: 'es-ES',
  ca: 'ca-ES',
  it: 'it-IT',
};

interface VisibilityApiParams {
  visibility: 'public' | 'private' | 'all';
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
  notificationThreshold: 0,
  trackStargazers: false,
  topRepos: 10,
};
