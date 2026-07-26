import * as fs from 'node:fs';
import * as path from 'node:path';
import * as core from '@actions/core';
import { CompareAgainst, NotificationMode } from '@domain/types';
import { LOCALES } from '@i18n';
import * as yaml from 'js-yaml';
import { DEFAULTS } from './defaults';
import {
  parseBool,
  parseDecimal,
  parseFileBool,
  parseFileHexColor,
  parseHexColor,
  parseList,
  parseNonNegativeNumber,
  parseNotificationThreshold,
  parseNumber,
  parseNumberList,
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

function toSnakeCase(key: string): string {
  return key.replaceAll(UPPERCASE_LETTER_PATTERN, (letter) => `_${letter.toLowerCase()}`);
}

function formatChoices(choices: readonly string[]): string {
  const quoted = choices.map((choice) => `"${choice}"`);

  if (quoted.length <= 2) return quoted.join(' or ');

  return `${quoted.slice(0, -1).join(', ')}, or ${quoted.at(-1)}`;
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

interface ParseOrWarnParams<T> {
  input: string;
  inputName: string;
  parse: (value: string) => T | undefined;
}

function parseOrWarn<T>({ input, inputName, parse }: ParseOrWarnParams<T>): T | undefined {
  const parsed = parse(input);

  if (input !== '' && parsed === undefined) {
    core.warning(`Invalid ${inputName} "${input}". Ignoring it.`);
  }

  return parsed;
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
      const snakeKey = toSnakeCase(key);

      return [key, parsed[snakeKey] ?? parsed[snakeKey.replaceAll('_', '-')]] as const;
    }),
  ) as FileConfig;
}

