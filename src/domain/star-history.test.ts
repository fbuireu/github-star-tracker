import { makeStargazer } from '@test-utils';
import { describe, expect, it } from 'vitest';
import { buildStarHistory, type RepoTotal } from './star-history';
import type { RepoStargazers } from './stargazers';

const NOW = new Date('2026-06-25T00:00:00Z');
const MAX_REACHABLE_STARS = 40_000;

function repoTotal(fullName: string, stars: number): RepoTotal {
  const [owner, name] = fullName.split('/');

  return { fullName, name, owner, stars };
}

function repoStargazers(fullName: string, dates: string[], sampled = false): RepoStargazers {
  return {
    repoFullName: fullName,
    stargazers: dates.map((starredAt) => makeStargazer({ starredAt })),
    sampled,
  };
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

    const totals = result.snapshots.map((snapshot) => snapshot.totalStars);
    for (let index = 1; index < totals.length; index++) {
      expect(totals[index]).toBeGreaterThanOrEqual(totals[index - 1]);
    }

    const last = result.snapshots.at(-1);
    expect(last?.totalStars).toBe(5);
    expect(last?.repos.find((repo) => repo.fullName === 'user/a')?.stars).toBe(3);
    expect(last?.repos.find((repo) => repo.fullName === 'user/b')?.stars).toBe(2);
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

    const stars = result.snapshots.map((snapshot) => snapshot.repos[0].stars);
    expect(stars.at(-1)).toBe(9000);
    for (let index = 1; index < stars.length; index++) {
      expect(stars[index]).toBeGreaterThanOrEqual(stars[index - 1]);
      expect(stars[index]).toBeLessThanOrEqual(9000);
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

    const stars = result.snapshots.map((snapshot) => snapshot.repos[0].stars);

    expect(stars.at(-1)).toBe(50000);
    for (let index = 1; index < stars.length; index++) {
      expect(stars[index]).toBeGreaterThanOrEqual(stars[index - 1]);
    }
    // The recent tail rises toward the total rather than sitting flat at it.
    expect(stars.at(-2)).toBeLessThan(50000);
    expect(stars.some((starCount) => starCount > MAX_REACHABLE_STARS && starCount < 50000)).toBe(
      true,
    );
    // The reachable portion still peaks around the 40k cap before ramping.
    expect(stars.some((starCount) => starCount > 0 && starCount <= MAX_REACHABLE_STARS)).toBe(true);
  });

  it('holds a repo with stars but no fetched dates flat at its true total', () => {
    const result = buildStarHistory({
      repoStargazers: [
        repoStargazers('user/a', ['2026-01-01T00:00:00Z']),
        repoStargazers('user/b', []),
      ],
      repos: [repoTotal('user/a', 1), repoTotal('user/b', 500)],
      maxPoints: 5,
      now: NOW,
    });

    const repoB = result.snapshots.map(
      (snapshot) => snapshot.repos.find((repo) => repo.fullName === 'user/b')?.stars,
    );
    expect(repoB.every((starCount) => starCount === 500)).toBe(true);
  });

  it('does not fabricate a straight 0→total ramp for a >40k repo with no fetched dates (#148)', () => {
    const result = buildStarHistory({
      repoStargazers: [
        repoStargazers('user/reachable', ['2023-10-01T00:00:00Z', '2026-06-01T00:00:00Z']),
        repoStargazers('user/restricted', []),
      ],
      repos: [repoTotal('user/reachable', 2), repoTotal('user/restricted', 54_000)],
      maxPoints: 30,
      now: NOW,
    });

    const restricted = result.snapshots.map(
      (snapshot) => snapshot.repos.find((repo) => repo.fullName === 'user/restricted')?.stars,
    );
    expect(restricted.every((starCount) => starCount === 54_000)).toBe(true);
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

    for (const snapshot of result.snapshots) {
      expect(snapshot.repos.find((repo) => repo.fullName === 'user/empty')?.stars).toBe(0);
      expect(snapshot.repos).toHaveLength(2);
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

  it('reconstructs a weekly-cadence full history when maxPoints is 0', () => {
    const earliest = '2026-01-01T00:00:00Z';
    const result = buildStarHistory({
      repoStargazers: [repoStargazers('user/a', [earliest, '2026-06-01T00:00:00Z'])],
      repos: [repoTotal('user/a', 2)],
      maxPoints: 0,
      now: NOW,
    });

    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const expectedBuckets = Math.ceil((NOW.getTime() - Date.parse(earliest)) / weekMs) + 1;
    expect(result.snapshots).toHaveLength(expectedBuckets);

    const firstGap =
      Date.parse(result.snapshots[1].timestamp) - Date.parse(result.snapshots[0].timestamp);
    expect(Math.round(firstGap / weekMs)).toBe(1);
  });

  it('caps the full-history reconstruction for very old repositories', () => {
    const result = buildStarHistory({
      repoStargazers: [repoStargazers('user/a', ['2000-01-01T00:00:00Z', '2026-06-01T00:00:00Z'])],
      repos: [repoTotal('user/a', 2)],
      maxPoints: 0,
      now: NOW,
    });

    expect(result.snapshots).toHaveLength(365);
  });

  it('honors a maxPoints value above the legacy 30-point limit', () => {
    const result = buildStarHistory({
      repoStargazers: [repoStargazers('user/a', ['2024-01-01T00:00:00Z', '2026-06-01T00:00:00Z'])],
      repos: [repoTotal('user/a', 2)],
      maxPoints: 50,
      now: NOW,
    });

    expect(result.snapshots).toHaveLength(50);
  });
});
