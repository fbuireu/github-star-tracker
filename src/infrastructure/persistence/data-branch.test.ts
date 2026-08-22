import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, initializeDataBranch } from "../git/worktree";
import type { PublishedArtefacts } from "./data-branch";
import { withDataBranch } from "./data-branch";
import {
	Artefact,
	commitAndPush,
	pruneCharts,
	readHistory,
	readStargazers,
	writeArtefact,
	writeChart,
	writeHistory,
	writeStargazers,
} from "./storage";

vi.mock("@actions/core", () => ({
	info: vi.fn(),
	debug: vi.fn(),
	warning: vi.fn(),
}));

vi.mock("../git/worktree", () => ({
	initializeDataBranch: vi.fn(),
	cleanup: vi.fn(),
}));

vi.mock("./storage", async (importOriginal) => ({
	Artefact: (await importOriginal<typeof import("./storage")>()).Artefact,
	readHistory: vi.fn(),
	readStargazers: vi.fn(),
	writeHistory: vi.fn(),
	writeArtefact: vi.fn(),
	writeChart: vi.fn(),
	writeStargazers: vi.fn(),
	pruneCharts: vi.fn().mockReturnValue([]),
	commitAndPush: vi.fn(),
}));

const DATA_DIR = ".star-data";

function makeArtefacts(overrides: Partial<PublishedArtefacts> = {}): PublishedArtefacts {
	return {
		history: { snapshots: [] },
		report: "# report",
		badge: "<svg>badge</svg>",
		csv: "header",
		charts: [],
		commitMessage: "Update star data",
		...overrides,
	};
}

const BASE = { dataBranch: "star-data", readOnly: false, token: "tok" };

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(initializeDataBranch).mockReturnValue(DATA_DIR);
	vi.mocked(pruneCharts).mockReturnValue([]);
});

describe("withDataBranch", () => {
	it("opens the worktree for the configured branch and hands back the data directory reads", async () => {
		vi.mocked(readHistory).mockReturnValue({ snapshots: [] });
		vi.mocked(readStargazers).mockReturnValue({});

		await withDataBranch({
			...BASE,
			run: async (branch) => {
				branch.readHistory();
				branch.readStargazers();
			},
		});

		expect(initializeDataBranch).toHaveBeenCalledWith({
			dataBranch: "star-data",
			readOnly: false,
			token: "tok",
		});
		expect(readHistory).toHaveBeenCalledWith(DATA_DIR);
		expect(readStargazers).toHaveBeenCalledWith(DATA_DIR);
	});

	it("returns whatever the run produced", async () => {
		const result = await withDataBranch({ ...BASE, run: async () => "done" });

		expect(result).toBe("done");
	});

	it("removes the worktree after a successful run", async () => {
		await withDataBranch({ ...BASE, run: async () => undefined });

		expect(cleanup).toHaveBeenCalledWith(DATA_DIR);
	});

	it("removes the worktree even when the run throws", async () => {
		await expect(
			withDataBranch({
				...BASE,
				run: async () => {
					throw new Error("run failed");
				},
			}),
		).rejects.toThrow("run failed");

		expect(cleanup).toHaveBeenCalledWith(DATA_DIR);
	});

	it("commits nothing when the run never publishes, though the worktree is always opened", async () => {
		await withDataBranch({ ...BASE, run: async () => undefined });

		expect(initializeDataBranch).toHaveBeenCalled();
		expect(commitAndPush).not.toHaveBeenCalled();
	});
});

describe("publish", () => {
	type PublishParams = {
		artefacts: PublishedArtefacts;
		readOnly?: boolean;
	};

	async function publish({ artefacts, readOnly = false }: PublishParams): Promise<void> {
		await withDataBranch({
			...BASE,
			readOnly,
			run: async (branch) => branch.publish(artefacts),
		});
	}

	it("writes every data-branch artefact into the worktree", async () => {
		const history = { snapshots: [] };

		await publish({ artefacts: makeArtefacts({ history }) });

		expect(writeHistory).toHaveBeenCalledWith({ dataDir: DATA_DIR, history });
		expect(writeArtefact).toHaveBeenCalledWith({
			dataDir: DATA_DIR,
			artefact: Artefact.REPORT,
			contents: "# report",
		});
		expect(writeArtefact).toHaveBeenCalledWith({
			dataDir: DATA_DIR,
			artefact: Artefact.BADGE,
			contents: "<svg>badge</svg>",
		});
		expect(writeArtefact).toHaveBeenCalledWith({
			dataDir: DATA_DIR,
			artefact: Artefact.CSV,
			contents: "header",
		});
	});

	it("writes the stargazer map only when the run produced one", async () => {
		await publish({ artefacts: makeArtefacts() });

		expect(writeStargazers).not.toHaveBeenCalled();

		await publish({ artefacts: makeArtefacts({ stargazerMap: { "user/repo": ["a"] } }) });

		expect(writeStargazers).toHaveBeenCalledWith({
			dataDir: DATA_DIR,
			stargazerMap: { "user/repo": ["a"] },
		});
	});

	it("writes each chart and prunes the ones this run did not produce", async () => {
		await publish({
			artefacts: makeArtefacts({
				charts: [
					{ filename: "star-history.svg", svg: "<svg>a</svg>" },
					{ filename: "comparison.svg", svg: "<svg>b</svg>" },
				],
			}),
		});

		expect(writeChart).toHaveBeenCalledWith({
			dataDir: DATA_DIR,
			filename: "star-history.svg",
			svg: "<svg>a</svg>",
		});
		expect(pruneCharts).toHaveBeenCalledWith({
			dataDir: DATA_DIR,
			keep: ["star-history.svg", "comparison.svg"],
		});
	});

	it("commits and pushes with the run message", async () => {
		await publish({ artefacts: makeArtefacts({ commitMessage: "Update star data: 100 total (+10)" }) });

		expect(commitAndPush).toHaveBeenCalledWith({
			dataDir: DATA_DIR,
			dataBranch: "star-data",
			message: "Update star data: 100 total (+10)",
			token: "tok",
		});
	});

	it("writes everything but never pushes on a read-only run", async () => {
		await publish({ artefacts: makeArtefacts({ charts: [{ filename: "a.svg", svg: "<svg/>" }] }), readOnly: true });

		expect(writeHistory).toHaveBeenCalled();
		expect(writeChart).toHaveBeenCalled();
		expect(pruneCharts).toHaveBeenCalled();
		expect(commitAndPush).not.toHaveBeenCalled();
	});

	it("stages every write before the push, so add -A can see them", async () => {
		const order: string[] = [];
		vi.mocked(writeHistory).mockImplementation(() => {
			order.push("write");
		});
		vi.mocked(writeChart).mockImplementation(() => {
			order.push("chart");
		});
		vi.mocked(commitAndPush).mockImplementation(() => {
			order.push("push");
			return true;
		});

		await publish({ artefacts: makeArtefacts({ charts: [{ filename: "a.svg", svg: "<svg/>" }] }) });

		expect(order).toEqual(["write", "chart", "push"]);
	});
});
