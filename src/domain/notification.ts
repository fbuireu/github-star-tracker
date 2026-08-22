import { NOTIFICATION_THRESHOLD_MAX_PACE, NOTIFICATION_THRESHOLDS } from "./constants";
import { type History, NotificationMode } from "./types";

function getAdaptiveThreshold(totalStars: number): number {
	return (
		NOTIFICATION_THRESHOLDS.find((threshold) => totalStars <= threshold.limit)?.value ?? NOTIFICATION_THRESHOLD_MAX_PACE
	);
}

interface ShouldNotifyParams {
	totalStars: number;
	starsAtLastNotification: number | undefined;
	threshold: number | "auto";
	mode?: NotificationMode;
}

export function shouldNotify({
	totalStars,
	starsAtLastNotification,
	threshold,
	mode = NotificationMode.NET,
}: ShouldNotifyParams): boolean {
	if (threshold === 0) return true;

	const effectiveThreshold = threshold === "auto" ? getAdaptiveThreshold(totalStars) : threshold;
	const delta = totalStars - (starsAtLastNotification ?? 0);
	const accumulatedDelta = mode === NotificationMode.GAINS ? delta : Math.abs(delta);

	return accumulatedDelta >= effectiveThreshold;
}

export const Delivery = {
	NOT_ATTEMPTED: "not-attempted",
	SENT: "sent",
	FAILED: "failed",
} as const;

export type Delivery = (typeof Delivery)[keyof typeof Delivery];

interface RecordNotificationParams {
	history: History;
	totalStars: number;
}

export function recordNotification({ history, totalStars }: RecordNotificationParams): History {
	return { ...history, starsAtLastNotification: totalStars };
}

interface NotificationDueParams {
	changed: boolean;
	thresholdReached: boolean;
}

export function notificationIsDue({ changed, thresholdReached }: NotificationDueParams): boolean {
	return changed && thresholdReached;
}

export interface NotificationOutcome {
	shouldNotify: boolean;
	notificationSent: boolean;
	historyToPersist: History;
}

interface SettleNotificationParams {
	changed: boolean;
	thresholdReached: boolean;
	delivery: Delivery;
	history: History;
	totalStars: number;
}

export function settleNotification({
	changed,
	thresholdReached,
	delivery,
	history,
	totalStars,
}: SettleNotificationParams): NotificationOutcome {
	const shouldNotify = notificationIsDue({ changed, thresholdReached });
	const baselineAdvances = shouldNotify && delivery !== Delivery.FAILED;

	return {
		shouldNotify,
		notificationSent: delivery === Delivery.SENT,
		historyToPersist: baselineAdvances ? recordNotification({ history, totalStars }) : history,
	};
}
