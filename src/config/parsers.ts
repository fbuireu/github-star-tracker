import * as z from "zod/mini";

const YAML_TRUE = ["true", "yes", "on", "y", "1"];
const YAML_FALSE = ["false", "no", "off", "n", "0"];
const INTEGER_PATTERN = /^[+-]?\d+$/;
const HEX_COLOR_PATTERN = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

const TrimmedStringSchema = z.string().check(z.trim());

interface BooleanVocabularyParams {
	truthy: readonly string[];
	falsy: readonly string[];
}

function booleanVocabulary({ truthy, falsy }: BooleanVocabularyParams) {
	return z.pipe(
		z.enum([...truthy, ...falsy]),
		z.transform((word) => truthy.includes(word)),
	);
}

const InputBoolSchema = z.union([
	z.boolean(),
	z.pipe(TrimmedStringSchema.check(z.toLowerCase()), booleanVocabulary({ truthy: ["true"], falsy: ["false"] })),
]);

const FileBoolSchema = z.union([
	z.boolean(),
	z.pipe(
		z.pipe(
			z.union([z.string(), z.number()]),
			z.transform((value) => String(value).trim().toLowerCase()),
		),
		booleanVocabulary({ truthy: YAML_TRUE, falsy: YAML_FALSE }),
	),
]);

const IntegerSchema = z.union([
	z.pipe(z.number(), z.transform(Math.trunc)),
	z.pipe(
		TrimmedStringSchema.check(z.regex(INTEGER_PATTERN)),
		z.transform((value) => Number.parseInt(value, 10)),
	),
]);

const PositiveIntegerSchema = z.pipe(IntegerSchema, z.number().check(z.positive()));

const NonNegativeIntegerSchema = z.pipe(IntegerSchema, z.number().check(z.nonnegative()));

const PositiveDecimalSchema = z.pipe(
	z.union([z.number(), z.pipe(z.string(), z.transform(Number.parseFloat))]),
	z.number().check(z.positive()),
);

const NotificationThresholdSchema = z.union([z.literal("auto"), IntegerSchema]);

const HexColorSchema = z.pipe(
	TrimmedStringSchema.check(z.regex(HEX_COLOR_PATTERN)),
	z.transform((value) => `#${value.replace(/^#/, "").toLowerCase()}`),
);

export function parseList(value: string | null | undefined): string[] | undefined {
	if (!value || value.trim() === "") return undefined;

	return value
		.split(",")
		.map((segment) => segment.trim())
		.filter(Boolean);
}

export function parseNumberList(value: string | null | undefined): number[] {
	return [
		...new Set(
			(parseList(value) ?? [])
				.map((segment) => Number.parseInt(segment, 10))
				.filter((parsed) => Number.isFinite(parsed) && parsed > 0),
		),
	].sort((a, b) => a - b);
}

export function parsePositiveNumber(value: unknown): number | undefined {
	return PositiveIntegerSchema.safeParse(value).data;
}

export function parseNonNegativeNumber(value: unknown): number | undefined {
	return NonNegativeIntegerSchema.safeParse(value).data;
}

export function parseBool(value: unknown): boolean | undefined {
	return InputBoolSchema.safeParse(value).data;
}

export function parseFileBool(value: unknown): boolean | undefined {
	return FileBoolSchema.safeParse(value).data;
}

export function toStringList(value: unknown): string[] | undefined {
	if (value === undefined || value === null) return undefined;
	if (Array.isArray(value)) return value.map(String);

	return typeof value === "string" ? parseList(value) : undefined;
}

export function parseHexColor(value: unknown): string | undefined {
	return HexColorSchema.safeParse(value).data;
}

export function parsePositiveDecimal(value: unknown): number | undefined {
	return PositiveDecimalSchema.safeParse(value).data;
}

export function parseNotificationThreshold(value: unknown): number | "auto" | undefined {
	return NotificationThresholdSchema.safeParse(value).data;
}
