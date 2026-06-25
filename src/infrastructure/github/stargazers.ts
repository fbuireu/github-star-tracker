import * as core from '@actions/core';
import type { RepoStargazers, Stargazer } from '@domain/stargazers';
import type { RepoInfo } from '@domain/types';
import type { GitHubStargazerRow, Octokit } from './types';

const STARGAZERS_PER_PAGE = 100;
// GitHub caps stargazer pagination at 40,000 results; requesting a page beyond
// that returns a "pagination is limited for this resource" error and fails the
// whole fetch, so every page index must stay within the reachable window.
const MAX_REACHABLE_STARGAZERS = 40_000;
const MAX_REACHABLE_PAGE = Math.floor(MAX_REACHABLE_STARGAZERS / STARGAZERS_PER_PAGE);

interface FetchAllStargazersParams {
  octokit: Octokit;
  repos: RepoInfo[];
  smartSampling: boolean;
  smartSamplingThreshold: number;
  smartSamplingPages: number;
}

export async function fetchAllStargazers({
  octokit,
  repos,
  smartSampling,
  smartSamplingThreshold,
  smartSamplingPages,
}: FetchAllStargazersParams): Promise<RepoStargazers[]> {
  const results: RepoStargazers[] = [];
  const sampled: string[] = [];

  for (const repo of repos) {
    const shouldSample = smartSampling && repo.stars > smartSamplingThreshold;

    try {
      const stargazers = shouldSample
        ? await fetchSampledStargazers({
            octokit,
            owner: repo.owner,
            name: repo.name,
            totalStars: repo.stars,
            maxPages: smartSamplingPages,
          })
        : await fetchRepoStargazers({ octokit, owner: repo.owner, name: repo.name });

      results.push({ repoFullName: repo.fullName, stargazers, sampled: shouldSample });

      if (shouldSample) sampled.push(repo.fullName);
    } catch (error) {
      core.warning(`Failed to fetch stargazers for ${repo.fullName}: ${(error as Error).message}`);

      results.push({ repoFullName: repo.fullName, stargazers: [], sampled: shouldSample });
    }
  }

  if (sampled.length > 0) {
    core.info(`Smart sampling applied to ${sampled.length} repo(s): ${sampled.join(', ')}`);
  }

  return results;
}

interface FetchStargazerPageParams {
  octokit: Octokit;
  owner: string;
  name: string;
  page: number;
}

async function fetchStargazerPage({
  octokit,
  owner,
  name,
  page,
}: FetchStargazerPageParams): Promise<Stargazer[]> {
  const { data } = await octokit.request('GET /repos/{owner}/{repo}/stargazers', {
    owner,
    repo: name,
    per_page: STARGAZERS_PER_PAGE,
    page,
    headers: {
      accept: 'application/vnd.github.star+json',
    },
  });
  const items = data as GitHubStargazerRow[];

  return items.map((item) => ({
    login: item.user.login,
    avatarUrl: item.user.avatar_url,
    profileUrl: item.user.html_url,
    starredAt: item.starred_at,
  }));
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
    const items = await fetchStargazerPage({ octokit, owner, name, page });
    itemCount = items.length;
    stargazers.push(...items);
    page++;
  } while (itemCount >= STARGAZERS_PER_PAGE && page <= MAX_REACHABLE_PAGE);

  return stargazers;
}

interface FetchSampledStargazersParams {
  octokit: Octokit;
  owner: string;
  name: string;
  totalStars: number;
  maxPages: number;
}

interface SelectSampledPagesParams {
  totalPages: number;
  maxPages: number;
}

function selectSampledPages({ totalPages, maxPages }: SelectSampledPagesParams): number[] {
  const pages = Math.max(1, maxPages);
  if (totalPages <= pages) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (pages === 1) return [1];

  const selected = new Set<number>();
  for (let i = 0; i < pages; i++) {
    selected.add(1 + Math.round((i * (totalPages - 1)) / (pages - 1)));
  }

  return [...selected].sort((a, b) => a - b);
}

async function fetchSampledStargazers({
  octokit,
  owner,
  name,
  totalStars,
  maxPages,
}: FetchSampledStargazersParams): Promise<Stargazer[]> {
  const totalPages = Math.min(
    MAX_REACHABLE_PAGE,
    Math.max(1, Math.ceil(totalStars / STARGAZERS_PER_PAGE)),
  );
  const pages = selectSampledPages({ totalPages, maxPages });
  const stargazers: Stargazer[] = [];

  for (const page of pages) {
    const items = await fetchStargazerPage({ octokit, owner, name, page });
    stargazers.push(...items);
  }

  return stargazers;
}
