import * as core from "@actions/core";
import type { Config } from "@config/types";
import { describeIssue } from "@shared/errors";
import * as z from "zod/mini";
import { describeFetchError } from "./errors";
import { type GitHubRepo, GitHubRepoSchema, type Octokit } from "./types";

const REPOS_PER_PAGE = 100;

const RepoPageSchema = z.array(z.unknown());

const RepoListSchema = z.array(GitHubRepoSchema);

interface FetchReposParams {
	octokit: Octokit;
	config: Config;
}

type ListReposParams = NonNullable<Parameters<Octokit["rest"]["repos"]["listForAuthenticatedUser"]>[0]>;

interface FetchRepoPageParams {
	octokit: Octokit;
	query: ListReposParams;
	page: number;
}

const VISIBILITY_PARAMS: Record<Config["visibility"], Pick<ListReposParams, "visibility" | "affiliation">> = {
	public: { visibility: "public" },
	private: { visibility: "private" },
	all: { visibility: "all" },
	owned: { visibility: "all", affiliation: "owner" },
};

async function fetchRepoPage({ octokit, query, page }: FetchRepoPageParams): Promise<unknown> {
	try {
		const { data } = await octokit.rest.repos.listForAuthenticatedUser({ ...query, page });

		return data;
	} catch (error) {
		throw new Error(
			`Failed to fetch repositories from GitHub API: ${describeFetchError(error)}. Verify that your github-token has the correct permissions.`,
		);
	}
}

function unreadableRepoList(issue: z.core.$ZodIssue): Error {
	return new Error(`GitHub returned a repository list this action cannot read: ${describeIssue(issue)}.`);
}

export async function fetchRepos({ octokit, config }: FetchReposParams): Promise<GitHubRepo[]> {
	const fetched: unknown[] = [];
	let page = 1;
	let pageLength: number;

	const query = {
		per_page: REPOS_PER_PAGE,
		sort: "full_name",
		...VISIBILITY_PARAMS[config.visibility],
	} satisfies ListReposParams;

	do {
		const rows = RepoPageSchema.safeParse(await fetchRepoPage({ octokit, query, page }), { reportInput: true });

		if (!rows.success) throw unreadableRepoList(rows.error.issues[0]);

		fetched.push(...rows.data);
		pageLength = rows.data.length;
		page++;
	} while (pageLength >= REPOS_PER_PAGE);

	const repos = RepoListSchema.safeParse(fetched, { reportInput: true });

	if (!repos.success) throw unreadableRepoList(repos.error.issues[0]);

	core.info(`Fetched ${repos.data.length} repositories from GitHub`);

	return repos.data;
}
