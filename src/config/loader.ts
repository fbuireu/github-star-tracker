import * as fs from 'node:fs';
import * as path from 'node:path';
import * as core from '@actions/core';
import { CompareAgainst, NotificationMode } from '@domain/types';
import { LOCALES } from '@i18n';
import * as yaml from 'js-yaml';
import { DEFAULTS } from './defaults';
import {
  parseBool,
  parseFileBool,
  parseFileHexColor,
  parseHexColor,
  parseList,
  parseNonNegativeNumber,
  parseNotificationThreshold,
  parseNumberList,
  parsePositiveDecimal,
  parsePositiveNumber,
  toStringList,
} from './parsers';
import type { Config } from './types';
import { ChartAxisSide, ChartCurve, ChartRange, ChartTheme, Visibility } from './types';

type FileConfigKey = Exclude<keyof Config, 'sendOnNoChanges'>;

type FileConfig = Partial<
  Omit<
    { [K in FileConfigKey]: Config[K] extends string ? string : Config[K] },
    'chartCustomMilestones'
  >
> & { chartCustomMilestones?: number[] | string };

const FILE_CONFIG_KEYS = Object.keys(DEFAULTS).filter(
  (key): key is FileConfigKey => key !== 'sendOnNoChanges',
);

export const DEFAULT_CONFIG_PATH = 'star-tracker.yml';

