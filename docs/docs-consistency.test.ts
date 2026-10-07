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
const GUIDE = "AGENTS.md";
const EXACT_VERSION = /^\d+\.\d+\.\d+$/;
const VERSIONS_SECTION = /^## Versions$([\s\S]*?)^## /m;
const QUOTED_VERSION = /\d+\.\d+/;
const REPINNED_RUNTIME = /^\s*(?:node-version|version|ruby-version|wranglerVersion):\s*["']?\d/m;
const CONTRIBUTOR_GUIDE = ".github/CONTRIBUTING.md";
const UNDOCUMENTED_SCRIPTS = new Set(["prepare"]);
const OUTPUT_SURFACES = [
	"README.md",
	"ARCHITECTURE.md",
	"docs/wiki/API-Reference.md",
	"docs/wiki/Viewing-Reports.md",
	"src/application/AGENTS.md",
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
const MERMAID_DIAGRAM_PATTERN = /```mermaid\n([\s\S]*?)```/g;
const MERMAID_FRONT_MATTER_PATTERN = /^---\n([\s\S]*?)\n---\n/;
const DAGRE_LAYOUT_PATTERN = /^\s+layout: dagre$/m;

const LINE_CITATION_ALLOWLIST = new Set([ADR_TEMPLATE]);

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
	...["AGENTS.md", "ARCHITECTURE.md", "CODING_STANDARDS.md", "GLOSSARY.md", "README.md"].filter((doc) =>
		fs.existsSync(doc),
	),
	...walk({ dir: ".github", keep: isMarkdown }),
	...walk({ dir: "docs", keep: isMarkdown }),
	...walk({ dir: "src", keep: (filename) => filename === "AGENTS.md" }),
];

const isTestFile = (filename: string): boolean => filename.endsWith(".test.ts");

const TEST_FILENAMES = new Set(
	[
		...walk({ dir: "src", keep: isTestFile }),
		...walk({ dir: "tests", keep: isTestFile }),
		...walk({ dir: "docs", keep: isTestFile }),
	].map((file) => path.basename(file)),
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
const IMPURE_PREFIXES = ["node:", "@actions/", "@octokit/", "nodemailer", "js-yaml", "zod"];
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
	const cited = DOCS.flatMap((doc) => [...read(doc).matchAll(pattern)].map((match) => ({ doc, target: match[1] })));

	expect(cited.length, `no document matches ${pattern}`).toBeGreaterThan(0);

	return cited.filter(({ doc, target }) => isBroken(target, doc)).map(({ doc, target }) => `${doc} -> ${target}`);
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
				(target.includes(".md") || target.includes(".ts")) &&
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

	it("pins every Mermaid diagram to the layout: dagre it was drawn with, so a renderer that defaults to ELK cannot redraw it", () => {
		const diagrams = DOCS.flatMap((doc) =>
			[...read(doc).matchAll(MERMAID_DIAGRAM_PATTERN)].map(([, body]) => ({ doc, body })),
		);
		const pinned = (body: string): boolean =>
			DAGRE_LAYOUT_PATTERN.test(MERMAID_FRONT_MATTER_PATTERN.exec(body)?.[1] ?? "");

		expect(pinned("---\nconfig:\n  look: handDrawn\n  layout: dagre\n---\nflowchart TD")).toBe(true);
		expect(pinned("flowchart TD\n  a --> b")).toBe(false);
		expect(diagrams.length).toBeGreaterThan(0);
		expect(diagrams.filter(({ body }) => !pinned(body)).map(({ doc }) => doc)).toEqual([]);
	});

	it("embeds only sample charts that exist", () => {
		const embedded = [...read("docs/examples/README.md").matchAll(SVG_LINK_PATTERN)].map((match) => match[1]);
		const missing = embedded.filter((svg) => !fs.existsSync(path.join("docs/examples", svg)));

		expect(embedded.length).toBeGreaterThan(0);
		expect(missing).toEqual([]);
	});
});

describe("architecture decision records", () => {
	it("finds a decision beside the template, so every check below reads a real record", () => {
		expect(ADR_FILES.filter((file) => file !== ADR_TEMPLATE).length).toBeGreaterThan(0);
	});

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
		const references = DOCS.flatMap((doc) => adrReferencesIn(doc).map((number) => ({ doc, number })));
		const dangling = references
			.filter(({ number }) => !existing.has(number))
			.map(({ doc, number }) => `${doc} -> ADR ${number}`);

		expect(references.length).toBeGreaterThan(0);
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
		const overridable = Object.entries(DEFAULTS).filter(([key]) => key !== "sendOnNoChanges");
		const wrong = overridable
			.map(([key, value]) => {
				const name = toActionInputName(key);
				const stated = proseDefault(manifest.inputs[name]?.description ?? "");
				const actual = describedAs(value);

				return stated === actual ? null : `${name}: says ${stated ?? "(nothing)"}, is ${actual}`;
			})
			.filter((mismatch) => mismatch !== null);

		expect(overridable.length).toBeGreaterThan(0);
		expect(wrong).toEqual([]);
	});

	it("tells the reader every overridable input can also come from the config file", () => {
		const overridable = Object.keys(DEFAULTS)
			.filter((key) => key !== "sendOnNoChanges")
			.map(toActionInputName);
		const silent = overridable.filter(
			(name) => !(manifest.inputs[name]?.description ?? "").includes("(overrides config file)"),
		);

		expect(overridable.length).toBeGreaterThan(0);
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
		const inputs = Object.keys(manifest.inputs);
		const undocumented = inputs.filter(
			(input) => !configuration.includes(`\`${input}\``) && !reference.includes(`\`${input}\``),
		);

		expect(inputs.length).toBeGreaterThan(0);
		expect(undocumented).toEqual([]);
	});
});

const PINNED_INPUT = "github-token";
const NAME_ROW_PATTERN = /^\| `([a-z][a-z\d-]*)`/gm;
const OPTION_HEADING_PATTERN = /^### `([a-z][a-z\d-]*)`$/gm;
const ORDERED_SURFACES = [
	"README.md",
	"docs/wiki/API-Reference.md",
	"docs/wiki/Viewing-Reports.md",
	"src/application/AGENTS.md",
];
const OUTPUT_LINE_DOC = "ARCHITECTURE.md";
const BACKTICKED_NAME_PATTERN = /`([a-z][a-z\d-]*)`/g;
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
		expect(declaredInputs.length).toBeGreaterThan(0);
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

	it("names every output in that order where ARCHITECTURE.md lists them in one line", () => {
		const line = read(OUTPUT_LINE_DOC)
			.split("\n")
			.find((candidate) => declaredOutputs.every((output) => candidate.includes(`\`${output}\``)));
		const firstMentions = new Set(
			[...(line ?? "").matchAll(BACKTICKED_NAME_PATTERN)]
				.map(([, name]) => name)
				.filter((name) => declaredOutputs.includes(name)),
		);

		expect([...firstMentions]).toEqual(inOrder(declaredOutputs));
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
	devDependencies: Record<string, string>;
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
		expect(documentedScripts.length).toBeGreaterThan(0);
		expect(documentedScripts.filter((script) => !(script in pkg.scripts))).toEqual([]);
	});

	it("documents every script that is not deliberately left out", () => {
		const missing = Object.keys(pkg.scripts).filter(
			(script) => !UNDOCUMENTED_SCRIPTS.has(script) && !documentedScripts.includes(script),
		);

		expect(Object.keys(pkg.scripts).length).toBeGreaterThan(0);
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
		const missing = layerRows.map(({ layer }) => `src/${layer}/AGENTS.md`).filter((file) => !fs.existsSync(file));

		expect(layerRows.length).toBeGreaterThan(0);
		expect(missing).toEqual([]);
	});

	it("runs no package script through a shell substitution, which cmd on Windows passes on as literal text", () => {
		const substituting = Object.entries(pkg.scripts)
			.filter(([, command]) => command.includes("$(") || command.includes("`"))
			.map(([script]) => script);

		expect(Object.keys(pkg.scripts).length).toBeGreaterThan(0);
		expect(substituting).toEqual([]);
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
const DOMAIN_GUIDE = "src/domain/AGENTS.md";
const CHART_GUIDE = "src/presentation/AGENTS.md";
const IO_GUIDE = "src/infrastructure/AGENTS.md";

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
		file: "vitest.config.mts",
		doc: GUIDE,
		mention: (percent: number) => `${percent}%`,
	},
];

