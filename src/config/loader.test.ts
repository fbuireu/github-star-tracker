import * as fs from 'node:fs';
import * as core from '@actions/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULTS } from './defaults';
import { loadConfig, loadConfigFile } from './loader';
import {
  parseBool,
  parseDecimal,
  parseHexColor,
  parseList,
  parseNotificationThreshold,
  parseNumber,
} from './parsers';
import { Visibility } from './types';

vi.mock('@actions/core', () => ({
  getInput: vi.fn().mockReturnValue(''),
  info: vi.fn(),
  warning: vi.fn(),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();

  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn().mockReturnValue(''),
  };
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

describe('parseHexColor', () => {
  it('returns undefined for empty/null/undefined', () => {
    expect(parseHexColor('')).toBeUndefined();
    expect(parseHexColor(null)).toBeUndefined();
    expect(parseHexColor(undefined)).toBeUndefined();
  });

  it('accepts 3/4/6/8-digit hex and lowercases', () => {
    expect(parseHexColor('#abc')).toBe('#abc');
    expect(parseHexColor('#abcd')).toBe('#abcd');
    expect(parseHexColor('#AABBCC')).toBe('#aabbcc');
    expect(parseHexColor('#aabbccdd')).toBe('#aabbccdd');
  });

  it('accepts hex without the leading # and normalizes it', () => {
    expect(parseHexColor('6b63ff')).toBe('#6b63ff');
    expect(parseHexColor('AABBCC')).toBe('#aabbcc');
    expect(parseHexColor('abc')).toBe('#abc');
  });

  it('trims surrounding whitespace', () => {
    expect(parseHexColor('  #6F42C1  ')).toBe('#6f42c1');
  });

  it('returns undefined for invalid colors', () => {
    expect(parseHexColor('red')).toBeUndefined();
    expect(parseHexColor('#xyz')).toBeUndefined();
    expect(parseHexColor('#12')).toBeUndefined();
    expect(parseHexColor('#1234567')).toBeUndefined();
  });
});

describe('parseDecimal', () => {
  it('returns undefined for empty/null/undefined', () => {
    expect(parseDecimal('')).toBeUndefined();
    expect(parseDecimal(null)).toBeUndefined();
    expect(parseDecimal(undefined)).toBeUndefined();
  });

  it('parses positive decimals and integers', () => {
    expect(parseDecimal('2.5')).toBe(2.5);
    expect(parseDecimal('3')).toBe(3);
  });

  it('returns undefined for non-positive, non-finite or non-numeric values', () => {
    expect(parseDecimal('abc')).toBeUndefined();
    expect(parseDecimal('0')).toBeUndefined();
    expect(parseDecimal('-1')).toBeUndefined();
    expect(parseDecimal('Infinity')).toBeUndefined();
    expect(parseDecimal('1e999')).toBeUndefined();
  });
});

describe('parseNotificationThreshold', () => {
  it('returns undefined for empty/null/undefined', () => {
    expect(parseNotificationThreshold('')).toBeUndefined();
    expect(parseNotificationThreshold(null)).toBeUndefined();
    expect(parseNotificationThreshold(undefined)).toBeUndefined();
  });

  it('returns "auto" for "auto"', () => {
    expect(parseNotificationThreshold('auto')).toBe('auto');
  });

  it('parses valid integers', () => {
    expect(parseNotificationThreshold('0')).toBe(0);
    expect(parseNotificationThreshold('5')).toBe(5);
    expect(parseNotificationThreshold('10')).toBe(10);
  });

  it('returns undefined for non-numeric strings', () => {
    expect(parseNotificationThreshold('abc')).toBeUndefined();
  });
});

describe('loadConfigFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(core.getInput).mockReturnValue('');
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readFileSync).mockReturnValue('');
  });

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

    expect(config.visibility).toBe(Visibility.PRIVATE);
    expect(config.includeArchived).toBe(true);
    expect(config.includeForks).toBe(false);
    expect(config.excludeRepos).toEqual(['old-repo']);
    expect(config.minStars).toBe(5);
  });

  it('accepts kebab-case keys in the config file', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('include-charts: false\nmin-stars: 7');

    const config = loadConfigFile('star-tracker.yml');

    expect(config.includeCharts).toBe(false);
    expect(config.minStars).toBe(7);
  });

  it('prefers snake_case over kebab-case when both are present', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('min_stars: 5\nmin-stars: 99');

    const config = loadConfigFile('star-tracker.yml');

    expect(config.minStars).toBe(5);
  });

  it('handles empty YAML file', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('');
    expect(loadConfigFile('star-tracker.yml')).toEqual({});
  });

  it('handles a whitespace-only YAML file', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('   \n  \n');
    expect(loadConfigFile('star-tracker.yml')).toEqual({});
  });

  it('returns empty object and warns on malformed YAML', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('visibility: "public"\n  bad: : :');

    expect(loadConfigFile('star-tracker.yml')).toEqual({});
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('Failed to parse config file'),
    );
  });
});

