import * as core from '@actions/core';
import { makeRepoInfo } from '@shared/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAllStargazers } from './stargazers';
import type { Octokit } from './types';

vi.mock('@actions/core', () => ({
  warning: vi.fn(),
  info: vi.fn(),
}));

const samplingOff = {
  smartSampling: false,
  smartSamplingThreshold: 1500,
  smartSamplingPages: 30,
};

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
      octokit: octokit as unknown as Octokit,
      repos: [makeRepoInfo('repo-a')],
      ...samplingOff,
    });

    expect(result).toHaveLength(1);
    expect(result[0].repoFullName).toBe('user/repo-a');
    expect(result[0].stargazers).toHaveLength(2);
    expect(result[0].stargazers[0].login).toBe('alice');
    expect(result[0].sampled).toBe(false);
  });

  it('handles pagination', async () => {
    const page1 = Array.from({ length: 100 }, (_, index) => makeStargazerResponse(`user-${index}`));
    const page2 = [makeStargazerResponse('last-user')];
    const octokit = {
      request: vi
        .fn()
        .mockResolvedValueOnce({ data: page1 })
        .mockResolvedValueOnce({ data: page2 }),
    };
    const result = await fetchAllStargazers({
      octokit: octokit as unknown as Octokit,
      repos: [makeRepoInfo('repo-a')],
      ...samplingOff,
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
      octokit: octokit as unknown as Octokit,
      repos: [makeRepoInfo('repo-a'), makeRepoInfo('repo-b')],
      ...samplingOff,
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
      octokit: octokit as unknown as Octokit,
      repos: [makeRepoInfo('repo-a')],
      ...samplingOff,
    });

    expect(result[0].stargazers).toHaveLength(0);
  });

  it('warns when a starred repo returns an empty stargazers list', async () => {
    const octokit = {
      request: vi.fn().mockResolvedValue({ data: [] }),
    };

    await fetchAllStargazers({
      octokit: octokit as unknown as Octokit,
      repos: [makeRepoInfo('restricted', 54000)],
      ...samplingOff,
    });

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('Stargazers for user/restricted came back empty'),
    );
  });

  it('does not warn about an empty stargazers list for a zero-star repo', async () => {
    const octokit = {
      request: vi.fn().mockResolvedValue({ data: [] }),
    };

    await fetchAllStargazers({
      octokit: octokit as unknown as Octokit,
      repos: [makeRepoInfo('empty', 0)],
      ...samplingOff,
    });

    expect(core.warning).not.toHaveBeenCalled();
  });

  it('samples evenly-spaced pages when stars exceed the threshold', async () => {
    const octokit = {
      request: vi.fn().mockResolvedValue({ data: [makeStargazerResponse('alice')] }),
    };

    const result = await fetchAllStargazers({
      octokit: octokit as unknown as Octokit,
      repos: [makeRepoInfo('huge', 5000)],
      smartSampling: true,
      smartSamplingThreshold: 1500,
      smartSamplingPages: 5,
    });

    expect(octokit.request).toHaveBeenCalledTimes(5);
    const pages = octokit.request.mock.calls.map((call) => call[1].page);
    expect(pages[0]).toBe(1);
    expect(pages.at(-1)).toBe(50);
    expect(result[0].sampled).toBe(true);
    expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Smart sampling applied'));
  });

  it('fetches all pages normally when stars are at or below the threshold', async () => {
    const octokit = {
      request: vi.fn().mockResolvedValue({ data: [makeStargazerResponse('alice')] }),
    };

    const result = await fetchAllStargazers({
      octokit: octokit as unknown as Octokit,
      repos: [makeRepoInfo('mid', 1000)],
      smartSampling: true,
      smartSamplingThreshold: 1500,
      smartSamplingPages: 5,
    });

    expect(octokit.request).toHaveBeenCalledTimes(1);
    expect(result[0].sampled).toBe(false);
  });

  it('does not sample when smart sampling is disabled even above the threshold', async () => {
    const octokit = {
      request: vi.fn().mockResolvedValue({ data: [] }),
    };

    const result = await fetchAllStargazers({
      octokit: octokit as unknown as Octokit,
      repos: [makeRepoInfo('huge', 50000)],
      ...samplingOff,
    });

    expect(result[0].sampled).toBe(false);
  });

  it('falls back to fetching all pages when total pages do not exceed maxPages', async () => {
    const octokit = {
      request: vi.fn().mockResolvedValue({ data: [makeStargazerResponse('alice')] }),
    };

    const result = await fetchAllStargazers({
      octokit: octokit as unknown as Octokit,
      repos: [makeRepoInfo('huge', 2000)],
      smartSampling: true,
      smartSamplingThreshold: 100,
      smartSamplingPages: 50,
    });

    expect(octokit.request).toHaveBeenCalledTimes(20);
    expect(result[0].sampled).toBe(true);
  });

  it('never samples a page beyond the 40,000-star reachable window', async () => {
    const octokit = {
      request: vi.fn().mockResolvedValue({ data: [makeStargazerResponse('alice')] }),
    };

    await fetchAllStargazers({
      octokit: octokit as unknown as Octokit,
      repos: [makeRepoInfo('massive', 50000)],
      smartSampling: true,
      smartSamplingThreshold: 1500,
      smartSamplingPages: 30,
    });

    const pages = octokit.request.mock.calls.map((call) => call[1].page);
    expect(Math.max(...pages)).toBeLessThanOrEqual(400);
  });

  it('stops the full fetch at the reachable page cap for repos above 40,000 stars', async () => {
    const octokit = {
      request: vi.fn().mockResolvedValue({
        data: Array.from({ length: 100 }, (_, index) => makeStargazerResponse(`user-${index}`)),
      }),
    };

    const result = await fetchAllStargazers({
      octokit: octokit as unknown as Octokit,
      repos: [makeRepoInfo('massive', 50000)],
      ...samplingOff,
    });

    expect(octokit.request).toHaveBeenCalledTimes(400);
    const pages = octokit.request.mock.calls.map((call) => call[1].page);
    expect(Math.max(...pages)).toBe(400);
    expect(result[0].sampled).toBe(false);
    expect(core.warning).not.toHaveBeenCalled();
  });

  it('fetches only the first page when maxPages is 1', async () => {
    const octokit = {
      request: vi.fn().mockResolvedValue({ data: [makeStargazerResponse('alice')] }),
    };

    await fetchAllStargazers({
      octokit: octokit as unknown as Octokit,
      repos: [makeRepoInfo('huge', 5000)],
      smartSampling: true,
      smartSamplingThreshold: 1500,
      smartSamplingPages: 1,
    });

    expect(octokit.request).toHaveBeenCalledTimes(1);
    expect(octokit.request.mock.calls[0][1].page).toBe(1);
  });
});
