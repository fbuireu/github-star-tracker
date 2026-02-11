import * as core from '@actions/core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import type { Config } from './types';

const VALID_VISIBILITIES = ['public', 'private', 'all'] as const;

export const DEFAULTS: Config = {
  visibility: 'public',
  includeArchived: false,
  includeForks: false,
  excludeRepos: [],
  onlyRepos: [],
  minStars: 0,
  dataBranch: 'star-tracker-data',
  maxHistory: 52,
  sendOnNoChanges: false,
};

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

  const visibility = (inputVisibility ||
    fileConfig.visibility ||
    DEFAULTS.visibility) as Config['visibility'];

  if (!VALID_VISIBILITIES.includes(visibility)) {
    throw new Error(
      `Invalid visibility "${visibility}". Must be one of: ${VALID_VISIBILITIES.join(', ')}`,
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
    minStars: parseNumber(inputMinStars) ?? fileConfig.minStars ?? DEFAULTS.minStars,
    dataBranch: inputDataBranch || fileConfig.dataBranch || DEFAULTS.dataBranch,
    maxHistory: parseNumber(inputMaxHistory) ?? fileConfig.maxHistory ?? DEFAULTS.maxHistory,
    sendOnNoChanges: parseBool(core.getInput('send-on-no-changes')) ?? false,
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