describe("the guides quote the constants the code declares", () => {
	it.each(QUOTED_CONSTANTS)("$name", ({ name, file, doc, mention }) => {
		expect(prose(doc)).toContain(mention(value({ file, name })));
	});

	it("names every runtime it pins", () => {
		const unnamed = ["Node", "pnpm"].flatMap((runtime) =>
			["AGENTS.md", CONTRIBUTOR_GUIDE].filter((doc) => !read(doc).includes(runtime)).map((doc) => `${doc}: ${runtime}`),
		);

		expect(unnamed).toEqual([]);
	});

	it("quotes a version for none of them, since nothing here would keep one current", () => {
		const section = read(GUIDE).match(VERSIONS_SECTION)?.[1] ?? "";
		const quoting = section.split("\n").filter((line) => QUOTED_VERSION.test(line));

		expect(section).not.toBe("");
		expect(quoting).toEqual([]);
	});

	it("pins Node once: .nvmrc and engines.node are one fact, so they say the same thing", () => {
		const manifest = JSON.parse(read("package.json")) as { engines: { node: string } };

		expect(read(".nvmrc").trim()).toBe(manifest.engines.node);
	});

	it("pins pnpm once, through packageManager", () => {
		const manifest = JSON.parse(read("package.json")) as { packageManager: string };

		expect(manifest.packageManager.split("@")[0]).toBe("pnpm");
	});

	it("pins every runtime to an exact version, since a range has no one version to compare", () => {
		const manifest = JSON.parse(read("package.json")) as { engines: { node: string }; packageManager: string };

		expect(manifest.engines.node).toMatch(EXACT_VERSION);
		expect(manifest.packageManager.split("@")[1]).toMatch(EXACT_VERSION);
	});

	it("lets no workflow or composite action pin a runtime the manifest already pins, a copy no rule compares", () => {
		const candidates = walk({ dir: ".github", keep: (filename) => filename.endsWith(".yml") });
		const repinned = candidates.filter((file) => REPINNED_RUNTIME.test(read(file)));

		expect(candidates.length).toBeGreaterThan(0);
		expect(repinned).toEqual([]);
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
		expect(prose("src/config/AGENTS.md")).toContain(`capped at ${max}`);
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

		expect(ladder.length).toBeGreaterThan(0);
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
		expect(prose("src/config/AGENTS.md")).toContain(`\`"${port}"\``);
	});

	it("keeps MS_PER_YEAR uncorrected for leap years", () => {
		expect(prose(DOMAIN_GUIDE)).toContain(`\`${declaration({ file: DOMAIN_CONSTANTS, name: "MS_PER_YEAR" })}\``);
	});
});

const GLOSSARY = "GLOSSARY.md";
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

interface BundleKeyReadParams {
	code: string;
	path: string;
}

const leafPathsOf = (bundle: Record<string, unknown>, prefix = ""): string[] =>
	Object.entries(bundle).flatMap(([key, value]) =>
		value !== null && typeof value === "object"
			? leafPathsOf(value as Record<string, unknown>, `${prefix}${key}.`)
			: [`${prefix}${key}`],
	);

const isBundleKeyRead = ({ code, path }: BundleKeyReadParams): boolean => {
	const [section, ...rest] = path.split(".");
	const byName = new RegExp(`\\b${section}\\.${rest.join("\\.")}\\b`);
	const byIndex = new RegExp(`\\b${section}\\[`);

	return byName.test(code) || (byIndex.test(code) && code.includes(`"${rest.at(-1)}"`));
};

describe("every bundle key has a reader", () => {
	it("reads every key of en.json in production code, by name or through its section's index, since an unread key is still translated in every bundle", () => {
		const bundle = JSON.parse(read("src/i18n/en.json")) as Record<string, unknown>;
		const code = PRODUCTION_FILES.filter((file) => !file.startsWith("src/i18n/"))
			.map(read)
			.join("\n");
		const paths = leafPathsOf(bundle);

		expect(leafPathsOf({ a: { b: "x", c: { d: "y" } } })).toEqual(["a.b", "a.c.d"]);
		expect(isBundleKeyRead({ code: "t.report.trend", path: "report.trend" })).toBe(true);
		expect(isBundleKeyRead({ code: "t.report.trendLine", path: "report.trend" })).toBe(false);
		expect(isBundleKeyRead({ code: "t.report.badges.new", path: "report.badges.new" })).toBe(true);
		expect(isBundleKeyRead({ code: 't.forecast[LABELS[m]]; const L = "aggregate";', path: "forecast.aggregate" })).toBe(
			true,
		);
		expect(isBundleKeyRead({ code: 'const L = "aggregate";', path: "forecast.aggregate" })).toBe(false);
		expect(paths.length).toBeGreaterThan(0);
		expect(paths.filter((path) => !isBundleKeyRead({ code, path }))).toEqual([]);
	});
});

describe("the documented data-branch format matches the writer", () => {
	it("shows the version stars-data.json is actually stamped with", () => {
		const stamped = read(STORAGE_MODULE).match(DATA_FORMAT_VERSION_PATTERN)?.[1];
		const shown = HISTORY_FILE_SURFACES.flatMap((surface) =>
			[...read(surface).matchAll(DOCUMENTED_VERSION_PATTERN)].map(([, documented]) => ({ surface, documented })),
		);
		const stale = shown
			.filter(({ documented }) => documented !== stamped)
			.map(({ surface, documented }) => `${surface} shows version ${documented}, storage.ts writes ${stamped}`);

		expect(stamped).toBeDefined();
		expect(shown.length).toBeGreaterThan(0);
		expect(stale).toEqual([]);
	});
});

