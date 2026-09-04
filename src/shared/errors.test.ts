import { describe, expect, it } from "vitest";
import { errorMessage } from "./errors";

describe("errorMessage", () => {
	it("reads the message off an Error", () => {
		expect(errorMessage(new Error("Network Error"))).toBe("Network Error");
	});

	it("reads the message off an Error-like throw that is not an Error", () => {
		expect(errorMessage({ message: "socket hang up" })).toBe("socket hang up");
	});

	it("never returns a blank string for an Error carrying none", () => {
		expect(errorMessage(new Error(""))).toBe("Error");
		expect(errorMessage(new Error("   ")).trim()).not.toBe("");
	});

	it("never throws for null or undefined", () => {
		expect(errorMessage(null)).toBe("null");
		expect(errorMessage(undefined)).toBe("undefined");
	});

	it("describes a non-Error throw", () => {
		expect(errorMessage("a plain string error")).toBe("a plain string error");
		expect(errorMessage(42)).toBe("42");
		expect(errorMessage({ some: "object" })).toBe("[object Object]");
	});

	it("ignores a non-string message", () => {
		expect(errorMessage({ message: 500 })).toBe("[object Object]");
	});
});
