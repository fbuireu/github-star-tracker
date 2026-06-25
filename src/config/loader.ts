import * as fs from 'node:fs';
import * as path from 'node:path';
import * as core from '@actions/core';
import { isValidLocale } from '@i18n';
import * as yaml from 'js-yaml';
import { DEFAULTS, VISIBILITY_CONFIG } from './defaults';
import {
  parseBool,
  parseDecimal,
  parseHexColor,
  parseList,
  parseNotificationThreshold,
  parseNumber,
} from './parsers';
import type { Config, Visibility } from './types';
import { ChartAxisSide } from './types';

interface FileConfig {
  visibility?: string;
  includeArchived?: boolean;
  includeForks?: boolean;
  excludeRepos?: string[];
  onlyRepos?: string[];
  excludeOrgs?: string[];
  onlyOrgs?: string[];
  minStars?: number;
  dataBranch?: string;
  maxHistory?: number;
  includeCharts?: boolean;
  locale?: string;
  notificationThreshold?: number | 'auto';
  trackStargazers?: boolean;
  topRepos?: number;
  smartSampling?: boolean;
  smartSamplingThreshold?: number;
  smartSamplingPages?: number;
  chartLineColor?: string;
  chartLineWidth?: number;
  chartMaxPoints?: number;
  chartYAxisSide?: string;
  chartSmoothing?: boolean;
}

function readFileKey<T>(parsed: Record<string, unknown>, snakeKey: string): T | undefined {
  const kebabKey = snakeKey.replaceAll('_', '-');
  const value = parsed[snakeKey] ?? parsed[kebabKey];

  return value as T | undefined;
}

