import { compareStars, createSnapshot } from "./comparison";
import { shouldNotify } from "./notification";
import { addSnapshot, getBaselineSnapshot } from "./snapshot";
import type { CompareAgainst, ComparisonResults, History, NotificationMode, RepoInfo, Summary } from "./types";

export interface RunMeasurement {
	baselineSnapshotTimestamp: string | null;
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
	notificationThreshold: number | "auto";
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
	const baselineSnapshot = getBaselineSnapshot({
		history: storedHistory,
		compareAgainst: comparisonWindow,
		now,
	});
	const results = compareStars({ currentRepos: trackedSet, baselineSnapshot });
	const { summary } = results;
	const snapshot = createSnapshot({ currentRepos: trackedSet, summary, now });
	const updatedHistory = addSnapshot({ history: storedHistory, snapshot, maxHistory });

	return {
		baselineSnapshotTimestamp: baselineSnapshot === null ? null : baselineSnapshot.timestamp,
		results,
		summary,
		updatedHistory,
		droppedSnapshots: storedHistory.snapshots.length + 1 - updatedHistory.snapshots.length,
		thresholdReached: shouldNotify({
			totalStars: summary.totalStars,
			starsAtLastNotification: storedHistory.starsAtLastNotification,
			threshold: notificationThreshold,
			mode: notificationMode,
		}),
	};
}