describe("the source follows the named-parameter convention", () => {
	it("is the rule the root guide states", () => {
		expect(read("AGENTS.md")).toContain("One argument is positional; two or more are one object");
	});

	it("declares no function or arrow taking two or more positional parameters", () => {
		const sources = walk({ dir: "src", keep: (filename) => filename.endsWith(".ts") });
		const declaration = /(?:function\s+\w+|=)\s*\(\s*(?:\w+|\{[^{}]*\})\s*:\s*[^,()]+,\s*(?:\w+|\{[^{}]*\})\s*:/g;
		const offenders = sources.flatMap((file) =>
			[...read(file).matchAll(declaration)].map(
				(match) => `${toPosix(file)} -> ${match[0].replace(/\s+/g, " ").trim()}`,
			),
		);

		expect(sources.length).toBeGreaterThan(0);
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

	it("reads sources, crossing and same-layer imports and pure-layer files, so no assertion below checks an empty list", () => {
		const edges = sources.flatMap(layerEdgesIn);
		const empty = Object.entries({
			sources,
			"crossing imports": sources.flatMap(crossLayerEdges),
			"same-layer imports": edges.filter(({ from, to }) => from === to),
			"pure-layer files": sources.filter((file) => !isTest(file) && PURE_LAYERS.has(layerOf(file))),
		})
			.filter(([, list]) => list.length === 0)
			.map(([census]) => census);

		expect(empty).toEqual([]);
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

	it("keeps every import inside a layer relative, tests included, so an alias always marks a crossing", () => {
		const aliased = sources
			.flatMap(layerEdgesIn)
			.filter(({ from, to, specifier }) => from === to && specifier.startsWith("@"))
			.map(({ file, specifier }) => `${file} -> "${specifier}"`);

		expect(aliased.sort()).toEqual([]);
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

const VERSIONED_DEPENDENCIES: Record<string, string[]> = {
	astro: ["Astro"],
	"@astrojs/starlight": ["Starlight"],
	effect: ["Effect"],
	next: ["Next", "Next.js"],
	react: ["React"],
	tailwindcss: ["Tailwind", "Tailwind CSS"],
	typescript: ["TypeScript"],
	wrangler: ["wrangler", "Wrangler"],
	zod: ["Zod", "zod"],
};
const escapeForRegExp = (name: string): string => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const statedVersionPattern = (names: string[]): RegExp =>
	new RegExp(`\\b(?:${names.map(escapeForRegExp).join("|")})\\s+(?:v|@)?\\d+(?:\\.\\d+)*\\b`, "g");
interface PolicedNamesParams {
	readonly declared: Set<string>;
	readonly runtimes: string[];
}
const policedNames = ({ declared, runtimes }: PolicedNamesParams): string[] => [
	...runtimes,
	...Object.entries(VERSIONED_DEPENDENCIES)
		.filter(([dependency]) => declared.has(dependency))
		.flatMap(([, names]) => names),
];
const declaredIn = (manifests: { dependencies?: object; devDependencies?: object }[]): Set<string> =>
	new Set(manifests.flatMap((manifest) => Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })));
const POLICED_NAMES = policedNames({
	declared: declaredIn([JSON.parse(read("package.json"))]),
	runtimes: ["Node", "Node.js", "pnpm"],
});
const STATED_VERSION = statedVersionPattern(POLICED_NAMES);
const SHIPPED_RUNTIME = read("action.yml").match(/^\s*using:\s*['"]?(node\d+)/m)?.[1] ?? "";
const SHIPPED_MAJOR = `Node ${SHIPPED_RUNTIME.replace("node", "")}`;
const SKIPPED_DOCUMENT_DIRECTORIES = new Set(["node_modules", "dist", ".git", "adr"]);

const markdownDocuments = (dir: string): string[] =>
	fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) return SKIPPED_DOCUMENT_DIRECTORIES.has(entry.name) ? [] : markdownDocuments(full);
		return entry.name.endsWith(".md") && entry.name !== "CHANGELOG.md" ? [full] : [];
	});

describe("stated versions, since a manifest is the only copy a bot keeps current", () => {
	it("polices the runtimes and every versioned dependency the manifests declare, and nothing else", () => {
		expect(POLICED_NAMES).toEqual(expect.arrayContaining(["Node", "pnpm"]));
		expect(POLICED_NAMES.length).toBeGreaterThan(2);
	});

	it("reads the shipped runtime from action.yml and finds it quoted where the gap is explained", () => {
		expect(SHIPPED_RUNTIME).toMatch(/^node\d+$/);
		expect(read("esbuild.config.ts")).toContain(`"${SHIPPED_RUNTIME}"`);
		expect(read(GUIDE)).toContain(`\`${SHIPPED_RUNTIME}\``);
		expect(read(CONTRIBUTOR_GUIDE)).toContain(SHIPPED_MAJOR);
	});

	it("states the current version of nothing a bot moves, outside the ADRs, which are dated", () => {
		const documents = markdownDocuments(".");
		const stated = documents.flatMap((file) =>
			[...read(file).matchAll(STATED_VERSION)]
				.map(([match]) => match)
				.filter((match) => match !== SHIPPED_MAJOR)
				.map((match) => `${file}: ${match}`),
		);

		expect(documents.length).toBeGreaterThan(0);
		expect(stated).toEqual([]);
	});
});

const BREAKING_PARSER_OPTS = {
	headerPattern: "^(\\w*)(?:\\((.*)\\))?!?: (.*)$",
	breakingHeaderPattern: "^(\\w*)(?:\\((.*)\\))?!: (.*)$",
};
const COMMIT_PARSING_PLUGINS = ["@semantic-release/commit-analyzer", "@semantic-release/release-notes-generator"];
const RELEASE_CONFIG_PATTERN = /^\.releaserc(\.\w+)?$|^release\.config\./;
const SKIPPED_TREE_DIRECTORIES = new Set(["node_modules", ".git", "dist", "coverage"]);

type ReleasePlugin = string | [string, Record<string, unknown>?];

interface ReleaseConfig {
	plugins: ReleasePlugin[];
}

const releaseConfigs = (dir: string): string[] =>
	fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) return SKIPPED_TREE_DIRECTORIES.has(entry.name) ? [] : releaseConfigs(full);
		return RELEASE_CONFIG_PATTERN.test(entry.name) ? [full] : [];
	});

interface ParserOptsOfParams {
	plugins: ReleasePlugin[];
	name: string;
}

const parserOptsOf = ({ plugins, name }: ParserOptsOfParams): unknown => {
	const entry = plugins.find((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) === name);

	return Array.isArray(entry) ? entry[1]?.parserOpts : undefined;
};

describe("the release config parses the commit grammar commitlint accepts", () => {
	const configs = releaseConfigs(".");

	it("teaches every plugin that parses a commit message the same header grammar", () => {
		const wrong = configs.flatMap((file) => {
			const { plugins } = JSON.parse(read(file)) as ReleaseConfig;

			return COMMIT_PARSING_PLUGINS.filter(
				(name) => JSON.stringify(parserOptsOf({ plugins, name })) !== JSON.stringify(BREAKING_PARSER_OPTS),
			).map((name) => `${file}: ${name}`);
		});

		expect(configs.length).toBeGreaterThan(0);
		expect(wrong).toEqual([]);
	});

	it("commits the release, which commitlint never sees, under the release scope and [skip ci] so it starts no run", () => {
		const wrong = configs.flatMap((file) => {
			const { plugins } = JSON.parse(read(file)) as ReleaseConfig;
			const entry = plugins.find((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) === "@semantic-release/git");
			const message = Array.isArray(entry) ? String(entry[1]?.message) : "";

			return message.startsWith(`chore(release): \${nextRelease.version}`) && message.includes("[skip ci]")
				? []
				: [`${file}: ${message}`];
		});

		expect(wrong).toEqual([]);
	});

	it("commits only the files a release rewrites, and a version bump never touches the lockfile", () => {
		const committed = configs.flatMap((file) => {
			const { plugins } = JSON.parse(read(file)) as ReleaseConfig;
			const entry = plugins.find((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) === "@semantic-release/git");
			const assets = Array.isArray(entry) ? ((entry[1]?.assets as string[]) ?? []) : [];

			return assets.map((asset) => ({ file, asset }));
		});
		const lockfiles = committed
			.filter(({ asset }) => asset.includes("lock"))
			.map(({ file, asset }) => `${file}: ${asset}`);

		expect(committed.length).toBeGreaterThan(0);
		expect(lockfiles).toEqual([]);
	});
});

const SOURCE_FILES = walk({ dir: "src", keep: (filename) => filename.endsWith(".ts") }).map(toPosix);
const PRODUCTION_FILES = SOURCE_FILES.filter((file) => !isTestFile(file));
const TYPESCRIPT_FILE_PATTERN = /\.[cm]?ts$/;
const TYPESCRIPT_FILES = [
	...fs.readdirSync(".").filter((filename) => TYPESCRIPT_FILE_PATTERN.test(filename)),
	...walk({ dir: "src", keep: (filename) => TYPESCRIPT_FILE_PATTERN.test(filename) }),
	...walk({ dir: "docs", keep: (filename) => TYPESCRIPT_FILE_PATTERN.test(filename) }),
].map(toPosix);
const REGEX_PRECEDING_PUNCTUATORS = new Set([..."(,=:[!&|?{};+-*%<>~^"]);
const REGEX_PRECEDING_KEYWORDS = new Set(
	"await case delete do else in instanceof new of return throw typeof void yield".split(" "),
);
const WORD_CHARACTER = /[\w$]/;
const WHITESPACE_CHARACTER = /\s/;

interface ScanParams {
	text: string;
	start: number;
}

function endOfString({ text, start }: ScanParams): number {
	let index = start + 1;

	while (index < text.length && text[index] !== text[start] && text[index] !== "\n") {
		index += text[index] === "\\" ? 2 : 1;
	}

	return index + 1;
}

function endOfRegex({ text, start }: ScanParams): number {
	let index = start + 1;
	let inClass = false;

	while (index < text.length && text[index] !== "\n" && (inClass || text[index] !== "/")) {
		if (text[index] === "[") inClass = true;
		if (text[index] === "]") inClass = false;

		index += text[index] === "\\" ? 2 : 1;
	}

	index += 1;

	while (index < text.length && WORD_CHARACTER.test(text[index])) index += 1;

	return index;
}

function commentOffsets(text: string): number[] {
	const offsets: number[] = [];
	const openers: boolean[] = [];
	let inTemplate = false;
	let previous = "";
	let index = 0;

	while (index < text.length) {
		const character = text[index];
		const pair = text.slice(index, index + 2);

		if (inTemplate) {
			if (pair === "${") {
				openers.push(true);
				inTemplate = false;
				previous = "{";
			} else if (character === "`") {
				inTemplate = false;
				previous = character;
			}

			index += character === "\\" || pair === "${" ? 2 : 1;
		} else if (pair === "//" || pair === "/*") {
			const end = pair === "//" ? text.indexOf("\n", index) : text.indexOf("*/", index + 2) + 1;

			offsets.push(index);
			index = end <= 0 ? text.length : end + 1;
		} else if (character === '"' || character === "'") {
			index = endOfString({ text, start: index });
			previous = character;
		} else if (character === "`") {
			inTemplate = true;
			index += 1;
		} else if (
			character === "/" &&
			(previous === "" || REGEX_PRECEDING_PUNCTUATORS.has(previous) || REGEX_PRECEDING_KEYWORDS.has(previous))
		) {
			index = endOfRegex({ text, start: index });
			previous = character;
		} else if (WORD_CHARACTER.test(character)) {
			const start = index;

			while (index < text.length && WORD_CHARACTER.test(text[index])) index += 1;

			previous = text.slice(start, index);
		} else {
			if (character === "{") openers.push(false);
			if (character === "}") inTemplate = openers.pop() === true;
			if (!WHITESPACE_CHARACTER.test(character)) previous = character;

			index += 1;
		}
	}

	return offsets;
}

const lineOf = ({ text, start }: ScanParams): number => text.slice(0, start).split("\n").length;

describe("the TypeScript carries no comments", () => {
	it("has none in any .ts file, suppressions included: a line's reason lives in the commit, the pull request, an ADR or CODING_STANDARDS.md", () => {
		const commented = TYPESCRIPT_FILES.flatMap((file) => {
			const text = read(file);

			return commentOffsets(text).map((start) => `${file}:${lineOf({ text, start })}`);
		});

		expect(TYPESCRIPT_FILES.length).toBeGreaterThan(0);
		expect(commented).toEqual([]);
	});
});

const NAMED_IMPORT_PATTERN = /^import\s+(type\s+)?\{([^}]*)\}\s*from\s*"([^"]+)"/gm;
const TYPE_MODIFIER_PATTERN = /^type\s+/;
const IMPORT_ALIAS_PATTERN = /\s+as\s+\w+$/;

