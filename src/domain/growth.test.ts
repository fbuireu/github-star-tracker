import { describe, expect, it } from "vitest";
import { calendarDays, fitTrend, latestRateInterval, type SeriesPoint, weightedDailyRate } from "./growth";
import type { History } from "./types";

type SeriesParams = {
	values: number[];
	step?: number;
};

function series({ values, step = 1 }: SeriesParams): SeriesPoint[] {
	return values.map((value, index) => ({ day: index * step, value }));
}

function makeHistory(timestamps: string[]): History {
	return {
		snapshots: timestamps.map((timestamp, index) => ({
			timestamp,
			totalStars: index,
			repos: [],
		})),
	};
}

describe("calendarDays", () => {
	it("measures each snapshot in days since the first", () => {
		const history = makeHistory(["2026-01-01T00:00:00Z", "2026-01-08T00:00:00Z", "2026-01-11T00:00:00Z"]);

		expect(calendarDays(history)).toEqual([0, 7, 10]);
	});

	it("keeps fractional spacing so a same-day re-run is not rounded away", () => {
		const history = makeHistory(["2026-01-01T00:00:00Z", "2026-01-01T12:00:00Z"]);

		expect(calendarDays(history)).toEqual([0, 0.5]);
	});

	it("falls back to a synthetic weekly cadence when any timestamp is unparseable", () => {
		const history = makeHistory(["2026-01-01T00:00:00Z", "not-a-date", "2026-01-20T00:00:00Z"]);

		expect(calendarDays(history)).toEqual([0, 7, 14]);
	});

	it("returns an empty array for an empty history", () => {
		expect(calendarDays({ snapshots: [] })).toEqual([]);
	});
});

describe("latestRateInterval", () => {
	it("returns null below two points", () => {
		expect(latestRateInterval(series({ values: [10] }))).toBeNull();
		expect(latestRateInterval([])).toBeNull();
	});

	it("pairs the newest point with the one immediately before it when far enough back", () => {
		const interval = latestRateInterval(series({ values: [10, 20, 30] }));

		expect(interval?.from.value).toBe(20);
		expect(interval?.to.value).toBe(30);
		expect(interval?.days).toBe(1);
	});

	it("skips a pair closer together than the minimum rate interval", () => {
		const interval = latestRateInterval([
			{ day: 0, value: 1000 },
			{ day: 1, value: 1010 },
			{ day: 1.04, value: 1011 },
		]);

		expect(interval?.from.value).toBe(1000);
		expect(interval?.days).toBeCloseTo(1.04);
	});

	it("returns null when every pair is closer than the minimum interval", () => {
		const interval = latestRateInterval([
			{ day: 0, value: 1000 },
			{ day: 0.1, value: 1001 },
		]);

		expect(interval).toBeNull();
	});

	it("returns null when no time has elapsed at all", () => {
		expect(
			latestRateInterval([
				{ day: 0, value: 100 },
				{ day: 0, value: 120 },
			]),
		).toBeNull();
	});
});

describe("weightedDailyRate", () => {
	it("returns 0 for fewer than 2 values", () => {
		expect(weightedDailyRate(series({ values: [10] }))).toBe(0);
		expect(weightedDailyRate(series({ values: [] }))).toBe(0);
	});

	it("computes weighted average for constant deltas", () => {
		expect(weightedDailyRate(series({ values: [10, 20, 30, 40] }))).toBeCloseTo(10);
	});

	it("weights recent deltas more heavily (accelerating)", () => {
		expect(weightedDailyRate(series({ values: [10, 11, 13, 18] }))).toBeGreaterThan(2);
	});

	it("weights recent deltas more heavily (decelerating)", () => {
		const resultAccel = weightedDailyRate(series({ values: [10, 20, 25, 26] }));
		const resultConst = weightedDailyRate(series({ values: [10, 14, 18, 22] }));

		expect(resultAccel).toBeLessThan(resultConst);
	});

	it("normalizes the rate by real day spacing", () => {
		expect(weightedDailyRate(series({ values: [10, 20, 30, 40], step: 10 }))).toBeCloseTo(1);
	});

	it("skips zero-duration intervals", () => {
		const result = weightedDailyRate([
			{ day: 0, value: 10 },
			{ day: 0, value: 20 },
			{ day: 1, value: 30 },
		]);

		expect(result).toBeCloseTo(10);
	});

	it("applies the same minimum interval as latestRateInterval", () => {
		const tooClose = [
			{ day: 0, value: 10 },
			{ day: 0.1, value: 90 },
		];

		expect(weightedDailyRate(tooClose)).toBe(0);
		expect(latestRateInterval(tooClose)).toBeNull();
	});
});

describe("fitTrend", () => {
	it("returns slope=0 for constant values", () => {
		const result = fitTrend(series({ values: [10, 10, 10, 10] }));

		expect(result.slope).toBeCloseTo(0);
		expect(result.intercept).toBeCloseTo(10);
	});

	it("computes correct slope for linear growth", () => {
		const result = fitTrend(series({ values: [10, 20, 30, 40] }));

		expect(result.slope).toBeCloseTo(10);
		expect(result.intercept).toBeCloseTo(10);
	});

	it("computes correct slope for decreasing values", () => {
		const result = fitTrend(series({ values: [40, 30, 20, 10] }));

		expect(result.slope).toBeCloseTo(-10);
		expect(result.intercept).toBeCloseTo(40);
	});

	it("handles single value", () => {
		const result = fitTrend(series({ values: [42] }));

		expect(result.slope).toBe(0);
		expect(result.intercept).toBe(42);
	});

	it("normalizes slope by real day spacing", () => {
		const result = fitTrend(series({ values: [10, 20, 30, 40], step: 10 }));

		expect(result.slope).toBeCloseTo(1);
		expect(result.intercept).toBeCloseTo(10);
	});
});
