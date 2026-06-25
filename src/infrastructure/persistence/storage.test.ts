import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as core from '@actions/core';
import type { StargazerMap } from '@domain/stargazers';
import type { History } from '@domain/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  commitAndPush,
  readHistory,
  readStargazers,
  writeBadge,
  writeChart,
  writeHistory,
  writeHtmlReport,
  writeReport,
  writeStargazers,
} from './storage';

vi.mock('node:fs');
vi.mock('node:child_process');
vi.mock('@actions/core', () => ({
  info: vi.fn(),
  debug: vi.fn(),
  setSecret: vi.fn(),
}));

describe('readHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty history when file does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = readHistory('/data');

    expect(result).toEqual({ snapshots: [] });
  });

  it('reads and parses history file when it exists', () => {
    const history: History = {
      snapshots: [
        {
          timestamp: '2024-01-01T00:00:00Z',
          totalStars: 100,
          repos: [{ name: 'test', owner: 'user', fullName: 'user/test', stars: 100 }],
        },
      ],
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(history));

    const result = readHistory('/data');

    expect(result).toEqual(history);
    expect(fs.readFileSync).toHaveBeenCalledWith(path.join('/data', 'stars-data.json'), 'utf8');
  });
});

describe('writeHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes history to file', () => {
    const history: History = {
      snapshots: [
        {
          timestamp: '2024-01-01T00:00:00Z',
          totalStars: 100,
          repos: [{ name: 'test', owner: 'user', fullName: 'user/test', stars: 100 }],
        },
      ],
    };

    writeHistory({ dataDir: '/data', history });

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      path.join('/data', 'stars-data.json'),
      JSON.stringify(history, null, 2),
    );
  });
});

describe('writeReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes markdown report to file', () => {
    const markdown = '# Test Report\n\nContent';

    writeReport({ dataDir: '/data', markdown });

    expect(fs.writeFileSync).toHaveBeenCalledWith(path.join('/data', 'README.md'), markdown);
  });
});

describe('writeHtmlReport', () => {
  const originalRunnerTemp = process.env.RUNNER_TEMP;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalRunnerTemp === undefined) {
      delete process.env.RUNNER_TEMP;
    } else {
      process.env.RUNNER_TEMP = originalRunnerTemp;
    }
  });

  it('writes the HTML report to RUNNER_TEMP and returns its path', () => {
    process.env.RUNNER_TEMP = '/runner/tmp';
    const htmlReport = '<p>Report</p>';

    const filePath = writeHtmlReport({ htmlReport });

    const expectedPath = path.join('/runner/tmp', 'star-tracker-report.html');
    expect(filePath).toBe(expectedPath);
    expect(fs.writeFileSync).toHaveBeenCalledWith(expectedPath, htmlReport);
  });

  it('falls back to the current working directory when RUNNER_TEMP is unset', () => {
    delete process.env.RUNNER_TEMP;
    const htmlReport = '<p>Report</p>';

    const filePath = writeHtmlReport({ htmlReport });

    expect(filePath).toBe(path.join(process.cwd(), 'star-tracker-report.html'));
  });
});

describe('writeBadge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes SVG badge to file', () => {
    const svg = '<svg>badge</svg>';

    writeBadge({ dataDir: '/data', svg });

    expect(fs.writeFileSync).toHaveBeenCalledWith(path.join('/data', 'stars-badge.svg'), svg);
  });
});

describe('writeChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates charts directory and writes SVG file', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const svg = '<svg>chart</svg>';

    writeChart({ dataDir: '/data', filename: 'star-history.svg', svg });

    expect(fs.existsSync).toHaveBeenCalledWith(path.join('/data', 'charts'));
    expect(fs.mkdirSync).toHaveBeenCalledWith(path.join('/data', 'charts'), { recursive: true });
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      path.join('/data', 'charts', 'star-history.svg'),
      svg,
    );
  });

  it('skips mkdir when charts directory already exists', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    writeChart({ dataDir: '/data', filename: 'star-history.svg', svg: '<svg />' });

    expect(fs.mkdirSync).not.toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      path.join('/data', 'charts', 'star-history.svg'),
      '<svg />',
    );
  });
});

describe('readStargazers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty map when file does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = readStargazers('/data');

    expect(result).toEqual({});
  });

  it('reads and parses stargazers file when it exists', () => {
    const stargazerMap: StargazerMap = { 'user/repo-a': ['alice', 'bob'] };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(stargazerMap));

    const result = readStargazers('/data');

    expect(result).toEqual(stargazerMap);
    expect(fs.readFileSync).toHaveBeenCalledWith(path.join('/data', 'stargazers.json'), 'utf8');
  });
});

describe('writeStargazers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes stargazer map to file', () => {
    const stargazerMap: StargazerMap = { 'user/repo-a': ['alice', 'bob'] };

    writeStargazers({ dataDir: '/data', stargazerMap });

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      path.join('/data', 'stargazers.json'),
      JSON.stringify(stargazerMap, null, 2),
    );
  });
});

describe('commitAndPush', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('commits and pushes changes when there are staged changes', () => {
    vi.mocked(execSync)
      .mockReturnValueOnce('')
      .mockImplementationOnce(() => {
        throw new Error('Changes detected');
      })
      .mockReturnValueOnce('')
      .mockReturnValueOnce('');

    const result = commitAndPush({
      dataDir: '/data',
      dataBranch: 'star-tracker-data',
      message: 'Update data',
      token: 'fake-token',
    });

    const basicCredential = Buffer.from('x-access-token:fake-token').toString('base64');

    expect(result).toBe(true);
    expect(execSync).toHaveBeenCalledWith('git add -A', expect.any(Object));
    expect(execSync).toHaveBeenCalledWith('git commit -m "Update data"', expect.any(Object));
    expect(core.setSecret).toHaveBeenCalledWith(basicCredential);
    expect(execSync).toHaveBeenCalledWith(
      `git -c http.extraheader="AUTHORIZATION: basic ${basicCredential}" push origin HEAD:star-tracker-data`,
      expect.any(Object),
    );
    expect(core.info).toHaveBeenCalledWith('Data committed and pushed to star-tracker-data');
  });

  it('returns false when there are no changes to commit', () => {
    vi.mocked(execSync).mockReturnValueOnce('').mockReturnValueOnce('');

    const result = commitAndPush({
      dataDir: '/data',
      dataBranch: 'star-tracker-data',
      message: 'Update data',
      token: 'fake-token',
    });

    expect(result).toBe(false);
    expect(core.info).toHaveBeenCalledWith('No data changes to commit');
    expect(execSync).not.toHaveBeenCalledWith(
      expect.stringContaining('git commit'),
      expect.any(Object),
    );
  });
});
