import { describe, expect, it } from 'vitest';
import { addSnapshot, getBaselineSnapshot, getLastSnapshot } from './snapshot';
import { CompareAgainst, type History, type Snapshot } from './types';

const NOW = new Date('2026-03-31T00:00:00Z');

function makeDailyHistory(days: number): History {
  return {
    snapshots: Array.from({ length: days }, (_, index) => ({
      timestamp: new Date(NOW.getTime() - (days - 1 - index) * 86_400_000).toISOString(),
      totalStars: 1000 + index,
      repos: [],
    })),
  };
}

describe('getLastSnapshot', () => {
  it('returns null for empty history', () => {
    const history: History = { snapshots: [] };

    expect(getLastSnapshot(history)).toBeNull();
  });

  it('returns the last snapshot', () => {
    const snapshot1: Snapshot = {
      timestamp: '2024-01-01T00:00:00Z',
      totalStars: 100,
      repos: [{ name: 'test', owner: 'user', fullName: 'user/test', stars: 100 }],
    };
    const snapshot2: Snapshot = {
      timestamp: '2024-01-02T00:00:00Z',
      totalStars: 150,
      repos: [{ name: 'test', owner: 'user', fullName: 'user/test', stars: 150 }],
    };
    const history: History = { snapshots: [snapshot1, snapshot2] };

    expect(getLastSnapshot(history)).toEqual(snapshot2);
  });
});

describe('getBaselineSnapshot', () => {
  it('returns null for empty history', () => {
    expect(
      getBaselineSnapshot({
        history: { snapshots: [] },
        compareAgainst: CompareAgainst.D7,
        now: NOW,
      }),
    ).toBeNull();
  });

  it('returns the most recent snapshot for last-run', () => {
    const baseline = getBaselineSnapshot({
      history: makeDailyHistory(30),
      compareAgainst: CompareAgainst.LAST_RUN,
      now: NOW,
    });

    expect(baseline?.totalStars).toBe(1029);
  });

  it('returns the most recent snapshot at least 24h old', () => {
    const baseline = getBaselineSnapshot({
      history: makeDailyHistory(30),
      compareAgainst: CompareAgainst.H24,
      now: NOW,
    });

    expect(baseline?.totalStars).toBe(1028);
  });

  it('returns the most recent snapshot at least 7 days old', () => {
    const baseline = getBaselineSnapshot({
      history: makeDailyHistory(30),
      compareAgainst: CompareAgainst.D7,
      now: NOW,
    });

    expect(baseline?.totalStars).toBe(1022);
  });

  it('falls back to the oldest snapshot when history is shorter than the window', () => {
    const baseline = getBaselineSnapshot({
      history: makeDailyHistory(30),
      compareAgainst: CompareAgainst.D30,
      now: NOW,
    });

    expect(baseline?.totalStars).toBe(1000);
  });

  it('falls back to the only snapshot available', () => {
    const baseline = getBaselineSnapshot({
      history: makeDailyHistory(1),
      compareAgainst: CompareAgainst.D7,
      now: NOW,
    });

    expect(baseline?.totalStars).toBe(1000);
  });

  it('picks the newest snapshot still inside the tolerated window', () => {
    const history: History = {
      snapshots: [
        { timestamp: '2026-03-24T05:00:00Z', totalStars: 100, repos: [] },
        { timestamp: '2026-03-24T07:00:00Z', totalStars: 200, repos: [] },
      ],
    };
    const baseline = getBaselineSnapshot({
      history,
      compareAgainst: CompareAgainst.D7,
      now: NOW,
    });

    expect(baseline?.totalStars).toBe(100);
  });

  it('tolerates cron jitter that pushes a snapshot just under the window', () => {
    const history: History = {
      snapshots: [
        { timestamp: '2026-03-17T00:00:00Z', totalStars: 100, repos: [] },
        { timestamp: '2026-03-24T00:05:00Z', totalStars: 200, repos: [] },
      ],
    };
    const baseline = getBaselineSnapshot({
      history,
      compareAgainst: CompareAgainst.D7,
      now: NOW,
    });

    expect(baseline?.totalStars).toBe(200);
  });

  it('never falls back to a snapshot whose timestamp is unparseable', () => {
    const history: History = {
      snapshots: [
        { timestamp: 'not-a-date', totalStars: 100, repos: [] },
        { timestamp: '2026-03-30T00:00:00Z', totalStars: 200, repos: [] },
      ],
    };
    const baseline = getBaselineSnapshot({
      history,
      compareAgainst: CompareAgainst.D7,
      now: NOW,
    });

    expect(baseline?.totalStars).toBe(200);
  });

  it('returns null when every snapshot has an unparseable timestamp', () => {
    const history: History = {
      snapshots: [{ timestamp: 'not-a-date', totalStars: 100, repos: [] }],
    };

    expect(
      getBaselineSnapshot({ history, compareAgainst: CompareAgainst.D7, now: NOW }),
    ).toBeNull();
  });

  it('ignores snapshots with unparseable timestamps', () => {
    const history: History = {
      snapshots: [
        { timestamp: '2026-03-01T00:00:00Z', totalStars: 100, repos: [] },
        { timestamp: 'not-a-date', totalStars: 200, repos: [] },
      ],
    };
    const baseline = getBaselineSnapshot({
      history,
      compareAgainst: CompareAgainst.D7,
      now: NOW,
    });

    expect(baseline?.totalStars).toBe(100);
  });

  it('does not consider the window for last-run', () => {
    const baseline = getBaselineSnapshot({
      history: makeDailyHistory(2),
      compareAgainst: CompareAgainst.LAST_RUN,
      now: NOW,
    });

    expect(baseline?.totalStars).toBe(1001);
  });
});

