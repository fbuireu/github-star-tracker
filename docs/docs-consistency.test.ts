import * as fs from "node:fs";
import * as path from "node:path";
import { DEFAULTS } from "@config/defaults";
import { toActionInputName } from "@config/loader";
import type { Config } from "@config/types";
import * as yaml from "js-yaml";
import { describe, expect, it, vi } from "vitest";

const DOCS_TEST_TIMEOUT_MS = 30_000;

vi.setConfig({ testTimeout: DOCS_TEST_TIMEOUT_MS });

const MARKDOWN_LINK_PATTERN = /\[[^\]]*\]\(([^)]+)\)/g;
const SOURCE_PATH_PATTERN = /`(src\/[\w./-]+\.ts)`/g;
const TEST_FILE_PATTERN = /`([\w-]+\.test\.ts)`/g;
const SVG_LINK_PATTERN = /\]\(([\w.-]+\.svg)\)/g;
const OUTPUT_KEY_PATTERN = /^ {2}([a-z][a-z-]*):$/gm;
const LINE_CITATION_PATTERN = /`[\w/.-]+\.ts:\d+/g;
const SCRIPT_PATTERN = /^pnpm ([a-z][a-z0-9:._-]*)/gm;
const LAYER_ROW_PATTERN = /^\| `([\w-]+)\/` \| `(@[a-z\d]+)(?:\/\*)?` \|/gm;

const GUIDE = "CLAUDE.md";
const CONTRIBUTOR_GUIDE = "CONTRIBUTING.md";

const UNDOCUMENTED_SCRIPTS = new Set(["prepare", "test:watch", "test:changed"]);

const OUTPUT_SURFACES = [
	"README.md",
	"ARCHITECTURE.md",
	"docs/wiki/API-Reference.md",
	"docs/wiki/Viewing-Reports.md",
	"src/application/CLAUDE.md",
];

const MIN_EXPECTED_DOCS = 20;

const ADR_DIRECTORY = "docs/adr";
const ADR_TEMPLATE = "docs/adr/0000-adr-template.md";
const ADR_INDEX = "ARCHITECTURE.md";
const ADR_SECTIONS = ["Status", "Context", "Decision", "Consequences"];
const ADR_STATUSES = new Set(["Template", "Proposed", "Accepted", "Superseded", "Deprecated"]);
const ADR_FILE_PATTERN = /^docs\/adr\/\d{4}(-[a-z\d]+)+\.md$/;
const ADR_STATUS_PATTERN = /\n## Status\n\n(\w+)/;
const ADR_DATE_PATTERN = /\nDate: \d{4}-\d{2}-\d{2}\n/;
const ADR_REFERENCE_PATTERNS = [/ADR (\d{4})/g, /docs\/adr\/(\d{4})-/g];
const adrHeadingPattern = (number: number): RegExp => new RegExp(`^# ${number}\\. \\S`);

const STORAGE_MODULE = "src/infrastructure/persistence/storage.ts";
const DATA_FORMAT_VERSION_PATTERN = /const DATA_FORMAT_VERSION = (\d+);/;
const DOCUMENTED_VERSION_PATTERN = /"version": (\d+)/g;
const HISTORY_FILE_SURFACES = ["docs/wiki/API-Reference.md", "docs/wiki/Data-Management.md"];

const I18N_PAGE = "docs/wiki/Internationalization-(i18n).md";
const I18N_SECTION_ROW_PATTERN = /^\| `(\w+)` \| ((?:`[\w.]+`(?:, )?)+) \|/gm;
const I18N_KEY_PATTERN = /`([\w.]+)`/g;

const LINE_CITATION_ALLOWLIST = new Set([GUIDE, CONTRIBUTOR_GUIDE, ADR_TEMPLATE]);

interface WalkParams {
	dir: string;
	keep: (filename: string) => boolean;
}

function walk({ dir, keep }: WalkParams): string[] {
	if (!fs.existsSync(dir)) return [];

	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const full = path.join(dir, entry.name);

		if (entry.isDirectory()) return walk({ dir: full, keep });

		return keep(entry.name) ? [full] : [];
	});
}

const isMarkdown = (filename: string): boolean => filename.endsWith(".md");

const DOCS = [
	...[
		"CLAUDE.md",
		"ARCHITECTURE.md",
		"CODE_OF_CONDUCT.md",
		"CONTEXT.md",
		"CONTRIBUTING.md",
		"README.md",
		"SECURITY.md",
		"examples/README.md",
	].filter((doc) => fs.existsSync(doc)),
	...walk({ dir: ".github", keep: isMarkdown }),
	...walk({ dir: "docs", keep: isMarkdown }),
	...walk({ dir: "src", keep: (filename) => filename === "CLAUDE.md" }),
];

