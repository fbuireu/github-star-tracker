import * as core from '@actions/core';
import type { Config } from '@config/types';
import { Visibility } from '@config/types';
import { makeConfig } from '@shared/tests';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchRepos } from './client';
import { getRepos, mapRepos } from './filters';
import type { GitHubRepo, Octokit } from './types';

vi.mock('@actions/core', () => ({
  info: vi.fn(),
  warning: vi.fn(),
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

const defaultConfig: Config = makeConfig({ includeCharts: false, notificationThreshold: 0 });

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
    const page1 = Array.from({ length: 100 }, (_, index) => makeRepo({ name: `repo${index}` }));
    const page2 = Array.from({ length: 50 }, (_, index) =>
      makeRepo({ name: `repo${index + 100}` }),
    );
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
      'Failed to fetch repositories from GitHub API: HTTP 401 API Error. Verify that your github-token has the correct permissions.',
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

  it('never throws a blank error description when the API error has no message', async () => {
    const mockOctokit: MockOctokit = {
      rest: {
        repos: {
          listForAuthenticatedUser: vi.fn().mockRejectedValue(new Error('')),
        },
      },
    };

    await expect(
      fetchRepos({ octokit: createMockOctokit(mockOctokit), config: defaultConfig }),
    ).rejects.toThrow(
      'Failed to fetch repositories from GitHub API: Error. Verify that your github-token has the correct permissions.',
    );
  });
});

describe('getRepos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function octokitReturning(repos: GitHubRepo[]): Octokit {
    return createMockOctokit({
      rest: { repos: { listForAuthenticatedUser: vi.fn().mockResolvedValue({ data: repos }) } },
    });
  }

  it('reports every pattern the tracked set could not read', async () => {
    await getRepos({
      octokit: octokitReturning([makeRepo({ name: 'keep-me' })]),
      config: makeConfig({ excludeRepos: ['/[unclosed/'] }),
    });

    expect(core.warning).toHaveBeenCalledWith(
      'Ignoring invalid pattern "/[unclosed/". Filters expect either an exact name or /pattern/flags.',
    );
  });

  it('logs the narrowing at each stage the filters actually ran', async () => {
    const repos = [
      makeRepo({ name: 'a', owner: { login: 'org-a' } }),
      makeRepo({ name: 'b', owner: { login: 'org-b' } }),
    ];

    await getRepos({
      octokit: octokitReturning(repos),
      config: makeConfig({ onlyOrgs: ['org-a'] }),
    });

    expect(core.info).toHaveBeenCalledWith('After only_orgs filter: 1 repos');
    expect(core.info).toHaveBeenCalledWith('After filtering: 1 repos');
    expect(core.info).not.toHaveBeenCalledWith(expect.stringContaining('only_repos'));
  });

  it('reports the only-repos count instead of the general one when it short-circuits', async () => {
    await getRepos({
      octokit: octokitReturning([makeRepo({ name: 'wanted' }), makeRepo({ name: 'other' })]),
      config: makeConfig({ onlyRepos: ['wanted'] }),
    });

    expect(core.info).toHaveBeenCalledWith('After only_repos filter: 1 repos');
    expect(core.info).not.toHaveBeenCalledWith(expect.stringContaining('After filtering'));
  });

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
