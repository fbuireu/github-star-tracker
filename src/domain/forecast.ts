import type { History } from './types';

export const MIN_SNAPSHOTS = 3;
export const FORECAST_WEEKS = 4;

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

interface LinearRegressionResult {
  slope: number;
  intercept: number;
}

export function linearRegression(values: number[]): LinearRegressionResult {
  const n = values.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }

  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) {
    return { slope: 0, intercept: values[0] ?? 0 };
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}

export function weightedMovingAverage(values: number[]): number {
  if (values.length < 2) return 0;

  const deltas: number[] = [];
  for (let i = 1; i < values.length; i++) {
    deltas.push(values[i] - values[i - 1]);
  }

  let weightedSum = 0;
  let totalWeight = 0;
  for (let i = 0; i < deltas.length; i++) {
    const weight = i + 1;
    weightedSum += deltas[i] * weight;
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

function forecastFromValues(values: number[]): ForecastResult[] {
  const lastValue = values.at(-1) ?? 0;
  const n = values.length;

  const lr = linearRegression(values);
  const wmaAvgDelta = weightedMovingAverage(values);

  const lrPoints: ForecastPoint[] = [];
  const wmaPoints: ForecastPoint[] = [];

  for (let w = 1; w <= FORECAST_WEEKS; w++) {
    lrPoints.push({
      weekOffset: w,
      predicted: clampPrediction(lr.slope * (n - 1 + w) + lr.intercept),
    });
    wmaPoints.push({
      weekOffset: w,
      predicted: clampPrediction(lastValue + wmaAvgDelta * w),
    });
  }

  return [
    { method: ForecastMethod.LINEAR_REGRESSION, points: lrPoints },
    { method: ForecastMethod.WEIGHTED_MOVING_AVERAGE, points: wmaPoints },
  ];
}

export function computeForecast({
  history,
  topRepoNames,
}: ComputeForecastParams): ForecastData | null {
  if (history.snapshots.length < MIN_SNAPSHOTS) {
    return null;
  }

  const totalValues = history.snapshots.map((s) => s.totalStars);
  const aggregateForecasts = forecastFromValues(totalValues);

  const repos: RepoForecast[] = topRepoNames.map((repoFullName) => {
    const values = history.snapshots.map((s) => {
      const repo = s.repos.find((r) => r.fullName === repoFullName);
      return repo?.stars ?? 0;
    });

    return { repoFullName, forecasts: forecastFromValues(values) };
  });

  return { aggregate: { forecasts: aggregateForecasts }, repos };
}