const isTestFile = (filename: string): boolean => filename.endsWith(".test.ts");

const TEST_FILENAMES = new Set(
	[...walk({ dir: "src", keep: isTestFile }), ...walk({ dir: "tests", keep: isTestFile })].map((file) =>
		path.basename(file),
	),
);

const toPosix = (file: string): string => file.split(path.sep).join("/");

const ADR_FILES = walk({ dir: ADR_DIRECTORY, keep: isMarkdown }).map(toPosix).sort();

const adrNumber = (file: string): string => path.basename(file).slice(0, 4);

function read(file: string): string {
	return fs.readFileSync(file, "utf8").replaceAll("\r\n", "\n");
}

const ENTRY_LAYER = "entry";
const LAYER_TABLE_DOC = "ARCHITECTURE.md";
const LAYER_TABLE_HEADER = "| Layer | Alias | Responsibility | May import | Must not import |";
const ENTRY_ROW_LABEL = "`src/` entry";
const MODULE_SPECIFIER_PATTERN = /(?:vi\.mock|(?<![.\w])(?:from|import|require))\s*\(?\s*"([^"]+)"/g;
const TEST_LAYER_EXEMPT_TARGETS = new Set(["shared"]);
const PURE_LAYERS = new Set(["domain", "presentation", "i18n"]);
const IMPURE_PREFIXES = ["node:", "@actions/", "@octokit/", "nodemailer", "js-yaml"];
const TEST_LAYER_CROSSINGS = new Set([
	'src/config/action-inputs.test.ts -> infrastructure ("@infrastructure/notification/email")',
]);

interface LayerRow {
	layer: string;
	mayImport: Set<string>;
}

function readLayerTable(): LayerRow[] {
	const lines = read(LAYER_TABLE_DOC).split("\n");
	const start = lines.indexOf(LAYER_TABLE_HEADER);

	expect(start, `${LAYER_TABLE_DOC} no longer holds the layer table`).toBeGreaterThan(-1);

	const cells: string[][] = [];

	for (const line of lines.slice(start + 2)) {
		if (!line.startsWith("|")) break;

		cells.push(line.split("|").map((cell) => cell.trim()));
	}

	const names = cells.map((row) => (row[1] === ENTRY_ROW_LABEL ? ENTRY_LAYER : row[1]));

	return cells.map((row, index) => ({
		layer: names[index],
		mayImport: new Set(names.filter((name) => new RegExp(`\\b${name}\\b`).test(row[4]))),
	}));
}

interface LayerEdge {
	file: string;
	from: string;
	to: string;
	specifier: string;
}

function layerOf(file: string): string {
	const parts = toPosix(file).split("/");

	return parts.length > 2 ? parts[1] : ENTRY_LAYER;
}

interface ResolveTargetLayerParams {
	specifier: string;
	file: string;
}

function resolveTargetLayer({ specifier, file }: ResolveTargetLayerParams): string | null {
	if (specifier.startsWith(".")) {
		const resolved = toPosix(path.normalize(path.join(path.dirname(toPosix(file)), specifier)));

		return resolved.startsWith("src/") ? layerOf(resolved) : null;
	}

	const alias = /^@([a-z\d]+)/.exec(specifier);

	return alias === null ? null : alias[1];
}

function specifiersIn(file: string): string[] {
	return [...read(file).matchAll(MODULE_SPECIFIER_PATTERN)].map(([, specifier]) => specifier);
}

function layerEdgesIn(file: string): LayerEdge[] {
	const from = layerOf(file);

	return specifiersIn(file)
		.map((specifier) => ({ specifier, to: resolveTargetLayer({ specifier, file }) }))
		.filter((edge): edge is { specifier: string; to: string } => edge.to !== null)
		.map(({ specifier, to }) => ({ file: toPosix(file), from, to, specifier }));
}

function adrReferencesIn(doc: string): string[] {
	const body = read(doc);

	return ADR_REFERENCE_PATTERNS.flatMap((pattern) => [...body.matchAll(pattern)].map(([, number]) => number));
}

interface CollectParams {
	pattern: RegExp;
	isBroken: (match: string, doc: string) => boolean;
}

function collect({ pattern, isBroken }: CollectParams): string[] {
	return DOCS.flatMap((doc) =>
		[...read(doc).matchAll(pattern)]
			.map((match) => match[1])
			.filter((match) => isBroken(match, doc))
			.map((match) => `${doc} -> ${match}`),
	);
}

