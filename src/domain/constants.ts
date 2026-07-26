export const MS_PER_DAY = 86_400_000;

export const MS_PER_YEAR = 365 * MS_PER_DAY;

export const MIN_SNAPSHOTS_FOR_FORECAST = 3;
export const FORECAST_WEEKS = 4;

export const MIN_RATE_INTERVAL_DAYS = 0.25;

export const STAR_MILESTONES = [
  10, 50, 100, 500, 1_000, 5_000, 10_000, 50_000, 100_000, 500_000, 1_000_000,
] as const;

export const NOTIFICATION_THRESHOLDS = [
  { limit: 50, value: 1 },
  { limit: 200, value: 5 },
  { limit: 500, value: 10 },
] as const;

export const NOTIFICATION_THRESHOLD_MAX_PACE = 20;

// GitHub only lets us page through the oldest 40,000 stargazers, so for larger
// repos the most recent stars are unreachable and the fetched dates stop well
// before "now". Those repos need a ramped tail instead of a flat one (#114).
export const MAX_REACHABLE_STARGAZERS = 40_000;
