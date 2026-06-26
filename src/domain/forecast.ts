import { FORECAST_WEEKS, MIN_SNAPSHOTS_FOR_FORECAST } from './constants';
import type { History } from './types';

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
  const pointCount = values.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let index = 0; index < pointCount; index++) {
    sumX += index;
    sumY += values[index];
    sumXY += index * values[index];
    sumXX += index * index;
  }

  const denominator = pointCount * sumXX - sumX * sumX;

  if (denominator === 0) {
    return { slope: 0, intercept: values[0] ?? 0 };
  }

  const slope = (pointCount * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / pointCount;

  return { slope, intercept };
}

const MIN_VALUES_FOR_WEIGHTED_AVERAGE = 2;

export function weightedMovingAverage(values: number[]): number {
  if (values.length < MIN_VALUES_FOR_WEIGHTED_AVERAGE) return 0;

  const deltas: number[] = [];

  for (let index = 1; index < values.length; index++) {
    deltas.push(values[index] - values[index - 1]);
  }

  let weightedSum = 0;
  let totalWeight = 0;

  for (let index = 0; index < deltas.length; index++) {
    const weight = index + 1;
    weightedSum += deltas[index] * weight;
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
  const pointCount = values.length;
  const regression = linearRegression(values);
  const wmaAvgDelta = weightedMovingAverage(values);
  const lrPoints: ForecastPoint[] = [];
  const wmaPoints: ForecastPoint[] = [];

  for (let weekOffset = 1; weekOffset <= FORECAST_WEEKS; weekOffset++) {
    lrPoints.push({
      weekOffset,
      predicted: clampPrediction(
        regression.slope * (pointCount - 1 + weekOffset) + regression.intercept,
      ),
    });
    wmaPoints.push({
      weekOffset,
      predicted: clampPrediction(lastValue + wmaAvgDelta * weekOffset),
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
  if (history.snapshots.length < MIN_SNAPSHOTS_FOR_FORECAST) {
    return null;
  }

  const totalValues = history.snapshots.map((snapshot) => snapshot.totalStars);
  const aggregateForecasts = forecastFromValues(totalValues);
  const repos: RepoForecast[] = topRepoNames.map((repoFullName) => {
    const values = history.snapshots.map((snapshot) => {
      const repo = snapshot.repos.find((candidate) => candidate.fullName === repoFullName);
      return repo?.stars ?? 0;
    });

    return { repoFullName, forecasts: forecastFromValues(values) };
  });

  return { aggregate: { forecasts: aggregateForecasts }, repos };
}
