import * as fs from 'node:fs';
import * as path from 'node:path';
import * as core from '@actions/core';
import { isValidLocale, type Locale } from '@i18n';
import * as yaml from 'js-yaml';
import { DEFAULTS, VALID_VISIBILITIES } from './defaults';
import { parseBool, parseList, parseNotificationThreshold, parseNumber } from './parsers';
import type { Config, Visibility } from './types';

interface FileConfig {
  visibility?: string;
  includeArchived?: boolean;
  includeForks?: boolean;
  excludeRepos?: string[];
  onlyRepos?: string[];
  minStars?: number;
  dataBranch?: string;
  maxHistory?: number;
  includeCharts?: boolean;
  locale?: string;
  notificationThreshold?: number | 'auto';
  trackStargazers?: boolean;
}

export function loadConfigFile(configPath: string): FileConfig {
  const fullPath = path.resolve(configPath);

  if (!fs.existsSync(fullPath)) {
    core.info(`No config file found at ${configPath}, using defaults`);
    return {};
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  const parsed = yaml.load(content) as Record<string, unknown> | null;

  if (!parsed || typeof parsed !== 'object') {
    return {};
  }

  return {
    visibility: parsed.visibility as string | undefined,
    includeArchived: parsed.include_archived as boolean | undefined,
    includeForks: parsed.include_forks as boolean | undefined,
    excludeRepos: parsed.exclude_repos as string[] | undefined,
    onlyRepos: parsed.only_repos as string[] | undefined,
    minStars: parsed.min_stars as number | undefined,
    dataBranch: parsed.data_branch as string | undefined,
    maxHistory: parsed.max_history as number | undefined,
    includeCharts: parsed.include_charts as boolean | undefined,
    locale: parsed.locale as string | undefined,
    notificationThreshold: parsed.notification_threshold as number | 'auto' | undefined,
    trackStargazers: parsed.track_stargazers as boolean | undefined,
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
  const inputMinStars = core.getInput('min-stars');
  const inputDataBranch = core.getInput('data-branch');
  const inputMaxHistory = core.getInput('max-history');
  const inputIncludeCharts = core.getInput('include-charts');
  const inputLocale = core.getInput('locale');
  const inputNotificationThreshold = core.getInput('notification-threshold');
  const inputTrackStargazers = core.getInput('track-stargazers');

  const visibility = (inputVisibility ||
    fileConfig.visibility ||
    DEFAULTS.visibility) as Visibility;

  if (!VALID_VISIBILITIES.includes(visibility)) {
    throw new Error(
      `Invalid visibility "${visibility}". Must be one of: ${VALID_VISIBILITIES.join(', ')}`,
    );
  }

  const locale = inputLocale || fileConfig.locale || DEFAULTS.locale;
  if (!isValidLocale(locale)) {
    core.warning(`Invalid locale "${locale}". Falling back to "en"`);
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

  return config;
}
