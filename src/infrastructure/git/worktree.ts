import * as fs from 'node:fs';
import * as path from 'node:path';
import * as core from '@actions/core';
import { execute } from './commands';

function ensureGitRepository(): void {
  try {
    execute({ args: ['rev-parse', '--is-inside-work-tree'] });
  } catch {
    throw new Error(
      'This action must run inside a checked-out repository. Add an "actions/checkout" step before this action in your workflow.',
    );
  }
}

export function initializeDataBranch(dataBranch: string): string {
  const dataDir = `.${dataBranch}`;

  ensureGitRepository();

  execute({ args: ['config', 'user.name', 'github-actions[bot]'] });
  execute({ args: ['config', 'user.email', 'github-actions[bot]@users.noreply.github.com'] });

  let branchExists = false;

  try {
    execute({ args: ['ls-remote', '--exit-code', '--heads', 'origin', dataBranch] });
    branchExists = true;
  } catch {
    core.info(`Branch "${dataBranch}" does not exist on remote, will create it`);
  }

  if (fs.existsSync(dataDir)) {
    try {
      execute({ args: ['worktree', 'remove', dataDir, '--force'] });
    } catch {
      core.debug(`Could not remove existing worktree at ${dataDir}, proceeding anyway`);
    }
  }

  if (!branchExists) {
    core.info(`Creating new orphan branch: ${dataBranch}`);

    const cwd = path.resolve(dataDir);

    execute({ args: ['worktree', 'add', '--detach', dataDir] });
    execute({ args: ['checkout', '--orphan', dataBranch], options: { cwd } });

    try {
      execute({ args: ['rm', '-rf', '.'], options: { cwd } });
    } catch {
      core.debug('Nothing to remove on the new orphan branch, proceeding anyway');
    }

    execute({
      args: ['commit', '--allow-empty', '-m', 'Initialize star tracker data'],
      options: { cwd },
    });

    return dataDir;
  }

  execute({ args: ['fetch', 'origin', dataBranch] });
  execute({ args: ['worktree', 'add', dataDir, `origin/${dataBranch}`] });

  return dataDir;
}

export function cleanup(dataDir: string): void {
  try {
    execute({ args: ['worktree', 'remove', dataDir, '--force'] });
  } catch {
    core.debug(`Worktree cleanup for "${dataDir}" failed, it may have already been removed`);
  }
}
