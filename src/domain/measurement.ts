import { compareStars, createSnapshot } from './comparison';
import { shouldNotify } from './notification';
import { addSnapshot, getBaselineSnapshot } from './snapshot';
import type {
  CompareAgainst,
  ComparisonResults,
  History,
  NotificationMode,
  RepoInfo,
  Summary,
} from './types';

export interface RunMeasurement {
  baselineTimestamp: string | null;
  results: ComparisonResults;
  summary: Summary;
  updatedHistory: History;
  droppedSnapshots: number;
  thresholdReached: boolean;
}

interface MeasureRunParams {
  trackedSet: RepoInfo[];
  storedHistory: History;
  comparisonWindow: CompareAgainst;
  maxHistory: number;
  notificationThreshold: number | 'auto';
  notificationMode: NotificationMode;
  now?: Date;
}

export function measureRun({
  trackedSet,
  storedHistory,
  comparisonWindow,
  maxHistory,
  notificationThreshold,
  notificationMode,
  now,
}: MeasureRunParams): RunMeasurement {
  const baseline = getBaselineSnapshot({
    history: storedHistory,
    compareAgainst: comparisonWindow,
    now,
  });
  const results = compareStars({ currentRepos: trackedSet, previousSnapshot: baseline });
  const { summary } = results;
  const snapshot = createSnapshot({ currentRepos: trackedSet, summary });

  return {
    baselineTimestamp: baseline === null ? null : baseline.timestamp,
    results,
    summary,
    updatedHistory: addSnapshot({ history: storedHistory, snapshot, maxHistory }),
    droppedSnapshots: Math.max(0, storedHistory.snapshots.length + 1 - maxHistory),
    thresholdReached: shouldNotify({
      totalStars: summary.totalStars,
      starsAtLastNotification: storedHistory.starsAtLastNotification,
      threshold: notificationThreshold,
      mode: notificationMode,
    }),
  };
}

interface RecordNotificationParams {
  history: History;
  totalStars: number;
}

export function recordNotification({ history, totalStars }: RecordNotificationParams): History {
  return { ...history, starsAtLastNotification: totalStars };
}
