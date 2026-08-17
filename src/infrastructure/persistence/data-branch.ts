import * as core from '@actions/core';
import type { StargazerMap } from '@domain/stargazers';
import type { History } from '@domain/types';
import { cleanup, initializeDataBranch } from '../git/worktree';
import {
  Artefact,
  commitAndPush,
  pruneCharts,
  readHistory,
  readStargazers,
  writeArtefact,
  writeChart,
  writeHistory,
  writeStargazers,
} from './storage';

export interface ChartFile {
  filename: string;
  svg: string;
}

export interface PublishedArtefacts {
  history: History;
  stargazerMap?: StargazerMap;
  report: string;
  badge: string;
  csv: string;
  charts: ChartFile[];
  commitMessage: string;
}

export interface DataBranch {
  readHistory: () => History;
  readStargazers: () => StargazerMap;
  publish: (artefacts: PublishedArtefacts) => void;
}

interface WithDataBranchParams<T> {
  dataBranch: string;
  readOnly: boolean;
  token: string;
  run: (branch: DataBranch) => Promise<T>;
}

export async function withDataBranch<T>({
  dataBranch,
  readOnly,
  token,
  run,
}: WithDataBranchParams<T>): Promise<T> {
  const dataDir = initializeDataBranch({ dataBranch, readOnly });

  try {
    return await run({
      readHistory: () => readHistory(dataDir),
      readStargazers: () => readStargazers(dataDir),
      publish: (artefacts) => publish({ dataDir, dataBranch, readOnly, token, artefacts }),
    });
  } finally {
    cleanup(dataDir);
  }
}

interface PublishParams {
  dataDir: string;
  dataBranch: string;
  readOnly: boolean;
  token: string;
  artefacts: PublishedArtefacts;
}

function publish({ dataDir, dataBranch, readOnly, token, artefacts }: PublishParams): void {
  writeHistory({ dataDir, history: artefacts.history });
  writeArtefact({ dataDir, artefact: Artefact.REPORT, contents: artefacts.report });
  writeArtefact({ dataDir, artefact: Artefact.BADGE, contents: artefacts.badge });
  writeArtefact({ dataDir, artefact: Artefact.CSV, contents: artefacts.csv });

  if (artefacts.stargazerMap !== undefined) {
    writeStargazers({ dataDir, stargazerMap: artefacts.stargazerMap });
  }

  for (const chart of artefacts.charts) {
    writeChart({ dataDir, filename: chart.filename, svg: chart.svg });
  }

  pruneCharts({ dataDir, keep: artefacts.charts.map((chart) => chart.filename) });

  if (readOnly) {
    core.info(`Read-only run: leaving ${dataBranch} untouched`);

    return;
  }

  commitAndPush({ dataDir, dataBranch, message: artefacts.commitMessage, token });
}