export function loadConfig(): Config {
  const configPath = core.getInput('config-path') || DEFAULT_CONFIG_PATH;
  const fileConfig = loadConfigFile(configPath);

  const inputVisibility = core.getInput('visibility');
  const inputIncludeArchived = core.getInput('include-archived');
  const inputIncludeForks = core.getInput('include-forks');
  const inputExcludeRepos = core.getInput('exclude-repos');
  const inputOnlyRepos = core.getInput('only-repos');
  const inputExcludeOrgs = core.getInput('exclude-orgs');
  const inputOnlyOrgs = core.getInput('only-orgs');
  const inputMinStars = core.getInput('min-stars');
  const inputDataBranch = core.getInput('data-branch');
  const inputMaxHistory = core.getInput('max-history');
  const inputReadOnly = core.getInput('read-only');
  const inputIncludeCharts = core.getInput('include-charts');
  const inputLocale = core.getInput('locale');
  const inputNotificationThreshold = core.getInput('notification-threshold');
  const inputNotificationMode = core.getInput('notification-mode');
  const inputCompareAgainst = core.getInput('compare-against');
  const inputTrackStargazers = core.getInput('track-stargazers');
  const inputTopRepos = core.getInput('top-repos');
  const inputSmartSampling = core.getInput('smart-sampling');
  const inputSmartSamplingThreshold = core.getInput('smart-sampling-threshold');
  const inputSmartSamplingPages = core.getInput('smart-sampling-pages');
  const inputChartLineColor = core.getInput('chart-line-color');
  const inputChartLineWidth = core.getInput('chart-line-width');
  const inputChartMaxPoints = core.getInput('chart-max-points');
  const inputChartYAxisSide = core.getInput('chart-y-axis-side');
  const inputChartSmoothing = core.getInput('chart-smoothing');
  const inputChartCurve = core.getInput('chart-curve');
  const inputChartShowPoints = core.getInput('chart-show-points');
  const inputChartAnimation = core.getInput('chart-animation');
  const inputChartMilestones = core.getInput('chart-milestones');
  const inputChartBeginAtZero = core.getInput('chart-begin-at-zero');
  const inputChartTheme = core.getInput('chart-theme');
  const inputChartCustomMilestones = core.getInput('chart-custom-milestones');
  const inputChartRange = core.getInput('chart-range');
  const inputChartTrendLine = core.getInput('chart-trend-line');
  const inputVelocityMetrics = core.getInput('velocity-metrics');

  const rawVisibility = inputVisibility || fileConfig.visibility || DEFAULTS.visibility;
  const visibilityOptions = Object.values(Visibility);
  const visibility = visibilityOptions.find((option) => option === rawVisibility);

  if (visibility === undefined) {
    throw new Error(
      `Invalid visibility "${rawVisibility}". Must be one of: ${visibilityOptions.join(', ')}`,
    );
  }

  const dataBranch = inputDataBranch || fileConfig.dataBranch || DEFAULTS.dataBranch;
  assertValidDataBranch(dataBranch);

  const fileCustomMilestones = Array.isArray(fileConfig.chartCustomMilestones)
    ? parseNumberList(fileConfig.chartCustomMilestones.join(','))
    : parseNumberList(fileConfig.chartCustomMilestones);

  if (inputChartCustomMilestones && parseNumberList(inputChartCustomMilestones).length === 0) {
    core.warning(
      `Invalid chart-custom-milestones "${inputChartCustomMilestones}". Expected a comma-separated list of positive numbers. Falling back to the built-in milestones.`,
    );
  }

  const locale = resolveEnum({
    value: inputLocale || fileConfig.locale,
    allowed: LOCALES,
    fallback: DEFAULTS.locale,
    inputName: 'locale',
  });

  const chartLineColor =
    parseHexColor(inputChartLineColor) ??
    parseFileHexColor(fileConfig.chartLineColor) ??
    DEFAULTS.chartLineColor;
  if (inputChartLineColor && !parseHexColor(inputChartLineColor)) {
    core.warning(
      `Invalid chart-line-color "${inputChartLineColor}". Falling back to "${DEFAULTS.chartLineColor}"`,
    );
  }

  const chartLineWidth =
    parseDecimal(inputChartLineWidth) ??
    parseDecimal(fileConfig.chartLineWidth) ??
    DEFAULTS.chartLineWidth;
  if (inputChartLineWidth && parseDecimal(inputChartLineWidth) === undefined) {
    core.warning(
      `Invalid chart-line-width "${inputChartLineWidth}". Falling back to ${DEFAULTS.chartLineWidth}`,
    );
  }

  const chartYAxisSide = resolveEnum({
    value: inputChartYAxisSide || fileConfig.chartYAxisSide,
    allowed: Object.values(ChartAxisSide),
    fallback: DEFAULTS.chartYAxisSide,
    inputName: 'chart-y-axis-side',
  });

  const chartTheme = resolveEnum({
    value: inputChartTheme || fileConfig.chartTheme,
    allowed: Object.values(ChartTheme),
    fallback: DEFAULTS.chartTheme,
    inputName: 'chart-theme',
  });

  const chartRange = resolveEnum({
    value: inputChartRange || fileConfig.chartRange,
    allowed: Object.values(ChartRange),
    fallback: DEFAULTS.chartRange,
    inputName: 'chart-range',
  });

  const chartCurve = resolveEnum({
    value: inputChartCurve || fileConfig.chartCurve,
    allowed: Object.values(ChartCurve),
    fallback: DEFAULTS.chartCurve,
    inputName: 'chart-curve',
  });

  const compareAgainst = resolveEnum({
    value: inputCompareAgainst || fileConfig.compareAgainst,
    allowed: Object.values(CompareAgainst),
    fallback: DEFAULTS.compareAgainst,
    inputName: 'compare-against',
  });

  const notificationMode = resolveEnum({
    value: inputNotificationMode || fileConfig.notificationMode,
    allowed: Object.values(NotificationMode),
    fallback: DEFAULTS.notificationMode,
    inputName: 'notification-mode',
  });

  const config: Config = {
    visibility,
    includeArchived:
      parseOrWarn({
        input: inputIncludeArchived,
        inputName: 'include-archived',
        parse: parseBool,
      }) ??
      parseFileBool(fileConfig.includeArchived) ??
      DEFAULTS.includeArchived,
    includeForks:
      parseOrWarn({ input: inputIncludeForks, inputName: 'include-forks', parse: parseBool }) ??
      parseFileBool(fileConfig.includeForks) ??
      DEFAULTS.includeForks,
    excludeRepos:
      parseList(inputExcludeRepos) ??
      toStringList(fileConfig.excludeRepos) ??
      DEFAULTS.excludeRepos,
    onlyRepos:
      parseList(inputOnlyRepos) ?? toStringList(fileConfig.onlyRepos) ?? DEFAULTS.onlyRepos,
    excludeOrgs:
      parseList(inputExcludeOrgs) ?? toStringList(fileConfig.excludeOrgs) ?? DEFAULTS.excludeOrgs,
    onlyOrgs: parseList(inputOnlyOrgs) ?? toStringList(fileConfig.onlyOrgs) ?? DEFAULTS.onlyOrgs,
    minStars:
      parseOrWarn({
        input: inputMinStars,
        inputName: 'min-stars',
        parse: parseNonNegativeNumber,
      }) ??
      parseNonNegativeNumber(fileConfig.minStars) ??
      DEFAULTS.minStars,
    dataBranch,
    maxHistory:
      parseOrWarn({
        input: inputMaxHistory,
        inputName: 'max-history',
        parse: parsePositiveNumber,
      }) ??
      parsePositiveNumber(fileConfig.maxHistory) ??
      DEFAULTS.maxHistory,
    compareAgainst,
    readOnly:
      parseOrWarn({ input: inputReadOnly, inputName: 'read-only', parse: parseBool }) ??
      parseFileBool(fileConfig.readOnly) ??
      DEFAULTS.readOnly,
    sendOnNoChanges: parseBool(core.getInput('send-on-no-changes')) ?? DEFAULTS.sendOnNoChanges,
    includeCharts:
      parseOrWarn({ input: inputIncludeCharts, inputName: 'include-charts', parse: parseBool }) ??
      parseFileBool(fileConfig.includeCharts) ??
      DEFAULTS.includeCharts,
    locale,
    notificationThreshold:
      parseOrWarn({
        input: inputNotificationThreshold,
        inputName: 'notification-threshold',
        parse: parseNotificationThreshold,
      }) ??
      parseNotificationThreshold(fileConfig.notificationThreshold) ??
      DEFAULTS.notificationThreshold,
    notificationMode,
    trackStargazers:
      parseOrWarn({
        input: inputTrackStargazers,
        inputName: 'track-stargazers',
        parse: parseBool,
      }) ??
      parseFileBool(fileConfig.trackStargazers) ??
      DEFAULTS.trackStargazers,
    topRepos:
      parseOrWarn({
        input: inputTopRepos,
        inputName: 'top-repos',
        parse: parsePositiveNumber,
      }) ??
      parsePositiveNumber(fileConfig.topRepos) ??
      DEFAULTS.topRepos,
    smartSampling:
      parseOrWarn({ input: inputSmartSampling, inputName: 'smart-sampling', parse: parseBool }) ??
      parseFileBool(fileConfig.smartSampling) ??
      DEFAULTS.smartSampling,
    smartSamplingThreshold:
      parseOrWarn({
        input: inputSmartSamplingThreshold,
        inputName: 'smart-sampling-threshold',
        parse: parseNonNegativeNumber,
      }) ??
      parseNonNegativeNumber(fileConfig.smartSamplingThreshold) ??
      DEFAULTS.smartSamplingThreshold,
    smartSamplingPages:
      parseOrWarn({
        input: inputSmartSamplingPages,
        inputName: 'smart-sampling-pages',
        parse: parsePositiveNumber,
      }) ??
      parsePositiveNumber(fileConfig.smartSamplingPages) ??
      DEFAULTS.smartSamplingPages,
    chartLineColor,
    chartLineWidth,
    chartMaxPoints:
      parseOrWarn({
        input: inputChartMaxPoints,
        inputName: 'chart-max-points',
        parse: parseNonNegativeNumber,
      }) ??
      parseNonNegativeNumber(fileConfig.chartMaxPoints) ??
      DEFAULTS.chartMaxPoints,
    chartYAxisSide,
    chartSmoothing:
      parseOrWarn({ input: inputChartSmoothing, inputName: 'chart-smoothing', parse: parseBool }) ??
      parseFileBool(fileConfig.chartSmoothing) ??
      DEFAULTS.chartSmoothing,
    chartCurve,
    chartShowPoints:
      parseOrWarn({
        input: inputChartShowPoints,
        inputName: 'chart-show-points',
        parse: parseBool,
      }) ??
      parseFileBool(fileConfig.chartShowPoints) ??
      DEFAULTS.chartShowPoints,
    chartAnimation:
      parseOrWarn({ input: inputChartAnimation, inputName: 'chart-animation', parse: parseBool }) ??
      parseFileBool(fileConfig.chartAnimation) ??
      DEFAULTS.chartAnimation,
    chartMilestones:
      parseOrWarn({
        input: inputChartMilestones,
        inputName: 'chart-milestones',
        parse: parseBool,
      }) ??
      parseFileBool(fileConfig.chartMilestones) ??
      DEFAULTS.chartMilestones,
    chartBeginAtZero:
      parseOrWarn({
        input: inputChartBeginAtZero,
        inputName: 'chart-begin-at-zero',
        parse: parseBool,
      }) ??
      parseFileBool(fileConfig.chartBeginAtZero) ??
      DEFAULTS.chartBeginAtZero,
    chartTheme,
    chartCustomMilestones: inputChartCustomMilestones
      ? parseNumberList(inputChartCustomMilestones)
      : fileCustomMilestones.length > 0
        ? fileCustomMilestones
        : DEFAULTS.chartCustomMilestones,
    chartRange,
    chartTrendLine:
      parseOrWarn({
        input: inputChartTrendLine,
        inputName: 'chart-trend-line',
        parse: parseBool,
      }) ??
      parseFileBool(fileConfig.chartTrendLine) ??
      DEFAULTS.chartTrendLine,
    velocityMetrics:
      parseOrWarn({
        input: inputVelocityMetrics,
        inputName: 'velocity-metrics',
        parse: parseBool,
      }) ??
      parseFileBool(fileConfig.velocityMetrics) ??
      DEFAULTS.velocityMetrics,
  };

  if (config.readOnly && config.notificationThreshold !== 0) {
    core.warning(
      `notification-threshold is set to "${config.notificationThreshold}" on a read-only run. The threshold accumulates against a value stored on ${config.dataBranch}, which a read-only run never updates, so it will either fire on every run or never fire. Use notification-threshold 0 here and gate on the stars-changed output instead.`,
    );
  }

  core.info(
    `Config: visibility=${config.visibility}, includeArchived=${config.includeArchived}, includeForks=${config.includeForks}`,
  );
  if (config.onlyRepos.length > 0) {
    core.info(`Config: tracking only repos: ${config.onlyRepos.join(', ')}`);
  }
  if (config.excludeRepos.length > 0) {
    core.info(`Config: excluding repos: ${config.excludeRepos.join(', ')}`);
  }
  if (config.onlyOrgs.length > 0) {
    core.info(`Config: tracking only orgs: ${config.onlyOrgs.join(', ')}`);
  }
  if (config.excludeOrgs.length > 0) {
    core.info(`Config: excluding orgs: ${config.excludeOrgs.join(', ')}`);
  }

  return config;
}
