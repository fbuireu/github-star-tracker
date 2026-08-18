import * as fs from 'node:fs';
import * as path from 'node:path';
import * as core from '@actions/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execute } from './commands';
import { cleanup, initializeDataBranch } from './worktree';

vi.mock('node:fs');
vi.mock('./commands', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./commands')>()),
  execute: vi.fn(),
}));
vi.mock('@actions/core', () => ({
  info: vi.fn(),
  debug: vi.fn(),
  setSecret: vi.fn(),
}));

const BRANCH = 'star-tracker-data';
const DATA_DIR = `.${BRANCH}`;

function ranGit(...args: string[]): boolean {
  return vi
    .mocked(execute)
    .mock.calls.some(([params]) => JSON.stringify(params.args) === JSON.stringify(args));
}

function failGitWhen(matches: (args: string[]) => boolean, error = new Error('git failed')): void {
  vi.mocked(execute).mockImplementation(({ args }) => {
    if (matches(args)) throw error;

    return '';
  });
}

const isRemoteProbe = (args: string[]): boolean => args.includes('ls-remote');

function remoteHasBranch(): void {
  vi.mocked(execute).mockImplementation(({ args }) =>
    isRemoteProbe(args) ? `abc123	refs/heads/${BRANCH}` : '',
  );
}
const isWorktreeRemove = (args: string[]): boolean =>
  args[0] === 'worktree' && args[1] === 'remove';

describe('initializeDataBranch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(execute).mockReturnValue('');
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('derives the data directory from the branch name', () => {
    expect(initializeDataBranch({ dataBranch: BRANCH })).toBe(DATA_DIR);
  });

  it('guards the repository and sets the bot identity before touching the branch', () => {
    initializeDataBranch({ dataBranch: BRANCH });

    expect(ranGit('rev-parse', '--is-inside-work-tree')).toBe(true);
    expect(ranGit('config', 'user.name', 'github-actions[bot]')).toBe(true);
    expect(ranGit('config', 'user.email', 'github-actions[bot]@users.noreply.github.com')).toBe(
      true,
    );
  });

  it('adds the worktree from the remote branch when it already exists', () => {
    remoteHasBranch();

    initializeDataBranch({ dataBranch: BRANCH });

    expect(ranGit('fetch', 'origin', BRANCH)).toBe(true);
    expect(ranGit('worktree', 'add', DATA_DIR, `origin/${BRANCH}`)).toBe(true);
    expect(ranGit('checkout', '--orphan', BRANCH)).toBe(false);
  });

  it('lets a failing remote probe through instead of reading it as an absent branch', () => {
    failGitWhen(isRemoteProbe, new Error('fatal: could not read Username for https://github.com'));

    expect(() => initializeDataBranch({ dataBranch: BRANCH })).toThrow(/could not read Username/);
    expect(ranGit('checkout', '--orphan', BRANCH)).toBe(false);
  });

  it('authenticates the remote probe and the fetch when a token is supplied', () => {
    remoteHasBranch();

    initializeDataBranch({ dataBranch: BRANCH, token: 'secret-token' });

    const remoteCalls = vi
      .mocked(execute)
      .mock.calls.map(([params]) => params.args)
      .filter((args) => args.includes('ls-remote') || args.includes('fetch'));

    const credential = Buffer.from('x-access-token:secret-token').toString('base64');

    expect(remoteCalls).toHaveLength(2);
    for (const args of remoteCalls) {
      expect(args.slice(0, 2)).toEqual([
        '-c',
        `http.extraheader=AUTHORIZATION: basic ${credential}`,
      ]);
    }
    expect(core.setSecret).toHaveBeenCalledWith(credential);
  });

  it('adds exactly one header, so it cannot duplicate itself', () => {
    remoteHasBranch();

    initializeDataBranch({ dataBranch: BRANCH, token: 'secret-token' });

    const probe = vi
      .mocked(execute)
      .mock.calls.map(([params]) => params.args)
      .find((args) => args.includes('ls-remote'));

    expect((probe ?? []).filter((arg) => arg.startsWith('http.extraheader='))).toHaveLength(1);
  });

  it('throws an actionable error when not inside a checked-out repository', () => {
    failGitWhen((args) => args[0] === 'rev-parse');

    expect(() => initializeDataBranch({ dataBranch: BRANCH })).toThrow(
      'This action must run inside a checked-out repository. Add an "actions/checkout" step before this action in your workflow.',
    );
  });

  it('removes a stale worktree left on disk', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    initializeDataBranch({ dataBranch: BRANCH });

    expect(ranGit('worktree', 'remove', DATA_DIR, '--force')).toBe(true);
  });

  it('carries on when the stale worktree cannot be removed', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    failGitWhen(isWorktreeRemove);

    expect(() => initializeDataBranch({ dataBranch: BRANCH })).not.toThrow();
    expect(core.debug).toHaveBeenCalledWith(
      `Could not remove existing worktree at ${DATA_DIR}, proceeding anyway`,
    );
  });

  it('creates an orphan branch when the remote branch does not exist', () => {
    initializeDataBranch({ dataBranch: BRANCH });

    expect(core.info).toHaveBeenCalledWith(
      `Branch "${BRANCH}" does not exist on remote, will create it`,
    );
    expect(ranGit('worktree', 'add', '--detach', DATA_DIR)).toBe(true);
    expect(ranGit('checkout', '--orphan', BRANCH)).toBe(true);
    expect(ranGit('commit', '--allow-empty', '-m', 'Initialize star tracker data')).toBe(true);
    expect(ranGit('fetch', 'origin', BRANCH)).toBe(false);
  });

  it('runs the orphan subcommands inside the worktree', () => {
    initializeDataBranch({ dataBranch: BRANCH });

    const inWorktree = vi
      .mocked(execute)
      .mock.calls.map(([params]) => params)
      .filter((params) => params.options !== undefined);

    expect(inWorktree.map((params) => params.args[0])).toEqual(['checkout', 'rm', 'commit']);

    for (const params of inWorktree) {
      expect(params.options).toEqual({ cwd: path.resolve(DATA_DIR) });
    }
  });

  it('carries on when the new orphan branch has nothing to clear', () => {
    failGitWhen((args) => args[0] === 'rm');

    expect(() => initializeDataBranch({ dataBranch: BRANCH })).not.toThrow();
    expect(core.debug).toHaveBeenCalledWith(
      'Nothing to remove on the new orphan branch, proceeding anyway',
    );
  });

  it('refuses to create the branch on a read-only run', () => {
    expect(() => initializeDataBranch({ dataBranch: BRANCH, readOnly: true })).toThrow(
      /does not exist on the remote and this is a read-only run/,
    );
    expect(ranGit('checkout', '--orphan', BRANCH)).toBe(false);
  });
});

describe('cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(execute).mockReturnValue('');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('removes the worktree', () => {
    cleanup('/data');

    expect(ranGit('worktree', 'remove', '/data', '--force')).toBe(true);
  });

  it('never rethrows, so it is safe in a finally', () => {
    failGitWhen(isWorktreeRemove, new Error('Worktree not found'));

    expect(() => cleanup('/data')).not.toThrow();
    expect(core.debug).toHaveBeenCalledWith(
      'Worktree cleanup for "/data" failed, it may have already been removed',
    );
  });
});
