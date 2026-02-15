import type { ForecastData } from '@domain/forecast';
import type { StargazerDiffResult } from '@domain/stargazers';
import type { ComparisonResults, History, RepoResult } from '@domain/types';
import { getTranslations, type Locale } from '@i18n';

export interface GenerateReportParams {
  results: ComparisonResults;
  previousTimestamp: string | null;
  locale: Locale;
  history?: History | null;
  includeCharts?: boolean;
  stargazerDiff?: StargazerDiffResult | null;
  forecastData?: ForecastData | null;
  topRepos?: number;
}

export interface ReportData {
  activeRepos: RepoResult[];
  newRepos: RepoResult[];
  removedRepos: RepoResult[];
  sorted: RepoResult[];
  now: string;
  prev: string;
}

export interface PrepareReportDataParams {
  results: ComparisonResults;
  previousTimestamp: string | null;
  locale: Locale;
}

export function prepareReportData({
  results,
  previousTimestamp,
  locale,
}: PrepareReportDataParams): ReportData {
  const { repos } = results;
  const t = getTranslations(locale);

  const activeRepos = repos.filter((r) => !r.isRemoved);

  return {
    activeRepos,
    newRepos: repos.filter((r) => r.isNew),
    removedRepos: repos.filter((r) => r.isRemoved),
    sorted: [...activeRepos].sort((a, b) => b.current - a.current),
    now: new Date().toISOString().split('T')[0],
    prev: previousTimestamp ? previousTimestamp.split('T')[0] : t.report.firstRun,
  };
}
