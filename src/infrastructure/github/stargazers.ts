import * as core from '@actions/core';
import type { Config } from '@config/types';
import {
  coveredStars,
  MAX_REACHABLE_PAGE,
  STARGAZER_PAGE_SIZE,
  sampledPages,
  shouldSample,
} from '@domain/sampling';
import type { RepoStargazers, Stargazer } from '@domain/stargazers';
import type { RepoInfo } from '@domain/types';
import { describeFetchError } from './errors';
import type { GitHubStargazerRow, Octokit } from './types';

interface FetchAllStargazersParams {
  octokit: Octokit;
  repos: RepoInfo[];
  config: Config;
}

export async function fetchAllStargazers({
  octokit,
  repos,
  config,
}: FetchAllStargazersParams): Promise<RepoStargazers[]> {
  const results: RepoStargazers[] = [];
  const sampled: string[] = [];

  for (const repo of repos) {
    const sampledRepo = shouldSample({
      stars: repo.stars,
      smartSampling: config.smartSampling,
      threshold: config.smartSamplingThreshold,
    });

    try {
      const { stargazers, coveredStars: covered } = sampledRepo
        ? await fetchSampledStargazers({
            octokit,
            owner: repo.owner,
            name: repo.name,
            totalStars: repo.stars,
            maxPages: config.smartSamplingPages,
          })
        : await fetchRepoStargazers({ octokit, owner: repo.owner, name: repo.name });

      warnWhenHistoryIsUnreconstructable(repo, stargazers);

      results.push({
        repoFullName: repo.fullName,
        stargazers,
        sampled: sampledRepo,
        coveredStars: covered,
        incomplete: repo.stars > 0 && stargazers.length === 0,
      });

      if (sampledRepo) sampled.push(repo.fullName);
    } catch (error) {
      core.warning(`Failed to fetch stargazers for ${repo.fullName}: ${describeFetchError(error)}`);

      results.push({
        repoFullName: repo.fullName,
        stargazers: [],
        sampled: sampledRepo,
        incomplete: true,
      });
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
    per_page: STARGAZER_PAGE_SIZE,
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
    if (items.length < STARGAZER_PAGE_SIZE) break;
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

async function fetchSampledStargazers({
  octokit,
  owner,
  name,
  totalStars,
  maxPages,
}: FetchSampledStargazersParams): Promise<StargazerFetchResult> {
  const pages = sampledPages({ totalStars, maxPages });
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
    coveredStars: coveredStars({ lastFetchedPage, totalStars }),
  };
}
