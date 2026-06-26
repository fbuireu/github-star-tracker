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
  parseNumberList,
} from './parsers';
import type { Config, Visibility } from './types';
import { ChartAxisSide, ChartTheme } from './types';

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
  chartShowPoints?: boolean;
  chartAnimation?: boolean;
  chartMilestones?: boolean;
  chartBeginAtZero?: boolean;
  chartTheme?: string;
  chartCustomMilestones?: number[] | string;
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

  const read = <T>(snakeKey: string): T | undefined =>
    (parsed[snakeKey] ?? parsed[snakeKey.replaceAll('_', '-')]) as T | undefined;

  return {
    visibility: read('visibility'),
    includeArchived: read('include_archived'),
    includeForks: read('include_forks'),
    excludeRepos: read('exclude_repos'),
    onlyRepos: read('only_repos'),
    excludeOrgs: read('exclude_orgs'),
    onlyOrgs: read('only_orgs'),
    minStars: read('min_stars'),
    dataBranch: read('data_branch'),
    maxHistory: read('max_history'),
    includeCharts: read('include_charts'),
    locale: read('locale'),
    notificationThreshold: read('notification_threshold'),
    trackStargazers: read('track_stargazers'),
    topRepos: read('top_repos'),
    smartSampling: read('smart_sampling'),
    smartSamplingThreshold: read('smart_sampling_threshold'),
    smartSamplingPages: read('smart_sampling_pages'),
    chartLineColor: read('chart_line_color'),
    chartLineWidth: read('chart_line_width'),
    chartMaxPoints: read('chart_max_points'),
    chartYAxisSide: read('chart_y_axis_side'),
    chartSmoothing: read('chart_smoothing'),
    chartShowPoints: read('chart_show_points'),
    chartAnimation: read('chart_animation'),
    chartMilestones: read('chart_milestones'),
    chartBeginAtZero: read('chart_begin_at_zero'),
    chartTheme: read('chart_theme'),
    chartCustomMilestones: read('chart_custom_milestones'),
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
  const inputChartShowPoints = core.getInput('chart-show-points');
  const inputChartAnimation = core.getInput('chart-animation');
  const inputChartMilestones = core.getInput('chart-milestones');
  const inputChartBeginAtZero = core.getInput('chart-begin-at-zero');
  const inputChartTheme = core.getInput('chart-theme');
  const inputChartCustomMilestones = core.getInput('chart-custom-milestones');

  const visibility = (inputVisibility ||
    fileConfig.visibility ||
    DEFAULTS.visibility) as Visibility;

  if (!(visibility in VISIBILITY_CONFIG)) {
    throw new Error(
      `Invalid visibility "${visibility}". Must be one of: ${Object.keys(VISIBILITY_CONFIG).join(', ')}`,
    );
  }

  const fileCustomMilestones = Array.isArray(fileConfig.chartCustomMilestones)
    ? parseNumberList(fileConfig.chartCustomMilestones.join(','))
    : parseNumberList(fileConfig.chartCustomMilestones);

  if (inputChartCustomMilestones && parseNumberList(inputChartCustomMilestones).length === 0) {
    core.warning(
      `Invalid chart-custom-milestones "${inputChartCustomMilestones}". Expected a comma-separated list of positive numbers. Falling back to the built-in milestones.`,
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

  const rawChartTheme = inputChartTheme || fileConfig.chartTheme;
  const isValidTheme = (value: string | undefined): value is ChartTheme =>
    value === ChartTheme.AUTO || value === ChartTheme.LIGHT || value === ChartTheme.DARK;
  const chartTheme = isValidTheme(rawChartTheme) ? rawChartTheme : DEFAULTS.chartTheme;
  if (rawChartTheme && !isValidTheme(rawChartTheme)) {
    core.warning(
      `Invalid chart-theme "${rawChartTheme}". Must be "auto", "light", or "dark". Falling back to "${DEFAULTS.chartTheme}"`,
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
      parseNotificationThreshold(inputNotificationThreshold) ??
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
    chartShowPoints:
      parseBool(inputChartShowPoints) ?? fileConfig.chartShowPoints ?? DEFAULTS.chartShowPoints,
    chartAnimation:
      parseBool(inputChartAnimation) ?? fileConfig.chartAnimation ?? DEFAULTS.chartAnimation,
    chartMilestones:
      parseBool(inputChartMilestones) ?? fileConfig.chartMilestones ?? DEFAULTS.chartMilestones,
    chartBeginAtZero:
      parseBool(inputChartBeginAtZero) ?? fileConfig.chartBeginAtZero ?? DEFAULTS.chartBeginAtZero,
    chartTheme,
    chartCustomMilestones: inputChartCustomMilestones
      ? parseNumberList(inputChartCustomMilestones)
      : fileCustomMilestones.length > 0
        ? fileCustomMilestones
        : DEFAULTS.chartCustomMilestones,
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
