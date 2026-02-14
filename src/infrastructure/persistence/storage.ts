import * as fs from 'node:fs';
import * as path from 'node:path';
import * as core from '@actions/core';
import type { History } from '@domain/types';
import { execute } from '../git/commands';

export function readHistory(dataDir: string): History {
  const filePath = path.join(dataDir, 'stars-data.json');
  if (!fs.existsSync(filePath)) {
    return { snapshots: [] };
  }
  const content = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(content) as History;
}

interface WriteHistoryParams {
  dataDir: string;
  history: History;
}

export function writeHistory({ dataDir, history }: WriteHistoryParams): void {
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

  execute({ cmd: 'git add -A', options: { cwd } });

  try {
    execute({ cmd: 'git diff --cached --quiet', options: { cwd } });
    core.info('No data changes to commit');
    return false;
  } catch {
    core.debug('Staged changes detected, proceeding with commit');
  }

  execute({ cmd: `git commit -m "${message}"`, options: { cwd } });
  execute({ cmd: `git push origin HEAD:${dataBranch}`, options: { cwd } });
  core.info(`Data committed and pushed to ${dataBranch}`);
  return true;
}