const DATA_BRANCH_FORBIDDEN_PATTERN = /[\s~^:?*[\\]/;
const DATA_BRANCH_FORBIDDEN_SEQUENCES = ['..', '//', '/.', '@{'];
const ASCII_CONTROL_MAX = 31;
const ASCII_DELETE = 127;
const UPPERCASE_LETTER_PATTERN = /[A-Z]/g;

function hasControlCharacter(value: string): boolean {
  return [...value].some((char) => {
    const code = char.codePointAt(0) ?? 0;

    return code <= ASCII_CONTROL_MAX || code === ASCII_DELETE;
  });
}

function assertValidDataBranch(dataBranch: string): void {
  const isValid =
    dataBranch !== '' &&
    dataBranch !== '@' &&
    !DATA_BRANCH_FORBIDDEN_PATTERN.test(dataBranch) &&
    !hasControlCharacter(dataBranch) &&
    !DATA_BRANCH_FORBIDDEN_SEQUENCES.some((sequence) => dataBranch.includes(sequence)) &&
    !['-', '.', '/'].some((prefix) => dataBranch.startsWith(prefix)) &&
    !['/', '.', '.lock'].some((suffix) => dataBranch.endsWith(suffix));

  if (!isValid) {
    throw new Error(
      `Invalid data-branch "${dataBranch}". It must be a valid git branch name: no whitespace and none of ~^:?*[\\, no "..", "//", "/." or "@{", it cannot start with "-", "." or "/", and it cannot end with "/", "." or ".lock".`,
    );
  }
}

interface ToDelimitedParams {
  key: string;
  delimiter: string;
}

function toDelimited({ key, delimiter }: ToDelimitedParams): string {
  return key.replaceAll(
    UPPERCASE_LETTER_PATTERN,
    (letter) => `${delimiter}${letter.toLowerCase()}`,
  );
}

export function toActionInputName(key: string): string {
  return toDelimited({ key, delimiter: '-' });
}

function formatChoices(choices: readonly string[]): string {
  const quoted = choices.map((choice) => `"${choice}"`);

  if (quoted.length <= 2) return quoted.join(' or ');

  return `${quoted.slice(0, -1).join(', ')}, or ${quoted.at(-1)}`;
}

function formatFallback(fallback: unknown): string {
  return typeof fallback === 'string' ? `"${fallback}"` : String(fallback);
}

interface ResolveEnumParams<T extends string> {
  value: string | undefined;
  allowed: readonly T[];
  fallback: NoInfer<T>;
  inputName: string;
}

function resolveEnum<T extends string>({
  value,
  allowed,
  fallback,
  inputName,
}: ResolveEnumParams<T>): T {
  if (!value) return fallback;

  const match = allowed.find((choice) => choice === value);

  if (match !== undefined) return match;

  core.warning(
    `Invalid ${inputName} "${value}". Must be ${formatChoices(allowed)}. Falling back to "${fallback}"`,
  );

  return fallback;
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

function scalarField<T>({
  fromInput,
  fromFile,
  namesFallback = false,
}: FieldSource<T>): FieldResolver<T> {
  return ({ input, inputName, fileValue, fallback }) => {
    const parsed = fromInput(input);

    if (input !== '' && parsed === undefined) {
      core.warning(
        namesFallback
          ? `Invalid ${inputName} "${input}". Falling back to ${formatFallback(fallback)}`
          : `Invalid ${inputName} "${input}". Ignoring it.`,
      );
    }

    return parsed ?? fromFile(fileValue);
  };
}

function enumField<T extends string>(allowed: readonly T[]): FieldResolver<T> {
  return ({ input, inputName, fileValue, fallback }) =>
    resolveEnum({
      value: input || (fileValue as string | undefined),
      allowed,
      fallback: fallback as T,
      inputName,
    });
}

type ScalarValue = string | number | null | undefined;

function fromFileScalar<T>(parse: (value: ScalarValue) => T | undefined) {
  return (value: unknown): T | undefined =>
    typeof value === 'string' || typeof value === 'number' || value === null || value === undefined
      ? parse(value)
      : undefined;
}

const boolField = scalarField<boolean>({ fromInput: parseBool, fromFile: parseFileBool });

const positiveField = scalarField<number>({
  fromInput: parsePositiveNumber,
  fromFile: fromFileScalar(parsePositiveNumber),
});

const nonNegativeField = scalarField<number>({
  fromInput: parseNonNegativeNumber,
  fromFile: fromFileScalar(parseNonNegativeNumber),
});

const listField = scalarField<string[]>({ fromInput: parseList, fromFile: toStringList });

type TabledKey = Exclude<
  keyof Config,
  'visibility' | 'dataBranch' | 'sendOnNoChanges' | 'chartCustomMilestones'
>;

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
  notificationThreshold: scalarField<number | 'auto'>({
    fromInput: parseNotificationThreshold,
    fromFile: fromFileScalar(parseNotificationThreshold),
  }),
  notificationMode: enumField(Object.values(NotificationMode)),
  trackStargazers: boolField,
  topRepos: positiveField,
  smartSampling: boolField,
  smartSamplingThreshold: nonNegativeField,
  smartSamplingPages: positiveField,
  chartLineColor: scalarField<string>({
    fromInput: parseHexColor,
    fromFile: parseFileHexColor,
    namesFallback: true,
  }),
  chartLineWidth: scalarField<number>({
    fromInput: parsePositiveDecimal,
    fromFile: fromFileScalar(parsePositiveDecimal),
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

function parseConfigYaml({
  content,
  configPath,
}: ParseConfigYamlParams): Record<string, unknown> | null {
  if (content.trim() === '') {
    return null;
  }

  try {
    return yaml.load(content) as Record<string, unknown> | null;
  } catch (error) {
    core.warning(`Failed to parse config file ${configPath}: ${(error as Error).message}`);
    return null;
  }
}

export function loadConfigFile(configPath: string): FileConfig {
  const fullPath = path.resolve(configPath);

  if (!fs.existsSync(fullPath)) {
    core.info(`No config file found at ${configPath}, using defaults`);
    return {};
  }

  const parsed = parseConfigYaml({ content: fs.readFileSync(fullPath, 'utf8'), configPath });

  if (!parsed || typeof parsed !== 'object') {
    return {};
  }

  return Object.fromEntries(
    FILE_CONFIG_KEYS.map((key) => {
      const snakeKey = toDelimited({ key, delimiter: '_' });

      return [key, parsed[snakeKey] ?? parsed[snakeKey.replaceAll('_', '-')]] as const;
    }),
  ) as FileConfig;
}

function resolveVisibility(fileConfig: FileConfig): Visibility {
  const raw = core.getInput('visibility') || fileConfig.visibility || DEFAULTS.visibility;
  const options = Object.values(Visibility);
  const match = options.find((option) => option === raw);

  if (match === undefined) {
    throw new Error(`Invalid visibility "${raw}". Must be one of: ${options.join(', ')}`);
  }

  return match;
}

function resolveDataBranch(fileConfig: FileConfig): string {
  const dataBranch = core.getInput('data-branch') || fileConfig.dataBranch || DEFAULTS.dataBranch;
  assertValidDataBranch(dataBranch);

  return dataBranch;
}

function resolveCustomMilestones(fileConfig: FileConfig): Config['chartCustomMilestones'] {
  const input = core.getInput('chart-custom-milestones');
  const fromInput = input ? parseNumberList(input) : null;

  if (fromInput !== null && fromInput.length === 0) {
    core.warning(
      `Invalid chart-custom-milestones "${input}". Expected a comma-separated list of positive numbers. Falling back to the built-in milestones.`,
    );
  }

  if (fromInput !== null) return fromInput;

  const fromFile = Array.isArray(fileConfig.chartCustomMilestones)
    ? parseNumberList(fileConfig.chartCustomMilestones.join(','))
    : parseNumberList(fileConfig.chartCustomMilestones);

  return fromFile.length > 0 ? fromFile : DEFAULTS.chartCustomMilestones;
}

const LIST_LOG_LABELS: Record<'onlyRepos' | 'excludeRepos' | 'onlyOrgs' | 'excludeOrgs', string> = {
  onlyRepos: 'tracking only repos',
  excludeRepos: 'excluding repos',
  onlyOrgs: 'tracking only orgs',
  excludeOrgs: 'excluding orgs',
};

export function loadConfig(): Config {
  const configPath = core.getInput('config-path') || DEFAULT_CONFIG_PATH;
  const fileConfig = loadConfigFile(configPath);

  const tabled = resolveTabledFields(fileConfig);

  const config: Config = {
    ...tabled,
    visibility: resolveVisibility(fileConfig),
    dataBranch: resolveDataBranch(fileConfig),
    sendOnNoChanges: parseBool(core.getInput('send-on-no-changes')) ?? DEFAULTS.sendOnNoChanges,
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
      core.info(`Config: ${label}: ${values.join(', ')}`);
    }
  }

  return config;
}
