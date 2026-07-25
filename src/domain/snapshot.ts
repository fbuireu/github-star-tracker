import { MS_PER_DAY, toEpochMs } from './constants';
import { CompareAgainst, type History, type Snapshot } from './types';

const COMPARE_WINDOW_DAYS: Record<
  Exclude<CompareAgainst, typeof CompareAgainst.LAST_RUN>,
  number
> = {
  [CompareAgainst.H24]: 1,
  [CompareAgainst.D7]: 7,
  [CompareAgainst.D30]: 30,
};

export function getLastSnapshot(history: History): Snapshot | null {
  return history.snapshots.at(-1) ?? null;
}

interface GetBaselineSnapshotParams {
  history: History;
  compareAgainst: CompareAgainst;
  now?: Date;
}

export function getBaselineSnapshot({
  history,
  compareAgainst,
  now = new Date(),
}: GetBaselineSnapshotParams): Snapshot | null {
  const snapshots = history.snapshots;

  if (snapshots.length === 0) return null;
  if (compareAgainst === CompareAgainst.LAST_RUN) return getLastSnapshot(history);

  const cutoff = now.getTime() - COMPARE_WINDOW_DAYS[compareAgainst] * MS_PER_DAY;
  const olderThanCutoff = snapshots.filter((snapshot) => {
    const timestamp = toEpochMs(snapshot.timestamp);

    return timestamp !== null && timestamp <= cutoff;
  });

  return olderThanCutoff.at(-1) ?? snapshots[0];
}

interface RepoStarSeriesParams {
  snapshots: Snapshot[];
  repoFullName: string;
}

export function repoStarSeries({ snapshots, repoFullName }: RepoStarSeriesParams): number[] {
  return snapshots.map(
    (snapshot) =>
      snapshot.repos.find((candidate) => candidate.fullName === repoFullName)?.stars ?? 0,
  );
}

interface AddSnapshotParams {
  history: History;
  snapshot: Snapshot;
  maxHistory: number;
}

export function addSnapshot({ history, snapshot, maxHistory }: AddSnapshotParams): History {
  const snapshots = [...history.snapshots, snapshot].slice(-maxHistory);

  return { ...history, snapshots };
}