function parseConfigYaml(content: string, configPath: string): Record<string, unknown> | null {
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

  const parsed = parseConfigYaml(fs.readFileSync(fullPath, 'utf8'), configPath);

  if (!parsed || typeof parsed !== 'object') {
    return {};
  }

  return {
    visibility: readFileKey(parsed, 'visibility'),
    includeArchived: readFileKey(parsed, 'include_archived'),
    includeForks: readFileKey(parsed, 'include_forks'),
    excludeRepos: readFileKey(parsed, 'exclude_repos'),
    onlyRepos: readFileKey(parsed, 'only_repos'),
    excludeOrgs: readFileKey(parsed, 'exclude_orgs'),
    onlyOrgs: readFileKey(parsed, 'only_orgs'),
    minStars: readFileKey(parsed, 'min_stars'),
    dataBranch: readFileKey(parsed, 'data_branch'),
    maxHistory: readFileKey(parsed, 'max_history'),
    includeCharts: readFileKey(parsed, 'include_charts'),
    locale: readFileKey(parsed, 'locale'),
    notificationThreshold: readFileKey(parsed, 'notification_threshold'),
    trackStargazers: readFileKey(parsed, 'track_stargazers'),
    topRepos: readFileKey(parsed, 'top_repos'),
    smartSampling: readFileKey(parsed, 'smart_sampling'),
    smartSamplingThreshold: readFileKey(parsed, 'smart_sampling_threshold'),
    smartSamplingPages: readFileKey(parsed, 'smart_sampling_pages'),
    chartLineColor: readFileKey(parsed, 'chart_line_color'),
    chartLineWidth: readFileKey(parsed, 'chart_line_width'),
    chartMaxPoints: readFileKey(parsed, 'chart_max_points'),
    chartYAxisSide: readFileKey(parsed, 'chart_y_axis_side'),
    chartSmoothing: readFileKey(parsed, 'chart_smoothing'),
  };
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
  const inputIncludeCharts = core.getInput('include-charts');
  const inputLocale = core.getInput('locale');
  const inputNotificationThreshold = core.getInput('notification-threshold');
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

  const visibility = (inputVisibility ||
    fileConfig.visibility ||
    DEFAULTS.visibility) as Visibility;

  if (!(visibility in VISIBILITY_CONFIG)) {
    throw new Error(
      `Invalid visibility "${visibility}". Must be one of: ${Object.keys(VISIBILITY_CONFIG).join(', ')}`,
    );
  }

  const locale = inputLocale || fileConfig.locale || DEFAULTS.locale;
  if (!isValidLocale(locale)) {
    core.warning(`Invalid locale "${locale}". Falling back to "en"`);
  }

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
    parseDecimal(inputChartLineWidth) ?? fileConfig.chartLineWidth ?? DEFAULTS.chartLineWidth;
  if (inputChartLineWidth && parseDecimal(inputChartLineWidth) === undefined) {
    core.warning(
      `Invalid chart-line-width "${inputChartLineWidth}". Falling back to ${DEFAULTS.chartLineWidth}`,
    );
  }

  const rawChartYAxisSide = inputChartYAxisSide || fileConfig.chartYAxisSide;
  const isValidAxisSide = (value: string | undefined): value is ChartAxisSide =>
    value === ChartAxisSide.LEFT || value === ChartAxisSide.RIGHT;
  const chartYAxisSide = isValidAxisSide(rawChartYAxisSide)
    ? rawChartYAxisSide
    : DEFAULTS.chartYAxisSide;
  if (rawChartYAxisSide && !isValidAxisSide(rawChartYAxisSide)) {
    core.warning(
      `Invalid chart-y-axis-side "${rawChartYAxisSide}". Must be "left" or "right". Falling back to "${DEFAULTS.chartYAxisSide}"`,
    );
  }

  const config: Config = {
    visibility,
    includeArchived:
      parseBool(inputIncludeArchived) ?? fileConfig.includeArchived ?? DEFAULTS.includeArchived,
    includeForks: parseBool(inputIncludeForks) ?? fileConfig.includeForks ?? DEFAULTS.includeForks,
    excludeRepos: inputExcludeRepos
      ? parseList(inputExcludeRepos)
      : fileConfig.excludeRepos || DEFAULTS.excludeRepos,
    onlyRepos: inputOnlyRepos
      ? parseList(inputOnlyRepos)
      : fileConfig.onlyRepos || DEFAULTS.onlyRepos,
    excludeOrgs: inputExcludeOrgs
      ? parseList(inputExcludeOrgs)
      : fileConfig.excludeOrgs || DEFAULTS.excludeOrgs,
    onlyOrgs: inputOnlyOrgs ? parseList(inputOnlyOrgs) : fileConfig.onlyOrgs || DEFAULTS.onlyOrgs,
    minStars: parseNumber(inputMinStars) ?? fileConfig.minStars ?? DEFAULTS.minStars,
    dataBranch: inputDataBranch || fileConfig.dataBranch || DEFAULTS.dataBranch,
    maxHistory: parseNumber(inputMaxHistory) ?? fileConfig.maxHistory ?? DEFAULTS.maxHistory,
    sendOnNoChanges: parseBool(core.getInput('send-on-no-changes')) ?? false,
    includeCharts:
      parseBool(inputIncludeCharts) ?? fileConfig.includeCharts ?? DEFAULTS.includeCharts,
    locale: isValidLocale(locale) ? locale : DEFAULTS.locale,
    notificationThreshold:
      parseNotificationThreshold({ value: inputNotificationThreshold }) ??
      fileConfig.notificationThreshold ??
      DEFAULTS.notificationThreshold,
    trackStargazers:
      parseBool(inputTrackStargazers) ?? fileConfig.trackStargazers ?? DEFAULTS.trackStargazers,
    topRepos: parseNumber(inputTopRepos) ?? fileConfig.topRepos ?? DEFAULTS.topRepos,
    smartSampling:
      parseBool(inputSmartSampling) ?? fileConfig.smartSampling ?? DEFAULTS.smartSampling,
    smartSamplingThreshold:
      parseNumber(inputSmartSamplingThreshold) ??
      fileConfig.smartSamplingThreshold ??
      DEFAULTS.smartSamplingThreshold,
    smartSamplingPages:
      parseNumber(inputSmartSamplingPages) ??
      fileConfig.smartSamplingPages ??
      DEFAULTS.smartSamplingPages,
    chartLineColor,
    chartLineWidth,
    chartMaxPoints:
      parseNumber(inputChartMaxPoints) ?? fileConfig.chartMaxPoints ?? DEFAULTS.chartMaxPoints,
    chartYAxisSide,
    chartSmoothing:
      parseBool(inputChartSmoothing) ?? fileConfig.chartSmoothing ?? DEFAULTS.chartSmoothing,
  };

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
