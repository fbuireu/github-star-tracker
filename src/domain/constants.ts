export const MS_PER_DAY = 86_400_000;
export const MS_PER_YEAR = 365 * MS_PER_DAY;

export const MIN_SNAPSHOTS_FOR_FORECAST = 3;
export const FORECAST_WEEKS = 4;

// GitHub only lets us page through the oldest 40,000 stargazers, so for larger
// repos the most recent stars are unreachable and the fetched dates stop well
// before "now". Those repos need a ramped tail instead of a flat one (#114).
export const MAX_REACHABLE_STARGAZERS = 40_000;
