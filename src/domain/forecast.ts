import { DAYS_PER_WEEK, FORECAST_WEEKS, MIN_SNAPSHOTS_FOR_FORECAST } from './constants';
import { calendarDays, fitTrend, type SeriesPoint, weightedDailyRate } from './growth';
import { repoStarSeries } from './snapshot';
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

interface ComputeForecastParams {
  history: History;
  topRepoNames: string[];
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

export function computeForecast({
  history,
  topRepoNames,
}: ComputeForecastParams): ForecastData | null {
  if (history.snapshots.length < MIN_SNAPSHOTS_FOR_FORECAST) {
    return null;
  }

  const days = calendarDays(history);
  const toSeries = (values: number[]): SeriesPoint[] =>
    values.map((value, index) => ({ day: days[index], value }));

  const totalValues = history.snapshots.map((snapshot) => snapshot.totalStars);
  const aggregateForecasts = forecastFromSeries(toSeries(totalValues));
  const repos: RepoForecast[] = topRepoNames.map((repoFullName) => {
    const values = repoStarSeries({ snapshots: history.snapshots, repoFullName });

    return { repoFullName, forecasts: forecastFromSeries(toSeries(values)) };
  });

  return { aggregate: { forecasts: aggregateForecasts }, repos };
}
