import * as fs from 'node:fs';
import * as path from 'node:path';
import * as core from '@actions/core';
import type { StargazerMap } from '@domain/stargazers';
import type { History } from '@domain/types';
import { execute } from '../git/commands';

interface ReadJsonFileParams<T> {
  filePath: string;
  fallback: T;
}

function readJsonFile<T>({ filePath, fallback }: ReadJsonFileParams<T>): T {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

interface WriteJsonFileParams {
  filePath: string;
  data: unknown;
}

function writeJsonFile({ filePath, data }: WriteJsonFileParams): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function readHistory(dataDir: string): History {
  return readJsonFile<History>({
    filePath: path.join(dataDir, 'stars-data.json'),
    fallback: { snapshots: [] },
  });
}

interface WriteHistoryParams {
  dataDir: string;
  history: History;
}

export function writeHistory({ dataDir, history }: WriteHistoryParams): void {
  writeJsonFile({ filePath: path.join(dataDir, 'stars-data.json'), data: history });
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

interface WriteChartParams {
  dataDir: string;
  filename: string;
  svg: string;
}

export function writeChart({ dataDir, filename, svg }: WriteChartParams): void {
  const chartsDir = path.join(dataDir, 'charts');

  if (!fs.existsSync(chartsDir)) {
    fs.mkdirSync(chartsDir, { recursive: true });
  }
  const filePath = path.join(chartsDir, filename);

  fs.writeFileSync(filePath, svg);
}

export function readStargazers(dataDir: string): StargazerMap {
  return readJsonFile<StargazerMap>({
    filePath: path.join(dataDir, 'stargazers.json'),
    fallback: {},
  });
}

interface WriteStargazersParams {
  dataDir: string;
  stargazerMap: StargazerMap;
}

export function writeStargazers({ dataDir, stargazerMap }: WriteStargazersParams): void {
  writeJsonFile({ filePath: path.join(dataDir, 'stargazers.json'), data: stargazerMap });
}

interface WriteHtmlReportParams {
  htmlReport: string;
}

export function writeHtmlReport({ htmlReport }: WriteHtmlReportParams): string {
  const outputDir = process.env.RUNNER_TEMP || process.cwd();
  const filePath = path.join(outputDir, 'star-tracker-report.html');

  fs.writeFileSync(filePath, htmlReport);

  return filePath;
}

interface WriteCsvParams {
  dataDir: string;
  csv: string;
}

export function writeCsv({ dataDir, csv }: WriteCsvParams): void {
  const filePath = path.join(dataDir, 'stars-data.csv');

  fs.writeFileSync(filePath, csv);
}

interface CommitAndPushParams {
  dataDir: string;
  dataBranch: string;
  message: string;
  token: string;
}

export function commitAndPush({
  dataDir,
  dataBranch,
  message,
  token,
}: CommitAndPushParams): boolean {
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

  const basicCredential = Buffer.from(`x-access-token:${token}`).toString('base64');
  core.setSecret(basicCredential);

  execute({
    cmd: `git -c http.extraheader="AUTHORIZATION: basic ${basicCredential}" push origin HEAD:${dataBranch}`,
    options: { cwd },
  });

  core.info(`Data committed and pushed to ${dataBranch}`);

  return true;
}
