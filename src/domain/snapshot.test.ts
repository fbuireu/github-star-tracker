import { describe, expect, it } from 'vitest';
import { addSnapshot, getLastSnapshot } from './snapshot';
import type { History, Snapshot } from './types';

describe('getLastSnapshot', () => {
  it('returns null for empty history', () => {
    const history: History = { snapshots: [] };
    expect(getLastSnapshot(history)).toBeNull();
  });

  it('returns null when snapshots is undefined', () => {
    const history = {} as History;
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

  it('trims history when exceeding maxHistory', () => {
    const snapshots = Array.from({ length: 52 }, (_, i) => ({
      timestamp: `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
      totalStars: i,
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
