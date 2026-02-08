import * as core from '@actions/core';
import type { GitHub } from '@actions/github/lib/utils';
import type { Config, RepoInfo } from './types';

type Octokit = InstanceType<typeof GitHub>;

export interface GitHubRepo {
  name: string;
  full_name: string;
  owner: { login: string };
  private: boolean;
  archived: boolean;
  fork: boolean;
  stargazers_count: number;
}

export async function fetchRepos({
  octokit,
  config,
}: {
  octokit: Octokit;
  config: Config;
}): Promise<GitHubRepo[]> {
  const repos: GitHubRepo[] = [];
  let page = 1;

  const params: Record<string, unknown> = { per_page: 100, sort: 'full_name' };
  params.visibility =
    config.visibility === 'public' || config.visibility === 'private' ? config.visibility : 'all';

  try {
    while (true) {
      const { data } = await octokit.rest.repos.listForAuthenticatedUser({
        ...params,
        page,
      } as Parameters<Octokit['rest']['repos']['listForAuthenticatedUser']>[0]);

      if (data.length === 0) break;
      repos.push(...(data as unknown as GitHubRepo[]));
      if (data.length < 100) break;
      page++;
    }
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

export function filterRepos({
  repos,
  config,
}: {
  repos: GitHubRepo[];
  config: Config;
}): GitHubRepo[] {
  let filtered = repos;

  if (config.onlyRepos.length > 0) {
    filtered = filtered.filter((repo) => config.onlyRepos.includes(repo.name));
    core.info(`After only_repos filter: ${filtered.length} repos`);
    return filtered;
  }

  if (!config.includeArchived) {
    filtered = filtered.filter((repo) => !repo.archived);
  }

  if (!config.includeForks) {
    filtered = filtered.filter((repo) => !repo.fork);
  }

  if (config.excludeRepos.length > 0) {
    filtered = filtered.filter((repo) => !config.excludeRepos.includes(repo.name));
  }

  if (config.minStars > 0) {
    filtered = filtered.filter((repo) => repo.stargazers_count >= config.minStars);
  }

  core.info(`After filtering: ${filtered.length} repos`);
  return filtered;
}

export function mapRepos(repos: GitHubRepo[]): RepoInfo[] {
  return repos.map((repo) => ({
    owner: repo.owner.login,
    name: repo.name,
    fullName: repo.full_name,
    private: repo.private,
    archived: repo.archived,
    fork: repo.fork,
    stars: repo.stargazers_count,
  }));
}

export async function getRepos({
  octokit,
  config,
}: {
  octokit: Octokit;
  config: Config;
}): Promise<RepoInfo[]> {
  const allRepos = await fetchRepos({ octokit, config });
  const filtered = filterRepos({ repos: allRepos, config });
  return mapRepos(filtered);
}
