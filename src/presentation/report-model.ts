import { topRepositories } from "@domain/comparison";
import type { ForecastData, ForecastResult } from "@domain/forecast";
import type { StargazerDiffEntry } from "@domain/stargazers";
import type { History, RepoResult, Summary } from "@domain/types";
import { computeVelocity, type VelocityMetrics } from "@domain/velocity";
import type { Translations } from "@i18n";
import { isPlottable } from "./chart-spec";
import type { ReportParams } from "./shared";
import {
	buildForecastWeekHeaders,
	forecastMethodLabel,
	perRepoChartFile,
	perRepoForecastChartFile,
	prepareReportData,
} from "./shared";
import type { PerRepoChart, PerRepoForecast, TopRepo } from "./types";

export type { TopRepo };

export const StargazerOutcome = {
	NEW: "new",
	NONE: "none",
} as const;

export type StargazerOutcome = (typeof StargazerOutcome)[keyof typeof StargazerOutcome];

interface StargazerSection {
	outcome: StargazerOutcome;
	totalNew: number;
	entries: StargazerDiffEntry[];
	sampledRepos: string[];
}

interface VelocitySection {
	starsPerDay: number;
	growthPercent: number | null;
	nextMilestone: { days: number; milestone: number } | null;
}

export interface ReportModel {
	summary: Summary;
	now: string;
	baselineSnapshotDate: string;
	generatedAt: string;
	isFirstRun: boolean;
	sorted: RepoResult[];
	newRepos: RepoResult[];
	removedRepos: RepoResult[];
	topRepos: TopRepo[];
	perRepoCharts: PerRepoChart[];
	chartHistory: History | null;
	showComparisonChart: boolean;
	stargazers: StargazerSection | null;
	velocity: VelocitySection | null;
	velocityIsNested: boolean;
	forecast: ForecastData | null;
	perRepoForecasts: PerRepoForecast[];
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
		nextMilestone:
			metrics.nextMilestone !== null && metrics.daysToNextMilestone !== null
				? { days: metrics.daysToNextMilestone, milestone: metrics.nextMilestone }
				: null,
	};
}

export function buildReportModel(params: ReportParams): ReportModel {
	const {
		config,
		results,
		baselineSnapshotTimestamp,
		history = null,
		velocityHistory = null,
		forecastData = null,
		now,
		chartHistories = null,
		drawn = null,
	} = params;
	const isDrawn = (filename: string): boolean => drawn === null || drawn.has(filename);
	const { locale, includeCharts, topRepos: topReposCount, velocityMetrics } = config;

	const {
		sorted,
		newRepos,
		removedRepos,
		now: reportDate,
		baselineSnapshotDate,
		isFirstRun,
		generatedAt,
	} = prepareReportData({
		results,
		baselineSnapshotTimestamp,
		locale,
		now,
	});
	const hasChartHistory = includeCharts && history !== null && isPlottable(history);
	const velocity = velocityMetrics && velocityHistory !== null ? computeVelocity(velocityHistory) : null;

	const topRepos = toTopRepos({ repos: results.repos, ranked: sorted, limit: topReposCount });
	const chartHistory = hasChartHistory ? history : null;
	const perRepoCharts: PerRepoChart[] =
		chartHistory !== null && chartHistories !== null
			? topRepos
					.filter((repo) => isDrawn(perRepoChartFile(repo.fullName)))
					.map((repo) => ({ ...repo, history: chartHistories.forRepo(repo.fullName) }))
			: [];
	const perRepoForecasts: PerRepoForecast[] =
		forecastData === null
			? []
			: forecastData.repos.map(({ repoFullName, forecasts }) => ({
					repoFullName,
					forecasts,
					chartHistory:
						chartHistory !== null && chartHistories !== null && isDrawn(perRepoForecastChartFile(repoFullName))
							? chartHistories.reconstructedForRepo(repoFullName)
							: null,
				}));

	return {
		summary: results.summary,
		now: reportDate,
		baselineSnapshotDate,
		generatedAt,
		isFirstRun,
		sorted,
		newRepos,
		removedRepos,
		topRepos,
		perRepoCharts,
		chartHistory,
		showComparisonChart: chartHistory !== null && topRepos.length > 0,
		stargazers: toStargazerSection(params),
		velocity: toVelocitySection(velocity),
		velocityIsNested: forecastData !== null,
		forecast: forecastData,
		perRepoForecasts,
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

export function buildForecastTable({ title, forecasts, t }: BuildForecastTableParams): ForecastTable {
	return {
		title,
		weekHeaders: buildForecastWeekHeaders(t),
		rows: forecasts.map((forecast) => ({
			method: forecastMethodLabel({ method: forecast.method, t }),
			predicted: forecast.points.map((point) => point.predicted),
		})),
	};
}
