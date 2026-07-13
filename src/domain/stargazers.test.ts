import { makeStargazer } from '@test-utils';
import { describe, expect, it } from 'vitest';
import type { RepoStargazers, Stargazer, StargazerMap } from './stargazers';

const makeStar = (login: string, starredAt = '2026-01-15'): Stargazer =>
  makeStargazer({ login, starredAt });

import { buildStargazerMap, diffStargazers } from './stargazers';

describe('diffStargazers', () => {
  it('treats all as new when previous map is empty (first run)', () => {
    const current: RepoStargazers[] = [
      { repoFullName: 'user/repo-a', stargazers: [makeStar('alice'), makeStar('bob')] },
    ];
    const result = diffStargazers({ current, previousMap: {} });

    expect(result.totalNew).toBe(2);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].newStargazers.map((stargazer) => stargazer.login)).toEqual([
      'alice',
      'bob',
    ]);
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
        stargazers: [
          makeStar('alice', '2026-01-10'),
          makeStar('bob', '2026-01-20'),
          makeStar('charlie', '2026-01-15'),
        ],
      },
    ];
    const previousMap: StargazerMap = { 'user/repo-a': ['alice'] };
    const result = diffStargazers({ current, previousMap });

    expect(result.totalNew).toBe(2);
    expect(result.entries[0].newStargazers.map((stargazer) => stargazer.login)).toEqual([
      'bob',
      'charlie',
    ]);
  });

  it('sorts new stargazers by date descending', () => {
    const current: RepoStargazers[] = [
      {
        repoFullName: 'user/repo-a',
        stargazers: [
          makeStar('alice', '2026-01-01'),
          makeStar('bob', '2026-01-20'),
          makeStar('charlie', '2026-01-10'),
        ],
      },
    ];
    const result = diffStargazers({ current, previousMap: {} });

    expect(result.entries[0].newStargazers.map((stargazer) => stargazer.login)).toEqual([
      'bob',
      'charlie',
      'alice',
    ]);
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

  it('excludes sampled repos from the diff and reports them in sampledRepos', () => {
    const current: RepoStargazers[] = [
      { repoFullName: 'user/repo-a', stargazers: [makeStar('alice')] },
      { repoFullName: 'user/huge', stargazers: [makeStar('bob')], sampled: true },
    ];
    const result = diffStargazers({ current, previousMap: {} });

    expect(result.totalNew).toBe(1);
    expect(result.entries.map((entry) => entry.repoFullName)).toEqual(['user/repo-a']);
    expect(result.sampledRepos).toEqual(['user/huge']);
  });

  it('omits sampledRepos when no repo is sampled', () => {
    const current: RepoStargazers[] = [
      { repoFullName: 'user/repo-a', stargazers: [makeStar('alice')] },
    ];
    const result = diffStargazers({ current, previousMap: {} });

    expect(result.sampledRepos).toBeUndefined();
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

  it('skips sampled repos so partial lists do not corrupt the next diff', () => {
    const repoStargazers: RepoStargazers[] = [
      { repoFullName: 'user/repo-a', stargazers: [makeStar('alice')] },
      { repoFullName: 'user/huge', stargazers: [makeStar('bob')], sampled: true },
    ];
    const map = buildStargazerMap(repoStargazers);

    expect(map).toEqual({ 'user/repo-a': ['alice'] });
  });
});