interface NamedImport {
	name: string;
	specifier: string;
	module: string | null;
	typeOnly: boolean;
}

function aliasTarget(specifier: string): string | null {
	const { paths } = tsconfig.compilerOptions;

	if (Object.hasOwn(paths, specifier)) return paths[specifier][0];

	const wildcard = Object.keys(paths).find((alias) => alias.endsWith("/*") && specifier.startsWith(alias.slice(0, -1)));

	return wildcard === undefined ? null : paths[wildcard][0].replace("*", specifier.slice(wildcard.length - 1));
}

interface ResolveModuleParams {
	specifier: string;
	file: string;
}

function resolveModule({ specifier, file }: ResolveModuleParams): string | null {
	const target = specifier.startsWith(".") ? path.join(path.dirname(file), specifier) : aliasTarget(specifier);

	if (target === null) return null;

	const resolved = [target, `${target}.ts`, path.join(target, "index.ts")].find(
		(candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
	);

	return resolved === undefined ? null : toPosix(path.normalize(resolved));
}

function namedImportsIn(file: string): NamedImport[] {
	return [...read(file).matchAll(NAMED_IMPORT_PATTERN)].flatMap(([, typeClause, names, specifier]) =>
		names
			.split(",")
			.map((entry) => entry.trim())
			.filter((entry) => entry !== "")
			.map((entry) => ({
				name: entry.replace(TYPE_MODIFIER_PATTERN, "").replace(IMPORT_ALIAS_PATTERN, ""),
				specifier,
				module: resolveModule({ specifier, file }),
				typeOnly: typeClause !== undefined || TYPE_MODIFIER_PATTERN.test(entry),
			})),
	);
}

const DESTRUCTURED_PARAMETER_PATTERN =
	/(?:function\s+(\w+)\s*(?:<[^>()]*>)?|(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?(?:<[^>()]*>)?)\s*\(\s*\{[^{}]*\}\s*:\s*(\{|[A-Z]\w*)/g;
const EXPORTED_PARAMS_PATTERN = /^export\s+(?:interface|type)\s+(\w+Params)\b/gm;
const SHARED_PARAMS_TYPES = new Set(["RenderReportParams", "ReportParams"]);
const INLINE_TYPE = "{";

const paramsTypeFor = (name: string): string => `${name[0].toUpperCase()}${name.slice(1)}Params`;

const PARAMS_DECLARATION_PATTERN =
	/(?:interface\s+(\w+Params)\b(?:\s*<[^>{]*>)?(\s+extends\s+[^{]+)?\s*\{|type\s+(\w+Params)\b(?:\s*<[^>=]*>)?\s*=\s*\{)/g;
const INLINE_SINGLE_FIELD_PATTERN =
	/[(]\s*\{\s*\w+\s*(?:=\s*[^}]+)?\}\s*:\s*\{\s*(?:readonly\s+)?\w+\??\s*:[^;{}]*;?\s*\}\s*[)]/;
const TYPE_OPENERS = "{([<";
const TYPE_CLOSERS = "})]>";
const FIELD_SEPARATORS = ";,\n";
const ARROW = "=>";

interface BracedBodyFromParams {
	source: string;
	open: number;
}

const bracedBodyFrom = ({ source, open }: BracedBodyFromParams): string => {
	let depth = 0;
	for (let index = open; index < source.length; index += 1) {
		if (source[index] === "{") depth += 1;
		if (source[index] === "}") {
			depth -= 1;
			if (depth === 0) return source.slice(open + 1, index);
		}
	}
	return "";
};

const fieldsOf = (body: string): string[] => {
	const fields: string[] = [];
	let depth = 0;
	let current = "";
	for (const token of body.split(ARROW).join("\u0000")) {
		if (TYPE_OPENERS.includes(token)) depth += 1;
		if (TYPE_CLOSERS.includes(token)) depth -= 1;
		if (FIELD_SEPARATORS.includes(token) && depth === 0) {
			if (current.trim()) fields.push(current.trim().replaceAll("\u0000", ARROW));
			current = "";
		} else current += token;
	}
	if (current.trim()) fields.push(current.trim().replaceAll("\u0000", ARROW));
	return fields;
};

describe("a parameter object is named for the function that takes it", () => {
	it("types a destructured parameter <FunctionName>Params, a type several functions share, or the record it unpacks", () => {
		const destructuring = SOURCE_FILES.flatMap((file) =>
			[...read(file).matchAll(DESTRUCTURED_PARAMETER_PATTERN)].map(([, declared, assigned, type]) => ({
				file,
				name: declared ?? assigned,
				type,
			})),
		);
		const misnamed = destructuring
			.filter(
				({ name, type }) =>
					type === INLINE_TYPE ||
					(type.endsWith("Params") && type !== paramsTypeFor(name) && !SHARED_PARAMS_TYPES.has(type)),
			)
			.map(({ file, name, type }) => `${file}: ${name} takes ${type === INLINE_TYPE ? "an inline type" : type}`);

		expect(destructuring.length).toBeGreaterThan(0);
		expect(misnamed).toEqual([]);
	});

	it("exports no *Params type but the ones several modules share", () => {
		const exportedParams = SOURCE_FILES.flatMap((file) =>
			[...read(file).matchAll(EXPORTED_PARAMS_PATTERN)].map(([, type]) => ({ file, type })),
		);
		const unshared = exportedParams
			.filter(({ type }) => !SHARED_PARAMS_TYPES.has(type))
			.map(({ file, type }) => `${file}: ${type}`);

		expect(exportedParams.length).toBeGreaterThan(0);
		expect(unshared).toEqual([]);
	});

	it("gives no *Params type and no inline parameter type a single field, since one argument travels positionally", () => {
		const declarations = TYPESCRIPT_FILES.flatMap((file) => {
			const source = read(file);
			return [...source.matchAll(PARAMS_DECLARATION_PATTERN)].map((match) => ({
				file,
				name: match[1] ?? match[3],
				extended: match[2] !== undefined,
				fields: fieldsOf(bracedBodyFrom({ source, open: (match.index ?? 0) + match[0].length - 1 })),
			}));
		});
		const single = [
			...declarations
				.filter(({ extended, fields }) => !extended && fields.length < 2)
				.map(({ file, name }) => `${file}: ${name}`),
			...TYPESCRIPT_FILES.filter((file) => INLINE_SINGLE_FIELD_PATTERN.test(read(file))).map(
				(file) => `${file}: an inline type`,
			),
		];

		expect(declarations.length).toBeGreaterThan(0);
		expect(fieldsOf("check: (value: string) => boolean;\n\terror?: Error;")).toEqual([
			"check: (value: string) => boolean",
			"error?: Error",
		]);
		expect(single).toEqual([]);
	});
});

const RUNTIME_EXPORT_PATTERN = /^export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/gm;
const MANIFEST_TESTS = ["src/config/action-inputs.test.ts", "docs/docs-consistency.test.ts"];
const TEST_SUPPORT_DIRECTORY = "src/shared/tests/";

describe("every export has a reader", () => {
	it("gives each runtime export a reader outside its module: production code, or a test comparing it with action.yml", () => {
		const readers = new Set(
			[...PRODUCTION_FILES, ...MANIFEST_TESTS].flatMap((file) =>
				namedImportsIn(file)
					.filter(({ typeOnly }) => !typeOnly)
					.map(({ module, name }) => `${module}#${name}`),
			),
		);
		const exports = PRODUCTION_FILES.filter((file) => !file.startsWith(TEST_SUPPORT_DIRECTORY)).flatMap((file) =>
			[...read(file).matchAll(RUNTIME_EXPORT_PATTERN)].map(([, name]) => `${file}#${name}`),
		);
		const unread = exports.filter((exported) => !readers.has(exported));

		expect(readers.size).toBeGreaterThan(0);
		expect(exports.length).toBeGreaterThan(0);
		expect(unread).toEqual([]);
	});
});

const GLOBAL_REGEX_DECLARATION_PATTERN = /^(?:export\s+)?const\s+(\w+)\s*=\s*\/.+\/[a-z]*g[a-z]*;$/gm;

describe("a global regex keeps no state between calls", () => {
	it("uses a module-level global regex only with replaceAll or matchAll, which reset its lastIndex", () => {
		const declared = SOURCE_FILES.flatMap((file) =>
			[...read(file).matchAll(GLOBAL_REGEX_DECLARATION_PATTERN)].map(([, name]) => ({ file, name })),
		);
		const misused = declared
			.filter(({ file, name }) => {
				const text = read(file);

				return (
					[...text.matchAll(new RegExp(`\\b${name}\\b`, "g"))].length - 1 !==
					[...text.matchAll(new RegExp(`\\.(?:replaceAll|matchAll)\\(\\s*${name}\\b`, "g"))].length
				);
			})
			.map(({ file, name }) => `${file}: ${name}`);

		expect(declared.length).toBeGreaterThan(0);
		expect(misused).toEqual([]);
	});
});

const CLOCK_READ_PATTERN = /new Date\(\s*\)|Date\.now\(\s*\)/g;
const INJECTED_CLOCK_PATTERN = /\bnow\s*(?:=|\?\?)\s*new Date\(\s*\)/g;
const LOCAL_DATE_PATTERN = /new Date\([^()]*,/g;
const ZONELESS_TIMESTAMP_PATTERN = /["'`]\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?["'`]/g;

describe("time is injected and zoned", () => {
	it("reads the clock in a pure layer only as the default of an injectable now", () => {
		const clocks = PRODUCTION_FILES.filter((file) => PURE_LAYERS.has(layerOf(file))).map((file) => ({
			file,
			reads: [...read(file).matchAll(CLOCK_READ_PATTERN)].length,
			injected: [...read(file).matchAll(INJECTED_CLOCK_PATTERN)].length,
		}));
		const unparameterised = clocks
			.filter(({ reads, injected }) => reads !== injected)
			.map(({ file, reads, injected }) => `${file}: ${reads} clock reads, ${injected} through now`);

		expect(clocks.reduce((total, { reads }) => total + reads, 0)).toBeGreaterThan(0);
		expect(unparameterised).toEqual([]);
	});

	it("builds no Date from local-time parts and writes no timestamp without its zone, so no result depends on where it runs", () => {
		const local = SOURCE_FILES.flatMap((file) =>
			[...read(file).matchAll(LOCAL_DATE_PATTERN), ...read(file).matchAll(ZONELESS_TIMESTAMP_PATTERN)].map(
				([match]) => `${file}: ${match}`,
			),
		);

		expect(SOURCE_FILES.length).toBeGreaterThan(0);
		expect(local).toEqual([]);
	});
});

const DECLARATION_MODULES = new Set(["types.ts", "defaults.ts", "constants.ts"]);
const ENTRY_MODULE = "src/index.ts";
const SPEC_ELSEWHERE = new Map([["src/infrastructure/github/client.ts", "src/infrastructure/github/filters.test.ts"]]);
const TEST_RUNNER_PATTERN = /from\s*"vitest"|\b(?:vi|expect)\s*[.(]|\b(?:before|after)(?:Each|All)\s*\(/;
const UNIT_TEST_FILES = SOURCE_FILES.filter(isTestFile);
const TEARDOWN_HOOK_PATTERN = /\bafter(?:Each|All)\(/g;
const SETUP_HOOK_PATTERN = /\bbeforeEach\(/g;
const MOCK_IMPLEMENTATION_PATTERN =
	/\bvi\.mocked\(([\w$.]+)\)\.mock(?:ReturnValue|Implementation|ResolvedValue|RejectedValue)(?:Once)?\(/g;
const RESET_ALL_MOCKS = "vi.resetAllMocks()";
const CLEAR_ALL_MOCKS = "vi.clearAllMocks()";
const RESTORE_ALL_MOCKS = "vi.restoreAllMocks()";
const SPY_PATTERN = /\bvi\.spyOn\(/;
const STUB_UNDOS = [
	{ stub: /\bvi\.stubGlobal\(/, undos: ["vi.unstubAllGlobals()"] },
	{ stub: /\bvi\.stubEnv\(/, undos: ["vi.unstubAllEnvs()"] },
	{ stub: /\bvi\.spyOn\(/, undos: ["vi.restoreAllMocks()", ".mockRestore()"] },
	{ stub: /\bvi\.useFakeTimers\(/, undos: ["vi.useRealTimers()"] },
];
const PROCESS_ENV_WRITE_PATTERN = /\bprocess\.env(?:\.\w+|\[[^\]]+\])\s*=(?!=)|\bdelete\s+process\.env\b/;
const REAL_CLOCK_YEAR_PATTERN = /new Date\(\s*\)\.get(?:UTC)?FullYear\(\)/;
const CLOCK_BRACKET_PATTERN = /\bconst\s+(?:before|after)\w*\s*=\s*(?:Math\.floor\()?Date\.now\(\)/;

interface HookBodiesParams {
	text: string;
	hook: RegExp;
}

function hookBodies({ text, hook }: HookBodiesParams): string[] {
	return [...text.matchAll(hook)].map(({ index }) => {
		const opening = text.indexOf("{", index);
		let depth = 0;

		for (let at = opening; at < text.length; at += 1) {
			if (text[at] === "{") depth += 1;
			if (text[at] === "}") depth -= 1;
			if (depth === 0) return text.slice(opening, at + 1);
		}

		return "";
	});
}

function missingUndos(text: string): string[] {
	const bodies = hookBodies({ text, hook: TEARDOWN_HOOK_PATTERN });

	return STUB_UNDOS.filter(({ stub }) => stub.test(text))
		.filter(({ undos }) => !bodies.some((body) => undos.some((undo) => body.includes(undo))))
		.map(({ undos }) => undos[0]);
}

function unresetMocks(text: string): string[] {
	const setups = hookBodies({ text, hook: SETUP_HOOK_PATTERN });
	const faked = [...new Set([...text.matchAll(MOCK_IMPLEMENTATION_PATTERN)].map(([, mock]) => mock))];
	const resetsAll = setups.some((body) => body.includes(RESET_ALL_MOCKS));

	return [
		...faked.filter((mock) => !resetsAll && !setups.some((body) => body.includes(`vi.mocked(${mock}).mockReset()`))),
		...(faked.length > 0 && text.includes(CLEAR_ALL_MOCKS) ? [CLEAR_ALL_MOCKS] : []),
	];
}

const restoresNothing = (text: string): boolean => text.includes(RESTORE_ALL_MOCKS) && !SPY_PATTERN.test(text);

describe("the tests", () => {
	it("give every module a colocated test, bar declarations, the entry point and the test support", () => {
		const modules = PRODUCTION_FILES.filter(
			(file) =>
				file !== ENTRY_MODULE &&
				!file.startsWith(TEST_SUPPORT_DIRECTORY) &&
				!DECLARATION_MODULES.has(path.basename(file)),
		);
		const untested = modules.filter(
			(file) => !fs.existsSync(SPEC_ELSEWHERE.get(file) ?? file.replace(TYPESCRIPT_FILE_PATTERN, ".test.ts")),
		);

		expect(modules.length).toBeGreaterThan(0);
		expect(untested).toEqual([]);
	});

	it("import the fixture factories into test files only", () => {
		const production = PRODUCTION_FILES.filter(
			(file) =>
				!file.startsWith(TEST_SUPPORT_DIRECTORY) &&
				specifiersIn(file).some((specifier) => resolveModule({ specifier, file })?.startsWith(TEST_SUPPORT_DIRECTORY)),
		);

		expect(PRODUCTION_FILES.length).toBeGreaterThan(0);
		expect(production).toEqual([]);
	});

	it("keep the fixture factories to defaults: no assertion, no mock, no setup", () => {
		const support = SOURCE_FILES.filter((file) => file.startsWith(TEST_SUPPORT_DIRECTORY));
		const running = support.filter((file) => TEST_RUNNER_PATTERN.test(read(file)));

		expect(support.length).toBeGreaterThan(0);
		expect(running).toEqual([]);
	});

	it("vary the process environment through vi.stubEnv and never write to it", () => {
		expect(UNIT_TEST_FILES.length).toBeGreaterThan(0);
		expect(UNIT_TEST_FILES.filter((file) => PROCESS_ENV_WRITE_PATTERN.test(read(file)))).toEqual([]);
	});

	it("undo every stubbed global, stubbed variable, spy and fake clock in an afterEach or afterAll, which a failing assertion cannot skip", () => {
		const stubbing = UNIT_TEST_FILES.filter((file) => STUB_UNDOS.some(({ stub }) => stub.test(read(file))));
		const leaking = UNIT_TEST_FILES.flatMap((file) => missingUndos(read(file)).map((undo) => `${file}: ${undo}`));

		expect(missingUndos('it("a", () => { vi.stubEnv("A", "1"); vi.unstubAllEnvs(); });')).toEqual([
			"vi.unstubAllEnvs()",
		]);
		expect(
			missingUndos('afterEach(() => { if (a) { b(); } spy.mockRestore(); }); const spy = vi.spyOn(a, "b");'),
		).toEqual([]);
		expect(stubbing.length).toBeGreaterThan(0);
		expect(leaking).toEqual([]);
	});

	it("pin the clock rather than read the year off it or bracket Date.now()", () => {
		const unpinned = UNIT_TEST_FILES.filter(
			(file) => REAL_CLOCK_YEAR_PATTERN.test(read(file)) || CLOCK_BRACKET_PATTERN.test(read(file)),
		);

		expect(REAL_CLOCK_YEAR_PATTERN.test("year: new Date().getUTCFullYear(),")).toBe(true);
		expect(CLOCK_BRACKET_PATTERN.test("const before = Math.floor(Date.now() / 1000);")).toBe(true);
		expect(UNIT_TEST_FILES.length).toBeGreaterThan(0);
		expect(unpinned).toEqual([]);
	});

	it("reset in a beforeEach every mock a test gives an implementation, which vi.clearAllMocks keeps for the next test", () => {
		const faking = UNIT_TEST_FILES.filter((file) => [...read(file).matchAll(MOCK_IMPLEMENTATION_PATTERN)].length > 0);
		const leaking = UNIT_TEST_FILES.flatMap((file) => unresetMocks(read(file)).map((mock) => `${file}: ${mock}`));

		expect(
			unresetMocks(
				'beforeEach(() => { vi.clearAllMocks(); }); it("a", () => { vi.mocked(fs.existsSync).mockReturnValue(true); });',
			),
		).toEqual(["fs.existsSync", CLEAR_ALL_MOCKS]);
		expect(
			unresetMocks(
				'beforeEach(() => { vi.mocked(run).mockReset(); }); it("a", () => { vi.mocked(run).mockImplementationOnce(f); });',
			),
		).toEqual([]);
		expect(faking.length).toBeGreaterThan(0);
		expect(leaking).toEqual([]);
	});

	it("call vi.restoreAllMocks only beside a vi.spyOn, the one kind of mock it restores", () => {
		expect(restoresNothing("afterEach(() => { vi.restoreAllMocks(); });")).toBe(true);
		expect(restoresNothing('afterEach(() => { vi.restoreAllMocks(); }); const spy = vi.spyOn(a, "b");')).toBe(false);
		expect(UNIT_TEST_FILES.length).toBeGreaterThan(0);
		expect(UNIT_TEST_FILES.filter((file) => restoresNothing(read(file)))).toEqual([]);
	});
});

const DOMAIN_DIRECTORY = "src/domain/";
const MEASUREMENT_MODULE = "src/domain/measurement.ts";
const APPLICATION_DIRECTORY = "src/application/";
const PRESENTATION_ALIAS = "@presentation/";
const PRESENTATION_ENTRY_POINTS = new Set(["renderRun", "renderEmptyRun", "resolveChartHistories"]);

describe("a layer is reached through its entry point", () => {
	it("imports the steps measureRun composes nowhere outside the domain, so their order cannot be got wrong", () => {
		const steps = new Set(
			namedImportsIn(MEASUREMENT_MODULE)
				.filter(({ typeOnly }) => !typeOnly)
				.map(({ name }) => name),
		);
		const reached = SOURCE_FILES.filter((file) => !file.startsWith(DOMAIN_DIRECTORY)).flatMap((file) =>
			namedImportsIn(file)
				.filter(({ name, module }) => steps.has(name) && module?.startsWith(DOMAIN_DIRECTORY))
				.map(({ name }) => `${file}: ${name}`),
		);

		expect(steps.size).toBeGreaterThan(0);
		expect(reached).toEqual([]);
	});

	it("renders from the application only through the presentation entry points", () => {
		const presentationImports = PRODUCTION_FILES.filter((file) => file.startsWith(APPLICATION_DIRECTORY)).flatMap(
			(file) =>
				namedImportsIn(file)
					.filter(({ typeOnly, specifier }) => !typeOnly && specifier.startsWith(PRESENTATION_ALIAS))
					.map(({ name }) => ({ file, name })),
		);
		const reached = presentationImports
			.filter(({ name }) => !PRESENTATION_ENTRY_POINTS.has(name))
			.map(({ file, name }) => `${file}: ${name}`);

		expect(presentationImports.length).toBeGreaterThan(0);
		expect(reached).toEqual([]);
	});
});

const INFRASTRUCTURE_DIRECTORY = "src/infrastructure/";
const PERSISTENCE_DIRECTORY = "src/infrastructure/persistence/";
const PERSISTENCE_ENTRY_POINTS = new Set(["withDataBranch", "writeHtmlReport"]);
const ALLOWED_ADAPTER_CROSSINGS = new Set(["persistence -> git"]);
const GIT_RUNNER = "src/infrastructure/git/commands.ts";
const GIT_RUNNER_CALL = "execFileSync";
const CHILD_PROCESS_SPECIFIERS = new Set(["node:child_process", "child_process"]);
const SHELL_OPTION_PATTERN = /\bshell\s*:/;
const CONFIG_VALUE_IMPORT_PATTERN = /^import(?!\s+type\b)[^;]*?from\s*"@config\/[^"]*"/gm;
const DATA_DIRECTORY_PATTERN = /\bdataDir\b/;

const adapterOf = (file: string): string => file.slice(INFRASTRUCTURE_DIRECTORY.length).split("/")[0];

describe("the infrastructure adapters keep to their folders", () => {
	const infrastructureFiles = SOURCE_FILES.filter((file) => file.startsWith(INFRASTRUCTURE_DIRECTORY));

	it("lets persistence import git, which it commits through, and no adapter import another", () => {
		const adapterImports = infrastructureFiles.flatMap((file) =>
			specifiersIn(file)
				.map((specifier) => resolveModule({ specifier, file }) ?? "")
				.filter((module) => module.startsWith(INFRASTRUCTURE_DIRECTORY) && adapterOf(module) !== adapterOf(file))
				.map((module) => ({ file, crossing: `${adapterOf(file)} -> ${adapterOf(module)}` })),
		);
		const crossings = adapterImports
			.filter(({ crossing }) => !ALLOWED_ADAPTER_CROSSINGS.has(crossing))
			.map(({ file, crossing }) => `${file}: ${crossing}`);

		expect(adapterImports.length).toBeGreaterThan(0);
		expect(crossings).toEqual([]);
	});

	it("lets nothing outside persistence import it past withDataBranch and writeHtmlReport, or hold dataDir", () => {
		const persistenceImports = SOURCE_FILES.filter((file) => !file.startsWith(PERSISTENCE_DIRECTORY)).flatMap((file) =>
			namedImportsIn(file)
				.filter(({ typeOnly, module }) => !typeOnly && module?.startsWith(PERSISTENCE_DIRECTORY))
				.map(({ name }) => ({ file, name })),
		);
		const reached = persistenceImports
			.filter(({ name }) => !PERSISTENCE_ENTRY_POINTS.has(name))
			.map(({ file, name }) => `${file}: ${name}`);
		const holding = SOURCE_FILES.filter(
			(file) => !file.startsWith(INFRASTRUCTURE_DIRECTORY) && DATA_DIRECTORY_PATTERN.test(read(file)),
		);

		expect(persistenceImports.length).toBeGreaterThan(0);
		expect(reached).toEqual([]);
		expect(holding).toEqual([]);
	});

	it("imports @config for types only, so GitHub's dialect never reaches the layer that reads the inputs", () => {
		const valued = infrastructureFiles.flatMap((file) =>
			[...read(file).matchAll(CONFIG_VALUE_IMPORT_PATTERN)].map(
				([statement]) => `${file}: ${statement.replaceAll(WHITESPACE_RUN_PATTERN, " ")}`,
			),
		);

		expect(infrastructureFiles.length).toBeGreaterThan(0);
		expect(valued).toEqual([]);
	});

	it("runs a child process only in git/commands.ts, through execFileSync and never a shell, since branch names and commit messages are user-controlled", () => {
		const spawning = PRODUCTION_FILES.filter(
			(file) => file !== GIT_RUNNER && specifiersIn(file).some((specifier) => CHILD_PROCESS_SPECIFIERS.has(specifier)),
		);
		const childProcessImports = namedImportsIn(GIT_RUNNER).filter(({ specifier }) =>
			CHILD_PROCESS_SPECIFIERS.has(specifier),
		);
		const otherCalls = childProcessImports.filter(({ name }) => name !== GIT_RUNNER_CALL).map(({ name }) => name);

		expect(childProcessImports.length).toBeGreaterThan(0);
		expect(spawning).toEqual([]);
		expect(otherCalls).toEqual([]);
		expect(SHELL_OPTION_PATTERN.test(read(GIT_RUNNER))).toBe(false);
	});
});

const ZOD_SPECIFIER_PATTERN = /^zod(?:\/|$)/;
const ZOD_MINI_IMPORT = 'import * as z from "zod/mini";';
const SCHEMA_DECLARATION_PATTERN = /^(?:export\s+)?const\s+(\w+)\s*=\s*z\./gm;
const SCHEMA_NAME_PATTERN = /^[A-Z][A-Za-z]*Schema$/;
const SCHEMA_PARSE_PATTERN = /\b(?:\w*Schema|schema|z)\.parse(?:Async)?\(/g;
const PARSED_CAST_PATTERN = /\b(?:JSON\.parse|yaml\.load)\((?:[^()]|\([^()]*\))*\)\s*as\b/g;
const SAFE_PARSE_PATTERN = /\.safeParse\(/g;
const REPORT_INPUT_PATTERN = /\breportInput:\s*true\b/g;
const ISSUE_WORDING = "describeIssue";

describe("data from outside the action is checked by a zod/mini schema", () => {
	it('imports zod only as import * as z from "zod/mini", since one import of zod bundles the classic build', () => {
		const importing = SOURCE_FILES.filter((file) =>
			specifiersIn(file).some((specifier) => ZOD_SPECIFIER_PATTERN.test(specifier)),
		);
		const wrong = importing.filter(
			(file) =>
				specifiersIn(file).filter((specifier) => ZOD_SPECIFIER_PATTERN.test(specifier)).length !== 1 ||
				!read(file).includes(ZOD_MINI_IMPORT),
		);

		expect(importing.length).toBeGreaterThan(0);
		expect(wrong).toEqual([]);
	});

	it("names each module-level schema <Concept>Schema and never calls parse, which throws zod's own English", () => {
		const declared = PRODUCTION_FILES.flatMap((file) =>
			[...read(file).matchAll(SCHEMA_DECLARATION_PATTERN)].map(([, name]) => ({ file, name })),
		);
		const misnamed = declared
			.filter(({ name }) => !SCHEMA_NAME_PATTERN.test(name))
			.map(({ file, name }) => `${file}: ${name}`);
		const parsing = PRODUCTION_FILES.flatMap((file) =>
			[...read(file).matchAll(SCHEMA_PARSE_PATTERN)].map(([call]) => `${file}: ${call}`),
		);

		expect(declared.length).toBeGreaterThan(0);
		expect(misnamed).toEqual([]);
		expect(parsing).toEqual([]);
	});

	it("runs every safeParse of a module that words an issue with reportInput, without which describeIssue finds nothing", () => {
		const wording = PRODUCTION_FILES.filter((file) => namedImportsIn(file).some(({ name }) => name === ISSUE_WORDING));
		const unreported = wording.filter(
			(file) =>
				[...read(file).matchAll(SAFE_PARSE_PATTERN)].length !== [...read(file).matchAll(REPORT_INPUT_PATTERN)].length,
		);

		expect(wording.length).toBeGreaterThan(0);
		expect(unreported).toEqual([]);
	});

	it("casts no JSON.parse or yaml.load result, since only a schema can type what they return", () => {
		const cast = PRODUCTION_FILES.flatMap((file) =>
			[...read(file).matchAll(PARSED_CAST_PATTERN)].map(
				([call]) => `${file}: ${call.replaceAll(WHITESPACE_RUN_PATTERN, " ")}`,
			),
		);

		expect([..."yaml.load(read(file)) as unknown".matchAll(PARSED_CAST_PATTERN)]).toHaveLength(1);
		expect(PRODUCTION_FILES.length).toBeGreaterThan(0);
		expect(cast).toEqual([]);
	});
});

const PRESENTATION_DIRECTORY = "src/presentation/";
const ESCAPING_MODULE = "src/presentation/escaping.ts";
const ESCAPE_ENTITY_PATTERN = /&(?:amp|lt|gt|quot|apos|#39);/;
const ESCAPER_FACTORY = "escapeFor(";
const ESCAPER_BINDING_PATTERN = /^const \w+ = escapeFor\(EscapeDialect\.[A-Z]+\);$/;
const COMPACT_COUNT_PATTERN = /\bformatCount\b/;
const FIXED_SPACE_MODULES = new Set([
	"src/presentation/badge.ts",
	"src/presentation/chart-spec.ts",
	"src/presentation/svg-chart.ts",
]);

describe("the presentation layer escapes and compacts in one place each", () => {
	const presentationFiles = PRODUCTION_FILES.filter((file) => file.startsWith(PRESENTATION_DIRECTORY));

	it("writes an escape entity only in escaping.ts", () => {
		const escaping = presentationFiles.filter(
			(file) => file !== ESCAPING_MODULE && ESCAPE_ENTITY_PATTERN.test(read(file)),
		);

		expect(presentationFiles.length).toBeGreaterThan(0);
		expect(escaping).toEqual([]);
	});

	it("binds each escaper once, at module load, to the dialect the renderer writes", () => {
		const bindings = presentationFiles
			.filter((file) => file !== ESCAPING_MODULE)
			.flatMap((file) =>
				read(file)
					.split("\n")
					.filter((line) => line.includes(ESCAPER_FACTORY))
					.map((line) => ({ file, line: line.trim() })),
			);
		const unbound = bindings
			.filter(({ line }) => !ESCAPER_BINDING_PATTERN.test(line))
			.map(({ file, line }) => `${file}: ${line}`);

		expect(bindings.length).toBeGreaterThan(0);
		expect(unbound).toEqual([]);
	});

	it("compacts a Star Count only where space is fixed, so a Report prints the exact figure", () => {
		const compacting = presentationFiles.filter(
			(file) => !FIXED_SPACE_MODULES.has(file) && COMPACT_COUNT_PATTERN.test(read(file)),
		);

		expect(presentationFiles.filter((file) => FIXED_SPACE_MODULES.has(file))).toHaveLength(FIXED_SPACE_MODULES.size);
		expect(compacting).toEqual([]);
	});
});

interface SingleOwner {
	rule: string;
	pattern: RegExp;
	owners: string[];
}

const SINGLE_OWNERS: SingleOwner[] = [
	{
		rule: "whether a History holds enough Snapshots to draw",
		pattern: /\bMIN_SNAPSHOTS_FOR_CHART\b/,
		owners: ["src/presentation/chart-spec.ts", "src/presentation/constants.ts"],
	},
	{
		rule: "whether a History holds enough Snapshots to fit a Forecast",
		pattern: /\bMIN_SNAPSHOTS_FOR_FORECAST\b/,
		owners: ["src/domain/constants.ts", "src/domain/forecast.ts"],
	},
	{
		rule: "the ISO date of a timestamp",
		pattern: /\.split\("T"\)/,
		owners: ["src/domain/formatting.ts"],
	},
];

describe("a rule with one owner is written nowhere else", () => {
	it("keeps the Snapshot minimums and the cut of an ISO date in the modules that own them, so no second copy drifts", () => {
		const misplaced = SINGLE_OWNERS.flatMap(({ rule, pattern, owners }) => {
			const holders = PRODUCTION_FILES.filter((file) => pattern.test(read(file)));

			return [
				...holders.filter((file) => !owners.includes(file)).map((file) => `${file}: restates ${rule}`),
				...owners.filter((file) => !holders.includes(file)).map((file) => `${file}: no longer holds ${rule}`),
			];
		});

		expect(SINGLE_OWNERS.length).toBeGreaterThan(0);
		expect(SINGLE_OWNERS.filter(({ owners }) => owners.length === 0)).toEqual([]);
		expect(SINGLE_OWNERS.map(({ pattern }) => pattern.test('stargazer.starredAt.split("T")[0]'))).toEqual([
			false,
			false,
			true,
		]);
		expect(misplaced).toEqual([]);
	});
});

const KNOWN_INCONSISTENCIES_HEADING = /^#{1,6}\s+(?:\d+\.\s+)?Known inconsistencies\b/im;

describe("the guides keep no list of known breaches", () => {
	it("fix a breach in the change that finds it, so no document holds a claim that nothing keeps true", () => {
		const listing = DOCS.filter((doc) => KNOWN_INCONSISTENCIES_HEADING.test(read(doc)));

		expect(KNOWN_INCONSISTENCIES_HEADING.test("## 8. Known inconsistencies\n\n- an entry\n")).toBe(true);
		expect(KNOWN_INCONSISTENCIES_HEADING.test("a breach is not a known inconsistencies list")).toBe(false);
		expect(DOCS.length).toBeGreaterThan(0);
		expect(listing).toEqual([]);
	});
});

const WIKI_DIRECTORY = "docs/wiki";
const WIKI_LINK_PATTERN = /\]\(<?([^)>\s]+)|\b(?:src|href)="([^"]+)"/g;
const EXTERNAL_TARGET_PATTERN = /^(?:[a-z]+:|#)/i;
const REPOSITORY_PATH_PATTERN = /^\.|\/|\.\w+(?:#|$)/;

describe("the wiki", () => {
	it("reaches a repository file only by an absolute URL, since sync-wiki.yml publishes docs/wiki to a repository of its own", () => {
		const links = walk({ dir: WIKI_DIRECTORY, keep: isMarkdown }).flatMap((page) =>
			[...read(page).matchAll(WIKI_LINK_PATTERN)].map(([, markdown, html]) => ({ page, target: markdown ?? html })),
		);
		const relative = links
			.filter(({ target }) => !EXTERNAL_TARGET_PATTERN.test(target) && REPOSITORY_PATH_PATTERN.test(target))
			.map(({ page, target }) => `${toPosix(page)} -> ${target}`);

		expect(links.length).toBeGreaterThan(0);
		expect(relative).toEqual([]);
	});
});

const YAML_FILE_PATTERN = /\.ya?ml$/;
const GENERATED_YAML = new Set(["pnpm-lock.yaml"]);
const YAML_COMMENT_PATTERN = /(?:^|\s)#/g;
const USES_PATTERN = /^\s*(?:-\s+)?uses:\s*(\S+)(.*)$/;
const SAME_REPOSITORY_ACTION_PATTERN = /^[.$]\//;
const SHA_PIN_PATTERN = /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/;
const PIN_COMMENT_PATTERN = /^\s+#\s\S+$/;
const TOOL_DIRECTIVE_PATTERN = /^#\s*(?:zizmor|yaml-language-server):/;
const RENOVATE_ANNOTATION_PATTERN = /^# Renovate security update: \S/;
const RENOVATE_ANNOTATED_FILE = "pnpm-workspace.yaml";

const yamlFiles = (dir: string): string[] =>
	fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) return SKIPPED_TREE_DIRECTORIES.has(entry.name) ? [] : yamlFiles(full);
		return YAML_FILE_PATTERN.test(entry.name) && !GENERATED_YAML.has(entry.name) ? [toPosix(full)] : [];
	});

const YAML_FILES = yamlFiles(".");

interface SameDocumentParams {
	text: string;
	parsed: string;
}

function sameDocument({ text, parsed }: SameDocumentParams): boolean {
	try {
		return JSON.stringify(yaml.loadAll(text)) === parsed;
	} catch {
		return false;
	}
}

interface YamlComment {
	line: number;
	comment: string;
}

function yamlComments(text: string): YamlComment[] {
	const lines = text.split("\n");
	const parsed = JSON.stringify(yaml.loadAll(text));

	return lines.flatMap((line, index) => {
		const start = [...line.matchAll(YAML_COMMENT_PATTERN)]
			.map((match) => line.indexOf("#", match.index))
			.find((at) =>
				sameDocument({
					text: [...lines.slice(0, index), line.slice(0, at).trimEnd(), ...lines.slice(index + 1)].join("\n"),
					parsed,
				}),
			);

		return start === undefined ? [] : [{ line: index + 1, comment: line.slice(start) }];
	});
}

function unpinnedUses(text: string): string[] {
	return text.split("\n").flatMap((line) => {
		const uses = USES_PATTERN.exec(line);

		if (uses === null || SAME_REPOSITORY_ACTION_PATTERN.test(uses[1])) return [];

		return SHA_PIN_PATTERN.test(uses[1]) && PIN_COMMENT_PATTERN.test(uses[2]) ? [] : [line.trim()];
	});
}

interface AllowedCommentParams {
	file: string;
	line: string;
	comment: string;
}

function allowedComment({ file, line, comment }: AllowedCommentParams): boolean {
	const uses = USES_PATTERN.exec(line);

	return (
		(uses !== null && SHA_PIN_PATTERN.test(uses[1])) ||
		TOOL_DIRECTIVE_PATTERN.test(comment) ||
		(file === RENOVATE_ANNOTATED_FILE && RENOVATE_ANNOTATION_PATTERN.test(comment))
	);
}

describe("the YAML", () => {
	it("pins every action of another repository to a full commit SHA, its version or branch in a trailing comment", () => {
		const uses = YAML_FILES.flatMap((file) =>
			read(file)
				.split("\n")
				.filter((line) => USES_PATTERN.test(line)),
		);
		const unpinned = YAML_FILES.flatMap((file) => unpinnedUses(read(file)).map((line) => `${file}: ${line}`));

		expect(
			unpinnedUses(
				[
					"      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1",
					"      - uses: $/.github/actions/prepare-env",
					"        uses: actions/setup-node@v7",
					"      - uses: pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413",
				].join("\n"),
			),
		).toEqual(["uses: actions/setup-node@v7", "- uses: pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413"]);
		expect(uses.length).toBeGreaterThan(0);
		expect(unpinned).toEqual([]);
	});

	it("carries no comment but a SHA pin's version, a tool directive and the line Renovate writes above an entry it exempts", () => {
		const commented = YAML_FILES.flatMap((file) => {
			const lines = read(file).split("\n");

			return yamlComments(read(file))
				.filter(({ line, comment }) => !allowedComment({ file, line: lines[line - 1], comment }))
				.map(({ line, comment }) => `${file}:${line}: ${comment}`);
		});

		expect(yamlComments("a: 1 # why\nb: '#kept'\nc: |\n  # content\nd: x#y\n")).toEqual([
			{ line: 1, comment: "# why" },
		]);
		expect(YAML_FILES.length).toBeGreaterThan(0);
		expect(commented).toEqual([]);
	});
});

describe("every census the assertions above read", () => {
	it("finds something in each list derived from the repository, since an assertion over an empty list passes whatever the tree holds", () => {
		const empty = Object.entries({
			DOCS,
			ADR_FILES,
			TEST_FILENAMES: [...TEST_FILENAMES],
			declaredInputs,
			declaredOutputs,
			SOURCE_FILES,
			PRODUCTION_FILES,
			TYPESCRIPT_FILES,
			UNIT_TEST_FILES,
			YAML_FILES,
		})
			.filter(([, list]) => list.length === 0)
			.map(([census]) => census);

		expect(empty).toEqual([]);
	});
});
