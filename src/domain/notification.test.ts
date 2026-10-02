import { makeMultiRepoHistory } from "@shared/tests";
import { describe, expect, it } from "vitest";
import { Delivery, settleNotification, shouldNotify } from "./notification";
import type { History } from "./types";
import { NotificationMode } from "./types";

interface FiresAtParams {
	totalStars: number;
	gained: number;
}

describe("shouldNotify with an 'auto' threshold", () => {
	function firesAt({ totalStars, gained }: FiresAtParams): boolean {
		return shouldNotify({
			totalStars,
			starsAtLastNotification: totalStars - gained,
			threshold: "auto",
		});
	}

	it.each([
		{ band: "up to 50 stars", totalStars: 50, threshold: 1 },
		{ band: "51 to 200 stars", totalStars: 200, threshold: 5 },
		{ band: "201 to 500 stars", totalStars: 500, threshold: 10 },
		{ band: "above 500 stars", totalStars: 1000, threshold: 20 },
	])("scales the threshold to $threshold for a set of $band", ({ totalStars, threshold }) => {
		expect(firesAt({ totalStars, gained: threshold })).toBe(true);
		expect(firesAt({ totalStars, gained: threshold - 1 })).toBe(false);
	});

	it("reads the band from the current total, so crossing a boundary raises the bar", () => {
		expect(firesAt({ totalStars: 50, gained: 1 })).toBe(true);
		expect(firesAt({ totalStars: 51, gained: 1 })).toBe(false);
	});
});

describe("shouldNotify", () => {
	it("returns true when threshold is 0", () => {
		expect(shouldNotify({ totalStars: 100, starsAtLastNotification: 100, threshold: 0 })).toBe(true);
	});

	it("returns false when delta is below threshold", () => {
		expect(shouldNotify({ totalStars: 103, starsAtLastNotification: 100, threshold: 5 })).toBe(false);
	});

	it("returns true when delta equals threshold", () => {
		expect(shouldNotify({ totalStars: 105, starsAtLastNotification: 100, threshold: 5 })).toBe(true);
	});

	it("returns true when delta exceeds threshold", () => {
		expect(shouldNotify({ totalStars: 107, starsAtLastNotification: 100, threshold: 5 })).toBe(true);
	});

	it("treats starsAtLastNotification undefined as 0", () => {
		expect(shouldNotify({ totalStars: 5, starsAtLastNotification: undefined, threshold: 5 })).toBe(true);
	});

	it("considers absolute delta (star loss)", () => {
		expect(shouldNotify({ totalStars: 95, starsAtLastNotification: 100, threshold: 5 })).toBe(true);
	});

	it("defaults to net mode", () => {
		expect(shouldNotify({ totalStars: 95, starsAtLastNotification: 100, threshold: 5 })).toBe(
			shouldNotify({
				totalStars: 95,
				starsAtLastNotification: 100,
				threshold: 5,
				mode: NotificationMode.NET,
			}),
		);
	});

	it("ignores star loss in gains mode", () => {
		expect(
			shouldNotify({
				totalStars: 95,
				starsAtLastNotification: 100,
				threshold: 5,
				mode: NotificationMode.GAINS,
			}),
		).toBe(false);
	});

	it("returns true in gains mode when the total rises by the threshold", () => {
		expect(
			shouldNotify({
				totalStars: 600,
				starsAtLastNotification: 100,
				threshold: 500,
				mode: NotificationMode.GAINS,
			}),
		).toBe(true);
	});

	it("returns false in gains mode when the rise is below the threshold", () => {
		expect(
			shouldNotify({
				totalStars: 599,
				starsAtLastNotification: 100,
				threshold: 500,
				mode: NotificationMode.GAINS,
			}),
		).toBe(false);
	});

	it("accumulates across runs in gains mode until the threshold trips", () => {
		const starsAtLastNotification = 40_000;

		expect(
			shouldNotify({
				totalStars: 40_300,
				starsAtLastNotification,
				threshold: 500,
				mode: NotificationMode.GAINS,
			}),
		).toBe(false);
		expect(
			shouldNotify({
				totalStars: 40_500,
				starsAtLastNotification,
				threshold: 500,
				mode: NotificationMode.GAINS,
			}),
		).toBe(true);
	});

	it("returns true when threshold is 0 regardless of mode", () => {
		expect(
			shouldNotify({
				totalStars: 95,
				starsAtLastNotification: 100,
				threshold: 0,
				mode: NotificationMode.GAINS,
			}),
		).toBe(true);
	});

	it("uses adaptive threshold in gains mode, ignoring a loss that would clear it", () => {
		expect(
			shouldNotify({
				totalStars: 1000,
				starsAtLastNotification: 1030,
				threshold: "auto",
				mode: NotificationMode.GAINS,
			}),
		).toBe(false);
		expect(
			shouldNotify({
				totalStars: 1020,
				starsAtLastNotification: 1000,
				threshold: "auto",
				mode: NotificationMode.GAINS,
			}),
		).toBe(true);
	});
});

describe("settleNotification", () => {
	const history: History = makeMultiRepoHistory({ snapshots: [{ "user/repo-a": 100 }] });
	const settle = (overrides: Partial<Parameters<typeof settleNotification>[0]> = {}) =>
		settleNotification({
			changed: true,
			thresholdReached: true,
			delivery: Delivery.NOT_ATTEMPTED,
			history,
			totalStars: 100,
			...overrides,
		});

	it("decides to notify only when something changed and the threshold was cleared", () => {
		expect(settle().shouldNotify).toBe(true);
		expect(settle({ changed: false }).shouldNotify).toBe(false);
		expect(settle({ thresholdReached: false }).shouldNotify).toBe(false);
	});

	it("reports delivery as a fact, independent of the decision", () => {
		expect(settle({ delivery: Delivery.SENT }).notificationSent).toBe(true);
		expect(settle({ delivery: Delivery.NOT_ATTEMPTED }).notificationSent).toBe(false);
		expect(settle({ delivery: Delivery.FAILED }).notificationSent).toBe(false);
	});

	it("advances the Notification Baseline when an unconfigured transport makes should-notify the notification", () => {
		expect(settle().historyToPersist.starsAtLastNotification).toBe(100);
	});

	it("advances the Notification Baseline on a delivered notification", () => {
		expect(settle({ delivery: Delivery.SENT }).historyToPersist.starsAtLastNotification).toBe(100);
	});

	it("moves an earlier Notification Baseline to the delivered total", () => {
		const notified: History = { ...history, starsAtLastNotification: 50 };

		expect(settle({ history: notified, delivery: Delivery.SENT }).historyToPersist.starsAtLastNotification).toBe(100);
	});

	it("returns a new History when it advances, so the one it was handed stays persistable", () => {
		const advanced = settle({ delivery: Delivery.SENT }).historyToPersist;

		expect(advanced).not.toBe(history);
		expect(history.starsAtLastNotification).toBeUndefined();
		expect(advanced.snapshots).toBe(history.snapshots);
	});

	it("leaves the Notification Baseline alone when a configured send failed, so the change still accrues", () => {
		const outcome = settle({ delivery: Delivery.FAILED });

		expect(outcome.historyToPersist).toBe(history);
		expect(outcome.historyToPersist.starsAtLastNotification).toBeUndefined();
	});

	it("does not let a courtesy send consume the accumulated threshold", () => {
		const outcome = settle({ changed: false, delivery: Delivery.SENT });

		expect(outcome.notificationSent).toBe(true);
		expect(outcome.shouldNotify).toBe(false);
		expect(outcome.historyToPersist).toBe(history);
	});
});
