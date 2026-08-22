import { DAYS_PER_WEEK, MIN_RATE_INTERVAL_DAYS, MS_PER_DAY } from "./constants";
import { toEpochMs } from "./time";
import type { History } from "./types";

const MIN_POINTS_FOR_RATE = 2;

export interface SeriesPoint {
	day: number;
	value: number;
}

export interface RateInterval {
	from: SeriesPoint;
	to: SeriesPoint;
	days: number;
}

export interface TrendFit {
	slope: number;
	intercept: number;
}

export function calendarDays(history: History): number[] {
	const times = history.snapshots.map((snapshot) => toEpochMs(snapshot.timestamp));

	if (times.some((timeMs) => timeMs === null)) {
		return history.snapshots.map((_, index) => index * DAYS_PER_WEEK);
	}

	const first = times[0] as number;

	return times.map((timeMs) => ((timeMs as number) - first) / MS_PER_DAY);
}

export function latestRateInterval(points: SeriesPoint[]): RateInterval | null {
	if (points.length < MIN_POINTS_FOR_RATE) return null;

	const to = points[points.length - 1];

	for (let index = points.length - 2; index >= 0; index--) {
		const days = to.day - points[index].day;

		if (days < MIN_RATE_INTERVAL_DAYS) continue;

		return { from: points[index], to, days };
	}

	return null;
}

export function weightedDailyRate(points: SeriesPoint[]): number {
	if (points.length < MIN_POINTS_FOR_RATE) return 0;

	const dailyRates: number[] = [];

	for (let index = 1; index < points.length; index++) {
		const elapsedDays = points[index].day - points[index - 1].day;

		if (elapsedDays < MIN_RATE_INTERVAL_DAYS) continue;

		dailyRates.push((points[index].value - points[index - 1].value) / elapsedDays);
	}

	if (dailyRates.length === 0) return 0;

	let weightedSum = 0;
	let totalWeight = 0;

	for (let index = 0; index < dailyRates.length; index++) {
		const weight = index + 1;

		weightedSum += dailyRates[index] * weight;
		totalWeight += weight;
	}

	return weightedSum / totalWeight;
}

export function fitTrend(points: SeriesPoint[]): TrendFit {
	const pointCount = points.length;
	let sumX = 0;
	let sumY = 0;
	let sumXY = 0;
	let sumXX = 0;

	for (const point of points) {
		sumX += point.day;
		sumY += point.value;
		sumXY += point.day * point.value;
		sumXX += point.day * point.day;
	}

	const denominator = pointCount * sumXX - sumX * sumX;

	if (denominator === 0) {
		return { slope: 0, intercept: points.at(-1)?.value ?? 0 };
	}

	const slope = (pointCount * sumXY - sumX * sumY) / denominator;
	const intercept = (sumY - slope * sumX) / pointCount;

	return { slope, intercept };
}
