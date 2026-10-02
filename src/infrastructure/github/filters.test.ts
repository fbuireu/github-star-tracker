import * as core from "@actions/core";
import { makeConfig } from "@shared/tests";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchRepos } from "./client";
import { getRepos } from "./filters";
import type { GitHubRepo, Octokit } from "./types";

vi.mock("@actions/core", () => ({
	info: vi.fn(),
	warning: vi.fn(),
}));

interface MockOctokit {
	rest: {
		repos: {
			listForAuthenticatedUser: ReturnType<typeof vi.fn>;
		};
	};
}

function createMockOctokit(mock: MockOctokit): Octokit {
	return mock as unknown as Octokit;
}

function makeRepo(overrides: Partial<GitHubRepo> = {}): GitHubRepo {
	const name = overrides.name ?? "test-repo";
	const owner = overrides.owner ?? { login: "user" };

	return {
		name,
		full_name: `${owner.login}/${name}`,
		owner,
		private: false,
		archived: false,
		fork: false,
		stargazers_count: 10,
		...overrides,
	};
}

const defaultConfig = makeConfig();

describe("fetchRepos", () => {
	it("fetches all repositories from GitHub API", async () => {
		const mockRepos = [makeRepo({ name: "repo1" }), makeRepo({ name: "repo2" })];
		const mockOctokit: MockOctokit = {
			rest: {
				repos: {
					listForAuthenticatedUser: vi.fn().mockResolvedValue({
						data: mockRepos,
					}),
				},
			},
		};
		const result = await fetchRepos({
			octokit: createMockOctokit(mockOctokit),
			config: defaultConfig,
		});

		expect(result).toEqual(mockRepos);
		expect(mockOctokit.rest.repos.listForAuthenticatedUser).toHaveBeenCalledWith({
			per_page: 100,
			sort: "full_name",
			visibility: "all",
			page: 1,
		});
	});

	it("handles pagination correctly", async () => {
		const page1 = Array.from({ length: 100 }, (_, index) => makeRepo({ name: `repo${index}` }));
		const page2 = Array.from({ length: 50 }, (_, index) => makeRepo({ name: `repo${index + 100}` }));
		const mockOctokit: MockOctokit = {
			rest: {
				repos: {
					listForAuthenticatedUser: vi
						.fn()
						.mockResolvedValueOnce({ data: page1 })
						.mockResolvedValueOnce({ data: page2 }),
				},
			},
		};
		const result = await fetchRepos({
			octokit: createMockOctokit(mockOctokit),
			config: defaultConfig,
		});

		expect(result).toHaveLength(150);
		expect(mockOctokit.rest.repos.listForAuthenticatedUser).toHaveBeenCalledTimes(2);
	});

	it("stops pagination when empty page is returned", async () => {
		const mockOctokit: MockOctokit = {
			rest: {
				repos: {
					listForAuthenticatedUser: vi.fn().mockResolvedValue({ data: [] }),
				},
			},
		};
		const result = await fetchRepos({
			octokit: createMockOctokit(mockOctokit),
			config: defaultConfig,
		});

		expect(result).toEqual([]);
		expect(mockOctokit.rest.repos.listForAuthenticatedUser).toHaveBeenCalledTimes(1);
	});

	it("uses public visibility when configured", async () => {
		const mockOctokit: MockOctokit = {
			rest: {
				repos: {
					listForAuthenticatedUser: vi.fn().mockResolvedValue({ data: [] }),
				},
			},
		};
		await fetchRepos({ octokit: createMockOctokit(mockOctokit), config: makeConfig({ visibility: "public" }) });

		expect(mockOctokit.rest.repos.listForAuthenticatedUser).toHaveBeenCalledWith(
			expect.objectContaining({ visibility: "public" }),
		);
	});

	it("uses private visibility when configured", async () => {
		const mockOctokit: MockOctokit = {
			rest: {
				repos: {
					listForAuthenticatedUser: vi.fn().mockResolvedValue({ data: [] }),
				},
			},
		};
		await fetchRepos({ octokit: createMockOctokit(mockOctokit), config: makeConfig({ visibility: "private" }) });

		expect(mockOctokit.rest.repos.listForAuthenticatedUser).toHaveBeenCalledWith(
			expect.objectContaining({ visibility: "private" }),
		);
	});

	it("uses owner affiliation when visibility is owned", async () => {
		const mockOctokit: MockOctokit = {
			rest: {
				repos: {
					listForAuthenticatedUser: vi.fn().mockResolvedValue({ data: [] }),
				},
			},
		};
		await fetchRepos({ octokit: createMockOctokit(mockOctokit), config: makeConfig({ visibility: "owned" }) });

		expect(mockOctokit.rest.repos.listForAuthenticatedUser).toHaveBeenCalledWith(
			expect.objectContaining({ visibility: "all", affiliation: "owner" }),
		);
	});

	it("throws error with status code when API call fails", async () => {
		const mockError = Object.assign(new Error("API Error"), { status: 401 });
		const mockOctokit: MockOctokit = {
			rest: {
				repos: {
					listForAuthenticatedUser: vi.fn().mockRejectedValue(mockError),
				},
			},
		};

		await expect(fetchRepos({ octokit: createMockOctokit(mockOctokit), config: defaultConfig })).rejects.toThrow(
			"Failed to fetch repositories from GitHub API: HTTP 401 API Error. Verify that your github-token has the correct permissions.",
		);
	});

	it("throws error without status code when API call fails", async () => {
		const mockError = new Error("Network Error");
		const mockOctokit: MockOctokit = {
			rest: {
				repos: {
					listForAuthenticatedUser: vi.fn().mockRejectedValue(mockError),
				},
			},
		};

		await expect(fetchRepos({ octokit: createMockOctokit(mockOctokit), config: defaultConfig })).rejects.toThrow(
			"Failed to fetch repositories from GitHub API: Network Error. Verify that your github-token has the correct permissions.",
		);
	});

	it("never throws a blank error description when the API error has no message", async () => {
		const mockOctokit: MockOctokit = {
			rest: {
				repos: {
					listForAuthenticatedUser: vi.fn().mockRejectedValue(new Error("")),
				},
			},
		};

		await expect(fetchRepos({ octokit: createMockOctokit(mockOctokit), config: defaultConfig })).rejects.toThrow(
			"Failed to fetch repositories from GitHub API: Error. Verify that your github-token has the correct permissions.",
		);
	});

	it("refuses a page that is not a list instead of blaming the token", async () => {
		const mockOctokit: MockOctokit = {
			rest: {
				repos: {
					listForAuthenticatedUser: vi.fn().mockResolvedValue({ data: { message: "Moved Permanently" } }),
				},
			},
		};

		await expect(fetchRepos({ octokit: createMockOctokit(mockOctokit), config: defaultConfig })).rejects.toThrow(
			"GitHub returned a repository list this action cannot read: the value (expected array, found an object).",
		);
	});

	it("stops at a page that is not a list rather than asking for the next one", async () => {
		const htmlPage = "<!DOCTYPE html>".padEnd(100, " ");
		const mockOctokit: MockOctokit = {
			rest: {
				repos: {
					listForAuthenticatedUser: vi
						.fn()
						.mockResolvedValueOnce({ data: htmlPage })
						.mockResolvedValueOnce({ data: htmlPage })
						.mockResolvedValue({ data: [] }),
				},
			},
		};

		await expect(fetchRepos({ octokit: createMockOctokit(mockOctokit), config: defaultConfig })).rejects.toThrow(
			'GitHub returned a repository list this action cannot read: the value (expected array, found "<!DOCTYPE html>',
		);
		expect(mockOctokit.rest.repos.listForAuthenticatedUser).toHaveBeenCalledTimes(1);
	});
});