describe('loadConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(core.getInput).mockReturnValue('');
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readFileSync).mockReturnValue('');
  });

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

    expect(config.visibility).toBe(Visibility.PRIVATE);
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

  it('parses notification-threshold as number', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === 'notification-threshold') return '5';
      return '';
    });

    const config = loadConfig();
    expect(config.notificationThreshold).toBe(5);
  });

  it('parses notification-threshold as auto', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === 'notification-threshold') return 'auto';
      return '';
    });

    const config = loadConfig();
    expect(config.notificationThreshold).toBe('auto');
  });

  it('defaults notification-threshold to auto', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const config = loadConfig();

    expect(config.notificationThreshold).toBe('auto');
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

  it('parses only-orgs input as comma-separated list', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === 'only-orgs') return 'org-a, org-b';
      return '';
    });

    const config = loadConfig();

    expect(config.onlyOrgs).toEqual(['org-a', 'org-b']);
  });

  it('parses exclude-orgs input as comma-separated list', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === 'exclude-orgs') return 'org-x,org-y';
      return '';
    });

    const config = loadConfig();

    expect(config.excludeOrgs).toEqual(['org-x', 'org-y']);
  });

  it('reads only_orgs and exclude_orgs from config file', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('only_orgs:\n- "org-a"\nexclude_orgs:\n- "org-z"');

    const config = loadConfig();

    expect(config.onlyOrgs).toEqual(['org-a']);
    expect(config.excludeOrgs).toEqual(['org-z']);
  });

  it('defaults org filters to empty arrays', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const config = loadConfig();

    expect(config.onlyOrgs).toEqual(DEFAULTS.onlyOrgs);
    expect(config.excludeOrgs).toEqual(DEFAULTS.excludeOrgs);
  });

  it('defaults chart line color and width', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const config = loadConfig();

    expect(config.chartLineColor).toBe(DEFAULTS.chartLineColor);
    expect(config.chartLineWidth).toBe(DEFAULTS.chartLineWidth);
  });

  it('parses chart-line-color and chart-line-width inputs', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === 'chart-line-color') return '#6f42c1';
      if (name === 'chart-line-width') return '4';
      return '';
    });

    const config = loadConfig();

    expect(config.chartLineColor).toBe('#6f42c1');
    expect(config.chartLineWidth).toBe(4);
  });

  it('preserves decimal chart-line-width (does not truncate 2.5)', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === 'chart-line-width') return '2.5';
      return '';
    });

    const config = loadConfig();

    expect(config.chartLineWidth).toBe(2.5);
  });

  it('falls back and warns on invalid chart-line-color', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === 'chart-line-color') return 'red';
      return '';
    });

    const config = loadConfig();

    expect(config.chartLineColor).toBe(DEFAULTS.chartLineColor);
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Invalid chart-line-color'));
  });

  it('accepts a bare hex chart-line-color without the leading #', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === 'chart-line-color') return '6b63ff';
      return '';
    });

    const config = loadConfig();

    expect(config.chartLineColor).toBe('#6b63ff');
  });

  it('defaults chart-max-points and chart-y-axis-side', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const config = loadConfig();

    expect(config.chartMaxPoints).toBe(DEFAULTS.chartMaxPoints);
    expect(config.chartYAxisSide).toBe(DEFAULTS.chartYAxisSide);
  });

  it('parses chart-max-points input including 0 for full history', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === 'chart-max-points') return '0';
      return '';
    });

    const config = loadConfig();

    expect(config.chartMaxPoints).toBe(0);
  });

  it('parses chart-y-axis-side input', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === 'chart-y-axis-side') return 'right';
      return '';
    });

    const config = loadConfig();

    expect(config.chartYAxisSide).toBe('right');
  });

  it('falls back and warns on invalid chart-y-axis-side', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === 'chart-y-axis-side') return 'top';
      return '';
    });

    const config = loadConfig();

    expect(config.chartYAxisSide).toBe(DEFAULTS.chartYAxisSide);
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Invalid chart-y-axis-side'));
  });

  it('defaults chart-smoothing to true', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const config = loadConfig();

    expect(config.chartSmoothing).toBe(true);
  });

  it('parses chart-smoothing input as false', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === 'chart-smoothing') return 'false';
      return '';
    });

    const config = loadConfig();

    expect(config.chartSmoothing).toBe(false);
  });

  it('defaults chart-show-points to true', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const config = loadConfig();

    expect(config.chartShowPoints).toBe(true);
  });

  it('parses chart-show-points input as false', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === 'chart-show-points') return 'false';
      return '';
    });

    const config = loadConfig();

    expect(config.chartShowPoints).toBe(false);
  });

  it('defaults track-stargazers to false', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const config = loadConfig();

    expect(config.trackStargazers).toBe(false);
  });

  it('parses track-stargazers input as true', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === 'track-stargazers') return 'true';
      return '';
    });

    const config = loadConfig();

    expect(config.trackStargazers).toBe(true);
  });

  it('reads track_stargazers from config file', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('track_stargazers: true');

    const config = loadConfig();

    expect(config.trackStargazers).toBe(true);
  });

  it('defaults smart sampling options', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const config = loadConfig();

    expect(config.smartSampling).toBe(DEFAULTS.smartSampling);
    expect(config.smartSamplingThreshold).toBe(DEFAULTS.smartSamplingThreshold);
    expect(config.smartSamplingPages).toBe(DEFAULTS.smartSamplingPages);
  });

  it('parses smart-sampling inputs', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === 'smart-sampling') return 'true';
      if (name === 'smart-sampling-threshold') return '5000';
      if (name === 'smart-sampling-pages') return '10';
      return '';
    });

    const config = loadConfig();

    expect(config.smartSampling).toBe(true);
    expect(config.smartSamplingThreshold).toBe(5000);
    expect(config.smartSamplingPages).toBe(10);
  });

  it('reads smart_sampling options from config file', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      'smart_sampling: true\nsmart_sampling_threshold: 2000\nsmart_sampling_pages: 15',
    );

    const config = loadConfig();

    expect(config.smartSampling).toBe(true);
    expect(config.smartSamplingThreshold).toBe(2000);
    expect(config.smartSamplingPages).toBe(15);
  });
});
