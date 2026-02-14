import { execSync } from 'node:child_process';

interface ExecuteParams {
  cmd: string;
  options?: Record<string, unknown>;
}

export function execute({ cmd, options = {} }: ExecuteParams): string {
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
