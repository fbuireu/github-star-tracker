import type { ComparisonResults, RepoInfo, RepoResult, Snapshot, Summary } from '../types';

interface CompareStarsParams {
  currentRepos: RepoInfo[];
  previousSnapshot: Snapshot | null;
}

export function compareStars({
  currentRepos,
  previousSnapshot,
}: CompareStarsParams): ComparisonResults {
  const prevMap: Record<string, number> = {};
  if (previousSnapshot?.repos) {
    for (const repo of previousSnapshot.repos) {
      prevMap[repo.fullName] = repo.stars;
    }
  }

  const currentMap: Record<string, boolean> = {};
  for (const repo of currentRepos) {
    currentMap[repo.fullName] = true;
  }

  const repoResults: RepoResult[] = [];

  for (const repo of currentRepos) {
    const previous = prevMap[repo.fullName] ?? null;
    const current = repo.stars;
    const delta = previous === null ? 0 : current - previous;

    repoResults.push({
      name: repo.name,
      fullName: repo.fullName,
      owner: repo.owner,
      current,
      previous,
      delta,
      isNew: previous === null,
      isRemoved: false,
    });
  }

  if (previousSnapshot?.repos) {
    for (const repo of previousSnapshot.repos) {
      if (!currentMap[repo.fullName]) {
        repoResults.push({
          name: repo.name || repo.fullName.split('/')[1],
          fullName: repo.fullName,
          owner: repo.owner || repo.fullName.split('/')[0],
          current: 0,
          previous: repo.stars,
          delta: -repo.stars,
          isNew: false,
          isRemoved: true,
        });
      }
    }
  }

  const totalStars = repoResults
    .filter((repo) => !repo.isRemoved)
    .reduce((sum, repo) => sum + repo.current, 0);

  const totalPrevious = previousSnapshot?.totalStars ?? 0;

  const gained = repoResults
    .filter((repo) => repo.delta > 0)
    .reduce((sum, repo) => sum + repo.delta, 0);

  const lost = repoResults
    .filter((repo) => repo.delta < 0)
    .reduce((sum, repo) => sum + Math.abs(repo.delta), 0);

  const changed = repoResults.some((repo) => repo.delta !== 0 || repo.isNew || repo.isRemoved);

  const summary: Summary = {
    totalStars,
    totalPrevious,
    totalDelta: totalStars - totalPrevious,
    newStars: gained,
    lostStars: lost,
    changed,
  };

  return { repos: repoResults, summary };
}

interface CreateSnapshotParams {
  currentRepos: RepoInfo[];
  summary: Summary;
}

export function createSnapshot({ currentRepos, summary }: CreateSnapshotParams): Snapshot {
  return {
    timestamp: new Date().toISOString(),
    totalStars: summary.totalStars,
    repos: currentRepos.map((repo) => ({
      fullName: repo.fullName,
      name: repo.name,
      owner: repo.owner,
      stars: repo.stars,
    })),
  };
}
