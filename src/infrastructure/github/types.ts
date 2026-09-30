import type { GitHub } from "@actions/github/lib/utils";
import * as z from "zod/mini";

export type Octokit = InstanceType<typeof GitHub>;

export const GitHubRepoSchema = z.object({
	name: z.string(),
	full_name: z.string(),
	owner: z.object({ login: z.string() }),
	private: z.boolean(),
	archived: z.boolean(),
	fork: z.boolean(),
	stargazers_count: z.number(),
});

export type GitHubRepo = z.infer<typeof GitHubRepoSchema>;

export const GitHubStargazerRowSchema = z.object({
	user: z.object({ login: z.string(), avatar_url: z.string(), html_url: z.string() }),
	starred_at: z.catch(z.string(), ""),
});
