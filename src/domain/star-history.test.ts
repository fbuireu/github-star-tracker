import { describe, expect, it } from 'vitest';
import { buildStarHistory, type RepoTotal } from './star-history';
import type { RepoStargazers, Stargazer } from './stargazers';

const NOW = new Date('2026-06-25T00:00:00Z');
const MAX_REACHABLE_STARS = 40_000;

function star(starredAt: string): Stargazer {
  return {
    login: `u-${starredAt}`,
    avatarUrl: '',
    profileUrl: '',
    starredAt,
  };
}

function repoTotal(fullName: string, stars: number): RepoTotal {
  const [owner, name] = fullName.split('/');

  return { fullName, name, owner, stars };
}

function repoStargazers(fullName: string, dates: string[], sampled = false): RepoStargazers {
  return { repoFullName: fullName, stargazers: dates.map(star), sampled };
}

describe('buildStarHistory', () => {
  it('returns an empty history when there are no valid starred_at dates', () => {
    const result = buildStarHistory({
      repoStargazers: [repoStargazers('user/a', [])],
      repos: [repoTotal('user/a', 0)],
      maxPoints: 30,
      now: NOW,
    });

    expect(result.snapshots).toEqual([]);
  });

  it('builds a cumulative, monotonic curve ending at the true total', () => {
    const result = buildStarHistory({
      repoStargazers: [
        repoStargazers('user/a', [
          '2026-01-01T00:00:00Z',
          '2026-02-01T00:00:00Z',
          '2026-03-01T00:00:00Z',
        ]),
        repoStargazers('user/b', ['2026-01-15T00:00:00Z', '2026-04-01T00:00:00Z']),
      ],
      repos: [repoTotal('user/a', 3), repoTotal('user/b', 2)],
      maxPoints: 30,
      now: NOW,
    });

    expect(result.snapshots).toHaveLength(30);

    const totals = result.snapshots.map((s) => s.totalStars);
    for (let i = 1; i < totals.length; i++) {
      expect(totals[i]).toBeGreaterThanOrEqual(totals[i - 1]);
    }

    const last = result.snapshots.at(-1);
    expect(last?.totalStars).toBe(5);
    expect(last?.repos.find((r) => r.fullName === 'user/a')?.stars).toBe(3);
    expect(last?.repos.find((r) => r.fullName === 'user/b')?.stars).toBe(2);
  });

  it('uses exact cumulative counts when nothing is sampled', () => {
    const result = buildStarHistory({
      repoStargazers: [
        repoStargazers('user/a', [
          '2026-01-01T00:00:00Z',
          '2026-02-01T00:00:00Z',
          '2026-03-01T00:00:00Z',
        ]),
      ],
      repos: [repoTotal('user/a', 3)],
      maxPoints: 2,
      now: NOW,
    });

    expect(result.snapshots).toHaveLength(2);
    expect(result.snapshots[0].repos[0].stars).toBe(1);
    expect(result.snapshots[1].repos[0].stars).toBe(3);
  });

  it('scales a sampled repo up so the terminal equals the true total', () => {
    const result = buildStarHistory({
      repoStargazers: [
        repoStargazers(
          'user/huge',
          ['2026-01-01T00:00:00Z', '2026-03-01T00:00:00Z', '2026-05-01T00:00:00Z'],
          true,
        ),
      ],
      repos: [repoTotal('user/huge', 9000)],
      maxPoints: 10,
      now: NOW,
    });

    const stars = result.snapshots.map((s) => s.repos[0].stars);
    expect(stars.at(-1)).toBe(9000);
    for (let i = 1; i < stars.length; i++) {
      expect(stars[i]).toBeGreaterThanOrEqual(stars[i - 1]);
      expect(stars[i]).toBeLessThanOrEqual(9000);
    }
  });

  it('ramps a >40k repo up to the true total instead of flattening the tail', () => {
    const result = buildStarHistory({
      repoStargazers: [
        repoStargazers(
          'user/massive',
          [
            '2024-01-01T00:00:00Z',
            '2024-06-01T00:00:00Z',
            '2025-01-01T00:00:00Z',
            '2025-09-01T00:00:00Z',
          ],
          true,
        ),
      ],
      repos: [repoTotal('user/massive', 50000)],
      maxPoints: 20,
      now: NOW,
    });

    const stars = result.snapshots.map((s) => s.repos[0].stars);

    expect(stars.at(-1)).toBe(50000);
    for (let i = 1; i < stars.length; i++) {
      expect(stars[i]).toBeGreaterThanOrEqual(stars[i - 1]);
    }
    // The recent tail rises toward the total rather than sitting flat at it.
    expect(stars.at(-2)).toBeLessThan(50000);
    expect(stars.some((v) => v > MAX_REACHABLE_STARS && v < 50000)).toBe(true);
    // The reachable portion still peaks around the 40k cap before ramping.
    expect(stars.some((v) => v > 0 && v <= MAX_REACHABLE_STARS)).toBe(true);
  });

  it('handles a repo with stars but no fetched dates (ends at the true total)', () => {
    const result = buildStarHistory({
      repoStargazers: [
        repoStargazers('user/a', ['2026-01-01T00:00:00Z']),
        repoStargazers('user/b', []),
      ],
      repos: [repoTotal('user/a', 1), repoTotal('user/b', 500)],
      maxPoints: 5,
      now: NOW,
    });

    const repoB = result.snapshots.map((s) => s.repos.find((r) => r.fullName === 'user/b')?.stars);
    expect(repoB.every((v) => Number.isFinite(v))).toBe(true);
    expect(repoB.at(-1)).toBe(500);
    expect(repoB.slice(0, -1).every((v) => v === 0)).toBe(true);
  });

  it('keeps a zero-star repo at 0 in every snapshot', () => {
    const result = buildStarHistory({
      repoStargazers: [
        repoStargazers('user/a', ['2026-01-01T00:00:00Z', '2026-03-01T00:00:00Z']),
        repoStargazers('user/empty', []),
      ],
      repos: [repoTotal('user/a', 2), repoTotal('user/empty', 0)],
      maxPoints: 8,
      now: NOW,
    });

    for (const s of result.snapshots) {
      expect(s.repos.find((r) => r.fullName === 'user/empty')?.stars).toBe(0);
      expect(s.repos).toHaveLength(2);
    }
  });

  it('produces at least two snapshots for a single star', () => {
    const result = buildStarHistory({
      repoStargazers: [repoStargazers('user/a', ['2026-06-01T00:00:00Z'])],
      repos: [repoTotal('user/a', 1)],
      maxPoints: 30,
      now: NOW,
    });

    expect(result.snapshots.length).toBeGreaterThanOrEqual(2);
    expect(result.snapshots.at(-1)?.totalStars).toBe(1);
  });

  it('ignores invalid starred_at values', () => {
    const result = buildStarHistory({
      repoStargazers: [repoStargazers('user/a', ['not-a-date', '2026-01-01T00:00:00Z', ''])],
      repos: [repoTotal('user/a', 2)],
      maxPoints: 4,
      now: NOW,
    });

    expect(result.snapshots.at(-1)?.totalStars).toBe(2);
  });

  it('respects maxPoints and never drops the earliest history for a long span', () => {
    const result = buildStarHistory({
      repoStargazers: [repoStargazers('user/a', ['2021-01-01T00:00:00Z', '2026-06-01T00:00:00Z'])],
      repos: [repoTotal('user/a', 2)],
      maxPoints: 30,
      now: NOW,
    });

    expect(result.snapshots.length).toBeLessThanOrEqual(30);
    expect(result.snapshots[0].timestamp.startsWith('2021')).toBe(true);
  });
});
