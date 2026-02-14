import * as fs from 'node:fs';
import * as path from 'node:path';
import * as core from '@actions/core';
import * as yaml from 'js-yaml';
import { DEFAULTS as DEFAULTS_INTERNAL, VALID_VISIBILITIES } from './constants';
import { isValidLocale, type Locale } from './i18n';
import type { Config } from './types';

export { DEFAULTS } from './constants';

export function parseList(value: string | null | undefined): string[] {
  if (!value || value.trim() === '') return [];
  return value
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export function parseBool(value: string | boolean | null | undefined): boolean | undefined {
  if (value === '' || value === undefined || value === null) return undefined;
  return value === 'true' || value === true;
}

export function parseNumber(value: string | null | undefined): number | undefined {
  if (value === '' || value === undefined || value === null) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? undefined : n;
}

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

  const visibility = (inputVisibility ||
    fileConfig.visibility ||
    DEFAULTS_INTERNAL.visibility) as Config['visibility'];

  if (!Object.values(VALID_VISIBILITIES).includes(visibility)) {
    throw new Error(
      `Invalid visibility "${visibility}". Must be one of: ${Object.values(VALID_VISIBILITIES).join(', ')}`,
    );
  }

  const locale = (inputLocale || fileConfig.locale || DEFAULTS_INTERNAL.locale) as Locale;
  if (!isValidLocale(locale)) {
    core.warning(`Invalid locale "${locale}". Falling back to "en"`);
  }

  const config: Config = {
    visibility,
    includeArchived:
      parseBool(inputIncludeArchived) ??
      fileConfig.includeArchived ??
      DEFAULTS_INTERNAL.includeArchived,
    includeForks:
      parseBool(inputIncludeForks) ?? fileConfig.includeForks ?? DEFAULTS_INTERNAL.includeForks,
    excludeRepos: inputExcludeRepos
      ? parseList(inputExcludeRepos)
      : fileConfig.excludeRepos || DEFAULTS_INTERNAL.excludeRepos,
    onlyRepos: inputOnlyRepos
      ? parseList(inputOnlyRepos)
      : fileConfig.onlyRepos || DEFAULTS_INTERNAL.onlyRepos,
    minStars: parseNumber(inputMinStars) ?? fileConfig.minStars ?? DEFAULTS_INTERNAL.minStars,
    dataBranch: inputDataBranch || fileConfig.dataBranch || DEFAULTS_INTERNAL.dataBranch,
    maxHistory:
      parseNumber(inputMaxHistory) ?? fileConfig.maxHistory ?? DEFAULTS_INTERNAL.maxHistory,
    sendOnNoChanges: parseBool(core.getInput('send-on-no-changes')) ?? false,
    includeCharts:
      parseBool(inputIncludeCharts) ?? fileConfig.includeCharts ?? DEFAULTS_INTERNAL.includeCharts,
    locale: isValidLocale(locale) ? locale : DEFAULTS_INTERNAL.locale,
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
