import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as core from '@actions/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, initializeDataBranch } from './worktree';

vi.mock('node:fs');
vi.mock('node:child_process');
vi.mock('@actions/core', () => ({
  info: vi.fn(),
  debug: vi.fn(),
}));

describe('initializeDataBranch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('configures git user and creates worktree when branch exists', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(execFileSync).mockReturnValue('');

    const result = initializeDataBranch('star-tracker-data');

    expect(execFileSync).toHaveBeenCalledWith(
      'git',
      ['rev-parse', '--is-inside-work-tree'],
      expect.any(Object),
    );
    expect(execFileSync).toHaveBeenCalledWith(
      'git',
      ['config', 'user.name', 'github-actions[bot]'],
      expect.any(Object),
    );
    expect(execFileSync).toHaveBeenCalledWith(
      'git',
      ['config', 'user.email', 'github-actions[bot]@users.noreply.github.com'],
      expect.any(Object),
    );
    expect(result).toBe('.star-tracker-data');
  });

  it('throws an actionable error when not inside a checked-out repository', () => {
    vi.mocked(execFileSync).mockImplementationOnce(() => {
      throw new Error('fatal: not in a git directory');
    });

    expect(() => initializeDataBranch('star-tracker-data')).toThrow(
      'This action must run inside a checked-out repository. Add an "actions/checkout" step before this action in your workflow.',
    );
  });

  it('handles existing worktree removal', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(execFileSync)
      .mockReturnValueOnce('')
      .mockReturnValueOnce('')
      .mockReturnValueOnce('')
      .mockReturnValueOnce('')
      .mockReturnValueOnce('')
      .mockReturnValueOnce('')
      .mockReturnValueOnce('');

    initializeDataBranch('star-tracker-data');

    expect(execFileSync).toHaveBeenCalledWith(
      'git',
      ['worktree', 'remove', '.star-tracker-data', '--force'],
      expect.any(Object),
    );
  });

  it('creates new orphan branch when remote branch does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const execError = new Error('Branch not found');

    vi.mocked(execFileSync)
      .mockReturnValueOnce('')
      .mockReturnValueOnce('')
      .mockReturnValueOnce('')
      .mockImplementationOnce(() => {
        throw execError;
      })
      .mockReturnValueOnce('')
      .mockReturnValueOnce('')
      .mockReturnValueOnce('')
      .mockReturnValueOnce('');

    initializeDataBranch('star-tracker-data');

    expect(core.info).toHaveBeenCalledWith(
      'Branch "star-tracker-data" does not exist on remote, will create it',
    );
    expect(execFileSync).toHaveBeenCalledWith(
      'git',
      ['checkout', '--orphan', 'star-tracker-data'],
      expect.objectContaining({ cwd: expect.any(String) }),
    );
  });

  it('handles worktree removal failure gracefully', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const execError = new Error('Worktree removal failed');

    vi.mocked(execFileSync)
      .mockReturnValueOnce('')
      .mockReturnValueOnce('')
      .mockReturnValueOnce('')
      .mockReturnValueOnce('')
      .mockImplementationOnce(() => {
        throw execError;
      })
      .mockReturnValueOnce('')
      .mockReturnValueOnce('');

    expect(() => initializeDataBranch('star-tracker-data')).not.toThrow();
    expect(core.debug).toHaveBeenCalledWith(
      'Could not remove existing worktree at .star-tracker-data, proceeding anyway',
    );
  });
});

describe('cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('removes worktree', () => {
    vi.mocked(execFileSync).mockReturnValue('');

    cleanup('/data');

    expect(execFileSync).toHaveBeenCalledWith(
      'git',
      ['worktree', 'remove', '/data', '--force'],
      expect.any(Object),
    );
  });

  it('handles worktree removal failure gracefully', () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('Worktree not found');
    });

    expect(() => cleanup('/data')).not.toThrow();
    expect(core.debug).toHaveBeenCalledWith(
      'Worktree cleanup for "/data" failed, it may have already been removed',
    );
  });
});
