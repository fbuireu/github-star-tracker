import { MS_PER_DAY } from './constants';
import { toEpochMs } from './time';
import { CompareAgainst, type History, type Snapshot } from './types';

const COMPARE_WINDOW_DAYS: Record<
  Exclude<CompareAgainst, typeof CompareAgainst.LAST_RUN>,
  number
> = {
  [CompareAgainst.H24]: 1,
  [CompareAgainst.D7]: 7,
  [CompareAgainst.D30]: 30,
};

const COMPARE_WINDOW_TOLERANCE_MS = 6 * 60 * 60 * 1000;

export function getLastSnapshot(history: History): Snapshot | null {
  for (let index = history.snapshots.length - 1; index >= 0; index--) {
    if (toEpochMs(history.snapshots[index].timestamp) !== null) return history.snapshots[index];
  }

  return null;
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

  const window = COMPARE_WINDOW_DAYS[compareAgainst] * MS_PER_DAY;
  const cutoff = now.getTime() - window + COMPARE_WINDOW_TOLERANCE_MS;
  const datable = snapshots.filter((snapshot) => toEpochMs(snapshot.timestamp) !== null);
  const olderThanCutoff = datable.filter(
    (snapshot) => (toEpochMs(snapshot.timestamp) as number) <= cutoff,
  );

  return olderThanCutoff.at(-1) ?? datable[0] ?? null;
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
