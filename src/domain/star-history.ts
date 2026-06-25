import type { RepoStargazers } from './stargazers';
import type { History, Snapshot } from './types';

const DAY_MS = 86_400_000;

export interface RepoTotal {
  fullName: string;
  name: string;
  owner: string;
  stars: number;
}

interface BuildStarHistoryParams {
  repoStargazers: RepoStargazers[];
  repos: RepoTotal[];
  maxPoints: number;
  now?: Date;
}

function cumulativeCounts(sortedTimes: number[], edges: number[]): number[] {
  const counts: number[] = [];
  let pointer = 0;

  for (const edge of edges) {
    while (pointer < sortedTimes.length && sortedTimes[pointer] <= edge) {
      pointer++;
    }
    counts.push(pointer);
  }

  return counts;
}

function scaleToTrueTotal(fetchedCounts: number[], trueTotal: number): number[] {
  const fetchedTotal = fetchedCounts.at(-1) ?? 0;
  const scale = fetchedTotal > 0 ? trueTotal / fetchedTotal : 0;
  const scaled = fetchedCounts.map((count) =>
    fetchedTotal === trueTotal ? count : Math.round(count * scale),
  );

  for (let i = 0; i < scaled.length; i++) {
    scaled[i] = Math.min(scaled[i], trueTotal);
    if (i > 0) scaled[i] = Math.max(scaled[i], scaled[i - 1]);
  }

  if (scaled.length > 0) {
    scaled[scaled.length - 1] = trueTotal;
  }

  return scaled;
}

export function buildStarHistory({
  repoStargazers,
  repos,
  maxPoints,
  now,
}: BuildStarHistoryParams): History {
  const stargazersByRepo = new Map(repoStargazers.map((entry) => [entry.repoFullName, entry]));
  const eventsByRepo = new Map<string, number[]>();
  let earliest = Number.POSITIVE_INFINITY;

  for (const repo of repos) {
    const times = (stargazersByRepo.get(repo.fullName)?.stargazers ?? [])
      .map((stargazer) => Date.parse(stargazer.starredAt))
      .filter((ms) => Number.isFinite(ms))
      .sort((a, b) => a - b);

    eventsByRepo.set(repo.fullName, times);
    if (times.length > 0 && times[0] < earliest) earliest = times[0];
  }

  if (!Number.isFinite(earliest)) {
    return { snapshots: [] };
  }

  const end = (now ?? new Date()).getTime();
  const edges =
    earliest >= end
      ? [earliest - DAY_MS, end]
      : (() => {
          const buckets = Math.max(2, Math.floor(maxPoints));
          const step = (end - earliest) / (buckets - 1);

          return Array.from({ length: buckets }, (_, i) =>
            i === buckets - 1 ? end : earliest + i * step,
          );
        })();

  const cumulativeByRepo = new Map<string, number[]>();
  for (const repo of repos) {
    const counts = cumulativeCounts(eventsByRepo.get(repo.fullName) ?? [], edges);
    cumulativeByRepo.set(repo.fullName, scaleToTrueTotal(counts, repo.stars));
  }

  const snapshots: Snapshot[] = edges.map((edge, i) => {
    const snapshotRepos = repos.map((repo) => ({
      fullName: repo.fullName,
      name: repo.name,
      owner: repo.owner,
      stars: cumulativeByRepo.get(repo.fullName)?.[i] ?? 0,
    }));

    return {
      timestamp: new Date(edge).toISOString(),
      totalStars: snapshotRepos.reduce((sum, repo) => sum + repo.stars, 0),
      repos: snapshotRepos,
    };
  });

  return { snapshots };
}
