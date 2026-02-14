import * as core from '@actions/core';
import type { RepoStargazers, Stargazer } from '@domain/stargazers';
import type { RepoInfo } from '@domain/types';
import type { Octokit } from './types';

const STARGAZERS_PER_PAGE = 100;

interface FetchAllStargazersParams {
  octokit: Octokit;
  repos: RepoInfo[];
}

export async function fetchAllStargazers({
  octokit,
  repos,
}: FetchAllStargazersParams): Promise<RepoStargazers[]> {
  const results: RepoStargazers[] = [];

  for (const repo of repos) {
    try {
      const stargazers = await fetchRepoStargazers({ octokit, owner: repo.owner, name: repo.name });
      results.push({ repoFullName: repo.fullName, stargazers });
    } catch (error) {
      core.warning(`Failed to fetch stargazers for ${repo.fullName}: ${(error as Error).message}`);
      results.push({ repoFullName: repo.fullName, stargazers: [] });
    }
  }

  return results;
}

interface FetchRepoStargazersParams {
  octokit: Octokit;
  owner: string;
  name: string;
}

async function fetchRepoStargazers({
  octokit,
  owner,
  name,
}: FetchRepoStargazersParams): Promise<Stargazer[]> {
  const stargazers: Stargazer[] = [];
  let page = 1;
  let itemCount: number;

  do {
    const { data } = await octokit.request('GET /repos/{owner}/{repo}/stargazers', {
      owner,
      repo: name,
      per_page: STARGAZERS_PER_PAGE,
      page,
      headers: {
        accept: 'application/vnd.github.star+json',
      },
    });

    const items = data as Array<{
      user: { login: string; avatar_url: string; html_url: string };
      starred_at: string;
    }>;
    itemCount = items.length;

    for (const item of items) {
      stargazers.push({
        login: item.user.login,
        avatarUrl: item.user.avatar_url,
        profileUrl: item.user.html_url,
        starredAt: item.starred_at,
      });
    }

    page++;
  } while (itemCount >= STARGAZERS_PER_PAGE);

  return stargazers;
}
