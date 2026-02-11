import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as core from '@actions/core';
import { DATA_DIR } from '../constants';
import type { History, Snapshot } from '../types';

function exec(cmd: string, options: Record<string, unknown> = {}): string {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options,
    }).trim();
  } catch (error: unknown) {
    const err = error as { stderr?: string; message?: string };
    const stderr = err.stderr?.trim() || '';
    const detail = stderr || err.message || 'Unknown error';
    throw new Error(`Git command failed: "${cmd}"\n${detail}`);
  }
}

export function initDataBranch(dataBranch: string): string {
  exec('git config user.name "github-actions[bot]"');
  exec('git config user.email "github-actions[bot]@users.noreply.github.com"');

  let branchExists = false;
  try {
    exec(`git ls-remote --exit-code --heads origin ${dataBranch}`);
    branchExists = true;
  } catch {
    core.info(`Branch "${dataBranch}" does not exist on remote, will create it`);
  }

  if (fs.existsSync(DATA_DIR)) {
    try {
      exec(`git worktree remove ${DATA_DIR} --force`);
    } catch {
      core.debug(`Could not remove existing worktree at ${DATA_DIR}, proceeding anyway`);
    }
  }

  if (branchExists) {
    exec(`git fetch origin ${dataBranch}`);
    exec(`git worktree add ${DATA_DIR} origin/${dataBranch}`);
  } else {
    core.info(`Creating new orphan branch: ${dataBranch}`);
    exec(`git worktree add --detach ${DATA_DIR}`);
    exec(`git checkout --orphan ${dataBranch}`, { cwd: path.resolve(DATA_DIR) });
    exec('git rm -rf . || true', { cwd: path.resolve(DATA_DIR) });
    exec('git commit --allow-empty -m "Initialize star tracker data"', {
      cwd: path.resolve(DATA_DIR),
    });
  }

  return DATA_DIR;
}

export function readHistory(dataDir: string): History {
  const filePath = path.join(dataDir, 'stars-data.json');
  if (!fs.existsSync(filePath)) {
    return { snapshots: [] };
  }
  const content = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(content) as History;
}

export function getLastSnapshot(history: History): Snapshot | null {
  if (!history.snapshots || history.snapshots.length === 0) {
    return null;
  }
  return history.snapshots.at(-1) ?? null;
}

interface WriteHistoryParams {
  dataDir: string;
  history: History;
  maxHistory: number;
}

export function writeHistory({ dataDir, history, maxHistory }: WriteHistoryParams): void {
  if (history.snapshots.length > maxHistory) {
    history.snapshots = history.snapshots.slice(-maxHistory);
  }
  const filePath = path.join(dataDir, 'stars-data.json');
  fs.writeFileSync(filePath, JSON.stringify(history, null, 2));
}

interface WriteReportParams {
  dataDir: string;
  markdown: string;
}

export function writeReport({ dataDir, markdown }: WriteReportParams): void {
  const filePath = path.join(dataDir, 'README.md');
  fs.writeFileSync(filePath, markdown);
}

interface WriteBadgeParams {
  dataDir: string;
  svg: string;
}

export function writeBadge({ dataDir, svg }: WriteBadgeParams): void {
  const filePath = path.join(dataDir, 'stars-badge.svg');
  fs.writeFileSync(filePath, svg);
}

interface CommitAndPushParams {
  dataDir: string;
  dataBranch: string;
  message: string;
}

export function commitAndPush({ dataDir, dataBranch, message }: CommitAndPushParams): boolean {
  const cwd = path.resolve(dataDir);

  exec('git add -A', { cwd });

  try {
    exec('git diff --cached --quiet', { cwd });
    core.info('No data changes to commit');
    return false;
  } catch {
    core.debug('Staged changes detected, proceeding with commit');
  }

  exec(`git commit -m "${message}"`, { cwd });
  exec(`git push origin HEAD:${dataBranch}`, { cwd });
  core.info(`Data committed and pushed to ${dataBranch}`);
  return true;
}

export function cleanup(dataDir: string): void {
  try {
    exec(`git worktree remove ${dataDir} --force`);
  } catch {
    core.debug(`Worktree cleanup for "${dataDir}" failed, it may have already been removed`);
  }
}
