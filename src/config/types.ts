import type { LOCALE_MAP } from './defaults';

export type Locale = keyof typeof LOCALE_MAP;
export const Visibility = {
  PUBLIC: 'public',
  PRIVATE: 'private',
  ALL: 'all',
  OWNED: 'owned',
} as const;

export type Visibility = (typeof Visibility)[keyof typeof Visibility];

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
  notificationThreshold: number | 'auto';
  trackStargazers: boolean;
  topRepos: number;
}
