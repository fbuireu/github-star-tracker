import { MS_PER_DAY } from './constants';
import type { History } from './types';

const VELOCITY_MILESTONES = [
  10, 50, 100, 500, 1_000, 5_000, 10_000, 50_000, 100_000, 500_000, 1_000_000,
] as const;

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
  return VELOCITY_MILESTONES.find((milestone) => milestone > value) ?? null;
}

export function computeVelocity({ history }: { history: History }): VelocityMetrics | null {
  const snapshots = history.snapshots;
  if (snapshots.length < MIN_SNAPSHOTS_FOR_VELOCITY) return null;

  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];
  const elapsedDays =
    (new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime()) / MS_PER_DAY;
  if (elapsedDays <= 0) return null;

  const gained = last.totalStars - first.totalStars;
  const starsPerDay = roundTo(gained / elapsedDays, STARS_PER_DAY_DECIMALS);
  const growthPercent =
    first.totalStars > 0
      ? roundTo((gained / first.totalStars) * PERCENT_MULTIPLIER, GROWTH_PERCENT_DECIMALS)
      : null;

  const nextMilestone = nextMilestoneAbove(last.totalStars);
  const daysToNextMilestone =
    nextMilestone !== null && starsPerDay > 0
      ? Math.ceil((nextMilestone - last.totalStars) / starsPerDay)
      : null;

  return { starsPerDay, growthPercent, nextMilestone, daysToNextMilestone };
}
