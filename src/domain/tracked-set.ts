import type { RepoInfo } from "./types";

const REGEX_PATTERN = /^\/(.+)\/([gimsuy]*)$/;

export interface TrackedSetFilters {
	onlyOrgs: string[];
	onlyRepos: string[];
	excludeOrgs: string[];
	excludeRepos: string[];
	includeArchived: boolean;
	includeForks: boolean;
	minStars: number;
}

export interface TrackedSet {
	repos: RepoInfo[];
	afterOnlyOrgs: number | null;
	afterOnlyRepos: number | null;
	invalidPatterns: string[];
}

interface MatchesPatternParams {
	name: string;
	patterns: string[];
	invalidPatterns: string[];
}

function matchesPattern({ name, patterns, invalidPatterns }: MatchesPatternParams): boolean {
	return patterns.some((pattern) => {
		const match = REGEX_PATTERN.exec(pattern);

		if (match === null) return name === pattern;

		try {
			return new RegExp(match[1], match[2]).test(name);
		} catch {
			if (!invalidPatterns.includes(pattern)) invalidPatterns.push(pattern);

			return false;
		}
	});
}

interface ResolveTrackedSetParams {
	repos: RepoInfo[];
	filters: TrackedSetFilters;
}

export function resolveTrackedSet({ repos, filters }: ResolveTrackedSetParams): TrackedSet {
	const invalidPatterns: string[] = [];
	const matches = ({ name, patterns }: { name: string; patterns: string[] }): boolean =>
		matchesPattern({ name, patterns, invalidPatterns });

	let candidates = repos;
	let afterOnlyOrgs: number | null = null;

	if (filters.onlyOrgs.length > 0) {
		candidates = candidates.filter((repo) => matches({ name: repo.owner, patterns: filters.onlyOrgs }));
		afterOnlyOrgs = candidates.length;
	}

	if (filters.onlyRepos.length > 0) {
		const onlyRepos = candidates.filter((repo) => matches({ name: repo.name, patterns: filters.onlyRepos }));

		return {
			repos: onlyRepos,
			afterOnlyOrgs,
			afterOnlyRepos: onlyRepos.length,
			invalidPatterns,
		};
	}

	let filtered = candidates;

	if (!filters.includeArchived) filtered = filtered.filter((repo) => !repo.archived);
	if (!filters.includeForks) filtered = filtered.filter((repo) => !repo.fork);

	if (filters.excludeRepos.length > 0) {
		filtered = filtered.filter((repo) => !matches({ name: repo.name, patterns: filters.excludeRepos }));
	}

	if (filters.excludeOrgs.length > 0) {
		filtered = filtered.filter((repo) => !matches({ name: repo.owner, patterns: filters.excludeOrgs }));
	}

	if (filters.minStars > 0) {
		filtered = filtered.filter((repo) => repo.stars >= filters.minStars);
	}

	return { repos: filtered, afterOnlyOrgs, afterOnlyRepos: null, invalidPatterns };
}