describe('addSnapshot', () => {
  it('adds a snapshot to history', () => {
    const history: History = { snapshots: [] };
    const snapshot: Snapshot = {
      timestamp: '2024-01-01T00:00:00Z',
      totalStars: 100,
      repos: [{ name: 'test', owner: 'user', fullName: 'user/test', stars: 100 }],
    };
    const result = addSnapshot({ history, snapshot, maxHistory: 52 });

    expect(result.snapshots).toHaveLength(1);
    expect(result.snapshots[0]).toEqual(snapshot);
  });

  it('does not mutate the original history', () => {
    const history: History = {
      snapshots: [
        {
          timestamp: '2024-01-01T00:00:00Z',
          totalStars: 100,
          repos: [],
        },
      ],
    };
    const snapshot: Snapshot = {
      timestamp: '2024-01-02T00:00:00Z',
      totalStars: 150,
      repos: [],
    };
    const result = addSnapshot({ history, snapshot, maxHistory: 52 });

    expect(history.snapshots).toHaveLength(1);
    expect(result.snapshots).toHaveLength(2);
  });

  it('preserves starsAtLastNotification', () => {
    const history: History = { snapshots: [], starsAtLastNotification: 42 };
    const snapshot: Snapshot = {
      timestamp: '2024-01-01T00:00:00Z',
      totalStars: 50,
      repos: [],
    };
    const result = addSnapshot({ history, snapshot, maxHistory: 52 });

    expect(result.starsAtLastNotification).toBe(42);
  });

  it('trims history when exceeding maxHistory', () => {
    const snapshots = Array.from({ length: 52 }, (_, index) => ({
      timestamp: `2024-01-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
      totalStars: index,
      repos: [],
    }));
    const history: History = { snapshots };
    const newSnapshot: Snapshot = {
      timestamp: '2024-03-01T00:00:00Z',
      totalStars: 100,
      repos: [],
    };
    const result = addSnapshot({ history, snapshot: newSnapshot, maxHistory: 52 });

    expect(result.snapshots).toHaveLength(52);
    expect(result.snapshots[0].timestamp).toBe('2024-01-02T00:00:00Z');
    expect(result.snapshots[51]).toEqual(newSnapshot);
  });
});
