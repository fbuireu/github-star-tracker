import { makeConfig, makeRepoInfo } from "@shared/tests";
import { describe, expect, it } from "vitest";
import type { TrackedSet, TrackedSetFilters } from "./tracked-set";
import { resolveTrackedSet } from "./tracked-set";
import type { RepoInfo } from "./types";

const defaultConfig: TrackedSetFilters = makeConfig();

interface Tracked {
	repos: RepoInfo[];
	filters?: TrackedSetFilters;
}

function trackedSet({ repos, filters = defaultConfig }: Tracked): TrackedSet {
	return resolveTrackedSet({ repos, filters });
}

function tracked(params: Tracked): RepoInfo[] {
	return trackedSet(params).repos;
}

describe("resolveTrackedSet", () => {
	it("matches only-repos by regex, like its sibling filters", () => {
		const repos = [makeRepoInfo("app-web"), makeRepoInfo("docs")];
		const config = makeConfig({ onlyRepos: ["/^app-/"] });

		expect(tracked({ repos, filters: config }).map((repo) => repo.name)).toEqual(["app-web"]);
	});

	it("warns and skips a malformed regex pattern instead of failing the run", () => {
		const repos = [makeRepoInfo("keep-me"), makeRepoInfo("drop-me")];
		const config = makeConfig({ excludeRepos: ["/[unclosed/", "drop-me"] });

		const filtered = trackedSet({ repos, filters: config });

		expect(filtered.repos.map((repo) => repo.name)).toEqual(["keep-me"]);
		expect(filtered.invalidPatterns).toEqual(["/[unclosed/"]);
	});

	it("returns all repos with default config", () => {
		const repos = [makeRepoInfo("test-repo"), makeRepoInfo("other")];

		expect(tracked({ repos })).toHaveLength(2);
	});

	it("filters out archived repos by default", () => {
		const repos = [makeRepoInfo("test-repo"), makeRepoInfo("archived", 10, { archived: true })];
		const result = tracked({ repos });

		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("test-repo");
	});

	it("includes archived repos when configured", () => {
		const repos = [makeRepoInfo("test-repo"), makeRepoInfo("archived", 10, { archived: true })];
		const config = { ...defaultConfig, includeArchived: true };

		expect(tracked({ repos, filters: config })).toHaveLength(2);
	});

	it("filters out forks by default", () => {
		const repos = [makeRepoInfo("test-repo"), makeRepoInfo("forked", 10, { fork: true })];

		expect(tracked({ repos })).toHaveLength(1);
	});

	it("includes forks when configured", () => {
		const repos = [makeRepoInfo("test-repo"), makeRepoInfo("forked", 10, { fork: true })];
		const config = { ...defaultConfig, includeForks: true };

		expect(tracked({ repos, filters: config })).toHaveLength(2);
	});

	it("excludes repos by name", () => {
		const repos = [makeRepoInfo("test-repo"), makeRepoInfo("excluded")];
		const config = { ...defaultConfig, excludeRepos: ["excluded"] };

		expect(tracked({ repos, filters: config })).toHaveLength(1);
	});

	it("excludes repos by regex pattern", () => {
		const repos = [makeRepoInfo("my-app"), makeRepoInfo("test-utils"), makeRepoInfo("test-helpers")];
		const config = { ...defaultConfig, excludeRepos: ["/^test-/"] };
		const result = tracked({ repos, filters: config });

		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("my-app");
	});

	it("supports mixed exact names and regex patterns in exclude", () => {
		const repos = [
			makeRepoInfo("keep-me"),
			makeRepoInfo("drop-this"),
			makeRepoInfo("experiment-1"),
			makeRepoInfo("experiment-2"),
		];
		const config = { ...defaultConfig, excludeRepos: ["drop-this", "/^experiment-/"] };
		const result = tracked({ repos, filters: config });

		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("keep-me");
	});

	it("supports regex flags in exclude pattern", () => {
		const repos = [makeRepoInfo("MyProject"), makeRepoInfo("mylib"), makeRepoInfo("other")];
		const config = { ...defaultConfig, excludeRepos: ["/^my/i"] };
		const result = tracked({ repos, filters: config });

		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("other");
	});

	it("filters by minimum stars", () => {
		const repos = [makeRepoInfo("test-repo", 5), makeRepoInfo("popular", 50)];
		const config = { ...defaultConfig, minStars: 10 };
		const result = tracked({ repos, filters: config });

		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("popular");
	});

	it("only_repos overrides all other filters", () => {
		const repos = [makeRepoInfo("wanted", 10, { archived: true, fork: true }), makeRepoInfo("unwanted")];
		const config = { ...defaultConfig, onlyRepos: ["wanted"] };
		const result = tracked({ repos, filters: config });

		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("wanted");
	});

	it("returns empty array when no repos match only_repos", () => {
		const repos = [makeRepoInfo("test-repo")];
		const config = { ...defaultConfig, onlyRepos: ["nonexistent"] };

		expect(tracked({ repos, filters: config })).toHaveLength(0);
	});

	it("filters by org with only-orgs", () => {
		const repos = [
			makeRepoInfo("a", 10, { owner: "org-a", fullName: "org-a/a" }),
			makeRepoInfo("b", 10, { owner: "org-b", fullName: "org-b/b" }),
		];
		const config = { ...defaultConfig, onlyOrgs: ["org-a"] };
		const result = tracked({ repos, filters: config });

		expect(result).toHaveLength(1);
		expect(result[0].owner).toBe("org-a");
	});

	it("supports regex pattern in only-orgs", () => {
		const repos = [
			makeRepoInfo("web", 10, { owner: "acme-web", fullName: "acme-web/web" }),
			makeRepoInfo("api", 10, { owner: "acme-api", fullName: "acme-api/api" }),
			makeRepoInfo("x", 10, { owner: "other", fullName: "other/x" }),
		];
		const config = { ...defaultConfig, onlyOrgs: ["/^acme-/"] };

		expect(tracked({ repos, filters: config })).toHaveLength(2);
	});

	it("excludes repos by org with exclude-orgs", () => {
		const repos = [
			makeRepoInfo("a", 10, { owner: "keep", fullName: "keep/a" }),
			makeRepoInfo("b", 10, { owner: "drop", fullName: "drop/b" }),
		];
		const config = { ...defaultConfig, excludeOrgs: ["drop"] };
		const result = tracked({ repos, filters: config });

		expect(result).toHaveLength(1);
		expect(result[0].owner).toBe("keep");
	});

	it("supports mixed exact names and regex in exclude-orgs", () => {
		const repos = [
			makeRepoInfo("a", 10, { owner: "keep", fullName: "keep/a" }),
			makeRepoInfo("b", 10, { owner: "drop-this", fullName: "drop-this/b" }),
			makeRepoInfo("c", 10, { owner: "experiment-1", fullName: "experiment-1/c" }),
		];
		const config = { ...defaultConfig, excludeOrgs: ["drop-this", "/^experiment-/"] };
		const result = tracked({ repos, filters: config });

		expect(result).toHaveLength(1);
		expect(result[0].owner).toBe("keep");
	});

	it("matches orgs case-sensitively", () => {
		const repos = [makeRepoInfo("a", 10, { owner: "Org-A", fullName: "Org-A/a" })];
		const config = { ...defaultConfig, onlyOrgs: ["org-a"] };

		expect(tracked({ repos, filters: config })).toHaveLength(0);
	});

	it("applies only-orgs before the only-repos override on the narrowed set", () => {
		const repos = [
			makeRepoInfo("wanted", 10, {
				owner: "org-a",
				fullName: "org-a/wanted",
				archived: true,
				fork: true,
			}),
			makeRepoInfo("wanted", 10, { owner: "org-b", fullName: "org-b/wanted" }),
			makeRepoInfo("unwanted", 10, { owner: "org-a", fullName: "org-a/unwanted" }),
		];
		const config = { ...defaultConfig, onlyOrgs: ["org-a"], onlyRepos: ["wanted"] };
		const result = tracked({ repos, filters: config });

		expect(result).toHaveLength(1);
		expect(result[0].owner).toBe("org-a");
		expect(result[0].name).toBe("wanted");
	});

	it("does not filter by org when org lists are empty", () => {
		const repos = [
			makeRepoInfo("a", 10, { owner: "org-a", fullName: "org-a/a" }),
			makeRepoInfo("b", 10, { owner: "org-b", fullName: "org-b/b" }),
		];

		expect(tracked({ repos })).toHaveLength(2);
	});
});
