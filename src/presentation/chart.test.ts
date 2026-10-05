import { ChartCurve } from "@config/types";
import type { ForecastData } from "@domain/forecast";
import { ForecastMethod } from "@domain/forecast";
import type { History } from "@domain/types";
import { LOCALE_MAP, LOCALES } from "@i18n";
import { makeMultiRepoHistory } from "@shared/tests";
import { describe, expect, it } from "vitest";
import { chartImageUrl } from "./chart";
import type { ChartRequest } from "./chart-spec";
import { AxisLabels, buildChartSpec, ChartKind } from "./chart-spec";
import { CHART_TENSION, LIGHT_PALETTE } from "./constants";

const CHART_CONFIG_PARAM = "&c=";
const CHART_HEIGHT = "&h=";
const CHART_WIDTH = "w=";

const forecastData: ForecastData = {
	aggregate: {
		forecasts: [
			{
				method: ForecastMethod.LINEAR_REGRESSION,
				points: [
					{ weekOffset: 1, predicted: 170 },
					{ weekOffset: 2, predicted: 195 },
					{ weekOffset: 3, predicted: 220 },
					{ weekOffset: 4, predicted: 245 },
				],
			},
			{
				method: ForecastMethod.WEIGHTED_MOVING_AVERAGE,
				points: [
					{ weekOffset: 1, predicted: 165 },
					{ weekOffset: 2, predicted: 180 },
					{ weekOffset: 3, predicted: 195 },
					{ weekOffset: 4, predicted: 210 },
				],
			},
		],
	},
	repos: [],
};

const mockHistory: History = makeMultiRepoHistory({
	snapshots: [
		{ "user/repo-a": 50, "user/repo-b": 50 },
		{ "user/repo-a": 70, "user/repo-b": 50 },
		{ "user/repo-a": 90, "user/repo-b": 60 },
	],
});

