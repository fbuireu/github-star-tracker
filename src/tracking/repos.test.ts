import { describe, expect, it, vi } from 'vitest';

vi.mock('@actions/core', () => ({
  info: vi.fn(),
}));

import type { Config } from '../types';
import type { GitHubRepo } from './repos';
import { filterRepos, mapRepos } from './repos';

function makeRepo(overrides: Partial<GitHubRepo> = {}): GitHubRepo {
  return {
    name: 'test-repo',
    full_name: 'user/test-repo',
    owner: { login: 'user' },
    private: false,
    archived: false,
    fork: false,
    stargazers_count: 10,
    ...overrides,
  };
}

const defaultConfig: Config = {
  visibility: 'all',
  includeArchived: false,
  includeForks: false,
  excludeRepos: [],
  onlyRepos: [],
  minStars: 0,
  dataBranch: 'star-tracker-data',
  maxHistory: 52,
  sendOnNoChanges: false,
  includeCharts: false,
  locale: 'en',
};

describe('filterRepos', () => {
  it('returns all repos with default config', () => {
    const repos = [makeRepo(), makeRepo({ name: 'other' })];
    expect(filterRepos({ repos, config: defaultConfig })).toHaveLength(2);
  });

  it('filters out archived repos by default', () => {
    const repos = [makeRepo(), makeRepo({ name: 'archived', archived: true })];
    const result = filterRepos({ repos, config: defaultConfig });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('test-repo');
  });

  it('includes archived repos when configured', () => {
    const repos = [makeRepo(), makeRepo({ name: 'archived', archived: true })];
    const config = { ...defaultConfig, includeArchived: true };
    expect(filterRepos({ repos, config })).toHaveLength(2);
  });

  it('filters out forks by default', () => {
    const repos = [makeRepo(), makeRepo({ name: 'forked', fork: true })];
    expect(filterRepos({ repos, config: defaultConfig })).toHaveLength(1);
  });

  it('includes forks when configured', () => {
    const repos = [makeRepo(), makeRepo({ name: 'forked', fork: true })];
    const config = { ...defaultConfig, includeForks: true };
    expect(filterRepos({ repos, config })).toHaveLength(2);
  });

  it('excludes repos by name', () => {
    const repos = [makeRepo(), makeRepo({ name: 'excluded' })];
    const config = { ...defaultConfig, excludeRepos: ['excluded'] };
    expect(filterRepos({ repos, config })).toHaveLength(1);
  });

  it('filters by minimum stars', () => {
    const repos = [
      makeRepo({ stargazers_count: 5 }),
      makeRepo({ name: 'popular', stargazers_count: 50 }),
    ];
    const config = { ...defaultConfig, minStars: 10 };
    const result = filterRepos({ repos, config });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('popular');
  });

  it('only_repos overrides all other filters', () => {
    const repos = [
      makeRepo({ name: 'wanted', archived: true, fork: true }),
      makeRepo({ name: 'unwanted' }),
    ];
    const config = { ...defaultConfig, onlyRepos: ['wanted'] };
    const result = filterRepos({ repos, config });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('wanted');
  });

  it('returns empty array when no repos match only_repos', () => {
    const repos = [makeRepo()];
    const config = { ...defaultConfig, onlyRepos: ['nonexistent'] };
    expect(filterRepos({ repos, config })).toHaveLength(0);
  });
});

describe('mapRepos', () => {
  it('maps raw GitHub API repos to clean objects', () => {
    const repos = [makeRepo({ name: 'my-repo', stargazers_count: 42 })];
    const mapped = mapRepos(repos);

    expect(mapped).toEqual([
      {
        owner: 'user',
        name: 'my-repo',
        fullName: 'user/test-repo',
        private: false,
        archived: false,
        fork: false,
        stars: 42,
      },
    ]);
  });
});