describe("documentation consistency", () => {
	it("guards the whole documentation set", () => {
		expect(DOCS.length).toBeGreaterThan(MIN_EXPECTED_DOCS);
	});

	it("links only to files that exist", () => {
		const broken = collect({
			pattern: MARKDOWN_LINK_PATTERN,
			isBroken: (target, doc) =>
				!target.startsWith("http") &&
				target.includes(".md") &&
				!fs.existsSync(path.resolve(path.dirname(doc), target.split("#")[0])),
		});

		expect(broken).toEqual([]);
	});

	it("cites only source files that exist", () => {
		const missing = collect({
			pattern: SOURCE_PATH_PATTERN,
			isBroken: (cited) => !fs.existsSync(cited),
		});

		expect(missing).toEqual([]);
	});

	it("cites only test files that exist", () => {
		const missing = collect({
			pattern: TEST_FILE_PATTERN,
			isBroken: (cited) => !TEST_FILENAMES.has(cited),
		});

		expect(missing).toEqual([]);
	});

	it("embeds only sample charts that exist", () => {
		const missing = [...read("examples/README.md").matchAll(SVG_LINK_PATTERN)]
			.map((match) => match[1])
			.filter((svg) => !fs.existsSync(path.join("examples", svg)));

		expect(missing).toEqual([]);
	});
});

describe("architecture decision records", () => {
	it("numbers files sequentially from the template, with no gaps or duplicates", () => {
		const numbers = ADR_FILES.map((file) => Number(adrNumber(file)));

		expect(numbers).toEqual(numbers.map((_, index) => index));
	});

	it("names every file NNNN-kebab-title.md", () => {
		expect(ADR_FILES.filter((file) => !ADR_FILE_PATTERN.test(file))).toEqual([]);
	});

	it("fills in the template: numbered heading, date, status, and the four sections", () => {
		const malformed = ADR_FILES.flatMap((file) => {
			const body = read(file);
			const number = Number(adrNumber(file));
			const status = body.match(ADR_STATUS_PATTERN)?.[1] ?? "";
			const heading = adrHeadingPattern(number);

			return [
				...(heading.test(body) ? [] : [`${file}: heading is not "# ${number}. Title"`]),
				...(ADR_DATE_PATTERN.test(body) ? [] : [`${file}: no "Date: YYYY-MM-DD" line`]),
				...(ADR_STATUSES.has(status) ? [] : [`${file}: status is "${status}"`]),
				...ADR_SECTIONS.filter((section) => !body.includes(`\n## ${section}\n`)).map(
					(section) => `${file}: no "## ${section}" section`,
				),
			];
		});

		expect(malformed).toEqual([]);
	});

	it("references only ADRs that exist", () => {
		const existing = new Set(ADR_FILES.map(adrNumber));
		const dangling = DOCS.flatMap((doc) =>
			adrReferencesIn(doc)
				.filter((number) => !existing.has(number))
				.map((number) => `${doc} -> ADR ${number}`),
		);

		expect(dangling).toEqual([]);
	});

	it("indexes every decision in ARCHITECTURE.md", () => {
		const index = read(ADR_INDEX);
		const unindexed = ADR_FILES.filter((file) => file !== ADR_TEMPLATE && !index.includes(file));

		expect(unindexed).toEqual([]);
	});

	it("gives every ADR a home outside the index", () => {
		const contextual = DOCS.map(toPosix).filter((doc) => doc !== ADR_INDEX && !doc.startsWith(`${ADR_DIRECTORY}/`));
		const linked = new Set(contextual.flatMap(adrReferencesIn));
		const orphaned = ADR_FILES.map(adrNumber).filter((number) => !linked.has(number));

		expect(orphaned).toEqual([]);
	});
});

interface ActionManifest {
	inputs: Record<string, { description: string; default?: string }>;
}

const manifest = yaml.load(read("action.yml")) as ActionManifest;
const declaredOutputs = [...read("action.yml").split("\noutputs:")[1].matchAll(OUTPUT_KEY_PATTERN)].map(
	(match) => match[1],
);

const PROSE_DEFAULT_PATTERN = /\(default ([^)]+)\)/;

function proseDefault(description: string): string | null {
	return PROSE_DEFAULT_PATTERN.exec(description)?.[1] ?? null;
}

function describedAs(value: Config[keyof Config]): string {
	if (Array.isArray(value)) return value.length === 0 ? "empty" : value.join(", ");

	return String(value);
}