describe("chart", () => {
	describe("chartImageUrl: star history", () => {
		it("generates valid QuickChart URL with history data", () => {
			const url = chartImageUrl({
				request: { kind: ChartKind.STAR_HISTORY, history: mockHistory, title: "Test Chart" },
				locale: "en",
			});

			expect(url).toContain("https://quickchart.io/chart?");
			expect(url).toContain(`${CHART_WIDTH}800`);
			expect(url).toContain(`${CHART_HEIGHT}400`);
			expect(url).toContain(CHART_CONFIG_PARAM);
		});

		it("asks QuickChart for Chart.js 4, the version its config is written for, since its default 2.9.4 reads neither plugins.title, plugins.legend nor scales.x", () => {
			const url = chartImageUrl({
				request: { kind: ChartKind.STAR_HISTORY, history: mockHistory, title: "Test Chart" },
				locale: "en",
			});

			expect(new URL(url ?? "").searchParams.get("v")).toBe("4");
		});

		it("returns null when the spec has too little history to plot", () => {
			const singleSnapshot: History = {
				snapshots: [mockHistory.snapshots[0]],
			};
			const url = chartImageUrl({
				request: { kind: ChartKind.STAR_HISTORY, history: singleSnapshot },
				locale: "en",
			});

			expect(url).toBeNull();
		});

		it("caps the email chart at 30 points, because it never passes maxPoints on", () => {
			const largeHistory: History = {
				snapshots: Array.from({ length: 50 }, (_, index) => ({
					timestamp: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
					totalStars: 100 + index * 10,
					repos: [],
				})),
			};

			const url = chartImageUrl({
				request: { kind: ChartKind.STAR_HISTORY, history: largeHistory },
				locale: "en",
			});

			expect(url).not.toBeNull();
			if (url) {
				const decodedUrl = decodeURIComponent(url);
				const config = JSON.parse(decodedUrl.split(CHART_CONFIG_PARAM)[1]);

				expect(config.data.labels).toHaveLength(30);
				expect(config.data.datasets[0].data).toHaveLength(30);
			}
		});
	});

	describe("chartImageUrl: forecast", () => {
		it("draws each forecast projection with the dash pattern of its method", () => {
			const url = chartImageUrl({
				request: { kind: ChartKind.FORECAST, history: mockHistory, forecastData },
				locale: "en",
			});

			expect(url).not.toBeNull();

			if (url) {
				const decodedUrl = decodeURIComponent(url);
				const config = JSON.parse(decodedUrl.split(CHART_CONFIG_PARAM)[1]);

				expect(config.data.datasets[0].borderDash).toBeUndefined();
				expect(config.data.datasets[1].borderDash).toEqual([8, 4]);
				expect(config.data.datasets[2].borderDash).toEqual([4, 4]);
			}
		});
	});

	describe("the spec it draws", () => {
		const REQUESTS: ChartRequest[] = [
			{ kind: ChartKind.STAR_HISTORY, history: mockHistory },
			{ kind: ChartKind.COMPARISON, history: mockHistory, repoNames: ["user/repo-a", "user/repo-b"] },
			{ kind: ChartKind.FORECAST, history: mockHistory, forecastData },
		];

		it.each(LOCALES.flatMap((locale) => REQUESTS.map((request) => ({ locale, request }))))(
			"draws the labels, series, title and legend setting of the $request.kind spec in $locale",
			({ locale, request }) => {
				const spec = buildChartSpec({ request, locale, palette: LIGHT_PALETTE, axisLabels: AxisLabels.DATES });
				const url = chartImageUrl({ request, locale });

				expect(spec).not.toBeNull();
				expect(url).not.toBeNull();

				if (url && spec) {
					const config = JSON.parse(decodeURIComponent(url).split(CHART_CONFIG_PARAM)[1]);

					expect(config.data.labels).toEqual(spec.labels);
					expect(
						config.data.datasets.map(({ label, data, borderColor, fill }: Record<string, unknown>) => ({
							label,
							data,
							color: borderColor,
							fill,
						})),
					).toEqual(spec.series.map(({ label, data, color, fill }) => ({ label, data, color, fill })));
					expect(config.options.plugins.title.text).toBe(spec.title);
					expect(config.options.plugins.legend.display).toBe(spec.showLegend);
				}
			},
		);
	});

	describe("milestone annotations", () => {
		it("draws one annotation per Milestone the spec carries, labelled as the spec labels it", () => {
			const request: ChartRequest = {
				kind: ChartKind.STAR_HISTORY,
				history: {
					snapshots: [
						{ timestamp: "2025-01-01T00:00:00.000Z", totalStars: 80, repos: [] },
						{ timestamp: "2025-01-08T00:00:00.000Z", totalStars: 620, repos: [] },
					],
				},
			};
			const spec = buildChartSpec({ request, locale: "en", palette: LIGHT_PALETTE, axisLabels: AxisLabels.DATES });
			const url = chartImageUrl({ request, locale: "en" });

			expect(spec?.milestones.length).toBeGreaterThan(1);
			expect(url).not.toBeNull();

			if (url && spec) {
				const { annotations } = JSON.parse(decodeURIComponent(url).split(CHART_CONFIG_PARAM)[1]).options.plugins
					.annotation;

				expect(Object.keys(annotations)).toEqual(spec.milestones.map((milestone) => `milestone${milestone.value}`));
				expect(Object.values<{ yMin: number; yMax: number; label: { content: string } }>(annotations)).toEqual(
					spec.milestones.map((milestone) =>
						expect.objectContaining({
							yMin: milestone.value,
							yMax: milestone.value,
							label: expect.objectContaining({ content: milestone.label }),
						}),
					),
				);
			}
		});

		it("does not include annotations when milestones are disabled", () => {
			const largeHistory: History = {
				snapshots: [
					{ timestamp: "2025-01-01T00:00:00.000Z", totalStars: 80, repos: [] },
					{ timestamp: "2025-01-08T00:00:00.000Z", totalStars: 120, repos: [] },
				],
			};

			const url = chartImageUrl({
				request: { kind: ChartKind.STAR_HISTORY, history: largeHistory, milestones: false },
				locale: "en",
			});

			expect(url).not.toBeNull();
			if (url) {
				const config = JSON.parse(decodeURIComponent(url).split(CHART_CONFIG_PARAM)[1]);

				expect(config.options.plugins.annotation).toBeUndefined();
			}
		});
	});

	describe("smoothing", () => {
		const tensionOf = (url: string): number => {
			const config = JSON.parse(decodeURIComponent(url).split(CHART_CONFIG_PARAM)[1]);
			return config.data.datasets[0].tension;
		};

		it("curves the line with the smooth tension by default", () => {
			const url = chartImageUrl({
				request: { kind: ChartKind.STAR_HISTORY, history: mockHistory },
				locale: "en",
			});

			expect(url).not.toBeNull();
			if (url) expect(tensionOf(url)).toBe(CHART_TENSION.smooth);
		});

		it("draws straight segments when smoothing is disabled", () => {
			const url = chartImageUrl({
				request: { kind: ChartKind.STAR_HISTORY, history: mockHistory },
				locale: "en",
				smoothing: false,
			});

			expect(url).not.toBeNull();
			if (url) expect(tensionOf(url)).toBe(0);
		});

		it("applies the smoothing setting to comparison datasets", () => {
			const url = chartImageUrl({
				request: {
					kind: ChartKind.COMPARISON,
					history: mockHistory,
					repoNames: ["user/repo-a", "user/repo-b"],
				},
				locale: "en",
				smoothing: false,
			});

			expect(url).not.toBeNull();
			if (url) {
				const config = JSON.parse(decodeURIComponent(url).split(CHART_CONFIG_PARAM)[1]);

				expect(config.data.datasets.every((dataset: { tension: number }) => dataset.tension === 0)).toBe(true);
			}
		});
	});

	describe("curve", () => {
		const firstDataset = (url: string): { tension: number; cubicInterpolationMode?: string } => {
			const config = JSON.parse(decodeURIComponent(url).split(CHART_CONFIG_PARAM)[1]);
			return config.data.datasets[0];
		};

		it("renders the monotone curve as a monotone cubic interpolation by default", () => {
			const url = chartImageUrl({
				request: { kind: ChartKind.STAR_HISTORY, history: mockHistory },
				locale: "en",
			});

			expect(url).not.toBeNull();
			if (url) expect(firstDataset(url).cubicInterpolationMode).toBe(ChartCurve.MONOTONE);
		});

		it("renders catmull-rom as a tensioned spline without monotone interpolation", () => {
			const url = chartImageUrl({
				request: { kind: ChartKind.STAR_HISTORY, history: mockHistory },
				locale: "en",
				curve: ChartCurve.CATMULL_ROM,
			});

			expect(url).not.toBeNull();
			if (url) {
				expect(firstDataset(url).tension).toBe(CHART_TENSION.smooth);
				expect(firstDataset(url).cubicInterpolationMode).toBeUndefined();
			}
		});

		it("falls back to monotone interpolation for the rounded-step curve", () => {
			const url = chartImageUrl({
				request: { kind: ChartKind.STAR_HISTORY, history: mockHistory },
				locale: "en",
				curve: ChartCurve.ROUNDED_STEP,
			});

			expect(url).not.toBeNull();
			if (url) expect(firstDataset(url).cubicInterpolationMode).toBe(ChartCurve.MONOTONE);
		});

		it("renders cubic-bezier as a tensioned spline without monotone interpolation", () => {
			const url = chartImageUrl({
				request: { kind: ChartKind.STAR_HISTORY, history: mockHistory },
				locale: "en",
				curve: ChartCurve.CUBIC_BEZIER,
			});

			expect(url).not.toBeNull();
			if (url) {
				expect(firstDataset(url).tension).toBe(CHART_TENSION.smooth);
				expect(firstDataset(url).cubicInterpolationMode).toBeUndefined();
			}
		});
	});

	describe("trendLine", () => {
		it("draws the trend series with its own dash pattern", () => {
			const url = chartImageUrl({
				request: { kind: ChartKind.STAR_HISTORY, history: mockHistory, trendLine: true },
				locale: "en",
			});

			expect(url).not.toBeNull();
			if (url) {
				const config = JSON.parse(decodeURIComponent(url).split(CHART_CONFIG_PARAM)[1]);

				expect(config.data.datasets[1].borderDash).toEqual([6, 4]);
			}
		});
	});

	describe("theme", () => {
		it("uses a light background by default", () => {
			const url = chartImageUrl({
				request: { kind: ChartKind.STAR_HISTORY, history: mockHistory },
				locale: "en",
			});

			expect(url).not.toBeNull();
			if (url) expect(url).toContain("backgroundColor=%23fff");
		});

		it("uses a dark background and palette for the dark theme", () => {
			const url = chartImageUrl({
				request: { kind: ChartKind.STAR_HISTORY, history: mockHistory },
				locale: "en",
				theme: "dark",
			});

			expect(url).not.toBeNull();
			if (url) {
				expect(url).toContain("backgroundColor=%230d1117");
				const config = JSON.parse(decodeURIComponent(url).split(CHART_CONFIG_PARAM)[1]);
				expect(config.options.scales.y.ticks.color).toBe("#8b949e");
			}
		});
	});

	describe("fill", () => {
		const datasetFor = (lineColor: string): { borderColor: string; backgroundColor: string } => {
			const url = chartImageUrl({
				request: { kind: ChartKind.STAR_HISTORY, history: mockHistory, lineColor },
				locale: "en",
			});

			expect(url).not.toBeNull();

			return JSON.parse(decodeURIComponent(url ?? "").split(CHART_CONFIG_PARAM)[1]).data.datasets[0];
		};

		it.each([
			{ label: "6-digit hex", lineColor: "#dfb317", fill: "#dfb31733" },
			{ label: "3-digit hex", lineColor: "#fa0", fill: "#ffaa0033" },
			{ label: "4-digit hex, scaling the fill by its own alpha", lineColor: "#fa08", fill: "#ffaa001b" },
			{ label: "8-digit hex, scaling the fill by its own alpha", lineColor: "#6b63ffcc", fill: "#6b63ff29" },
		])("draws a line in $label over a translucent fill of the same colour", ({ lineColor, fill }) => {
			const dataset = datasetFor(lineColor);

			expect(dataset.backgroundColor).toBe(fill);
			expect(dataset.borderColor).toBe(lineColor);
		});
	});

	describe("locale", () => {
		it.each(LOCALES)("hands Chart.js the Intl code of the %s run, so the Y-axis ticks follow it", (locale) => {
			const url = chartImageUrl({
				request: { kind: ChartKind.STAR_HISTORY, history: mockHistory },
				locale,
			});

			expect(url).not.toBeNull();
			expect(JSON.parse(decodeURIComponent(url ?? "").split(CHART_CONFIG_PARAM)[1]).options.locale).toBe(
				LOCALE_MAP[locale],
			);
		});
	});

	describe("beginAtZero", () => {
		const beginAtZeroOf = (url: string): boolean => {
			const config = JSON.parse(decodeURIComponent(url).split(CHART_CONFIG_PARAM)[1]);
			return config.options.scales.y.beginAtZero;
		};

		it("does not begin the Y-axis at zero by default", () => {
			const url = chartImageUrl({
				request: { kind: ChartKind.STAR_HISTORY, history: mockHistory },
				locale: "en",
			});

			expect(url).not.toBeNull();
			if (url) expect(beginAtZeroOf(url)).toBe(false);
		});

		it("begins the Y-axis at zero when enabled", () => {
			const url = chartImageUrl({
				request: { kind: ChartKind.STAR_HISTORY, history: mockHistory },
				locale: "en",
				beginAtZero: true,
			});

			expect(url).not.toBeNull();
			if (url) expect(beginAtZeroOf(url)).toBe(true);
		});
	});

	describe("showPoints", () => {
		const pointRadiusOf = (url: string): number => {
			const config = JSON.parse(decodeURIComponent(url).split(CHART_CONFIG_PARAM)[1]);
			return config.data.datasets[0].pointRadius;
		};

		it("draws point markers by default", () => {
			const url = chartImageUrl({
				request: { kind: ChartKind.STAR_HISTORY, history: mockHistory },
				locale: "en",
			});

			expect(url).not.toBeNull();
			if (url) expect(pointRadiusOf(url)).toBeGreaterThan(0);
		});

		it("hides point markers when disabled", () => {
			const url = chartImageUrl({
				request: { kind: ChartKind.STAR_HISTORY, history: mockHistory },
				locale: "en",
				showPoints: false,
			});

			expect(url).not.toBeNull();
			if (url) expect(pointRadiusOf(url)).toBe(0);
		});

		it("hides markers on every comparison dataset when disabled", () => {
			const url = chartImageUrl({
				request: {
					kind: ChartKind.COMPARISON,
					history: mockHistory,
					repoNames: ["user/repo-a", "user/repo-b"],
				},
				locale: "en",
				showPoints: false,
			});

			expect(url).not.toBeNull();
			if (url) {
				const config = JSON.parse(decodeURIComponent(url).split(CHART_CONFIG_PARAM)[1]);

				expect(config.data.datasets.every((dataset: { pointRadius: number }) => dataset.pointRadius === 0)).toBe(true);
			}
		});
	});
});
