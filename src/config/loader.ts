import * as fs from "node:fs";
import * as path from "node:path";
import * as core from "@actions/core";
import { CompareAgainst, NotificationMode } from "@domain/types";
import { LOCALES } from "@i18n";
import { errorMessage } from "@shared/errors";
import * as yaml from "js-yaml";
import * as z from "zod/mini";
import { DEFAULTS } from "./defaults";
import {
	parseBool,
	parseFileBool,
	parseHexColor,
	parseList,
	parseNonNegativeNumber,
	parseNotificationThreshold,
	parseNumberList,
	parsePositiveDecimal,
	parsePositiveNumber,
	toStringList,
} from "./parsers";
import type { Config } from "./types";
import { ChartAxisSide, ChartCurve, ChartRange, ChartTheme, Visibility } from "./types";

type FileConfigKey = Exclude<keyof Config, "sendOnNoChanges">;

type FileConfig = Partial<Record<FileConfigKey, unknown>>;

const ConfigFileSchema = z.record(z.string(), z.unknown());

const FILE_CONFIG_KEYS = Object.keys(DEFAULTS).filter((key): key is FileConfigKey => key !== "sendOnNoChanges");

export const DEFAULT_CONFIG_PATH = "star-tracker.yml";

const DATA_BRANCH_FORBIDDEN_PATTERN = /[\s~^:?*[\\]/;
const DATA_BRANCH_FORBIDDEN_SEQUENCES = ["..", "//", "/.", "@{"];
const ASCII_CONTROL_MAX = 31;
const ASCII_DELETE = 127;
const UPPERCASE_LETTER_PATTERN = /[A-Z]/g;

function hasControlCharacter(value: string): boolean {
	return [...value].some((char) => {
		const code = char.codePointAt(0) ?? 0;

		return code <= ASCII_CONTROL_MAX || code === ASCII_DELETE;
	});
}

function isValidDataBranch(dataBranch: string): boolean {
	return (
		dataBranch !== "" &&
		dataBranch !== "@" &&
		!DATA_BRANCH_FORBIDDEN_PATTERN.test(dataBranch) &&
		!hasControlCharacter(dataBranch) &&
		!DATA_BRANCH_FORBIDDEN_SEQUENCES.some((sequence) => dataBranch.includes(sequence)) &&
		!["-", ".", "/"].some((prefix) => dataBranch.startsWith(prefix)) &&
		!["/", ".", ".lock"].some((suffix) => dataBranch.endsWith(suffix))
	);
}

const DataBranchSchema = z.string().check(z.refine(isValidDataBranch));

const VisibilitySchema = z.enum(Object.values(Visibility));

const CustomMilestonesFileSchema = z.union([
	z.pipe(
		z.array(z.unknown()),
		z.transform((milestones) => milestones.join(",")),
	),
	z.string(),
	z.pipe(z.number(), z.transform(String)),
]);

interface ToDelimitedParams {
	key: string;
	delimiter: string;
}

function toDelimited({ key, delimiter }: ToDelimitedParams): string {
	return key.replaceAll(UPPERCASE_LETTER_PATTERN, (letter) => `${delimiter}${letter.toLowerCase()}`);
}

export function toActionInputName(key: string): string {
	return toDelimited({ key, delimiter: "-" });
}

function formatChoices(choices: readonly string[]): string {
	const quoted = choices.map((choice) => `"${choice}"`);

	if (quoted.length <= 2) return quoted.join(" or ");

	return `${quoted.slice(0, -1).join(", ")}, or ${quoted.at(-1)}`;
}

function formatFallback(fallback: unknown): string {
	return typeof fallback === "string" ? `"${fallback}"` : String(fallback);
}

interface FieldContext {
	input: string;
	inputName: string;
	fileValue: unknown;
	fallback: unknown;
}

type FieldResolver<T> = (context: FieldContext) => T | undefined;

interface FieldSource<T> {
	fromInput: (value: string) => T | undefined;
	fromFile: (value: unknown) => T | undefined;
	namesFallback?: boolean;
}

function scalarField<T>({ fromInput, fromFile, namesFallback = false }: FieldSource<T>): FieldResolver<T> {
	return ({ input, inputName, fileValue, fallback }) => {
		const parsed = fromInput(input);

		if (input !== "" && parsed === undefined) {
			core.warning(
				namesFallback
					? `Invalid ${inputName} "${input}". Falling back to ${formatFallback(fallback)}`
					: `Invalid ${inputName} "${input}". Ignoring it.`,
			);
		}

		return parsed ?? fromFile(fileValue);
	};
}

function enumField<const T extends string>(allowed: readonly T[]): FieldResolver<T> {
	const schema = z.enum(allowed);

	return ({ input, inputName, fileValue, fallback }) => {
		const value = input || fileValue;

		if (!value) return fallback as T;

		const match = schema.safeParse(value);

		if (match.success) return match.data;

		core.warning(
			`Invalid ${inputName} "${String(value)}". Must be ${formatChoices(allowed)}. Falling back to "${String(fallback)}"`,
		);

		return fallback as T;
	};
}

const boolField = scalarField<boolean>({ fromInput: parseBool, fromFile: parseFileBool });

const positiveField = scalarField<number>({ fromInput: parsePositiveNumber, fromFile: parsePositiveNumber });

const nonNegativeField = scalarField<number>({ fromInput: parseNonNegativeNumber, fromFile: parseNonNegativeNumber });

const listField = scalarField<string[]>({ fromInput: parseList, fromFile: toStringList });

type TabledKey = Exclude<keyof Config, "visibility" | "dataBranch" | "sendOnNoChanges" | "chartCustomMilestones">;

const FIELD_SOURCES: { [K in TabledKey]: FieldResolver<Config[K]> } = {
	includeArchived: boolField,
	includeForks: boolField,
	excludeRepos: listField,
	onlyRepos: listField,
	excludeOrgs: listField,
	onlyOrgs: listField,
	minStars: nonNegativeField,
	maxHistory: positiveField,
	compareAgainst: enumField(Object.values(CompareAgainst)),
	readOnly: boolField,
	includeCharts: boolField,
	locale: enumField(LOCALES),
	notificationThreshold: scalarField<number | "auto">({
		fromInput: parseNotificationThreshold,
		fromFile: parseNotificationThreshold,
	}),
	notificationMode: enumField(Object.values(NotificationMode)),
	trackStargazers: boolField,
	topRepos: positiveField,
	smartSampling: boolField,
	smartSamplingThreshold: nonNegativeField,
	smartSamplingPages: positiveField,
	chartLineColor: scalarField<string>({
		fromInput: parseHexColor,
		fromFile: parseHexColor,
		namesFallback: true,
	}),
	chartLineWidth: scalarField<number>({
		fromInput: parsePositiveDecimal,
		fromFile: parsePositiveDecimal,
		namesFallback: true,
	}),
	chartMaxPoints: nonNegativeField,
	chartYAxisSide: enumField(Object.values(ChartAxisSide)),
	chartSmoothing: boolField,
	chartCurve: enumField(Object.values(ChartCurve)),
	chartShowPoints: boolField,
	chartAnimation: boolField,
	chartMilestones: boolField,
	chartBeginAtZero: boolField,
	chartTheme: enumField(Object.values(ChartTheme)),
	emailTheme: enumField(Object.values(ChartTheme)),
	chartRange: enumField(Object.values(ChartRange)),
	chartTrendLine: boolField,
	velocityMetrics: boolField,
};

const TABLED_KEYS = Object.keys(FIELD_SOURCES) as TabledKey[];

function resolveTabledFields(fileConfig: FileConfig): Pick<Config, TabledKey> {
	const resolved = TABLED_KEYS.map((key) => {
		const inputName = toActionInputName(key);
		const fallback = DEFAULTS[key];
		const value = FIELD_SOURCES[key]({
			input: core.getInput(inputName),
			inputName,
			fileValue: fileConfig[key as FileConfigKey],
			fallback,
		});

		return [key, value ?? fallback] as const;
	});

	return Object.fromEntries(resolved) as Pick<Config, TabledKey>;
}

interface ParseConfigYamlParams {
	content: string;
	configPath: string;
}

function parseConfigYaml({ content, configPath }: ParseConfigYamlParams): unknown {
	if (content.trim() === "") {
		return null;
	}

	try {
		return yaml.load(content);
	} catch (error) {
		core.warning(`Failed to parse config file ${configPath}: ${errorMessage(error)}`);
		return null;
	}
}

export function loadConfigFile(configPath: string): FileConfig {
	const fullPath = path.resolve(configPath);

	if (!fs.existsSync(fullPath)) {
		core.info(`No config file found at ${configPath}, using defaults`);
		return {};
	}

	const parsed = parseConfigYaml({ content: fs.readFileSync(fullPath, "utf8"), configPath });

	if (!z.validate(ConfigFileSchema, parsed)) {
		return {};
	}

	return Object.fromEntries(
		FILE_CONFIG_KEYS.map((key) => {
			const snakeKey = toDelimited({ key, delimiter: "_" });

			return [key, parsed[snakeKey] ?? parsed[snakeKey.replaceAll("_", "-")]] as const;
		}),
	);
}

function resolveVisibility(fileConfig: FileConfig): Visibility {
	const raw = core.getInput("visibility") || fileConfig.visibility || DEFAULTS.visibility;
	const visibility = VisibilitySchema.safeParse(raw);

	if (!visibility.success) {
		throw new Error(`Invalid visibility "${String(raw)}". Must be one of: ${Object.values(Visibility).join(", ")}`);
	}

	return visibility.data;
}

function resolveDataBranch(fileConfig: FileConfig): string {
	const raw = core.getInput("data-branch") || fileConfig.dataBranch || DEFAULTS.dataBranch;
	const dataBranch = DataBranchSchema.safeParse(raw);

	if (dataBranch.success) return dataBranch.data;

	if (typeof raw !== "string") {
		throw new Error(
			`Invalid data-branch ${JSON.stringify(raw)} in the config file. It must be a string, so quote it in the config file.`,
		);
	}

	throw new Error(
		`Invalid data-branch "${raw}". It must be a valid git branch name: no whitespace and none of ~^:?*[\\, no "..", "//", "/." or "@{", it cannot start with "-", "." or "/", and it cannot end with "/", "." or ".lock".`,
	);
}

function resolveCustomMilestones(fileConfig: FileConfig): Config["chartCustomMilestones"] {
	const input = core.getInput("chart-custom-milestones");
	const fromInput = input ? parseNumberList(input) : null;

	if (fromInput !== null && fromInput.length === 0) {
		core.warning(
			`Invalid chart-custom-milestones "${input}". Expected a comma-separated list of positive numbers. Falling back to the built-in milestones.`,
		);
	}

	if (fromInput !== null) return fromInput;

	const fromFile = parseNumberList(CustomMilestonesFileSchema.safeParse(fileConfig.chartCustomMilestones).data);

	return fromFile.length > 0 ? fromFile : DEFAULTS.chartCustomMilestones;
}

const LIST_LOG_LABELS: Record<"onlyRepos" | "excludeRepos" | "onlyOrgs" | "excludeOrgs", string> = {
	onlyRepos: "tracking only repos",
	excludeRepos: "excluding repos",
	onlyOrgs: "tracking only orgs",
	excludeOrgs: "excluding orgs",
};

export function loadConfig(): Config {
	const configPath = core.getInput("config-path") || DEFAULT_CONFIG_PATH;
	const fileConfig = loadConfigFile(configPath);

	const tabled = resolveTabledFields(fileConfig);

	const config: Config = {
		...tabled,
		visibility: resolveVisibility(fileConfig),
		dataBranch: resolveDataBranch(fileConfig),
		sendOnNoChanges: parseBool(core.getInput("send-on-no-changes")) ?? DEFAULTS.sendOnNoChanges,
		chartCustomMilestones: resolveCustomMilestones(fileConfig),
		emailTheme: tabled.emailTheme === ChartTheme.AUTO ? tabled.chartTheme : tabled.emailTheme,
	};

	if (config.readOnly && config.notificationThreshold !== 0) {
		core.warning(
			`notification-threshold is set to "${config.notificationThreshold}" on a read-only run. The threshold accumulates against a value stored on ${config.dataBranch}, which a read-only run never updates, so it will either fire on every run or never fire. Use notification-threshold 0 here and gate on the stars-changed output instead.`,
		);
	}

	core.info(
		`Config: visibility=${config.visibility}, includeArchived=${config.includeArchived}, includeForks=${config.includeForks}`,
	);

	for (const [key, label] of Object.entries(LIST_LOG_LABELS)) {
		const values = config[key as keyof typeof LIST_LOG_LABELS];

		if (values.length > 0) {
			core.info(`Config: ${label}: ${values.join(", ")}`);
		}
	}

	return config;
}
