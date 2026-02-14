import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs');
vi.mock('node:child_process');
vi.mock('@actions/core', () => ({
  info: vi.fn(),
  debug: vi.fn(),
}));

import * as core from '@actions/core';
import type { StargazerMap } from '@domain/stargazers';
import type { History } from '@domain/types';
import {
  commitAndPush,
  readHistory,
  readStargazers,
  writeBadge,
  writeHistory,
  writeReport,
  writeStargazers,
} from './storage';

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
    });

    expect(result).toBe(true);
    expect(execSync).toHaveBeenCalledWith('git add -A', expect.any(Object));
    expect(execSync).toHaveBeenCalledWith('git commit -m "Update data"', expect.any(Object));
    expect(execSync).toHaveBeenCalledWith(
      'git push origin HEAD:star-tracker-data',
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
    });

    expect(result).toBe(false);
    expect(core.info).toHaveBeenCalledWith('No data changes to commit');
    expect(execSync).not.toHaveBeenCalledWith(
      expect.stringContaining('git commit'),
      expect.any(Object),
    );
  });
});
