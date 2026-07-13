import * as core from '@actions/core';
import { MAX_REACHABLE_STARGAZERS } from '@domain/constants';
import type { RepoStargazers, Stargazer } from '@domain/stargazers';
import type { RepoInfo } from '@domain/types';
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
      const stargazers = shouldSample
        ? await fetchSampledStargazers({
            octokit,
            owner: repo.owner,
            name: repo.name,
            totalStars: repo.stars,
            maxPages: smartSamplingPages,
          })
        : await fetchRepoStargazers({ octokit, owner: repo.owner, name: repo.name });

      if (repo.stars > 0 && stargazers.length === 0) {
        core.warning(
          `Stargazers for ${repo.fullName} came back empty even though it has ${repo.stars} stars. GitHub restricts the stargazers API to repository admins and collaborators, so its star history cannot be reconstructed with this token.`,
        );
      } else if (
        repo.stars > 0 &&
        stargazers.length > 0 &&
        !stargazers.some((stargazer) => Number.isFinite(Date.parse(stargazer.starredAt)))
      ) {
        core.warning(
          `Stargazers for ${repo.fullName} came back without usable starred_at dates, so its star history cannot be reconstructed.`,
        );
      }

      results.push({ repoFullName: repo.fullName, stargazers, sampled: shouldSample });

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

function describeFetchError(error: unknown): string {
  const { status, message } = error as { status?: number; message?: string };
  const parts = [typeof status === 'number' ? `HTTP ${status}` : '', message?.trim() ?? ''].filter(
    Boolean,
  );

  return parts.length > 0 ? parts.join(' ') : String(error);
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

async function fetchRepoStargazers({
  octokit,
  owner,
  name,
}: FetchRepoStargazersParams): Promise<Stargazer[]> {
  const stargazers: Stargazer[] = [];
  let page = 1;
  let itemCount: number;

  do {
    let items: Stargazer[];
    try {
      items = await fetchStargazerPage({ octokit, owner, name, page });
    } catch (error) {
      if (stargazers.length === 0) throw error;

      core.warning(
        `Stopped fetching stargazers for ${owner}/${name} at page ${page} (${describeFetchError(error)}); keeping the ${stargazers.length} fetched so far`,
      );

      return stargazers;
    }
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
}: FetchSampledStargazersParams): Promise<Stargazer[]> {
  const totalPages = Math.min(
    MAX_REACHABLE_PAGE,
    Math.max(1, Math.ceil(totalStars / STARGAZERS_PER_PAGE)),
  );
  const pages = selectSampledPages({ totalPages, maxPages });
  const stargazers: Stargazer[] = [];
  const failures: { page: number; error: unknown }[] = [];

  for (const page of pages) {
    try {
      const items = await fetchStargazerPage({ octokit, owner, name, page });
      stargazers.push(...items);
    } catch (error) {
      failures.push({ page, error });
    }
  }

  if (failures.length > 0) {
    if (stargazers.length === 0) throw failures[0].error;

    const failedPages = failures.map((failure) => failure.page).join(', ');
    core.warning(
      `Skipped ${failures.length}/${pages.length} sampled stargazer pages for ${owner}/${name} (pages ${failedPages}; first error: ${describeFetchError(failures[0].error)}); reconstructing from the ${stargazers.length} fetched`,
    );
  }

  return stargazers;
}
