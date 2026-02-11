import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@actions/core', () => ({
  getInput: vi.fn().mockReturnValue(''),
  info: vi.fn(),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn().mockReturnValue(''),
  };
});

import * as fs from 'node:fs';
import * as core from '@actions/core';
import {
  DEFAULTS,
  loadConfig,
  loadConfigFile,
  parseBool,
  parseList,
  parseNumber,
} from '../src/config';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(core.getInput).mockReturnValue('');
  vi.mocked(fs.existsSync).mockReturnValue(false);
  vi.mocked(fs.readFileSync).mockReturnValue('');
});

describe('parseList', () => {
  it('returns empty array for empty string', () => {
    expect(parseList('')).toEqual([]);
  });

  it('returns empty array for null/undefined', () => {
    expect(parseList(null)).toEqual([]);
    expect(parseList(undefined)).toEqual([]);
  });

  it('splits comma-separated values and trims whitespace', () => {
    expect(parseList('foo, bar , baz')).toEqual(['foo', 'bar', 'baz']);
  });

  it('filters out empty segments', () => {
    expect(parseList('foo,,bar,')).toEqual(['foo', 'bar']);
  });
});

describe('parseBool', () => {
  it('returns undefined for empty/null/undefined', () => {
    expect(parseBool('')).toBeUndefined();
    expect(parseBool(null)).toBeUndefined();
    expect(parseBool(undefined)).toBeUndefined();
  });

  it('parses "true" as true', () => {
    expect(parseBool('true')).toBe(true);
    expect(parseBool(true)).toBe(true);
  });

  it('parses anything else as false', () => {
    expect(parseBool('false')).toBe(false);
    expect(parseBool('yes')).toBe(false);
  });
});

describe('parseNumber', () => {
  it('returns undefined for empty/null/undefined', () => {
    expect(parseNumber('')).toBeUndefined();
    expect(parseNumber(null)).toBeUndefined();
  });

  it('parses valid integers', () => {
    expect(parseNumber('42')).toBe(42);
    expect(parseNumber('0')).toBe(0);
  });

  it('returns undefined for non-numeric strings', () => {
    expect(parseNumber('abc')).toBeUndefined();
  });
});

describe('loadConfigFile', () => {
  it('returns empty object when file does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(loadConfigFile('star-tracker.yml')).toEqual({});
  });

  it('parses YAML config file correctly', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(`
visibility: "private"
include_archived: true
include_forks: false
exclude_repos:
  - "old-repo"
only_repos: []
min_stars: 5
    `);

    const config = loadConfigFile('star-tracker.yml');
    expect(config.visibility).toBe('private');
    expect(config.includeArchived).toBe(true);
    expect(config.includeForks).toBe(false);
    expect(config.excludeRepos).toEqual(['old-repo']);
    expect(config.minStars).toBe(5);
  });

  it('handles empty YAML file', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('');
    expect(loadConfigFile('star-tracker.yml')).toEqual({});
  });
});

describe('loadConfig', () => {
  it('uses defaults when no config file and no inputs', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const config = loadConfig();

    expect(config.visibility).toBe(DEFAULTS.visibility);
    expect(config.includeArchived).toBe(DEFAULTS.includeArchived);
    expect(config.includeForks).toBe(DEFAULTS.includeForks);
    expect(config.excludeRepos).toEqual(DEFAULTS.excludeRepos);
    expect(config.onlyRepos).toEqual(DEFAULTS.onlyRepos);
    expect(config.minStars).toBe(DEFAULTS.minStars);
  });

  it('action inputs override config file values', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('visibility: "public"\nmin_stars: 10');

    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === 'visibility') return 'private';
      if (name === 'min-stars') return '20';
      return '';
    });

    const config = loadConfig();
    expect(config.visibility).toBe('private');
    expect(config.minStars).toBe(20);
  });

  it('throws on invalid visibility', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === 'visibility') return 'invalid';
      return '';
    });

    expect(() => loadConfig()).toThrow(/Invalid visibility/);
  });

  it('parses exclude-repos input as comma-separated list', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === 'exclude-repos') return 'repo-a, repo-b';
      return '';
    });

    const config = loadConfig();
    expect(config.excludeRepos).toEqual(['repo-a', 'repo-b']);
  });
});
