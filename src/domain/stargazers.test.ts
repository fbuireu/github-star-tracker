import { describe, expect, it } from 'vitest';
import type { RepoStargazers, Stargazer, StargazerMap } from './stargazers';
import { buildStargazerMap, diffStargazers } from './stargazers';

function makeStar(login: string, date = '2026-01-15'): Stargazer {
  return {
    login,
    avatarUrl: `https://avatars.githubusercontent.com/u/${login}`,
    profileUrl: `https://github.com/${login}`,
    starredAt: date,
  };
}

describe('diffStargazers', () => {
  it('treats all as new when previous map is empty (first run)', () => {
    const current: RepoStargazers[] = [
      { repoFullName: 'user/repo-a', stargazers: [makeStar('alice'), makeStar('bob')] },
    ];

    const result = diffStargazers({ current, previousMap: {} });

    expect(result.totalNew).toBe(2);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].newStargazers.map((s) => s.login)).toEqual(['alice', 'bob']);
  });

  it('returns empty when no changes', () => {
    const current: RepoStargazers[] = [
      { repoFullName: 'user/repo-a', stargazers: [makeStar('alice'), makeStar('bob')] },
    ];
    const previousMap: StargazerMap = { 'user/repo-a': ['alice', 'bob'] };

    const result = diffStargazers({ current, previousMap });

    expect(result.totalNew).toBe(0);
    expect(result.entries).toHaveLength(0);
  });

  it('detects partial overlap correctly', () => {
    const current: RepoStargazers[] = [
      {
        repoFullName: 'user/repo-a',
        stargazers: [makeStar('alice'), makeStar('bob'), makeStar('charlie')],
      },
    ];
    const previousMap: StargazerMap = { 'user/repo-a': ['alice'] };

    const result = diffStargazers({ current, previousMap });

    expect(result.totalNew).toBe(2);
    expect(result.entries[0].newStargazers.map((s) => s.login)).toEqual(['bob', 'charlie']);
  });

  it('handles newly added repo', () => {
    const current: RepoStargazers[] = [
      { repoFullName: 'user/new-repo', stargazers: [makeStar('alice')] },
    ];
    const previousMap: StargazerMap = { 'user/old-repo': ['bob'] };

    const result = diffStargazers({ current, previousMap });

    expect(result.totalNew).toBe(1);
    expect(result.entries[0].repoFullName).toBe('user/new-repo');
  });

  it('handles multiple repos with mixed changes', () => {
    const current: RepoStargazers[] = [
      { repoFullName: 'user/repo-a', stargazers: [makeStar('alice'), makeStar('bob')] },
      { repoFullName: 'user/repo-b', stargazers: [makeStar('charlie')] },
    ];
    const previousMap: StargazerMap = {
      'user/repo-a': ['alice', 'bob'],
      'user/repo-b': [],
    };

    const result = diffStargazers({ current, previousMap });

    expect(result.totalNew).toBe(1);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].repoFullName).toBe('user/repo-b');
  });
});

describe('buildStargazerMap', () => {
  it('builds map from repo stargazers', () => {
    const repoStargazers: RepoStargazers[] = [
      { repoFullName: 'user/repo-a', stargazers: [makeStar('alice'), makeStar('bob')] },
      { repoFullName: 'user/repo-b', stargazers: [makeStar('charlie')] },
    ];

    const map = buildStargazerMap(repoStargazers);

    expect(map).toEqual({
      'user/repo-a': ['alice', 'bob'],
      'user/repo-b': ['charlie'],
    });
  });

  it('returns empty map for empty input', () => {
    const map = buildStargazerMap([]);
    expect(map).toEqual({});
  });
});
