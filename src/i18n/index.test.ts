import { describe, expect, it } from "vitest";
import { getTranslations, interpolate, LOCALE_MAP, LOCALES, type Locale } from "./index";

const INTL_LOCALE_CODE_PATTERN = /^[a-z]{2}-[A-Z]{2}$/;

const leafKeys = (bundle: object): string[] =>
	Object.entries(bundle).flatMap(([key, value]) =>
		typeof value === "object" && value !== null ? leafKeys(value).map((leaf) => `${key}.${leaf}`) : [key],
	);

describe("interpolate prototype safety", () => {
	it("does not resolve a placeholder from the prototype chain", () => {
		expect(interpolate({ template: "{constructor}", params: {} })).toBe("{constructor}");
		expect(interpolate({ template: "{toString}", params: {} })).toBe("{toString}");
	});
});

describe("interpolate", () => {
	it("replaces placeholders with params", () => {
		expect(interpolate({ template: "Hello {name}!", params: { name: "World" } })).toBe("Hello World!");
	});

	it("replaces multiple placeholders", () => {
		expect(
			interpolate({
				template: "{a} + {b} = {c}",
				params: { a: 1, b: 2, c: 3 },
			}),
		).toBe("1 + 2 = 3");
	});

	it("leaves unmatched placeholders intact", () => {
		expect(interpolate({ template: "Hello {name}!", params: {} })).toBe("Hello {name}!");
	});

	it("handles template with no placeholders", () => {
		expect(interpolate({ template: "No placeholders", params: { key: "val" } })).toBe("No placeholders");
	});
});

describe("getTranslations", () => {
	it("falls back to English for a locale outside the union, prototype keys included", () => {
		const english = getTranslations("en");

		expect(getTranslations("fr" as Locale)).toBe(english);
		expect(getTranslations("toString" as Locale)).toBe(english);
	});

	it("returns English translations for en locale", () => {
		const t = getTranslations("en");

		expect(t.report.title).toBe("Star Tracker Report");
	});

	it("returns Spanish translations for es locale", () => {
		const t = getTranslations("es");

		expect(t.report.title).toBe("Informe de seguimiento de estrellas");
	});

	it("returns Catalan translations for ca locale", () => {
		const t = getTranslations("ca");

		expect(t.report.title).toBe("Informe de seguiment d'estrelles");
	});

	it("returns Italian translations for it locale", () => {
		const t = getTranslations("it");

		expect(t.report.title).toBe("Report di monitoraggio delle stelle");
	});
});

describe("LOCALES", () => {
	it("lists every key of LOCALE_MAP", () => {
		expect(LOCALES).toEqual(["en", "es", "ca", "it"]);
	});

	it("has a bundle of its own for every listed locale, not the English fallback", () => {
		const titles = LOCALES.map((locale) => getTranslations(locale).report.title);

		expect(new Set(titles).size).toBe(LOCALES.length);
	});

	it("gives every bundle exactly the keys of en.json", () => {
		const english = leafKeys(getTranslations("en"));
		const drift = LOCALES.flatMap((locale) => {
			const keys = leafKeys(getTranslations(locale));

			return [
				...keys.filter((key) => !english.includes(key)).map((key) => `${locale}: extra ${key}`),
				...english.filter((key) => !keys.includes(key)).map((key) => `${locale}: missing ${key}`),
			];
		});

		expect(drift).toEqual([]);
	});

	it("maps every locale to an Intl code", () => {
		for (const locale of LOCALES) {
			expect(LOCALE_MAP[locale]).toMatch(INTL_LOCALE_CODE_PATTERN);
		}
	});
});
