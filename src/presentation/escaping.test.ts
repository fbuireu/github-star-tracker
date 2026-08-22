import { describe, expect, it } from "vitest";
import { EscapeDialect, escapeFor } from "./escaping";

describe("escapeFor(markup)", () => {
	const escaped = escapeFor(EscapeDialect.MARKUP);

	it("neutralises every character that could break out of an attribute or a tag", () => {
		expect(escaped(`<img src="x" onerror='y'>&`)).toBe("&lt;img src=&quot;x&quot; onerror=&#39;y&#39;&gt;&amp;");
	});

	it("leaves an ordinary repository name untouched", () => {
		expect(escaped("fbuireu/github-star-tracker")).toBe("fbuireu/github-star-tracker");
	});

	it("escapes an ampersand before the entities it introduces", () => {
		expect(escaped("a & <b>")).toBe("a &amp; &lt;b&gt;");
	});
});

describe("escapeFor(xml)", () => {
	const escaped = escapeFor(EscapeDialect.XML);

	it("escapes the four characters that can break an SVG attribute", () => {
		expect(escaped('<a href="x">&')).toBe("&lt;a href=&quot;x&quot;&gt;&amp;");
	});

	it("leaves a single quote alone because every attribute uses double quotes", () => {
		expect(escaped("it's")).toBe("it's");
	});

	it("leaves the star glyph the badge renders untouched", () => {
		expect(escaped("★ 1.5K")).toBe("★ 1.5K");
	});
});

describe("escapeFor(markdown)", () => {
	const escaped = escapeFor(EscapeDialect.MARKDOWN);

	it("neutralises link syntax so a login cannot forge its own link", () => {
		expect(escaped("evil](https://phish.example)[")).toBe("evil\\]\\(https://phish.example\\)\\[");
	});

	it("neutralises raw HTML so a login cannot inject a tag", () => {
		expect(escaped("<script>alert(1)</script>")).toBe("&lt;script&gt;alert\\(1\\)&lt;/script&gt;");
	});

	it("neutralises backticks so a login cannot open a code span", () => {
		expect(escaped("a`b")).toBe("a\\`b");
	});

	it("leaves an ordinary login untouched", () => {
		expect(escaped("fbuireu")).toBe("fbuireu");
	});
});

describe("escapeFor(csv)", () => {
	const escaped = escapeFor(EscapeDialect.CSV);

	it("quotes a field containing the delimiter", () => {
		expect(escaped("a,b")).toBe('"a,b"');
	});

	it("doubles an embedded quote and wraps the field", () => {
		expect(escaped('a"b')).toBe('"a""b"');
	});

	it("quotes a field containing a newline", () => {
		expect(escaped("a\nb")).toBe('"a\nb"');
	});

	it.each(["=", "+", "-", "@"])("neutralises a field starting with %s", (trigger) => {
		expect(escaped(`${trigger}cmd`)).toBe(`"'${trigger}cmd"`);
	});

	it("leaves an ordinary field unquoted", () => {
		expect(escaped("owner/repo")).toBe("owner/repo");
	});
});

describe("dialect selection", () => {
	it("returns a different escaper per dialect", () => {
		const input = `<a href='x'>`;

		expect(escapeFor(EscapeDialect.MARKUP)(input)).not.toBe(escapeFor(EscapeDialect.XML)(input));
	});

	it("is stable across calls so renderers can bind once at module load", () => {
		expect(escapeFor(EscapeDialect.MARKUP)).toBe(escapeFor(EscapeDialect.MARKUP));
	});
});
