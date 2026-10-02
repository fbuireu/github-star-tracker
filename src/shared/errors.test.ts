import { describe, expect, it } from "vitest";
import * as z from "zod/mini";
import { describeFound, describeIssue, errorMessage } from "./errors";

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

	it("never throws for an object with no prototype, which String() cannot convert", () => {
		expect(errorMessage(Object.create(null))).toBe("[object Object]");
	});
});

describe("describeFound", () => {
	it("names containers by kind and quotes scalars as JSON", () => {
		expect(describeFound([1])).toBe("an array");
		expect(describeFound({ a: 1 })).toBe("an object");
		expect(describeFound(null)).toBe("null");
		expect(describeFound("7")).toBe('"7"');
		expect(describeFound(7)).toBe("7");
		expect(describeFound(undefined)).toBe("nothing");
	});
});

describe("describeIssue", () => {
	interface FirstIssueParams {
		schema: z.ZodMiniType;
		value: unknown;
	}

	function firstIssue({ schema, value }: FirstIssueParams): z.core.$ZodIssue {
		const result = schema.safeParse(value, { reportInput: true });

		if (result.success) throw new Error("expected the value to be rejected");

		return result.error.issues[0];
	}

	it("renders the path with indexes in brackets and keys after dots", () => {
		const schema = z.object({ items: z.array(z.object({ count: z.number() })) });
		const value = { items: [{ count: 1 }, { count: "2" }] };

		expect(describeIssue(firstIssue({ schema, value }))).toBe('items[1].count (expected number, found "2")');
	});

	it("says a missing key was found as nothing", () => {
		const schema = z.object({ name: z.string() });

		expect(describeIssue(firstIssue({ schema, value: {} }))).toBe("name (expected string, found nothing)");
	});

	it("calls the root the value and leads with an index at the top of a list", () => {
		const schema = z.array(z.string());

		expect(describeIssue(firstIssue({ schema, value: {} }))).toBe("the value (expected array, found an object)");
		expect(describeIssue(firstIssue({ schema, value: ["a", null] }))).toBe("[1] (expected string, found null)");
	});

	it("leaves out the expectation for an issue that is not about the type", () => {
		const schema = z.number().check(z.maximum(1));

		expect(describeIssue(firstIssue({ schema, value: 2 }))).toBe("the value (found 2)");
	});
});
