import * as z from "zod/mini";

const ErrorWithMessageSchema = z.object({
	message: z.string().check(z.refine((message) => message.trim() !== "")),
});

function textOf(value: unknown): string {
	try {
		return String(value);
	} catch {
		return Object.prototype.toString.call(value);
	}
}

export function errorMessage(error: unknown): string {
	return z.validate(ErrorWithMessageSchema, error) ? error.message : textOf(error);
}

export function describeFound(value: unknown): string {
	if (Array.isArray(value)) return "an array";
	if (value !== null && typeof value === "object") return "an object";

	return value === undefined ? "nothing" : JSON.stringify(value);
}

function formatIssuePath(path: readonly PropertyKey[]): string {
	return path
		.map((key, index) => (typeof key === "number" ? `[${key}]` : `${index === 0 ? "" : "."}${String(key)}`))
		.join("");
}

export function describeIssue(issue: z.core.$ZodIssue): string {
	const expected = issue.code === "invalid_type" ? `expected ${issue.expected}, ` : "";

	return `${formatIssuePath(issue.path) || "the value"} (${expected}found ${describeFound(issue.input)})`;
}
