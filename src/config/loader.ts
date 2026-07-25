import * as fs from 'node:fs';
import * as path from 'node:path';
import * as core from '@actions/core';
import { LOCALES } from '@i18n';
import * as yaml from 'js-yaml';
import { DEFAULTS } from './defaults';
import {
  parseBool,
  parseDecimal,
  parseFileBool,
  parseHexColor,
  parseList,
  parseNotificationThreshold,
  parseNumber,
  parseNumberList,
  toStringList,
} from './parsers';
import type { Config } from './types';
import {
  ChartAxisSide,
  ChartCurve,
  ChartRange,
  ChartTheme,
  CompareAgainst,
  NotificationMode,
  Visibility,
} from './types';

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

const DATA_BRANCH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const UPPERCASE_LETTER_PATTERN = /[A-Z]/g;

function assertValidDataBranch(dataBranch: string): void {
  const isValid =
    DATA_BRANCH_PATTERN.test(dataBranch) &&
    !dataBranch.includes('..') &&
    !dataBranch.endsWith('/') &&
    !dataBranch.endsWith('.lock');

  if (!isValid) {
    throw new Error(
      `Invalid data-branch "${dataBranch}". Use only letters, digits, ".", "-", "_" and "/", starting with a letter or digit.`,
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
  fallback: T;
}

function parseOrWarn<T>({
  input,
  inputName,
  parse,
  fallback,
}: ParseOrWarnParams<T>): T | undefined {
  const parsed = parse(input);

  if (input !== '' && parsed === undefined) {
    const shown = typeof fallback === 'string' ? `"${fallback}"` : fallback;
    core.warning(`Invalid ${inputName} "${input}". Falling back to ${shown}`);
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
  const configPath = core.getInput('config-path') || 'star-tracker.yml';
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
    parseHexColor(fileConfig.chartLineColor) ??
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
      parseBool(inputIncludeArchived) ??
      parseFileBool(fileConfig.includeArchived) ??
      DEFAULTS.includeArchived,
    includeForks:
      parseBool(inputIncludeForks) ??
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
        parse: parseNumber,
        fallback: DEFAULTS.minStars,
      }) ??
      parseNumber(fileConfig.minStars) ??
      DEFAULTS.minStars,
    dataBranch,
    maxHistory:
      parseOrWarn({
        input: inputMaxHistory,
        inputName: 'max-history',
        parse: parseNumber,
        fallback: DEFAULTS.maxHistory,
      }) ??
      parseNumber(fileConfig.maxHistory) ??
      DEFAULTS.maxHistory,
    compareAgainst,
    readOnly: parseBool(inputReadOnly) ?? parseFileBool(fileConfig.readOnly) ?? DEFAULTS.readOnly,
    sendOnNoChanges: parseBool(core.getInput('send-on-no-changes')) ?? DEFAULTS.sendOnNoChanges,
    includeCharts:
      parseBool(inputIncludeCharts) ??
      parseFileBool(fileConfig.includeCharts) ??
      DEFAULTS.includeCharts,
    locale,
    notificationThreshold:
      parseOrWarn({
        input: inputNotificationThreshold,
        inputName: 'notification-threshold',
        parse: parseNotificationThreshold,
        fallback: DEFAULTS.notificationThreshold,
      }) ??
      parseNotificationThreshold(fileConfig.notificationThreshold) ??
      DEFAULTS.notificationThreshold,
    notificationMode,
    trackStargazers:
      parseBool(inputTrackStargazers) ??
      parseFileBool(fileConfig.trackStargazers) ??
      DEFAULTS.trackStargazers,
    topRepos:
      parseOrWarn({
        input: inputTopRepos,
        inputName: 'top-repos',
        parse: parseNumber,
        fallback: DEFAULTS.topRepos,
      }) ??
      parseNumber(fileConfig.topRepos) ??
      DEFAULTS.topRepos,
    smartSampling:
      parseBool(inputSmartSampling) ??
      parseFileBool(fileConfig.smartSampling) ??
      DEFAULTS.smartSampling,
    smartSamplingThreshold:
      parseOrWarn({
        input: inputSmartSamplingThreshold,
        inputName: 'smart-sampling-threshold',
        parse: parseNumber,
        fallback: DEFAULTS.smartSamplingThreshold,
      }) ??
      parseNumber(fileConfig.smartSamplingThreshold) ??
      DEFAULTS.smartSamplingThreshold,
    smartSamplingPages:
      parseOrWarn({
        input: inputSmartSamplingPages,
        inputName: 'smart-sampling-pages',
        parse: parseNumber,
        fallback: DEFAULTS.smartSamplingPages,
      }) ??
      parseNumber(fileConfig.smartSamplingPages) ??
      DEFAULTS.smartSamplingPages,
    chartLineColor,
    chartLineWidth,
    chartMaxPoints:
      parseOrWarn({
        input: inputChartMaxPoints,
        inputName: 'chart-max-points',
        parse: parseNumber,
        fallback: DEFAULTS.chartMaxPoints,
      }) ??
      parseNumber(fileConfig.chartMaxPoints) ??
      DEFAULTS.chartMaxPoints,
    chartYAxisSide,
    chartSmoothing:
      parseBool(inputChartSmoothing) ??
      parseFileBool(fileConfig.chartSmoothing) ??
      DEFAULTS.chartSmoothing,
    chartCurve,
    chartShowPoints:
      parseBool(inputChartShowPoints) ??
      parseFileBool(fileConfig.chartShowPoints) ??
      DEFAULTS.chartShowPoints,
    chartAnimation:
      parseBool(inputChartAnimation) ??
      parseFileBool(fileConfig.chartAnimation) ??
      DEFAULTS.chartAnimation,
    chartMilestones:
      parseBool(inputChartMilestones) ??
      parseFileBool(fileConfig.chartMilestones) ??
      DEFAULTS.chartMilestones,
    chartBeginAtZero:
      parseBool(inputChartBeginAtZero) ??
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
      parseBool(inputChartTrendLine) ??
      parseFileBool(fileConfig.chartTrendLine) ??
      DEFAULTS.chartTrendLine,
    velocityMetrics:
      parseBool(inputVelocityMetrics) ??
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
