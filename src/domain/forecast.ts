import { FORECAST_WEEKS, MIN_SNAPSHOTS_FOR_FORECAST, MS_PER_DAY } from './constants';
import type { History } from './types';

const DAYS_PER_WEEK = 7;

export interface ForecastPoint {
  weekOffset: number;
  predicted: number;
}

export const ForecastMethod = {
  LINEAR_REGRESSION: 'linear-regression',
  WEIGHTED_MOVING_AVERAGE: 'weighted-moving-average',
} as const;

export type ForecastMethod = (typeof ForecastMethod)[keyof typeof ForecastMethod];

export interface ForecastResult {
  method: ForecastMethod;
  points: ForecastPoint[];
}

export interface RepoForecast {
  repoFullName: string;
  forecasts: ForecastResult[];
}

export interface ForecastData {
  aggregate: { forecasts: ForecastResult[] };
  repos: RepoForecast[];
}

export interface SeriesPoint {
  day: number;
  value: number;
}

interface LinearRegressionResult {
  slope: number;
  intercept: number;
}

export function linearRegression(points: SeriesPoint[]): LinearRegressionResult {
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

const MIN_POINTS_FOR_WEIGHTED_AVERAGE = 2;

export function weightedMovingAverage(points: SeriesPoint[]): number {
  if (points.length < MIN_POINTS_FOR_WEIGHTED_AVERAGE) return 0;

  const dailyRates: number[] = [];

  for (let index = 1; index < points.length; index++) {
    const elapsedDays = points[index].day - points[index - 1].day;
    if (elapsedDays <= 0) continue;
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

interface ComputeForecastParams {
  history: History;
  topRepoNames: string[];
}

function clampPrediction(value: number): number {
  return Math.max(0, Math.round(value));
}

function forecastFromSeries(points: SeriesPoint[]): ForecastResult[] {
  const last = points.at(-1) ?? { day: 0, value: 0 };
  const regression = linearRegression(points);
  const wmaDailyRate = weightedMovingAverage(points);
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

function snapshotDays(history: History): number[] {
  const times = history.snapshots.map((snapshot) => Date.parse(snapshot.timestamp));

  if (times.some((timeMs) => !Number.isFinite(timeMs))) {
    return history.snapshots.map((_, index) => index * DAYS_PER_WEEK);
  }

  const first = times[0];

  return times.map((timeMs) => (timeMs - first) / MS_PER_DAY);
}

export function computeForecast({
  history,
  topRepoNames,
}: ComputeForecastParams): ForecastData | null {
  if (history.snapshots.length < MIN_SNAPSHOTS_FOR_FORECAST) {
    return null;
  }

  const days = snapshotDays(history);
  const toSeries = (values: number[]): SeriesPoint[] =>
    values.map((value, index) => ({ day: days[index], value }));

  const totalValues = history.snapshots.map((snapshot) => snapshot.totalStars);
  const aggregateForecasts = forecastFromSeries(toSeries(totalValues));
  const repos: RepoForecast[] = topRepoNames.map((repoFullName) => {
    const values = history.snapshots.map((snapshot) => {
      const repo = snapshot.repos.find((candidate) => candidate.fullName === repoFullName);
      return repo?.stars ?? 0;
    });

    return { repoFullName, forecasts: forecastFromSeries(toSeries(values)) };
  });

  return { aggregate: { forecasts: aggregateForecasts }, repos };
}
