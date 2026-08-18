import type { History } from '@domain/types';

export interface ColorPalette {
  accent: string;
  positive: string;
  negative: string;
  neutral: string;
  link: string;
  text: string;
  white: string;
  shadow: string;
  muted: string;
  tableHeaderBg: string;
  tableHeaderBorder: string;
  cellBorder: string;
  gradientStart: string;
}

export interface ChartHistories {
  aggregate: History;
  forRepo: (repoFullName: string) => History;
  reconstructedForRepo: (repoFullName: string) => History | null;
}

export interface TopRepo {
  fullName: string;
  current: number;
  delta: number;
}

export interface PerRepoChart extends TopRepo {
  history: History;
}
