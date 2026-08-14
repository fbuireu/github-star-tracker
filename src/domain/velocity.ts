import { MS_PER_DAY, STAR_MILESTONES } from './constants';
import { latestRateInterval, type SeriesPoint } from './growth';
import { toEpochMs } from './time';
import type { History } from './types';

const MIN_SNAPSHOTS_FOR_VELOCITY = 2;
const PERCENT_MULTIPLIER = 100;
const STARS_PER_DAY_DECIMALS = 2;
const GROWTH_PERCENT_DECIMALS = 1;

export interface VelocityMetrics {
  starsPerDay: number;
  growthPercent: number | null;
  nextMilestone: number | null;
  daysToNextMilestone: number | null;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;

  return Math.round(value * factor) / factor;
}

function nextMilestoneAbove(value: number): number | null {
  return STAR_MILESTONES.find((milestone) => milestone > value) ?? null;
}

export function computeVelocity({ history }: { history: History }): VelocityMetrics | null {
  const snapshots = history.snapshots;
  if (snapshots.length < MIN_SNAPSHOTS_FOR_VELOCITY) return null;

  const last = snapshots[snapshots.length - 1];
  if (toEpochMs(last.timestamp) === null) return null;

  const points = snapshots.reduce<SeriesPoint[]>((observed, snapshot) => {
    const timeMs = toEpochMs(snapshot.timestamp);

    if (timeMs !== null) observed.push({ day: timeMs / MS_PER_DAY, value: snapshot.totalStars });

    return observed;
  }, []);

  const interval = latestRateInterval(points);
  if (interval === null) return null;

  const gained = interval.to.value - interval.from.value;
  const starsPerDay = roundTo(gained / interval.days, STARS_PER_DAY_DECIMALS);
  const growthPercent =
    interval.from.value > 0
      ? roundTo((gained / interval.from.value) * PERCENT_MULTIPLIER, GROWTH_PERCENT_DECIMALS)
      : null;

  const nextMilestone = nextMilestoneAbove(last.totalStars);
  const daysToNextMilestone =
    nextMilestone !== null && starsPerDay > 0
      ? Math.ceil((nextMilestone - last.totalStars) / starsPerDay)
      : null;

  return { starsPerDay, growthPercent, nextMilestone, daysToNextMilestone };
}