describe("getRepos", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	function octokitReturning(repos: GitHubRepo[]): Octokit {
		return createMockOctokit({
			rest: { repos: { listForAuthenticatedUser: vi.fn().mockResolvedValue({ data: repos }) } },
		});
	}

	it("maps raw GitHub API repos to clean objects", async () => {
		const mapped = await getRepos({
			octokit: octokitReturning([
				makeRepo({
					name: "my-repo",
					full_name: "octo-org/my-repo",
					owner: { login: "octo-org" },
					stargazers_count: 42,
				}),
			]),
			config: defaultConfig,
		});

		expect(mapped).toEqual([
			{
				owner: "octo-org",
				name: "my-repo",
				fullName: "octo-org/my-repo",
				private: false,
				archived: false,
				fork: false,
				stars: 42,
			},
		]);
	});

	it("reports every pattern the tracked set could not read", async () => {
		await getRepos({
			octokit: octokitReturning([makeRepo({ name: "keep-me" })]),
			config: makeConfig({ excludeRepos: ["/[unclosed/"] }),
		});

		expect(core.warning).toHaveBeenCalledWith(
			'Ignoring invalid pattern "/[unclosed/". Filters expect either an exact name or /pattern/flags.',
		);
	});

	it("logs the narrowing at each stage the filters actually ran", async () => {
		const repos = [
			makeRepo({ name: "a", owner: { login: "org-a" } }),
			makeRepo({ name: "b", owner: { login: "org-b" } }),
		];

		await getRepos({
			octokit: octokitReturning(repos),
			config: makeConfig({ onlyOrgs: ["org-a"] }),
		});

		expect(core.info).toHaveBeenCalledWith("After only_orgs filter: 1 repos");
		expect(core.info).toHaveBeenCalledWith("After filtering: 1 repos");
		expect(core.info).not.toHaveBeenCalledWith(expect.stringContaining("only_repos"));
	});

	it("reports the only-repos count instead of the general one when it short-circuits", async () => {
		await getRepos({
			octokit: octokitReturning([makeRepo({ name: "wanted" }), makeRepo({ name: "other" })]),
			config: makeConfig({ onlyRepos: ["wanted"] }),
		});

		expect(core.info).toHaveBeenCalledWith("After only_repos filter: 1 repos");
		expect(core.info).not.toHaveBeenCalledWith(expect.stringContaining("After filtering"));
	});

	it("refuses a repository row it cannot read instead of tracking a broken count", async () => {
		const { stargazers_count: _missing, ...unreadable } = makeRepo({ name: "broken" });
		const octokit = createMockOctokit({
			rest: { repos: { listForAuthenticatedUser: vi.fn().mockResolvedValue({ data: [makeRepo(), unreadable] }) } },
		});

		await expect(getRepos({ octokit, config: defaultConfig })).rejects.toThrow(
			"GitHub returned a repository list this action cannot read: [1].stargazers_count (expected number, found nothing).",
		);
	});

	it("refuses a repository whose owner is missing", async () => {
		const octokit = createMockOctokit({
			rest: {
				repos: {
					listForAuthenticatedUser: vi.fn().mockResolvedValue({ data: [{ ...makeRepo(), owner: null }] }),
				},
			},
		});

		await expect(getRepos({ octokit, config: defaultConfig })).rejects.toThrow(
			"[0].owner (expected object, found null)",
		);
	});

	it("fetches, filters, and maps repos", async () => {
		const mockRepos = [makeRepo({ name: "repo1", stargazers_count: 10 }), makeRepo({ name: "repo2", archived: true })];
		const mockOctokit: MockOctokit = {
			rest: {
				repos: {
					listForAuthenticatedUser: vi.fn().mockResolvedValue({
						data: mockRepos,
					}),
				},
			},
		};
		const result = await getRepos({
			octokit: createMockOctokit(mockOctokit),
			config: defaultConfig,
		});

		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({
			owner: "user",
			name: "repo1",
			fullName: "user/repo1",
			private: false,
			archived: false,
			fork: false,
			stars: 10,
		});
	});
});