describe("action.yml is documented", () => {
	it("states a default in prose for every overridable input, and states the real one", () => {
		const wrong = Object.entries(DEFAULTS)
			.filter(([key]) => key !== "sendOnNoChanges")
			.map(([key, value]) => {
				const name = toActionInputName(key);
				const stated = proseDefault(manifest.inputs[name]?.description ?? "");
				const actual = describedAs(value);

				return stated === actual ? null : `${name}: says ${stated ?? "(nothing)"}, is ${actual}`;
			})
			.filter((mismatch) => mismatch !== null);

		expect(wrong).toEqual([]);
	});

	it("tells the reader every overridable input can also come from the config file", () => {
		const silent = Object.keys(DEFAULTS)
			.filter((key) => key !== "sendOnNoChanges")
			.map(toActionInputName)
			.filter((name) => !(manifest.inputs[name]?.description ?? "").includes("(overrides config file)"));

		expect(silent).toEqual([]);
	});

	it("declares outputs this test can read", () => {
		expect(declaredOutputs.length).toBeGreaterThan(0);
	});

	it("names every declared output on each surface that lists outputs", () => {
		const undocumented = OUTPUT_SURFACES.flatMap((surface) => {
			const text = read(surface);

			return declaredOutputs
				.filter((output) => !text.includes(`\`${output}\``))
				.map((output) => `${surface} -> ${output}`);
		});

		expect(undocumented).toEqual([]);
	});

	it("documents every input in the wiki", () => {
		const configuration = read("docs/wiki/Configuration.md");
		const reference = read("docs/wiki/API-Reference.md");
		const undocumented = Object.keys(manifest.inputs).filter(
			(input) => !configuration.includes(`\`${input}\``) && !reference.includes(`\`${input}\``),
		);

		expect(undocumented).toEqual([]);
	});
});

const PINNED_INPUT = "github-token";
const NAME_ROW_PATTERN = /^\| `([a-z][a-z\d-]*)`/gm;
const OPTION_HEADING_PATTERN = /^### `([a-z][a-z\d-]*)`$/gm;
const ORDERED_SURFACES = ["README.md", "docs/wiki/API-Reference.md", "docs/wiki/Viewing-Reports.md"];
const OPTION_GUIDE = "docs/wiki/Configuration.md";
const GROUP_HEADING_PATTERN = /^## /m;

const declaredInputs = Object.keys(manifest.inputs);

const alphabetically = (a: string, b: string): number => a.localeCompare(b, "en");

function inOrder(names: string[]): string[] {
	return [
		...names.filter((name) => name === PINNED_INPUT),
		...names.filter((name) => name !== PINNED_INPUT).sort(alphabetically),
	];
}

const isOrdered = (names: string[]): boolean => names.join() === inOrder(names).join();

interface ListedParams {
	surface: string;
	declared: string[];
}

function listed({ surface, declared }: ListedParams): string[] {
	const names = new Set(declared);

	return [...read(surface).matchAll(NAME_ROW_PATTERN)].map(([, name]) => name).filter((name) => names.has(name));
}

describe("inputs and outputs are listed alphabetically", () => {
	it("declares them in that order in action.yml, after the required github-token", () => {
		expect(declaredInputs).toEqual(inOrder(declaredInputs));
		expect(declaredOutputs).toEqual(inOrder(declaredOutputs));
	});

	it("tabulates them in that order on every surface that tabulates them at all", () => {
		const tables = ORDERED_SURFACES.flatMap((surface) =>
			[declaredInputs, declaredOutputs].map((declared) => ({
				surface,
				names: listed({ surface, declared }),
			})),
		);
		const silent = ORDERED_SURFACES.filter((surface) =>
			tables.every((table) => table.surface !== surface || table.names.length === 0),
		);
		const misordered = tables
			.filter((table) => table.names.length > 0 && !isOrdered(table.names))
			.map(({ surface, names }) => `${surface}: ${names.join(", ")}`);

		expect(silent).toEqual([]);
		expect(misordered).toEqual([]);
	});

	it("orders the option sections of the configuration guide within each group", () => {
		const groups = read(OPTION_GUIDE)
			.split(GROUP_HEADING_PATTERN)
			.slice(1)
			.map((group) => ({
				title: group.split("\n")[0],
				names: [...group.matchAll(OPTION_HEADING_PATTERN)].map(([, name]) => name),
			}))
			.filter(({ names }) => names.length > 0);
		const misordered = groups
			.filter(({ names }) => !isOrdered(names))
			.map(({ title, names }) => `${title}: ${names.join(", ")}`);

		expect(groups.length).toBeGreaterThan(0);
		expect(misordered).toEqual([]);
	});
});

interface PackageManifest {
	scripts: Record<string, string>;
}

interface TsConfig {
	compilerOptions: { paths: Record<string, string[]> };
}

const JSONC_COMMENT_PATTERN = /^\s*\/\/.*$/gm;

const pkg = JSON.parse(read("package.json")) as PackageManifest;
const tsconfig = JSON.parse(read("tsconfig.json").replace(JSONC_COMMENT_PATTERN, "")) as TsConfig;
const guide = read(GUIDE);

