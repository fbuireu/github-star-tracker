import { describe, expect, it } from "vitest";
import { generateBadge } from "./badge";

describe("generateBadge", () => {
	it("generates valid SVG", () => {
		const svg = generateBadge({ totalStars: 42, locale: "en" });

		expect(svg).toContain("<svg");
		expect(svg).toContain("</svg>");
		expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
	});

	it("titles the badge with the label and the starred count", () => {
		const svg = generateBadge({ totalStars: 42, locale: "en" });

		expect(svg).toContain("<title>Total Stars: \u2605 42</title>");
	});

	it("formats large numbers", () => {
		const svg = generateBadge({ totalStars: 1500, locale: "en" });

		expect(svg).toContain("1.5K");
	});

	it("has correct aria-label for accessibility", () => {
		const svg = generateBadge({ totalStars: 100, locale: "en" });

		expect(svg).toContain('aria-label="Total Stars: \u2605 100"');
	});
});
