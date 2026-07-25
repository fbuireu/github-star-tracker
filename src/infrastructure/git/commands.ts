import { execFileSync } from 'node:child_process';

interface ExecuteParams {
  args: string[];
  options?: Record<string, unknown>;
}

export function execute({ args, options = {} }: ExecuteParams): string {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options,
    }).trim();
  } catch (error: unknown) {
    const err = error as { stderr?: string; message?: string };
    const stderr = err.stderr?.trim() || '';
    const detail = stderr || err.message || 'Unknown error';

    throw new Error(`Git command failed: "git ${args.join(' ')}"\n${detail}`);
  }
}
