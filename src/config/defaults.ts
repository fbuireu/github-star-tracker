import type { Config, Visibility } from './types';

export const LOCALES = ['en', 'es', 'ca', 'it'] as const;
export const VALID_VISIBILITIES: readonly Visibility[] = ['public', 'private', 'all'];

export const DEFAULTS: Config = {
  visibility: 'all',
  includeArchived: false,
  includeForks: false,
  excludeRepos: [],
  onlyRepos: [],
  minStars: 0,
  dataBranch: 'star-tracker-data',
  maxHistory: 52,
  sendOnNoChanges: false,
  includeCharts: true,
  locale: 'en',
};
