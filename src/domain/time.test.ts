import { describe, expect, it } from "vitest";
import { toEpochMs } from "./time";

describe("toEpochMs", () => {
	it("parses an ISO timestamp", () => {
		expect(toEpochMs("2026-01-01T00:00:00Z")).toBe(Date.UTC(2026, 0, 1));
	});

	it("returns null for an unparseable timestamp", () => {
		expect(toEpochMs("not-a-date")).toBeNull();
	});

	it("returns null for an empty string", () => {
		expect(toEpochMs("")).toBeNull();
	});
});
