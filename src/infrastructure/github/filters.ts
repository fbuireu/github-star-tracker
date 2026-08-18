import * as core from '@actions/core';
import type { Config } from '@config/types';
import { resolveTrackedSet } from '@domain/tracked-set';
import type { RepoInfo } from '@domain/types';
import { fetchRepos } from './client';
import type { GitHubRepo, Octokit } from './types';

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

interface GetReposParams {
  octokit: Octokit;
  config: Config;
}

export async function getRepos({ octokit, config }: GetReposParams): Promise<RepoInfo[]> {
  const fetched = await fetchRepos({ octokit, config });
  const trackedSet = resolveTrackedSet({ repos: mapRepos(fetched), filters: config });

  for (const pattern of trackedSet.invalidPatterns) {
    core.warning(
      `Ignoring invalid pattern "${pattern}". Filters expect either an exact name or /pattern/flags.`,
    );
  }

  if (trackedSet.afterOnlyOrgs !== null) {
    core.info(`After only_orgs filter: ${trackedSet.afterOnlyOrgs} repos`);
  }

  if (trackedSet.afterOnlyRepos !== null) {
    core.info(`After only_repos filter: ${trackedSet.afterOnlyRepos} repos`);

    return trackedSet.repos;
  }

  core.info(`After filtering: ${trackedSet.repos.length} repos`);

  return trackedSet.repos;
}
