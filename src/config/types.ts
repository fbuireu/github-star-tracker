import type { LOCALES } from './defaults';

export type Locale = (typeof LOCALES)[number];
export type Visibility = 'public' | 'private' | 'all';

export interface Config {
  visibility: Visibility;
  includeArchived: boolean;
  includeForks: boolean;
  excludeRepos: string[];
  onlyRepos: string[];
  minStars: number;
  dataBranch: string;
  maxHistory: number;
  sendOnNoChanges: boolean;
  includeCharts: boolean;
  locale: Locale;
}
