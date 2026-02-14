import type { History, Snapshot } from './types';

export function getLastSnapshot(history: History): Snapshot | null {
  if (!history.snapshots || history.snapshots.length === 0) {
    return null;
  }

  return history.snapshots.at(-1) ?? null;
}

interface AddSnapshotParams {
  history: History;
  snapshot: Snapshot;
  maxHistory: number;
}

export function addSnapshot({ history, snapshot, maxHistory }: AddSnapshotParams): History {
  const snapshots = [...history.snapshots, snapshot].slice(-maxHistory);
  return { snapshots };
}
