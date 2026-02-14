import * as fs from 'node:fs';
import * as path from 'node:path';
import * as core from '@actions/core';
import { execute } from './commands';

export function initializeDataBranch(dataBranch: string): string {
  const dataDir = `.${dataBranch}`;

  execute({ cmd: 'git config user.name "github-actions[bot]"' });
  execute({ cmd: 'git config user.email "github-actions[bot]@users.noreply.github.com"' });

  let branchExists = false;
  try {
    execute({ cmd: `git ls-remote --exit-code --heads origin ${dataBranch}` });
    branchExists = true;
  } catch {
    core.info(`Branch "${dataBranch}" does not exist on remote, will create it`);
  }

  if (fs.existsSync(dataDir)) {
    try {
      execute({ cmd: `git worktree remove ${dataDir} --force` });
    } catch {
      core.debug(`Could not remove existing worktree at ${dataDir}, proceeding anyway`);
    }
  }

  if (!branchExists) {
    core.info(`Creating new orphan branch: ${dataBranch}`);
    execute({ cmd: `git worktree add --detach ${dataDir}` });
    execute({
      cmd: `git checkout --orphan ${dataBranch}`,
      options: { cwd: path.resolve(dataDir) },
    });
    execute({ cmd: 'git rm -rf . || true', options: { cwd: path.resolve(dataDir) } });
    execute({
      cmd: 'git commit --allow-empty -m "Initialize star tracker data"',
      options: { cwd: path.resolve(dataDir) },
    });
    return dataDir;
  }

  execute({ cmd: `git fetch origin ${dataBranch}` });
  execute({ cmd: `git worktree add ${dataDir} origin/${dataBranch}` });
  return dataDir;
}

export function cleanup(dataDir: string): void {
  try {
    execute({ cmd: `git worktree remove ${dataDir} --force` });
  } catch {
    core.debug(`Worktree cleanup for "${dataDir}" failed, it may have already been removed`);
  }
}
