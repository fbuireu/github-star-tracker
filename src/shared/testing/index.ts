import { DEFAULTS } from '@config/defaults';
import type { Config } from '@config/types';
import type { Stargazer } from '@domain/stargazers';
import type {
  ComparisonResults,
  History,
  RepoInfo,
  RepoResult,
  Snapshot,
  SnapshotRepo,
} from '@domain/types';

const MS_PER_DAY = 86_400_000;
const DEFAULT_SERIES_START = Date.UTC(2026, 0, 1);
const DEFAULT_HISTORY_STEP_DAYS = 7;

export function makeConfig(overrides: Partial<Config> = {}): Config {
  return { ...DEFAULTS, ...overrides };
}

export function makeRepoInfo(
  name: string,
  stars = 10,
  overrides: Partial<RepoInfo> = {},
): RepoInfo {
  return {
    owner: 'user',
    name,
    fullName: `user/${name}`,
    private: false,
    archived: false,
    fork: false,
    stars,
    ...overrides,
  };
}

export function makeStargazer(overrides: Partial<Stargazer> = {}): Stargazer {
  const starredAt = overrides.starredAt ?? '2026-01-15T00:00:00Z';

  return {
    login: overrides.login ?? `u-${starredAt}`,
    avatarUrl: overrides.avatarUrl ?? '',
    profileUrl: overrides.profileUrl ?? '',
    starredAt,
  };
}

interface MakeStargazerSeriesParams {
  count: number;
  startMs?: number;
  stepDays?: number;
  prefix?: string;
}

export function makeStargazerSeries({
  count,
  startMs = DEFAULT_SERIES_START,
  stepDays = 1,
  prefix = 'u',
}: MakeStargazerSeriesParams): Stargazer[] {
  return Array.from({ length: count }, (_, index) =>
    makeStargazer({
      login: `${prefix}${index}`,
      starredAt: new Date(startMs + index * stepDays * MS_PER_DAY).toISOString(),
    }),
  );
}

export function makeSnapshot(
  timestamp: string,
  totalStars: number,
  repos: SnapshotRepo[] = [],
): Snapshot {
  return { timestamp, totalStars, repos };
}

interface MakeHistoryParams {
  startMs?: number;
  stepDays?: number;
}

export function makeHistory(
  starCounts: number[],
  { startMs = DEFAULT_SERIES_START, stepDays = DEFAULT_HISTORY_STEP_DAYS }: MakeHistoryParams = {},
): History {
  return {
    snapshots: starCounts.map((totalStars, index) =>
      makeSnapshot(new Date(startMs + index * stepDays * MS_PER_DAY).toISOString(), totalStars),
    ),
  };
}

export function makeMultiRepoSnapshot(
  timestamp: string,
  repoStars: Record<string, number>,
): Snapshot {
  const repos = Object.entries(repoStars).map(([fullName, stars]) => ({
    fullName,
    name: fullName.split('/')[1],
    owner: fullName.split('/')[0],
    stars,
  }));

  return {
    timestamp,
    totalStars: repos.reduce((sum, repo) => sum + repo.stars, 0),
    repos,
  };
}

export function makeMultiRepoHistory(
  snapshots: Record<string, number>[],
  { startMs = DEFAULT_SERIES_START, stepDays = DEFAULT_HISTORY_STEP_DAYS }: MakeHistoryParams = {},
): History {
  return {
    snapshots: snapshots.map((repoStars, index) =>
      makeMultiRepoSnapshot(
        new Date(startMs + index * stepDays * MS_PER_DAY).toISOString(),
        repoStars,
      ),
    ),
  };
}

export function makeRepoResult(name: string, overrides: Partial<RepoResult> = {}): RepoResult {
  return {
    name,
    fullName: `user/${name}`,
    owner: 'user',
    current: 10,
    previous: 10,
    delta: 0,
    isNew: false,
    isRemoved: false,
    ...overrides,
  };
}

export function makeComparisonResults(
  overrides: Partial<ComparisonResults> = {},
): ComparisonResults {
  return {
    repos: [
      makeRepoResult('repo-a', { current: 15, previous: 10, delta: 5 }),
      makeRepoResult('repo-b', { current: 8, previous: 10, delta: -2 }),
    ],
    summary: {
      totalStars: 23,
      totalPrevious: 20,
      totalDelta: 3,
      newStars: 5,
      lostStars: 2,
      changed: true,
    },
    ...overrides,
  };
}
