import * as core from '@actions/core';
import type { RepoInfo } from '@domain/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAllStargazers } from './stargazers';

vi.mock('@actions/core', () => ({
  warning: vi.fn(),
}));

function makeRepo(name: string): RepoInfo {
  return {
    owner: 'user',
    name,
    fullName: `user/${name}`,
    private: false,
    archived: false,
    fork: false,
    stars: 10,
  };
}

function makeStargazerResponse(login: string, date = '2026-01-15T00:00:00Z') {
  return {
    user: {
      login,
      avatar_url: `https://avatars.githubusercontent.com/u/${login}`,
      html_url: `https://github.com/${login}`,
    },
    starred_at: date,
  };
}

describe('fetchAllStargazers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches stargazers for a single repo', async () => {
    const octokit = {
      request: vi.fn().mockResolvedValue({
        data: [makeStargazerResponse('alice'), makeStargazerResponse('bob')],
      }),
    };

    const result = await fetchAllStargazers({
      octokit: octokit as any,
      repos: [makeRepo('repo-a')],
    });

    expect(result).toHaveLength(1);
    expect(result[0].repoFullName).toBe('user/repo-a');
    expect(result[0].stargazers).toHaveLength(2);
    expect(result[0].stargazers[0].login).toBe('alice');
  });

  it('handles pagination', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => makeStargazerResponse(`user-${i}`));
    const page2 = [makeStargazerResponse('last-user')];

    const octokit = {
      request: vi
        .fn()
        .mockResolvedValueOnce({ data: page1 })
        .mockResolvedValueOnce({ data: page2 }),
    };

    const result = await fetchAllStargazers({
      octokit: octokit as any,
      repos: [makeRepo('repo-a')],
    });

    expect(result[0].stargazers).toHaveLength(101);
    expect(octokit.request).toHaveBeenCalledTimes(2);
  });

  it('handles per-repo errors gracefully', async () => {
    const octokit = {
      request: vi
        .fn()
        .mockRejectedValueOnce(new Error('rate limited'))
        .mockResolvedValueOnce({ data: [makeStargazerResponse('alice')] }),
    };

    const result = await fetchAllStargazers({
      octokit: octokit as any,
      repos: [makeRepo('repo-a'), makeRepo('repo-b')],
    });

    expect(result).toHaveLength(2);
    expect(result[0].stargazers).toHaveLength(0);
    expect(result[1].stargazers).toHaveLength(1);
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('Failed to fetch stargazers for user/repo-a'),
    );
  });

  it('returns empty stargazers list for repos with no stargazers', async () => {
    const octokit = {
      request: vi.fn().mockResolvedValue({ data: [] }),
    };

    const result = await fetchAllStargazers({
      octokit: octokit as any,
      repos: [makeRepo('repo-a')],
    });

    expect(result[0].stargazers).toHaveLength(0);
  });
});
