import { makeMultiRepoHistory, makeRepoInfo } from '@shared/tests';
import { describe, expect, it } from 'vitest';
import { measureRun } from './measurement';
import type { History } from './types';
import { CompareAgainst, NotificationMode } from './types';

const BASE = {
  comparisonWindow: CompareAgainst.LAST_RUN,
  maxHistory: 30,
  notificationThreshold: 0,
  notificationMode: NotificationMode.NET,
} as const;

const EMPTY_HISTORY: History = { snapshots: [] };

describe('measureRun', () => {
  it('measures a first run against no baseline', () => {
    const measurement = measureRun({
      ...BASE,
      trackedSet: [makeRepoInfo('repo-a', 10), makeRepoInfo('repo-b', 5)],
      storedHistory: EMPTY_HISTORY,
    });

    expect(measurement.baselineTimestamp).toBeNull();
    expect(measurement.summary.totalStars).toBe(15);
    expect(measurement.summary.totalDelta).toBe(15);
    expect(measurement.results.repos.every((repo) => repo.isNew)).toBe(true);
  });

  it('compares against the baseline the comparison window selects, not the newest snapshot', () => {
    const storedHistory = makeMultiRepoHistory([
      { 'user/repo-a': 10 },
      { 'user/repo-a': 40 },
      { 'user/repo-a': 90 },
    ]);

    const lastRun = measureRun({
      ...BASE,
      comparisonWindow: CompareAgainst.LAST_RUN,
      trackedSet: [makeRepoInfo('repo-a', 100)],
      storedHistory,
      now: new Date(storedHistory.snapshots[2].timestamp),
    });
    const monthly = measureRun({
      ...BASE,
      comparisonWindow: CompareAgainst.D30,
      trackedSet: [makeRepoInfo('repo-a', 100)],
      storedHistory,
      now: new Date(storedHistory.snapshots[2].timestamp),
    });

    expect(lastRun.baselineTimestamp).toBe(storedHistory.snapshots[2].timestamp);
    expect(lastRun.summary.totalDelta).toBe(10);
    expect(monthly.baselineTimestamp).toBe(storedHistory.snapshots[0].timestamp);
    expect(monthly.summary.totalDelta).toBe(90);
  });

  it('appends the run to the stored history without mutating it', () => {
    const storedHistory = makeMultiRepoHistory([{ 'user/repo-a': 10 }]);

    const measurement = measureRun({
      ...BASE,
      trackedSet: [makeRepoInfo('repo-a', 20)],
      storedHistory,
    });

    expect(storedHistory.snapshots).toHaveLength(1);
    expect(measurement.updatedHistory.snapshots).toHaveLength(2);
    expect(measurement.updatedHistory.snapshots.at(-1)?.totalStars).toBe(20);
  });

  it('snapshots the same repositories it compared, so the totals cannot diverge', () => {
    const trackedSet = [makeRepoInfo('repo-a', 7), makeRepoInfo('repo-b', 3)];

    const measurement = measureRun({ ...BASE, trackedSet, storedHistory: EMPTY_HISTORY });
    const appended = measurement.updatedHistory.snapshots.at(-1);

    expect(appended?.totalStars).toBe(measurement.summary.totalStars);
    expect(appended?.repos.map((repo) => repo.fullName)).toEqual(
      trackedSet.map((repo) => repo.fullName),
    );
  });

  it('reports how many snapshots the max-history trim drops', () => {
    const storedHistory = makeMultiRepoHistory([
      { 'user/repo-a': 1 },
      { 'user/repo-a': 2 },
      { 'user/repo-a': 3 },
    ]);

    expect(
      measureRun({
        ...BASE,
        maxHistory: 2,
        trackedSet: [makeRepoInfo('repo-a', 4)],
        storedHistory,
      }).droppedSnapshots,
    ).toBe(2);
  });

  it('reports no drop when max-history leaves room', () => {
    expect(
      measureRun({
        ...BASE,
        maxHistory: 30,
        trackedSet: [makeRepoInfo('repo-a', 4)],
        storedHistory: EMPTY_HISTORY,
      }).droppedSnapshots,
    ).toBe(0);
  });

  it('counts what the appended history actually lost, even when max-history keeps everything', () => {
    const storedHistory = makeMultiRepoHistory([{ 'user/repo-a': 1 }, { 'user/repo-a': 2 }]);
    const measurement = measureRun({
      ...BASE,
      maxHistory: 0,
      trackedSet: [makeRepoInfo('repo-a', 3)],
      storedHistory,
    });

    expect(measurement.updatedHistory.snapshots).toHaveLength(3);
    expect(measurement.droppedSnapshots).toBe(0);
  });

  it('trims the appended history to max-history', () => {
    const storedHistory = makeMultiRepoHistory([
      { 'user/repo-a': 1 },
      { 'user/repo-a': 2 },
      { 'user/repo-a': 3 },
    ]);

    const measurement = measureRun({
      ...BASE,
      maxHistory: 2,
      trackedSet: [makeRepoInfo('repo-a', 4)],
      storedHistory,
    });

    expect(measurement.updatedHistory.snapshots).toHaveLength(2);
  });

  it('measures the notification threshold against the pre-append baseline, so it accumulates', () => {
    const storedHistory: History = {
      ...makeMultiRepoHistory([{ 'user/repo-a': 100 }]),
      starsAtLastNotification: 100,
    };

    const belowThreshold = measureRun({
      ...BASE,
      notificationThreshold: 20,
      trackedSet: [makeRepoInfo('repo-a', 110)],
      storedHistory,
    });
    const aboveThreshold = measureRun({
      ...BASE,
      notificationThreshold: 20,
      trackedSet: [makeRepoInfo('repo-a', 125)],
      storedHistory,
    });

    expect(belowThreshold.thresholdReached).toBe(false);
    expect(aboveThreshold.thresholdReached).toBe(true);
  });

  it('leaves the notification baseline untouched, so a threshold that was not delivered still accrues', () => {
    const storedHistory: History = {
      ...makeMultiRepoHistory([{ 'user/repo-a': 100 }]),
      starsAtLastNotification: 100,
    };

    const measurement = measureRun({
      ...BASE,
      notificationThreshold: 5,
      trackedSet: [makeRepoInfo('repo-a', 130)],
      storedHistory,
    });

    expect(measurement.thresholdReached).toBe(true);
    expect(measurement.updatedHistory.starsAtLastNotification).toBe(100);
  });

  it('honours the notification mode when stars are lost', () => {
    const storedHistory: History = {
      ...makeMultiRepoHistory([{ 'user/repo-a': 100 }]),
      starsAtLastNotification: 100,
    };
    const lost = { ...BASE, notificationThreshold: 20, trackedSet: [makeRepoInfo('repo-a', 70)] };

    expect(
      measureRun({ ...lost, storedHistory, notificationMode: NotificationMode.NET })
        .thresholdReached,
    ).toBe(true);
    expect(
      measureRun({ ...lost, storedHistory, notificationMode: NotificationMode.GAINS })
        .thresholdReached,
    ).toBe(false);
  });

  it('stamps the appended Snapshot with the injected clock, not the wall clock', () => {
    const now = new Date('2026-03-04T12:00:00.000Z');

    const measurement = measureRun({
      ...BASE,
      trackedSet: [makeRepoInfo('repo-a', 10)],
      storedHistory: EMPTY_HISTORY,
      now,
    });

    expect(measurement.updatedHistory.snapshots.at(-1)?.timestamp).toBe(now.toISOString());
  });
});
