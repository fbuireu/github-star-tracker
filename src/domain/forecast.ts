import { DAYS_PER_WEEK, FORECAST_WEEKS, MIN_SNAPSHOTS_FOR_FORECAST } from "./constants";
import { calendarDays, fitTrend, type SeriesPoint, weightedDailyRate } from "./growth";
import { repoStarSeries } from "./snapshot";
import type { History } from "./types";

export interface ForecastPoint {
	weekOffset: number;
	predicted: number;
}

export const ForecastMethod = {
	LINEAR_REGRESSION: "linear-regression",
	WEIGHTED_MOVING_AVERAGE: "weighted-moving-average",
} as const;

export type ForecastMethod = (typeof ForecastMethod)[keyof typeof ForecastMethod];

export interface ForecastResult {
	method: ForecastMethod;
	points: ForecastPoint[];
}

export const ForecastSource = {
	OWN: "own",
	AGGREGATE: "aggregate",
} as const;

export type ForecastSource = (typeof ForecastSource)[keyof typeof ForecastSource];

export interface RepoForecast {
	repoFullName: string;
	source: ForecastSource;
	forecasts: ForecastResult[];
}

export interface ForecastData {
	aggregate: { forecasts: ForecastResult[] };
	repos: RepoForecast[];
}

interface ComputeForecastParams {
	history: History;
	topRepoNames: string[];
	historyForRepo?: (repoFullName: string) => History | null;
}

interface ToSeriesParams {
	values: number[];
	days: number[];
}

interface SnapshotsHoldingParams {
	history: History;
	repoFullName: string;
}

function snapshotsHolding({ history, repoFullName }: SnapshotsHoldingParams): History {
	return {
		snapshots: history.snapshots.filter((snapshot) => snapshot.repos.some((repo) => repo.fullName === repoFullName)),
	};
}

function holdsEnoughToForecast(history: History): boolean {
	return history.snapshots.length >= MIN_SNAPSHOTS_FOR_FORECAST;
}

function clampPrediction(value: number): number {
	return Math.max(0, Math.round(value));
}

function forecastFromSeries(points: SeriesPoint[]): ForecastResult[] {
	const last = points.at(-1) ?? { day: 0, value: 0 };
	const regression = fitTrend(points);
	const wmaDailyRate = weightedDailyRate(points);
	const lrPoints: ForecastPoint[] = [];
	const wmaPoints: ForecastPoint[] = [];

	for (let weekOffset = 1; weekOffset <= FORECAST_WEEKS; weekOffset++) {
		const forecastDays = weekOffset * DAYS_PER_WEEK;
		lrPoints.push({
			weekOffset,
			predicted: clampPrediction(last.value + regression.slope * forecastDays),
		});
		wmaPoints.push({
			weekOffset,
			predicted: clampPrediction(last.value + wmaDailyRate * forecastDays),
		});
	}

	return [
		{ method: ForecastMethod.LINEAR_REGRESSION, points: lrPoints },
		{ method: ForecastMethod.WEIGHTED_MOVING_AVERAGE, points: wmaPoints },
	];
}

export function computeForecast({ history, topRepoNames, historyForRepo }: ComputeForecastParams): ForecastData | null {
	if (!holdsEnoughToForecast(history)) {
		return null;
	}

	const toSeries = ({ values, days }: ToSeriesParams): SeriesPoint[] =>
		values.map((value, index) => ({ day: days[index], value }));

	const totalValues = history.snapshots.map((snapshot) => snapshot.totalStars);
	const aggregateForecasts = forecastFromSeries(toSeries({ values: totalValues, days: calendarDays(history) }));
	const repos: RepoForecast[] = topRepoNames.flatMap((repoFullName) => {
		const candidate = historyForRepo?.(repoFullName);
		const ownHistory = candidate && holdsEnoughToForecast(candidate) ? candidate : null;
		const fitted = snapshotsHolding({ history: ownHistory ?? history, repoFullName });

		if (!holdsEnoughToForecast(fitted)) return [];

		const values = repoStarSeries({ snapshots: fitted.snapshots, repoFullName });

		return [
			{
				repoFullName,
				source: ownHistory === null ? ForecastSource.AGGREGATE : ForecastSource.OWN,
				forecasts: forecastFromSeries(toSeries({ values, days: calendarDays(fitted) })),
			},
		];
	});

	return { aggregate: { forecasts: aggregateForecasts }, repos };
}
