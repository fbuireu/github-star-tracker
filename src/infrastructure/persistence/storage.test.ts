import * as fs from 'node:fs';
import * as path from 'node:path';
import * as core from '@actions/core';
import type { StargazerMap } from '@domain/stargazers';
import type { History } from '@domain/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execute } from '../git/commands';
import {
  Artefact,
  commitAndPush,
  pruneCharts,
  readHistory,
  readStargazers,
  writeArtefact,
  writeChart,
  writeHistory,
  writeHtmlReport,
  writeStargazers,
} from './storage';

vi.mock('node:fs');
vi.mock('../git/commands', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../git/commands')>()),
  execute: vi.fn(),
}));
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

  it('guarantees an array when the stored file has no snapshots key', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('{}');

    expect(readHistory('/data')).toEqual({ snapshots: [] });
  });

  it('guarantees an array when snapshots is not an array', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('{"snapshots":"garbage"}');

    expect(readHistory('/data')).toEqual({ snapshots: [] });
  });

  it('preserves starsAtLastNotification while coercing snapshots', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('{"starsAtLastNotification":520}');

    expect(readHistory('/data')).toEqual({ snapshots: [], starsAtLastNotification: 520 });
  });

  it('fails with an actionable message when the stored file is not valid JSON', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('{ not json');

    expect(() => readHistory('/data')).toThrow(/stars-data\.json on the data branch/);
  });

  it.each([
    ['null', 'null'],
    ['an array', '[]'],
    ['an array of snapshots', '[{"timestamp":"2026-01-01","totalStars":1,"repos":[]}]'],
    ['a number', '5'],
    ['a string', '"snapshots"'],
  ])('refuses %s rather than silently restarting the tracking record', (_label, contents) => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(contents);

    expect(() => readHistory('/data')).toThrow(/valid JSON but not an object/);
  });

  it('accepts a file written by this format version', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('{"version":1,"snapshots":[]}');

    expect(readHistory('/data')).toEqual({ snapshots: [] });
  });

  it('refuses a file written by a newer format version instead of misreading it', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('{"version":2,"snapshots":[]}');

    expect(() => readHistory('/data')).toThrow(/declares format version 2/);
  });

  it('refuses a version that is not a number', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('{"version":"1","snapshots":[]}');

    expect(() => readHistory('/data')).toThrow(/declares format version "1"/);
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
      JSON.stringify({ version: 1, ...history }, null, 2),
    );
  });

  it('stamps the format version as the first key so a reader sees it before the data', () => {
    writeHistory({ dataDir: '/data', history: { snapshots: [] } });

    const written = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;

    expect(Object.keys(JSON.parse(written))[0]).toBe('version');
  });

  it('round-trips: what writeHistory stamps, readHistory accepts and strips', () => {
    const history: History = { snapshots: [], starsAtLastNotification: 520 };

    writeHistory({ dataDir: '/data', history });

    const written = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(written);

    expect(readHistory('/data')).toEqual(history);
  });
});

describe('writeArtefact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    [Artefact.REPORT, 'README.md', '# Test Report\n\nContent'],
    [Artefact.BADGE, 'stars-badge.svg', '<svg>badge</svg>'],
    [Artefact.CSV, 'stars-data.csv', 'repository,stars'],
  ])('writes the %s artefact to %s', (artefact, filename, contents) => {
    writeArtefact({ dataDir: '/data', artefact, contents });

    expect(fs.writeFileSync).toHaveBeenCalledWith(path.join('/data', filename), contents);
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
  const CREDENTIAL = Buffer.from('x-access-token:fake-token').toString('base64');
  const push = {
    dataDir: '/data',
    dataBranch: 'star-tracker-data',
    message: 'Update data',
    token: 'fake-token',
  };

  function ranGit(...args: string[]): boolean {
    return vi
      .mocked(execute)
      .mock.calls.some(([params]) => JSON.stringify(params.args) === JSON.stringify(args));
  }

  function stageChanges({ pushError }: { pushError?: Error } = {}): void {
    vi.mocked(execute).mockImplementation(({ args }) => {
      if (args[0] === 'diff') throw new Error('Changes detected');
      if (pushError && args.includes('push')) throw pushError;

      return '';
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(execute).mockReturnValue('');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('commits and pushes changes when there are staged changes', () => {
    stageChanges();

    expect(commitAndPush(push)).toBe(true);
    expect(ranGit('add', '-A')).toBe(true);
    expect(ranGit('commit', '-m', 'Update data')).toBe(true);
    expect(core.setSecret).toHaveBeenCalledWith(CREDENTIAL);
    expect(
      ranGit(
        '-c',
        'http.extraheader=',
        '-c',
        `http.extraheader=AUTHORIZATION: basic ${CREDENTIAL}`,
        'push',
        'origin',
        'HEAD:star-tracker-data',
      ),
    ).toBe(true);
    expect(core.info).toHaveBeenCalledWith('Data committed and pushed to star-tracker-data');
  });

  it('passes a commit message with quotes through without breaking the command', () => {
    stageChanges();

    commitAndPush({ ...push, message: 'Update star data: 12 "total" (+3)' });

    expect(ranGit('commit', '-m', 'Update star data: 12 "total" (+3)')).toBe(true);
  });

  it('explains a rejected push instead of surfacing git’s raw text', () => {
    stageChanges({
      pushError: new Error(
        'Git command failed: "git push"\n ! [rejected] HEAD -> star-tracker-data (fetch first)',
      ),
    });

    expect(() => commitAndPush(push)).toThrow(
      /Another run pushed to "star-tracker-data" while this one was working/,
    );
  });

  it('lets any other push failure through untouched', () => {
    stageChanges({
      pushError: new Error('Git command failed: "git push"\nfatal: Authentication failed'),
    });

    expect(() => commitAndPush(push)).toThrow(/Authentication failed/);
  });

  it('returns false when there are no changes to commit', () => {
    expect(commitAndPush(push)).toBe(false);
    expect(ranGit('commit', '-m', 'Update data')).toBe(false);
  });
});

describe('pruneCharts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes chart files no longer produced and keeps the current ones', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([
      'star-history.svg',
      'user-gone.svg',
      'notes.txt',
    ] as unknown as ReturnType<typeof fs.readdirSync>);

    const removed = pruneCharts({ dataDir: '.data', keep: ['star-history.svg'] });

    expect(removed).toEqual(['user-gone.svg']);
    expect(fs.rmSync).toHaveBeenCalledWith(path.join('.data', 'charts', 'user-gone.svg'));
    expect(fs.rmSync).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when the charts directory does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    expect(pruneCharts({ dataDir: '.data', keep: [] })).toEqual([]);
    expect(fs.rmSync).not.toHaveBeenCalled();
  });
});
