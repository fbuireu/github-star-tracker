import { describe, expect, it } from 'vitest';
import { compareStars, createSnapshot } from '../src/stars';
import type { RepoInfo, Snapshot } from '../src/types';

function makeRepoData(name: string, stars: number): RepoInfo {
  return {
    owner: 'user',
    name,
    fullName: `user/${name}`,
    private: false,
    archived: false,
    fork: false,
    stars,
  };
}

describe('compareStars', () => {
  it('handles first run with no previous snapshot', () => {
    const repos = [makeRepoData('repo-a', 10), makeRepoData('repo-b', 20)];

    const result = compareStars({ currentRepos: repos, previousSnapshot: null });

    expect(result.summary.totalStars).toBe(30);
    expect(result.summary.totalDelta).toBe(30);
    expect(result.summary.changed).toBe(true);
    expect(result.repos).toHaveLength(2);
    expect(result.repos[0].isNew).toBe(true);
    expect(result.repos[0].delta).toBe(0);
  });

  it('computes deltas against previous snapshot', () => {
    const repos = [makeRepoData('repo-a', 15), makeRepoData('repo-b', 18)];
    const previous: Snapshot = {
      timestamp: '2026-01-01T00:00:00Z',
      totalStars: 30,
      repos: [
        { fullName: 'user/repo-a', name: 'repo-a', owner: 'user', stars: 10 },
        { fullName: 'user/repo-b', name: 'repo-b', owner: 'user', stars: 20 },
      ],
    };

    const result = compareStars({ currentRepos: repos, previousSnapshot: previous });

    expect(result.summary.totalStars).toBe(33);
    expect(result.summary.totalPrevious).toBe(30);
    expect(result.summary.totalDelta).toBe(3);
    expect(result.summary.newStars).toBe(5);
    expect(result.summary.lostStars).toBe(2);
    expect(result.summary.changed).toBe(true);

    const repoA = result.repos.find((r) => r.name === 'repo-a');
    expect(repoA?.delta).toBe(5);

    const repoB = result.repos.find((r) => r.name === 'repo-b');
    expect(repoB?.delta).toBe(-2);
  });

  it('detects removed repositories', () => {
    const repos = [makeRepoData('repo-a', 10)];
    const previous: Snapshot = {
      timestamp: '2026-01-01T00:00:00Z',
      totalStars: 30,
      repos: [
        { fullName: 'user/repo-a', name: 'repo-a', owner: 'user', stars: 10 },
        { fullName: 'user/repo-b', name: 'repo-b', owner: 'user', stars: 20 },
      ],
    };

    const result = compareStars({ currentRepos: repos, previousSnapshot: previous });
    const removed = result.repos.find((r) => r.name === 'repo-b');

    expect(removed?.isRemoved).toBe(true);
    expect(removed?.current).toBe(0);
    expect(removed?.previous).toBe(20);
    expect(removed?.delta).toBe(-20);
  });

  it('detects newly added repositories', () => {
    const repos = [makeRepoData('repo-a', 10), makeRepoData('new-repo', 5)];
    const previous: Snapshot = {
      timestamp: '2026-01-01T00:00:00Z',
      totalStars: 10,
      repos: [{ fullName: 'user/repo-a', name: 'repo-a', owner: 'user', stars: 10 }],
    };

    const result = compareStars({ currentRepos: repos, previousSnapshot: previous });
    const newRepo = result.repos.find((r) => r.name === 'new-repo');

    expect(newRepo?.isNew).toBe(true);
    expect(newRepo?.delta).toBe(0);
    expect(result.summary.changed).toBe(true);
  });

  it('reports no changes when stars are identical', () => {
    const repos = [makeRepoData('repo-a', 10)];
    const previous: Snapshot = {
      timestamp: '2026-01-01T00:00:00Z',
      totalStars: 10,
      repos: [{ fullName: 'user/repo-a', name: 'repo-a', owner: 'user', stars: 10 }],
    };

    const result = compareStars({ currentRepos: repos, previousSnapshot: previous });
    expect(result.summary.changed).toBe(false);
    expect(result.summary.totalDelta).toBe(0);
  });
});

describe('createSnapshot', () => {
  it('creates a snapshot with timestamp and repo data', () => {
    const repos = [makeRepoData('repo-a', 10)];
    const summary = {
      totalStars: 10,
      totalPrevious: 0,
      totalDelta: 10,
      newStars: 0,
      lostStars: 0,
      changed: false,
    };

    const snapshot = createSnapshot({ currentRepos: repos, summary });

    expect(snapshot.timestamp).toBeDefined();
    expect(snapshot.totalStars).toBe(10);
    expect(snapshot.repos).toHaveLength(1);
    expect(snapshot.repos[0]).toEqual({
      fullName: 'user/repo-a',
      name: 'repo-a',
      owner: 'user',
      stars: 10,
    });
  });
});