describe("the root guide matches the manifests", () => {
	const documentedScripts = [...guide.matchAll(SCRIPT_PATTERN)].map(([, name]) => name);

	it("documents only scripts that package.json declares", () => {
		expect(documentedScripts.filter((script) => !(script in pkg.scripts))).toEqual([]);
	});

	it("documents every script that is not deliberately left out", () => {
		const missing = Object.keys(pkg.scripts).filter(
			(script) => !UNDOCUMENTED_SCRIPTS.has(script) && !documentedScripts.includes(script),
		);

		expect(missing).toEqual([]);
	});

	const layerRows = [...guide.matchAll(LAYER_ROW_PATTERN)].map(([, layer, alias]) => ({
		layer,
		alias,
	}));

	it("gives every layer under src a row in the layer table", () => {
		const onDisk = fs
			.readdirSync("src", { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.sort();

		expect(layerRows.map(({ layer }) => layer).sort()).toEqual(onDisk);
	});

	it("gives every layer its own nested guide", () => {
		const missing = layerRows.map(({ layer }) => `src/${layer}/CLAUDE.md`).filter((file) => !fs.existsSync(file));

		expect(missing).toEqual([]);
	});

	it("names the alias tsconfig maps to each layer, and no others", () => {
		const declared = Object.keys(tsconfig.compilerOptions.paths)
			.map((alias) => alias.replace("/*", ""))
			.sort();

		expect([...new Set(layerRows.map(({ alias }) => alias))].sort()).toEqual(declared);

		const mismatched = layerRows.filter(({ layer, alias }) => {
			const target = tsconfig.compilerOptions.paths[alias] ?? tsconfig.compilerOptions.paths[`${alias}/*`];

			return !target?.[0]?.startsWith(`./src/${layer}`);
		});

		expect(mismatched).toEqual([]);
	});
});

const DOMAIN_CONSTANTS = "src/domain/constants.ts";
const CHART_CONSTANTS = "src/presentation/constants.ts";
const DOMAIN_GUIDE = "src/domain/CLAUDE.md";
const CHART_GUIDE = "src/presentation/CLAUDE.md";
const IO_GUIDE = "src/infrastructure/CLAUDE.md";

const declarationPattern = (name: string): RegExp => new RegExp(`\\b${name}\\b[^=:\\n]*[=:]\\s*([^;,\\n]+)`);
const arrayLiteralPattern = (name: string): RegExp => new RegExp(`\\b${name}\\b[^=:]*[=:]\\s*\\[([\\s\\S]*?)\\]`);
const objectLiteralPattern = (name: string): RegExp => new RegExp(`\\b${name}\\b[^=:]*[=:]\\s*\\{([^{}]*)\\}`);

const NUMERIC_SEPARATOR_PATTERN = /_/g;
const WHITESPACE_RUN_PATTERN = /\s+/g;
const QUOTE_PATTERN = /["']/g;
const THRESHOLD_RUNG_PATTERN = /limit:\s*(\d+),\s*value:\s*(\d+)/g;
const QUOTED_RUNG_PATTERN = /`<=\d+ → \d+`/g;
const MULTIPLICATION_OPERATOR = "*";
const GROUPING_LOCALE = "en-US";
const MS_PER_HOUR = 3_600_000;

interface DeclarationParams {
	file: string;
	name: string;
}

function declaration({ file, name }: DeclarationParams): string {
	const match = declarationPattern(name).exec(read(file));

	if (!match) throw new Error(`${name} is not declared in ${file}`);

	return match[1].trim();
}

function arrayLiteral({ file, name }: DeclarationParams): string {
	const match = arrayLiteralPattern(name).exec(read(file));

	if (!match) throw new Error(`${name} is not declared as an array in ${file}`);

	return match[1];
}

function objectLiteral({ file, name }: DeclarationParams): string {
	const match = objectLiteralPattern(name).exec(read(file));

	if (!match) throw new Error(`${name} is not declared as an object in ${file}`);

	return match[1];
}

function product(expression: string): number {
	return expression
		.split(MULTIPLICATION_OPERATOR)
		.reduce((total, part) => total * Number(part.trim().replace(NUMERIC_SEPARATOR_PATTERN, "")), 1);
}

const value = (params: DeclarationParams): number => product(declaration(params));

const grouped = (count: number): string => count.toLocaleString(GROUPING_LOCALE);

const prose = (file: string): string => read(file).replace(WHITESPACE_RUN_PATTERN, " ");

const QUOTED_CONSTANTS = [
	{
		name: "MIN_SNAPSHOTS_FOR_FORECAST",
		file: DOMAIN_CONSTANTS,
		doc: DOMAIN_GUIDE,
		mention: (count: number) => `below ${count} snapshots`,
	},
	{
		name: "FORECAST_WEEKS",
		file: DOMAIN_CONSTANTS,
		doc: DOMAIN_GUIDE,
		mention: (count: number) => `${count} weekly points`,
	},
	{
		name: "MIN_RATE_INTERVAL_DAYS",
		file: DOMAIN_CONSTANTS,
		doc: DOMAIN_GUIDE,
		mention: (days: number) => `at least ${days} days back`,
	},
	{
		name: "NOTIFICATION_THRESHOLD_MAX_PACE",
		file: DOMAIN_CONSTANTS,
		doc: DOMAIN_GUIDE,
		mention: (pace: number) => `else \`${pace}\``,
	},
	{
		name: "MAX_REACHABLE_STARGAZERS",
		file: DOMAIN_CONSTANTS,
		doc: IO_GUIDE,
		mention: (cap: number) => `oldest ${grouped(cap)} stargazers`,
	},
	{
		name: "MIN_SNAPSHOTS_FOR_CHART",
		file: CHART_CONSTANTS,
		doc: CHART_GUIDE,
		mention: (count: number) => `\`< ${count}\` snapshots`,
	},
	{
		name: "maxDataPoints",
		file: CHART_CONSTANTS,
		doc: CHART_GUIDE,
		mention: (count: number) => `fixed at ${count} points`,
	},
	{
		name: "STARGAZER_PAGE_SIZE",
		file: "src/domain/sampling.ts",
		doc: IO_GUIDE,
		mention: (size: number) => `shorter than ${size}`,
	},
	{
		name: "SECURE_SMTP_PORT",
		file: "src/infrastructure/notification/email.ts",
		doc: IO_GUIDE,
		mention: (port: number) => `port === ${port}`,
	},
	{
		name: "MIN_THRESHOLD",
		file: "vitest.config.ts",
		doc: GUIDE,
		mention: (percent: number) => `${percent}%`,
	},
];

describe("the guides quote the constants the code declares", () => {
	it.each(QUOTED_CONSTANTS)("$name", ({ name, file, doc, mention }) => {
		expect(prose(doc)).toContain(mention(value({ file, name })));
	});

	it("pins the hand-maintained toolchain versions to package.json", () => {
		const manifest = JSON.parse(read("package.json")) as {
			engines: { node: string };
			packageManager: string;
		};
		const guide = prose(GUIDE);

		expect(guide).toContain(`Node **${manifest.engines.node}** (\`engines.node\`)`);
		expect(guide).toContain(`pnpm **${manifest.packageManager.replace("pnpm@", "")}** (\`packageManager\`)`);
	});

	it("keeps .nvmrc on the version engines.node declares", () => {
		const manifest = JSON.parse(read("package.json")) as { engines: { node: string } };

		expect(read(".nvmrc").trim()).toBe(manifest.engines.node);
	});

	it("states the compare-window tolerance in hours", () => {
		const hours = value({ file: "src/domain/snapshot.ts", name: "COMPARE_WINDOW_TOLERANCE_MS" }) / MS_PER_HOUR;
		const guide = prose(DOMAIN_GUIDE);

		expect(guide).toContain(`+ ${hours}h`);
		expect(guide).toContain(`${hours}-hour`);
	});

	it("states the bucket clamp both layers rely on", () => {
		const min = value({ file: "src/domain/star-history.ts", name: "MIN_HISTORY_BUCKETS" });
		const max = value({ file: "src/domain/star-history.ts", name: "MAX_HISTORY_BUCKETS" });

		expect(prose(DOMAIN_GUIDE)).toContain(`clamp(maxPoints, ${min}, ${max})`);
		expect(prose("src/config/CLAUDE.md")).toContain(`capped at ${max}`);
	});

	it("derives the reachable page cap rather than restating it", () => {
		const pages = Math.floor(
			value({ file: DOMAIN_CONSTANTS, name: "MAX_REACHABLE_STARGAZERS" }) /
				value({ file: "src/domain/sampling.ts", name: "STARGAZER_PAGE_SIZE" }),
		);

		expect(prose(IO_GUIDE)).toContain(`is ${pages} because`);
	});

	it("states the SVG canvas, its margins and what they imply", () => {
		const width = value({ file: CHART_CONSTANTS, name: "width" });
		const height = value({ file: CHART_CONSTANTS, name: "height" });
		const margin = Object.fromEntries(
			objectLiteral({ file: CHART_CONSTANTS, name: "margin" })
				.split(",")
				.map((entry) => entry.split(":").map((part) => part.trim()))
				.filter(([side]) => side)
				.map(([side, size]) => [side, Number(size)]),
		) as Record<"top" | "right" | "bottom" | "left", number>;
		const guide = prose(CHART_GUIDE);

		expect(guide).toContain(`viewBox="0 0 ${width} ${height}"`);
		expect(guide).toContain(`{top:${margin.top},right:${margin.right},bottom:${margin.bottom},left:${margin.left}}`);
		expect(guide).toContain(`plot area ${width - margin.left - margin.right}x${height - margin.top - margin.bottom}`);
		expect(guide).toContain(`baseline y=${height - margin.bottom}`);
	});

	it("states the adaptive threshold ladder and its top milestone", () => {
		const ladder = [
			...arrayLiteral({ file: DOMAIN_CONSTANTS, name: "NOTIFICATION_THRESHOLDS" }).matchAll(THRESHOLD_RUNG_PATTERN),
		].map(([, limit, threshold]) => `\`<=${limit} → ${threshold}\``);
		const milestones = arrayLiteral({ file: DOMAIN_CONSTANTS, name: "STAR_MILESTONES" })
			.split(",")
			.map((entry) => Number(entry.trim().replace(NUMERIC_SEPARATOR_PATTERN, "")))
			.filter(Number.isFinite);
		const guide = prose(DOMAIN_GUIDE);

		expect(ladder.filter((rung) => !guide.includes(rung))).toEqual([]);
		expect([...guide.matchAll(QUOTED_RUNG_PATTERN)]).toHaveLength(ladder.length);
		expect(guide).toContain(`exactly ${grouped(Math.max(...milestones))}`);
	});

	it("states the default SMTP port on both surfaces that name it", () => {
		const port = declaration({
			file: "src/infrastructure/notification/email.ts",
			name: "DEFAULT_SMTP_PORT",
		}).replace(QUOTE_PATTERN, "");

		expect(prose(IO_GUIDE)).toContain(`falls back to \`${port}\``);
		expect(prose("src/config/CLAUDE.md")).toContain(`\`"${port}"\``);
	});

	it("keeps MS_PER_YEAR uncorrected for leap years", () => {
		expect(prose(DOMAIN_GUIDE)).toContain(`\`${declaration({ file: DOMAIN_CONSTANTS, name: "MS_PER_YEAR" })}\``);
	});
});

const GLOSSARY = "CONTEXT.md";
const GLOSSARY_TERM_PATTERN = /^\*\*(.+?)\*\*:/gm;
const NON_LETTER_PATTERN = /[^a-z]/gi;

const flatten = (text: string): string => text.replace(NON_LETTER_PATTERN, "").toLowerCase();

describe("the glossary is ubiquitous language, not decoration", () => {
	it("uses every term it defines somewhere outside itself", () => {
		const terms = [...read(GLOSSARY).matchAll(GLOSSARY_TERM_PATTERN)].map(([, term]) => term);
		const corpus = DOCS.map(toPosix)
			.filter((doc) => doc !== GLOSSARY)
			.map(read)
			.join("\n");
		const flattened = flatten(corpus);
		const unused = terms.filter((term) => !corpus.includes(term) && !flattened.includes(flatten(term)));

		expect(terms.length).toBeGreaterThan(0);
		expect(unused).toEqual([]);
	});
});

describe("citations name symbols, not line numbers", () => {
	it("cites no file:line anywhere outside the rule that forbids it", () => {
		const cited = DOCS.map(toPosix)
			.filter((doc) => !LINE_CITATION_ALLOWLIST.has(doc))
			.flatMap((doc) => [...read(doc).matchAll(LINE_CITATION_PATTERN)].map((match) => `${doc} -> ${match[0]}`));

		expect(cited).toEqual([]);
	});
});

describe("the i18n key table matches the bundles", () => {
	it("lists every section and every key of en.json, and invents none", () => {
		const bundle = JSON.parse(read("src/i18n/en.json")) as Record<string, Record<string, unknown>>;
		const documented = new Map(
			[...read(I18N_PAGE).matchAll(I18N_SECTION_ROW_PATTERN)].map(([, section, keys]) => [
				section,
				[...keys.matchAll(I18N_KEY_PATTERN)].map(([, key]) => key).sort(),
			]),
		);
		const actualKeys = (section: Record<string, unknown>): string[] =>
			Object.entries(section)
				.flatMap(([key, value]) =>
					value !== null && typeof value === "object"
						? Object.keys(value as Record<string, unknown>).map((leaf) => `${key}.${leaf}`)
						: [key],
				)
				.sort();

		const mismatches = [
			...Object.keys(bundle)
				.filter((section) => !documented.has(section))
				.map((section) => `undocumented section: ${section}`),
			...[...documented.keys()]
				.filter((section) => !(section in bundle))
				.map((section) => `section is not in en.json: ${section}`),
			...Object.entries(bundle)
				.filter(([section]) => documented.has(section))
				.flatMap(([section, keys]) => {
					const expected = actualKeys(keys);
					const listed = documented.get(section) ?? [];

					return expected.join() === listed.join()
						? []
						: [`${section}: documented [${listed.join(", ")}] but en.json has [${expected.join(", ")}]`];
				}),
		];

		expect(documented.size).toBeGreaterThan(0);
		expect(mismatches).toEqual([]);
	});
});

describe("the documented data-branch format matches the writer", () => {
	it("shows the version stars-data.json is actually stamped with", () => {
		const stamped = read(STORAGE_MODULE).match(DATA_FORMAT_VERSION_PATTERN)?.[1];
		const stale = HISTORY_FILE_SURFACES.flatMap((surface) =>
			[...read(surface).matchAll(DOCUMENTED_VERSION_PATTERN)]
				.map(([, documented]) => documented)
				.filter((documented) => documented !== stamped)
				.map((documented) => `${surface} shows version ${documented}, storage.ts writes ${stamped}`),
		);

		expect(stamped).toBeDefined();
		expect(stale).toEqual([]);
	});
});

describe("the source follows the named-parameter convention", () => {
	it("is the rule the root guide states", () => {
		expect(read("CLAUDE.md")).toContain("One argument is positional; two or more are one object");
	});

	it("declares no function or arrow taking two or more positional parameters", () => {
		const sources = walk({ dir: "src", keep: (filename) => filename.endsWith(".ts") });
		const declaration = /(?:function\s+\w+|=)\s*\(\s*\w+\s*:\s*[^,()]+,\s*\w+\s*:/g;
		const offenders = sources.flatMap((file) =>
			[...read(file).matchAll(declaration)].map(
				(match) => `${toPosix(file)} -> ${match[0].replace(/\s+/g, " ").trim()}`,
			),
		);

		expect(offenders).toEqual([]);
	});
});

describe("the layer table is the import contract", () => {
	const layerTable = readLayerTable();
	const layers = new Set(layerTable.map(({ layer }) => layer));
	const allowed = new Map(layerTable.map(({ layer, mayImport }) => [layer, mayImport]));
	const sources = walk({ dir: "src", keep: (filename) => filename.endsWith(".ts") });
	const isTest = (file: string): boolean => file.endsWith(".test.ts");
	const crossLayerEdges = (file: string): LayerEdge[] =>
		layerEdgesIn(file).filter(({ from, to }) => from !== to && layers.has(to));

	it("tabulates every layer the tree has, plus the entry point", () => {
		const onDisk = fs
			.readdirSync("src", { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name);

		expect([...layers].sort()).toEqual([...onDisk, ENTRY_LAYER].sort());
	});

	it("lets every source file import only the layers its row allows", () => {
		const forbidden = sources
			.filter((file) => !isTest(file))
			.flatMap(crossLayerEdges)
			.filter(({ from, to }) => !allowed.get(from)?.has(to))
			.map(({ file, from, to, specifier }) => `${file}: ${from} -> ${to} ("${specifier}")`);

		expect([...new Set(forbidden)].sort()).toEqual([]);
	});

	it("lets no source file reach another layer by a relative path", () => {
		const relative = sources
			.filter((file) => !isTest(file))
			.flatMap(crossLayerEdges)
			.filter(({ specifier }) => specifier.startsWith("."))
			.map(({ file, to, specifier }) => `${file} -> ${to} ("${specifier}")`);

		expect(relative.sort()).toEqual([]);
	});

	it("keeps the pure layers free of the shell's dependencies", () => {
		const impure = sources
			.filter((file) => !isTest(file) && PURE_LAYERS.has(layerOf(file)))
			.flatMap((file) =>
				specifiersIn(file)
					.filter((specifier) => IMPURE_PREFIXES.some((prefix) => specifier.startsWith(prefix)))
					.map((specifier) => `${toPosix(file)} -> "${specifier}"`),
			);

		expect(impure.sort()).toEqual([]);
	});

	it("is the purity rule the root guide states", () => {
		expect(read(GUIDE)).toContain("`domain`, `presentation` and `i18n` must stay pure");
	});

	it("lets a test file import what its own layer may, and names every test that does not", () => {
		const crossings = sources
			.filter(isTest)
			.flatMap(crossLayerEdges)
			.filter(({ from, to }) => !TEST_LAYER_EXEMPT_TARGETS.has(to) && !allowed.get(from)?.has(to))
			.map(({ file, to, specifier }) => `${file} -> ${to} ("${specifier}")`);

		expect([...new Set(crossings)].sort()).toEqual([...TEST_LAYER_CROSSINGS].sort());
	});
});
