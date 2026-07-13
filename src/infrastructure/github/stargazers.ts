import * as core from '@actions/core';
import { MAX_REACHABLE_STARGAZERS } from '@domain/constants';
import type { RepoStargazers, Stargazer } from '@domain/stargazers';
import type { RepoInfo } from '@domain/types';
import { describeFetchError } from './errors';
import type { GitHubStargazerRow, Octokit } from './types';

const STARGAZERS_PER_PAGE = 100;
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
      const { stargazers, coveredStars } = shouldSample
        ? await fetchSampledStargazers({
            octokit,
            owner: repo.owner,
            name: repo.name,
            totalStars: repo.stars,
            maxPages: smartSamplingPages,
          })
        : await fetchRepoStargazers({ octokit, owner: repo.owner, name: repo.name });

      warnWhenHistoryIsUnreconstructable(repo, stargazers);

      results.push({
        repoFullName: repo.fullName,
        stargazers,
        sampled: shouldSample,
        coveredStars,
      });

      if (shouldSample) sampled.push(repo.fullName);
    } catch (error) {
      core.warning(`Failed to fetch stargazers for ${repo.fullName}: ${describeFetchError(error)}`);

      results.push({ repoFullName: repo.fullName, stargazers: [], sampled: shouldSample });
    }
  }

  if (sampled.length > 0) {
    core.info(`Smart sampling applied to ${sampled.length} repo(s): ${sampled.join(', ')}`);
  }

  return results;
}

function warnWhenHistoryIsUnreconstructable(repo: RepoInfo, stargazers: Stargazer[]): void {
  if (repo.stars === 0) return;

  if (stargazers.length === 0) {
    core.warning(
      `Stargazers for ${repo.fullName} came back empty even though it has ${repo.stars} stars, so its star history cannot be reconstructed. This can happen if the token's user isn't an admin or collaborator on the repo, or from a transient GitHub API error; see the Troubleshooting guide.`,
    );
    return;
  }

  if (stargazers.some((stargazer) => Number.isFinite(Date.parse(stargazer.starredAt)))) return;

  core.warning(
    `Stargazers for ${repo.fullName} came back without usable starred_at dates, so its star history cannot be reconstructed.`,
  );
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

  return items.map((row) => ({
    login: row.user.login,
    avatarUrl: row.user.avatar_url,
    profileUrl: row.user.html_url,
    starredAt: row.starred_at,
  }));
}

interface FetchRepoStargazersParams {
  octokit: Octokit;
  owner: string;
  name: string;
}

interface StargazerFetchResult {
  stargazers: Stargazer[];
  coveredStars?: number;
}

async function fetchRepoStargazers({
  octokit,
  owner,
  name,
}: FetchRepoStargazersParams): Promise<StargazerFetchResult> {
  const stargazers: Stargazer[] = [];

  for (let page = 1; page <= MAX_REACHABLE_PAGE; page++) {
    let items: Stargazer[];
    try {
      items = await fetchStargazerPage({ octokit, owner, name, page });
    } catch (error) {
      if (stargazers.length === 0) throw error;

      core.warning(
        `Stopped fetching stargazers for ${owner}/${name} at page ${page} (${describeFetchError(error)}); keeping the ${stargazers.length} fetched so far`,
      );

      return { stargazers, coveredStars: stargazers.length };
    }

    stargazers.push(...items);
    if (items.length < STARGAZERS_PER_PAGE) break;
  }

  return { stargazers };
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
    return Array.from({ length: totalPages }, (_, pageIndex) => pageIndex + 1);
  }
  if (pages === 1) return [1];

  const selected = new Set<number>();
  for (let pageIndex = 0; pageIndex < pages; pageIndex++) {
    selected.add(1 + Math.round((pageIndex * (totalPages - 1)) / (pages - 1)));
  }

  return [...selected].sort((earlierPage, laterPage) => earlierPage - laterPage);
}

async function fetchSampledStargazers({
  octokit,
  owner,
  name,
  totalStars,
  maxPages,
}: FetchSampledStargazersParams): Promise<StargazerFetchResult> {
  const totalPages = Math.min(
    MAX_REACHABLE_PAGE,
    Math.max(1, Math.ceil(totalStars / STARGAZERS_PER_PAGE)),
  );
  const pages = selectSampledPages({ totalPages, maxPages });
  const stargazers: Stargazer[] = [];
  const failedPages: number[] = [];
  let firstError: unknown;
  let lastFetchedPage = 0;

  for (const page of pages) {
    try {
      const items = await fetchStargazerPage({ octokit, owner, name, page });
      stargazers.push(...items);
      if (items.length > 0) lastFetchedPage = page;
    } catch (error) {
      failedPages.push(page);
      firstError ??= error;
    }
  }

  if (failedPages.length === 0) return { stargazers };
  if (stargazers.length === 0) throw firstError;

  core.warning(
    `Skipped ${failedPages.length}/${pages.length} sampled stargazer pages for ${owner}/${name} (pages ${failedPages.join(', ')}; first error: ${describeFetchError(firstError)}); reconstructing from the ${stargazers.length} fetched`,
  );

  return {
    stargazers,
    coveredStars: Math.min(lastFetchedPage * STARGAZERS_PER_PAGE, totalStars),
  };
}
