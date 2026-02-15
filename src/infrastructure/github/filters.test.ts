import type { Config } from '@config/types';
import { Visibility } from '@config/types';
import { describe, expect, it, vi } from 'vitest';
import { fetchRepos } from './client';
import { filterRepos, getRepos, mapRepos } from './filters';
import type { GitHubRepo, Octokit } from './types';

vi.mock('@actions/core', () => ({
  info: vi.fn(),
}));

interface MockOctokit {
  rest: {
    repos: {
      listForAuthenticatedUser: ReturnType<typeof vi.fn>;
    };
  };
}

function createMockOctokit(mock: MockOctokit): Octokit {
  return mock as unknown as Octokit;
}

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
  visibility: Visibility.ALL,
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
  notificationThreshold: 0,
  trackStargazers: false,
  topRepos: 10,
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

  it('excludes repos by regex pattern', () => {
    const repos = [
      makeRepo({ name: 'my-app' }),
      makeRepo({ name: 'test-utils' }),
      makeRepo({ name: 'test-helpers' }),
    ];
    const config = { ...defaultConfig, excludeRepos: ['/^test-/'] };
    const result = filterRepos({ repos, config });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('my-app');
  });

  it('supports mixed exact names and regex patterns in exclude', () => {
    const repos = [
      makeRepo({ name: 'keep-me' }),
      makeRepo({ name: 'drop-this' }),
      makeRepo({ name: 'experiment-1' }),
      makeRepo({ name: 'experiment-2' }),
    ];
    const config = { ...defaultConfig, excludeRepos: ['drop-this', '/^experiment-/'] };
    const result = filterRepos({ repos, config });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('keep-me');
  });

  it('supports regex flags in exclude pattern', () => {
    const repos = [
      makeRepo({ name: 'MyProject' }),
      makeRepo({ name: 'mylib' }),
      makeRepo({ name: 'other' }),
    ];
    const config = { ...defaultConfig, excludeRepos: ['/^my/i'] };
    const result = filterRepos({ repos, config });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('other');
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

describe('fetchRepos', () => {
  it('fetches all repositories from GitHub API', async () => {
    const mockRepos = [makeRepo({ name: 'repo1' }), makeRepo({ name: 'repo2' })];
    const mockOctokit: MockOctokit = {
      rest: {
        repos: {
          listForAuthenticatedUser: vi.fn().mockResolvedValue({
            data: mockRepos,
          }),
        },
      },
    };

    const result = await fetchRepos({
      octokit: createMockOctokit(mockOctokit),
      config: defaultConfig,
    });

    expect(result).toEqual(mockRepos);
    expect(mockOctokit.rest.repos.listForAuthenticatedUser).toHaveBeenCalledWith({
      per_page: 100,
      sort: 'full_name',
      visibility: Visibility.ALL,
      page: 1,
    });
  });

  it('handles pagination correctly', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => makeRepo({ name: `repo${i}` }));
    const page2 = Array.from({ length: 50 }, (_, i) => makeRepo({ name: `repo${i + 100}` }));

    const mockOctokit: MockOctokit = {
      rest: {
        repos: {
          listForAuthenticatedUser: vi
            .fn()
            .mockResolvedValueOnce({ data: page1 })
            .mockResolvedValueOnce({ data: page2 }),
        },
      },
    };

    const result = await fetchRepos({
      octokit: createMockOctokit(mockOctokit),
      config: defaultConfig,
    });

    expect(result).toHaveLength(150);
    expect(mockOctokit.rest.repos.listForAuthenticatedUser).toHaveBeenCalledTimes(2);
  });

  it('stops pagination when empty page is returned', async () => {
    const mockOctokit: MockOctokit = {
      rest: {
        repos: {
          listForAuthenticatedUser: vi.fn().mockResolvedValue({ data: [] }),
        },
      },
    };

    const result = await fetchRepos({
      octokit: createMockOctokit(mockOctokit),
      config: defaultConfig,
    });

    expect(result).toEqual([]);
    expect(mockOctokit.rest.repos.listForAuthenticatedUser).toHaveBeenCalledTimes(1);
  });

  it('uses public visibility when configured', async () => {
    const mockOctokit: MockOctokit = {
      rest: {
        repos: {
          listForAuthenticatedUser: vi.fn().mockResolvedValue({ data: [] }),
        },
      },
    };

    const config = { ...defaultConfig, visibility: Visibility.PUBLIC };
    await fetchRepos({ octokit: createMockOctokit(mockOctokit), config });

    expect(mockOctokit.rest.repos.listForAuthenticatedUser).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: Visibility.PUBLIC }),
    );
  });

  it('uses private visibility when configured', async () => {
    const mockOctokit: MockOctokit = {
      rest: {
        repos: {
          listForAuthenticatedUser: vi.fn().mockResolvedValue({ data: [] }),
        },
      },
    };

    const config = { ...defaultConfig, visibility: Visibility.PRIVATE };
    await fetchRepos({ octokit: createMockOctokit(mockOctokit), config });

    expect(mockOctokit.rest.repos.listForAuthenticatedUser).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: Visibility.PRIVATE }),
    );
  });

  it('uses owner affiliation when visibility is owned', async () => {
    const mockOctokit: MockOctokit = {
      rest: {
        repos: {
          listForAuthenticatedUser: vi.fn().mockResolvedValue({ data: [] }),
        },
      },
    };

    const config = { ...defaultConfig, visibility: Visibility.OWNED };
    await fetchRepos({ octokit: createMockOctokit(mockOctokit), config });

    expect(mockOctokit.rest.repos.listForAuthenticatedUser).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: Visibility.ALL, affiliation: 'owner' }),
    );
  });

  it('throws error with status code when API call fails', async () => {
    const mockError = Object.assign(new Error('API Error'), { status: 401 });

    const mockOctokit: MockOctokit = {
      rest: {
        repos: {
          listForAuthenticatedUser: vi.fn().mockRejectedValue(mockError),
        },
      },
    };

    await expect(
      fetchRepos({ octokit: createMockOctokit(mockOctokit), config: defaultConfig }),
    ).rejects.toThrow(
      'Failed to fetch repositories from GitHub API (HTTP 401): API Error. Verify that your github-token has the correct permissions.',
    );
  });

  it('throws error without status code when API call fails', async () => {
    const mockError = new Error('Network Error');

    const mockOctokit: MockOctokit = {
      rest: {
        repos: {
          listForAuthenticatedUser: vi.fn().mockRejectedValue(mockError),
        },
      },
    };

    await expect(
      fetchRepos({ octokit: createMockOctokit(mockOctokit), config: defaultConfig }),
    ).rejects.toThrow(
      'Failed to fetch repositories from GitHub API: Network Error. Verify that your github-token has the correct permissions.',
    );
  });
});

describe('getRepos', () => {
  it('fetches, filters, and maps repos', async () => {
    const mockRepos = [
      makeRepo({ name: 'repo1', stargazers_count: 10 }),
      makeRepo({ name: 'repo2', archived: true }),
    ];

    const mockOctokit: MockOctokit = {
      rest: {
        repos: {
          listForAuthenticatedUser: vi.fn().mockResolvedValue({
            data: mockRepos,
          }),
        },
      },
    };

    const result = await getRepos({
      octokit: createMockOctokit(mockOctokit),
      config: defaultConfig,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      owner: 'user',
      name: 'repo1',
      fullName: 'user/test-repo',
      private: false,
      archived: false,
      fork: false,
      stars: 10,
    });
  });
});
