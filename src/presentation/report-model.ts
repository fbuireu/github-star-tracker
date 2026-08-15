import { topRepositories } from '@domain/comparison';
import type { ForecastData, ForecastResult } from '@domain/forecast';
import type { StargazerDiffEntry } from '@domain/stargazers';
import type { History, RepoResult, Summary } from '@domain/types';
import { computeVelocity, type VelocityMetrics } from '@domain/velocity';
import { getTranslations } from '@i18n';
import { MIN_SNAPSHOTS_FOR_CHART } from './constants';
import type { ReportParams } from './shared';
import { buildForecastWeekHeaders, forecastMethodLabel, prepareReportData } from './shared';

type Translations = ReturnType<typeof getTranslations>;

export const StargazerOutcome = {
  NEW: 'new',
  NONE: 'none',
} as const;

export type StargazerOutcome = (typeof StargazerOutcome)[keyof typeof StargazerOutcome];

export interface StargazerSection {
  outcome: StargazerOutcome;
  totalNew: number;
  entries: StargazerDiffEntry[];
  sampledRepos: string[];
}

export interface VelocitySection {
  starsPerDay: number;
  growthPercent: number | null;
  projection: { days: number; milestone: number } | null;
}

export interface TopRepo {
  fullName: string;
  current: number;
  delta: number;
}

export interface ReportModel {
  summary: Summary;
  now: string;
  prev: string;
  isFirstRun: boolean;
  sorted: RepoResult[];
  newRepos: RepoResult[];
  removedRepos: RepoResult[];
  topRepos: TopRepo[];
  hasChartHistory: boolean;
  chartHistory: History | null;
  stargazers: StargazerSection | null;
  velocity: VelocitySection | null;
  velocityIsNested: boolean;
  forecast: ForecastData | null;
}

interface ToTopReposParams {
  repos: RepoResult[];
  ranked: RepoResult[];
  limit: number;
}

function toTopRepos({ repos, ranked, limit }: ToTopReposParams): TopRepo[] {
  const top = new Set(topRepositories({ repos, limit }));

  return ranked
    .filter((repo) => top.has(repo.fullName))
    .map(({ fullName, current, delta }) => ({ fullName, current, delta }));
}

function toStargazerSection(params: ReportParams): StargazerSection | null {
  const diff = params.stargazerDiff ?? null;

  if (diff === null) return null;

  return {
    outcome: diff.totalNew > 0 ? StargazerOutcome.NEW : StargazerOutcome.NONE,
    totalNew: diff.totalNew,
    entries: diff.entries,
    sampledRepos: diff.sampledRepos ?? [],
  };
}

function toVelocitySection(metrics: VelocityMetrics | null): VelocitySection | null {
  if (metrics === null) return null;

  return {
    starsPerDay: metrics.starsPerDay,
    growthPercent: metrics.growthPercent,
    projection:
      metrics.nextMilestone !== null && metrics.daysToNextMilestone !== null
        ? { days: metrics.daysToNextMilestone, milestone: metrics.nextMilestone }
        : null,
  };
}

export function buildReportModel(params: ReportParams): ReportModel {
  const {
    results,
    previousTimestamp,
    locale,
    history = null,
    velocityHistory = null,
    includeCharts = true,
    forecastData = null,
    topRepos: topReposCount = 10,
    velocityMetrics = false,
  } = params;

  const t = getTranslations(locale);
  const { sorted, newRepos, removedRepos, now, prev } = prepareReportData({
    results,
    previousTimestamp,
    locale,
  });
  const hasChartHistory =
    includeCharts && history !== null && history.snapshots.length >= MIN_SNAPSHOTS_FOR_CHART;
  const velocity =
    velocityMetrics && velocityHistory !== null
      ? computeVelocity({ history: velocityHistory })
      : null;

  return {
    summary: results.summary,
    now,
    prev,
    isFirstRun: prev === t.report.firstRun,
    sorted,
    newRepos,
    removedRepos,
    topRepos: toTopRepos({ repos: results.repos, ranked: sorted, limit: topReposCount }),
    hasChartHistory,
    chartHistory: hasChartHistory ? history : null,
    stargazers: toStargazerSection(params),
    velocity: toVelocitySection(velocity),
    velocityIsNested: forecastData !== null,
    forecast: forecastData,
  };
}

export interface ForecastTable {
  title: string;
  weekHeaders: string[];
  rows: { method: string; predicted: number[] }[];
}

interface BuildForecastTableParams {
  title: string;
  forecasts: ForecastResult[];
  t: Translations;
}

export function buildForecastTable({
  title,
  forecasts,
  t,
}: BuildForecastTableParams): ForecastTable {
  return {
    title,
    weekHeaders: buildForecastWeekHeaders(t),
    rows: forecasts.map((forecast) => ({
      method: forecastMethodLabel({ method: forecast.method, t }),
      predicted: forecast.points.map((point) => point.predicted),
    })),
  };
}
