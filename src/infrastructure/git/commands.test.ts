import { describe, expect, it, vi } from 'vitest';
import { execute } from './commands';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

describe('execute', () => {
  it('returns trimmed output from execSync', async () => {
    const { execSync } = await import('node:child_process');
    vi.mocked(execSync).mockReturnValue('  output  ');

    expect(execute({ cmd: 'echo hello' })).toBe('output');
  });

  it('passes options to execSync', async () => {
    const { execSync } = await import('node:child_process');
    vi.mocked(execSync).mockReturnValue('ok');

    execute({ cmd: 'git status', options: { cwd: '/tmp' } });

    expect(execSync).toHaveBeenCalledWith('git status', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: '/tmp',
    });
  });

  it('throws error with stderr when command fails', async () => {
    const { execSync } = await import('node:child_process');
    const error = new Error('exec failed') as Error & { stderr?: string };
    error.stderr = '  fatal: not a repo  ';
    vi.mocked(execSync).mockImplementation(() => {
      throw error;
    });

    expect(() => execute({ cmd: 'git log' })).toThrow(
      'Git command failed: "git log"\nfatal: not a repo',
    );
  });

  it('throws error with message when no stderr', async () => {
    const { execSync } = await import('node:child_process');
    const error = new Error('spawn failed');
    vi.mocked(execSync).mockImplementation(() => {
      throw error;
    });

    expect(() => execute({ cmd: 'git push' })).toThrow(
      'Git command failed: "git push"\nspawn failed',
    );
  });

  it('throws error with Unknown error when no stderr or message', async () => {
    const { execSync } = await import('node:child_process');
    vi.mocked(execSync).mockImplementation(() => {
      throw {};
    });

    expect(() => execute({ cmd: 'git fetch' })).toThrow(
      'Git command failed: "git fetch"\nUnknown error',
    );
  });
});
