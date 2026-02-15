import * as core from '@actions/core';
import { VISIBILITY_CONFIG } from '@config/defaults';
import type { Config } from '@config/types';
import type { GitHubRepo, Octokit } from './types';

const REPOS_PER_PAGE = 100;

interface FetchReposParams {
  octokit: Octokit;
  config: Config;
}

export async function fetchRepos({ octokit, config }: FetchReposParams): Promise<GitHubRepo[]> {
  const repos: GitHubRepo[] = [];
  let page = 1;

  const params: Record<string, unknown> = {
    per_page: REPOS_PER_PAGE,
    sort: 'full_name',
    ...VISIBILITY_CONFIG[config.visibility],
  };

  try {
    let dataLength: number;

    do {
      const { data } = await octokit.rest.repos.listForAuthenticatedUser({
        ...params,
        page,
      });

      dataLength = data.length;
      if (dataLength === 0) break;
      repos.push(...data);
      page++;
    } while (dataLength >= REPOS_PER_PAGE);
  } catch (error) {
    const err = error as Error & { status?: number };
    const status = err.status ? ` (HTTP ${err.status})` : '';
    throw new Error(
      `Failed to fetch repositories from GitHub API${status}: ${err.message}. ` +
        'Verify that your github-token has the correct permissions.',
    );
  }

  core.info(`Fetched ${repos.length} repositories from GitHub`);
  return repos;
}
