import * as core from "@actions/core";
import type { Config } from "@config/types";
import { describeIssue } from "@shared/errors";
import * as z from "zod/mini";
import { describeFetchError } from "./errors";
import { type GitHubRepo, GitHubRepoSchema, type Octokit } from "./types";

const REPOS_PER_PAGE = 100;

const RepoListSchema = z.array(GitHubRepoSchema);

interface FetchReposParams {
	octokit: Octokit;
	config: Config;
}

type ListReposParams = NonNullable<Parameters<Octokit["rest"]["repos"]["listForAuthenticatedUser"]>[0]>;

const VISIBILITY_PARAMS: Record<Config["visibility"], Pick<ListReposParams, "visibility" | "affiliation">> = {
	public: { visibility: "public" },
	private: { visibility: "private" },
	all: { visibility: "all" },
	owned: { visibility: "all", affiliation: "owner" },
};

export async function fetchRepos({ octokit, config }: FetchReposParams): Promise<GitHubRepo[]> {
	const fetched: unknown[] = [];
	let page = 1;

	const params = {
		per_page: REPOS_PER_PAGE,
		sort: "full_name",
		...VISIBILITY_PARAMS[config.visibility],
	} satisfies ListReposParams;

	try {
		let dataLength: number;

		do {
			const { data } = await octokit.rest.repos.listForAuthenticatedUser({
				...params,
				page,
			});

			dataLength = data.length;

			if (dataLength === 0) break;

			fetched.push(...data);
			page++;
		} while (dataLength >= REPOS_PER_PAGE);
	} catch (error) {
		throw new Error(
			`Failed to fetch repositories from GitHub API: ${describeFetchError(error)}. Verify that your github-token has the correct permissions.`,
		);
	}

	const repos = RepoListSchema.safeParse(fetched, { reportInput: true });

	if (!repos.success) {
		throw new Error(
			`GitHub returned a repository list this action cannot read: ${describeIssue(repos.error.issues[0])}.`,
		);
	}

	core.info(`Fetched ${repos.data.length} repositories from GitHub`);

	return repos.data;
}
