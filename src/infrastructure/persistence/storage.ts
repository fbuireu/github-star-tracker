import * as fs from 'node:fs';
import * as path from 'node:path';
import * as core from '@actions/core';
import type { StargazerMap } from '@domain/stargazers';
import type { History } from '@domain/types';
import { execute } from '../git/commands';

const DATA_FILES = {
  history: 'stars-data.json',
  stargazers: 'stargazers.json',
  report: 'README.md',
  badge: 'stars-badge.svg',
  csv: 'stars-data.csv',
  htmlReport: 'star-tracker-report.html',
  chartsDir: 'charts',
} as const;

interface ReadJsonFileParams<T> {
  filePath: string;
  fallback: T;
}

function readJsonFile<T>({ filePath, fallback }: ReadJsonFileParams<T>): T {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  const contents = fs.readFileSync(filePath, 'utf8');

  try {
    return JSON.parse(contents) as T;
  } catch (error) {
    throw new Error(
      `${path.basename(filePath)} on the data branch is not valid JSON (${(error as Error).message}). Fix or delete the file on that branch and re-run.`,
    );
  }
}

interface WriteJsonFileParams {
  filePath: string;
  data: unknown;
}

function writeJsonFile({ filePath, data }: WriteJsonFileParams): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function readHistory(dataDir: string): History {
  const raw = readJsonFile<Partial<History>>({
    filePath: path.join(dataDir, DATA_FILES.history),
    fallback: {},
  });

  return { ...raw, snapshots: Array.isArray(raw.snapshots) ? raw.snapshots : [] };
}

interface WriteHistoryParams {
  dataDir: string;
  history: History;
}

export function writeHistory({ dataDir, history }: WriteHistoryParams): void {
  writeJsonFile({ filePath: path.join(dataDir, DATA_FILES.history), data: history });
}

interface WriteReportParams {
  dataDir: string;
  markdown: string;
}

export function writeReport({ dataDir, markdown }: WriteReportParams): void {
  const filePath = path.join(dataDir, DATA_FILES.report);

  fs.writeFileSync(filePath, markdown);
}

interface WriteBadgeParams {
  dataDir: string;
  svg: string;
}

export function writeBadge({ dataDir, svg }: WriteBadgeParams): void {
  const filePath = path.join(dataDir, DATA_FILES.badge);

  fs.writeFileSync(filePath, svg);
}

interface WriteChartParams {
  dataDir: string;
  filename: string;
  svg: string;
}

export function writeChart({ dataDir, filename, svg }: WriteChartParams): void {
  const chartsDir = path.join(dataDir, DATA_FILES.chartsDir);

  if (!fs.existsSync(chartsDir)) {
    fs.mkdirSync(chartsDir, { recursive: true });
  }
  const filePath = path.join(chartsDir, filename);

  fs.writeFileSync(filePath, svg);
}

export function readStargazers(dataDir: string): StargazerMap {
  return readJsonFile<StargazerMap>({
    filePath: path.join(dataDir, DATA_FILES.stargazers),
    fallback: {},
  });
}

interface WriteStargazersParams {
  dataDir: string;
  stargazerMap: StargazerMap;
}

export function writeStargazers({ dataDir, stargazerMap }: WriteStargazersParams): void {
  writeJsonFile({ filePath: path.join(dataDir, DATA_FILES.stargazers), data: stargazerMap });
}

interface WriteHtmlReportParams {
  htmlReport: string;
}

export function writeHtmlReport({ htmlReport }: WriteHtmlReportParams): string {
  const outputDir = process.env.RUNNER_TEMP || process.cwd();
  const filePath = path.join(outputDir, DATA_FILES.htmlReport);

  fs.writeFileSync(filePath, htmlReport);

  return filePath;
}

interface WriteCsvParams {
  dataDir: string;
  csv: string;
}

export function writeCsv({ dataDir, csv }: WriteCsvParams): void {
  const filePath = path.join(dataDir, DATA_FILES.csv);

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

  execute({ args: ['add', '-A'], options: { cwd } });

  try {
    execute({ args: ['diff', '--cached', '--quiet'], options: { cwd } });

    core.info('No data changes to commit');

    return false;
  } catch {
    core.debug('Staged changes detected, proceeding with commit');
  }

  execute({ args: ['commit', '-m', message], options: { cwd } });

  const basicCredential = Buffer.from(`x-access-token:${token}`).toString('base64');
  core.setSecret(basicCredential);

  execute({
    args: [
      '-c',
      `http.extraheader=AUTHORIZATION: basic ${basicCredential}`,
      'push',
      'origin',
      `HEAD:${dataBranch}`,
    ],
    options: { cwd },
  });

  core.info(`Data committed and pushed to ${dataBranch}`);

  return true;
}
