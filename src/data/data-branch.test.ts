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
import type { History, Snapshot } from '../types';
import {
  cleanup,
  commitAndPush,
  getLastSnapshot,
  initializeDataBranch,
  readHistory,
  writeBadge,
  writeHistory,
  writeReport,
} from './data-branch';

describe('data-branch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initializeDataBranch', () => {
    it('configures git user and creates worktree when branch exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(execSync).mockReturnValue('');

      const result = initializeDataBranch('star-tracker-data');

      expect(execSync).toHaveBeenCalledWith(
        'git config user.name "github-actions[bot]"',
        expect.any(Object),
      );
      expect(execSync).toHaveBeenCalledWith(
        'git config user.email "github-actions[bot]@users.noreply.github.com"',
        expect.any(Object),
      );
      expect(result).toBe('.star-tracker-data');
    });

    it('handles existing worktree removal', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(execSync)
        .mockReturnValueOnce('')
        .mockReturnValueOnce('')
        .mockReturnValueOnce('')
        .mockReturnValueOnce('')
        .mockReturnValueOnce('')
        .mockReturnValueOnce('');

      initializeDataBranch('star-tracker-data');

      expect(execSync).toHaveBeenCalledWith(
        'git worktree remove .star-tracker-data --force',
        expect.any(Object),
      );
    });

    it('creates new orphan branch when remote branch does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const execError = new Error('Branch not found');
      vi.mocked(execSync)
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
      expect(execSync).toHaveBeenCalledWith(
        'git checkout --orphan star-tracker-data',
        expect.objectContaining({ cwd: expect.any(String) }),
      );
    });

    it('handles worktree removal failure gracefully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const execError = new Error('Worktree removal failed');
      vi.mocked(execSync)
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

  describe('readHistory', () => {
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

  describe('getLastSnapshot', () => {
    it('returns null for empty history', () => {
      const history: History = { snapshots: [] };
      expect(getLastSnapshot(history)).toBeNull();
    });

    it('returns null when snapshots is undefined', () => {
      const history = {} as History;
      expect(getLastSnapshot(history)).toBeNull();
    });

    it('returns the last snapshot', () => {
      const snapshot1: Snapshot = {
        timestamp: '2024-01-01T00:00:00Z',
        totalStars: 100,
        repos: [{ name: 'test', owner: 'user', fullName: 'user/test', stars: 100 }],
      };
      const snapshot2: Snapshot = {
        timestamp: '2024-01-02T00:00:00Z',
        totalStars: 150,
        repos: [{ name: 'test', owner: 'user', fullName: 'user/test', stars: 150 }],
      };

      const history: History = { snapshots: [snapshot1, snapshot2] };
      expect(getLastSnapshot(history)).toEqual(snapshot2);
    });
  });

  describe('writeHistory', () => {
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

      writeHistory({ dataDir: '/data', history, maxHistory: 52 });

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join('/data', 'stars-data.json'),
        JSON.stringify(history, null, 2),
      );
    });

    it('trims history when exceeding maxHistory', () => {
      const snapshots = Array.from({ length: 60 }, (_, i) => ({
        timestamp: `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
        totalStars: i,
        repos: [],
      }));

      const history: History = { snapshots };

      writeHistory({ dataDir: '/data', history, maxHistory: 52 });

      const writtenHistory = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string);
      expect(writtenHistory.snapshots).toHaveLength(52);
      expect(writtenHistory.snapshots[0].timestamp).toBe('2024-01-09T00:00:00Z');
    });
  });

  describe('writeReport', () => {
    it('writes markdown report to file', () => {
      const markdown = '# Test Report\n\nContent';

      writeReport({ dataDir: '/data', markdown });

      expect(fs.writeFileSync).toHaveBeenCalledWith(path.join('/data', 'README.md'), markdown);
    });
  });

  describe('writeBadge', () => {
    it('writes SVG badge to file', () => {
      const svg = '<svg>badge</svg>';

      writeBadge({ dataDir: '/data', svg });

      expect(fs.writeFileSync).toHaveBeenCalledWith(path.join('/data', 'stars-badge.svg'), svg);
    });
  });

  describe('commitAndPush', () => {
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

  describe('cleanup', () => {
    it('removes worktree', () => {
      vi.mocked(execSync).mockReturnValue('');

      cleanup('/data');

      expect(execSync).toHaveBeenCalledWith(
        'git worktree remove /data --force',
        expect.any(Object),
      );
    });

    it('handles worktree removal failure gracefully', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Worktree not found');
      });

      expect(() => cleanup('/data')).not.toThrow();
      expect(core.debug).toHaveBeenCalledWith(
        'Worktree cleanup for "/data" failed, it may have already been removed',
      );
    });
  });
});
