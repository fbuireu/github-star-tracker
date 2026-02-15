import * as core from '@actions/core';
import type { Config } from '@config/types';
import type { RepoInfo } from '@domain/types';
import { fetchRepos } from './client';
import type { GitHubRepo, Octokit } from './types';

const REGEX_PATTERN = /^\/(.+)\/([gimsuy]*)$/;

interface MatchesExcludePatternParams {
  name: string;
  patterns: string[];
}

function matchesExcludePattern({ name, patterns }: MatchesExcludePatternParams): boolean {
  return patterns.some((pattern) => {
    const match = REGEX_PATTERN.exec(pattern);
    if (match) {
      const regex = new RegExp(match[1], match[2]);
      return regex.test(name);
    }
    return name === pattern;
  });
}

interface FilterReposParams {
  repos: GitHubRepo[];
  config: Config;
}

export function filterRepos({ repos, config }: FilterReposParams): GitHubRepo[] {
  if (config.onlyRepos.length > 0) {
    const filtered = repos.filter((repo) => config.onlyRepos.includes(repo.name));
    core.info(`After only_repos filter: ${filtered.length} repos`);
    return filtered;
  }

  let filtered = repos;

  if (!config.includeArchived) {
    filtered = filtered.filter((repo) => !repo.archived);
  }

  if (!config.includeForks) {
    filtered = filtered.filter((repo) => !repo.fork);
  }

  if (config.excludeRepos.length > 0) {
    filtered = filtered.filter(
      (repo) => !matchesExcludePattern({ name: repo.name, patterns: config.excludeRepos }),
    );
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

interface GetReposParams {
  octokit: Octokit;
  config: Config;
}

export async function getRepos({ octokit, config }: GetReposParams): Promise<RepoInfo[]> {
  const allRepos = await fetchRepos({ octokit, config });
  const filtered = filterRepos({ repos: allRepos, config });
  return mapRepos(filtered);
}
