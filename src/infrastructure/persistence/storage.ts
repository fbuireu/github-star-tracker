import * as fs from "node:fs";
import * as path from "node:path";
import * as core from "@actions/core";
import type { StargazerMap } from "@domain/stargazers";
import type { History } from "@domain/types";
import { authenticatedArgs, execute } from "../git/commands";

const DATA_FORMAT_VERSION = 1;

const PUSH_REJECTED_PATTERN = /\[rejected]|non-fast-forward|fetch first/i;

const DATA_FILES = {
	history: "stars-data.json",
	stargazers: "stargazers.json",
	report: "README.md",
	badge: "stars-badge.svg",
	csv: "stars-data.csv",
	htmlReport: "star-tracker-report.html",
	chartsDir: "charts",
} as const;

interface ReadJsonFileParams<T> {
	filePath: string;
	fallback: T;
}

function readJsonFile<T>({ filePath, fallback }: ReadJsonFileParams<T>): T {
	if (!fs.existsSync(filePath)) {
		return fallback;
	}

	const contents = fs.readFileSync(filePath, "utf8");

	try {
		return JSON.parse(contents) as T;
	} catch (error) {
		throw new Error(
			`${path.basename(filePath)} on the data branch is not valid JSON (${(error as Error).message}). Fix or delete the file on that branch and re-run.`,
		);
	}
}

interface WriteJsonFileParams {
	filePath: string;
	data: unknown;
}

function writeJsonFile({ filePath, data }: WriteJsonFileParams): void {
	fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function assertReadableFormat(version: unknown): void {
	if (version === undefined || (typeof version === "number" && version <= DATA_FORMAT_VERSION)) {
		return;
	}

	throw new Error(
		`${DATA_FILES.history} on the data branch declares format version ${JSON.stringify(version)}, which this version of the action does not understand (it writes version ${DATA_FORMAT_VERSION}). Upgrade the action, or point data-branch at a branch this version wrote.`,
	);
}

function assertJsonObject(parsed: unknown): asserts parsed is Record<string, unknown> {
	if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
		return;
	}

	throw new Error(
		`${DATA_FILES.history} on the data branch is valid JSON but not an object (found ${Array.isArray(parsed) ? "an array" : JSON.stringify(parsed)}). Reading it as an empty history would discard your tracking record, so this run stops instead. Fix or delete the file on that branch and re-run.`,
	);
}

export function readHistory(dataDir: string): History {
	const parsed = readJsonFile<unknown>({
		filePath: path.join(dataDir, DATA_FILES.history),
		fallback: {},
	});

	assertJsonObject(parsed);

	const { version, ...raw } = parsed as Partial<History> & { version?: unknown };

	assertReadableFormat(version);

	return { ...raw, snapshots: Array.isArray(raw.snapshots) ? raw.snapshots : [] };
}

interface WriteHistoryParams {
	dataDir: string;
	history: History;
}

export function writeHistory({ dataDir, history }: WriteHistoryParams): void {
	writeJsonFile({
		filePath: path.join(dataDir, DATA_FILES.history),
		data: { version: DATA_FORMAT_VERSION, ...history },
	});
}

export const Artefact = {
	REPORT: "report",
	BADGE: "badge",
	CSV: "csv",
} as const;

export type Artefact = (typeof Artefact)[keyof typeof Artefact];

interface WriteArtefactParams {
	dataDir: string;
	artefact: Artefact;
	contents: string;
}

export function writeArtefact({ dataDir, artefact, contents }: WriteArtefactParams): void {
	fs.writeFileSync(path.join(dataDir, DATA_FILES[artefact]), contents);
}

interface WriteChartParams {
	dataDir: string;
	filename: string;
	svg: string;
}

export function writeChart({ dataDir, filename, svg }: WriteChartParams): void {
	const chartsDir = path.join(dataDir, DATA_FILES.chartsDir);

	if (!fs.existsSync(chartsDir)) {
		fs.mkdirSync(chartsDir, { recursive: true });
	}
	const filePath = path.join(chartsDir, filename);

	fs.writeFileSync(filePath, svg);
}

interface PruneChartsParams {
	dataDir: string;
	keep: string[];
}

export function pruneCharts({ dataDir, keep }: PruneChartsParams): string[] {
	const chartsDir = path.join(dataDir, DATA_FILES.chartsDir);

	if (!fs.existsSync(chartsDir)) return [];

	const kept = new Set(keep);
	const removed = fs.readdirSync(chartsDir).filter((filename) => filename.endsWith(".svg") && !kept.has(filename));

	for (const filename of removed) {
		fs.rmSync(path.join(chartsDir, filename));
	}

	if (removed.length > 0) {
		core.info(`Removed ${removed.length} chart(s) no longer produced: ${removed.join(", ")}`);
	}

	return removed;
}

export function readStargazers(dataDir: string): StargazerMap {
	return readJsonFile<StargazerMap>({
		filePath: path.join(dataDir, DATA_FILES.stargazers),
		fallback: {},
	});
}

interface WriteStargazersParams {
	dataDir: string;
	stargazerMap: StargazerMap;
}

export function writeStargazers({ dataDir, stargazerMap }: WriteStargazersParams): void {
	writeJsonFile({ filePath: path.join(dataDir, DATA_FILES.stargazers), data: stargazerMap });
}

interface WriteHtmlReportParams {
	htmlReport: string;
}

export function writeHtmlReport({ htmlReport }: WriteHtmlReportParams): string {
	const outputDir = process.env.RUNNER_TEMP || process.cwd();
	const filePath = path.join(outputDir, DATA_FILES.htmlReport);

	fs.writeFileSync(filePath, htmlReport);

	return filePath;
}

interface CommitAndPushParams {
	dataDir: string;
	dataBranch: string;
	message: string;
	token: string;
}

export function commitAndPush({ dataDir, dataBranch, message, token }: CommitAndPushParams): boolean {
	const cwd = path.resolve(dataDir);

	execute({ args: ["add", "-A"], options: { cwd } });

	try {
		execute({ args: ["diff", "--cached", "--quiet"], options: { cwd } });

		core.info("No data changes to commit");

		return false;
	} catch {
		core.debug("Staged changes detected, proceeding with commit");
	}

	execute({ args: ["commit", "-m", message], options: { cwd } });

	try {
		execute({
			args: authenticatedArgs({ token, args: ["push", "origin", `HEAD:${dataBranch}`] }),
			options: { cwd },
		});
	} catch (error) {
		if (!PUSH_REJECTED_PATTERN.test((error as Error).message)) throw error;

		throw new Error(
			`Another run pushed to "${dataBranch}" while this one was working, so this run's snapshot was not recorded — its report and any email have already gone out. Re-run to record it. To stop runs overlapping, give the workflow a "concurrency" group, or set read-only on whichever workflow should not be the writer.`,
		);
	}

	core.info(`Data committed and pushed to ${dataBranch}`);

	return true;
}
