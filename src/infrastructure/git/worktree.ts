import * as fs from 'node:fs';
import * as path from 'node:path';
import * as core from '@actions/core';
import { authenticatedArgs, execute } from './commands';

function ensureGitRepository(): void {
  try {
    execute({ args: ['rev-parse', '--is-inside-work-tree'] });
  } catch {
    throw new Error(
      'This action must run inside a checked-out repository. Add an "actions/checkout" step before this action in your workflow.',
    );
  }
}

interface InitializeDataBranchParams {
  dataBranch: string;
  readOnly?: boolean;
  token?: string;
}

export function initializeDataBranch({
  dataBranch,
  readOnly = false,
  token,
}: InitializeDataBranchParams): string {
  const dataDir = `.${dataBranch}`;

  ensureGitRepository();

  execute({ args: ['config', 'user.name', 'github-actions[bot]'] });
  execute({ args: ['config', 'user.email', 'github-actions[bot]@users.noreply.github.com'] });

  const remoteArgs = (args: string[]): string[] =>
    token === undefined ? args : authenticatedArgs({ token, args });

  const branchExists =
    execute({ args: remoteArgs(['ls-remote', '--heads', 'origin', dataBranch]) }).length > 0;

  if (!branchExists) {
    core.info(`Branch "${dataBranch}" does not exist on remote, will create it`);
  }

  if (fs.existsSync(dataDir)) {
    try {
      execute({ args: ['worktree', 'remove', dataDir, '--force'] });
    } catch {
      core.debug(`Could not remove existing worktree at ${dataDir}, proceeding anyway`);
    }
  }

  if (!branchExists && readOnly) {
    throw new Error(
      `Branch "${dataBranch}" does not exist on the remote and this is a read-only run, so it cannot be created. Point data-branch at the branch your tracking workflow maintains, or drop read-only so this run can create it.`,
    );
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

  execute({ args: remoteArgs(['fetch', 'origin', dataBranch]) });
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
