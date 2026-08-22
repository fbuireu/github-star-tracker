export const EscapeDialect = {
	MARKUP: "markup",
	XML: "xml",
	MARKDOWN: "markdown",
	CSV: "csv",
} as const;

export type EscapeDialect = (typeof EscapeDialect)[keyof typeof EscapeDialect];

type EscapeMap = Record<string, string>;

const MARKUP_ESCAPES: EscapeMap = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};

const XML_ESCAPES: EscapeMap = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
};

const MARKDOWN_ESCAPES: EscapeMap = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	"[": "\\[",
	"]": "\\]",
	"(": "\\(",
	")": "\\)",
	"`": "\\`",
};

const CSV_DELIMITER = ",";
const CSV_QUOTE = '"';
const CSV_NEW_LINE = "\n";
const CSV_FORMULA_TRIGGERS = ["=", "+", "-", "@"];
const CSV_FORMULA_GUARD = "'";

function replacerFor(escapes: EscapeMap): (text: string) => string {
	const pattern = new RegExp(
		`[${Object.keys(escapes)
			.join("")
			.replace(/[\]\\^-]/g, "\\$&")}]`,
		"g",
	);

	return (text: string) => text.replaceAll(pattern, (char) => escapes[char]);
}

function escapeCsvField(field: string): string {
	const neutralized = CSV_FORMULA_TRIGGERS.some((trigger) => field.startsWith(trigger))
		? `${CSV_FORMULA_GUARD}${field}`
		: field;

	if (
		neutralized.includes(CSV_DELIMITER) ||
		neutralized.includes(CSV_QUOTE) ||
		neutralized.includes(CSV_NEW_LINE) ||
		neutralized !== field
	) {
		return `${CSV_QUOTE}${neutralized.replaceAll(CSV_QUOTE, `${CSV_QUOTE}${CSV_QUOTE}`)}${CSV_QUOTE}`;
	}

	return neutralized;
}

const ESCAPERS: Record<EscapeDialect, (text: string) => string> = {
	[EscapeDialect.MARKUP]: replacerFor(MARKUP_ESCAPES),
	[EscapeDialect.XML]: replacerFor(XML_ESCAPES),
	[EscapeDialect.MARKDOWN]: replacerFor(MARKDOWN_ESCAPES),
	[EscapeDialect.CSV]: escapeCsvField,
};

export function escapeFor(dialect: EscapeDialect): (text: string) => string {
	return ESCAPERS[dialect];
}
