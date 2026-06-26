import { MAX_REACHABLE_STARGAZERS, MS_PER_DAY } from './constants';
import type { RepoStargazers } from './stargazers';
import type { History, Snapshot } from './types';

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

  for (let index = 0; index < scaled.length; index++) {
    scaled[index] = Math.min(scaled[index], trueTotal);
    if (index > 0) scaled[index] = Math.max(scaled[index], scaled[index - 1]);
  }

  if (scaled.length > 0) {
    scaled[scaled.length - 1] = trueTotal;
  }

  return scaled;
}

function scaleCappedToTrueTotal(counts: number[], trueTotal: number): number[] {
  const fetchedTotal = counts.at(-1) ?? 0;
  const scale = fetchedTotal > 0 ? MAX_REACHABLE_STARGAZERS / fetchedTotal : 0;
  const scaled = counts.map((count) => Math.round(count * scale));

  // The fetched stargazers only cover the oldest ~40k stars, so the curve goes
  // flat once their dates run out. Replace that flat tail with a straight ramp
  // from the reachable count up to the repo's real current total at the last edge.
  let tailStart = scaled.length - 1;
  while (tailStart > 0 && counts[tailStart - 1] === fetchedTotal) {
    tailStart--;
  }

  const last = scaled.length - 1;
  const span = last - tailStart;
  if (span > 0) {
    const startValue = scaled[tailStart];
    for (let index = tailStart; index <= last; index++) {
      scaled[index] = Math.round(
        startValue + ((index - tailStart) / span) * (trueTotal - startValue),
      );
    }
  }

  for (let index = 1; index < scaled.length; index++) {
    if (scaled[index] < scaled[index - 1]) scaled[index] = scaled[index - 1];
  }
  if (scaled.length > 0) scaled[last] = trueTotal;

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
      .filter((timeMs) => Number.isFinite(timeMs))
      .sort((earlier, later) => earlier - later);

    eventsByRepo.set(repo.fullName, times);
    if (times.length > 0 && times[0] < earliest) earliest = times[0];
  }

  if (!Number.isFinite(earliest)) {
    return { snapshots: [] };
  }

  const end = (now ?? new Date()).getTime();
  const edges =
    earliest >= end
      ? [earliest - MS_PER_DAY, end]
      : (() => {
          const buckets = Math.max(2, Math.floor(maxPoints));
          const step = (end - earliest) / (buckets - 1);

          return Array.from({ length: buckets }, (_, bucketIndex) =>
            bucketIndex === buckets - 1 ? end : earliest + bucketIndex * step,
          );
        })();

  const cumulativeByRepo = new Map<string, number[]>();
  for (const repo of repos) {
    const counts = cumulativeCounts(eventsByRepo.get(repo.fullName) ?? [], edges);
    const scaled =
      repo.stars > MAX_REACHABLE_STARGAZERS
        ? scaleCappedToTrueTotal(counts, repo.stars)
        : scaleToTrueTotal(counts, repo.stars);
    cumulativeByRepo.set(repo.fullName, scaled);
  }

  const snapshots: Snapshot[] = edges.map((edge, edgeIndex) => {
    const snapshotRepos = repos.map((repo) => ({
      fullName: repo.fullName,
      name: repo.name,
      owner: repo.owner,
      stars: cumulativeByRepo.get(repo.fullName)?.[edgeIndex] ?? 0,
    }));

    return {
      timestamp: new Date(edge).toISOString(),
      totalStars: snapshotRepos.reduce((sum, repo) => sum + repo.stars, 0),
      repos: snapshotRepos,
    };
  });

  return { snapshots };
}
