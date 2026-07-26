import { MIN_RATE_INTERVAL_DAYS, MS_PER_DAY, STAR_MILESTONES } from './constants';
import { toEpochMs } from './time';
import type { History, Snapshot } from './types';

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
  const lastMs = toEpochMs(last.timestamp);
  if (lastMs === null) return null;

  let previous: Snapshot | null = null;
  let elapsedDays = 0;

  for (let index = snapshots.length - 2; index >= 0; index--) {
    const candidateMs = toEpochMs(snapshots[index].timestamp);
    if (candidateMs === null) continue;

    const candidateDays = (lastMs - candidateMs) / MS_PER_DAY;
    if (candidateDays < MIN_RATE_INTERVAL_DAYS) continue;

    previous = snapshots[index];
    elapsedDays = candidateDays;
    break;
  }

  if (previous === null) return null;

  const gained = last.totalStars - previous.totalStars;
  const starsPerDay = roundTo(gained / elapsedDays, STARS_PER_DAY_DECIMALS);
  const growthPercent =
    previous.totalStars > 0
      ? roundTo((gained / previous.totalStars) * PERCENT_MULTIPLIER, GROWTH_PERCENT_DECIMALS)
      : null;

  const nextMilestone = nextMilestoneAbove(last.totalStars);
  const daysToNextMilestone =
    nextMilestone !== null && starsPerDay > 0
      ? Math.ceil((nextMilestone - last.totalStars) / starsPerDay)
      : null;

  return { starsPerDay, growthPercent, nextMilestone, daysToNextMilestone };
}
