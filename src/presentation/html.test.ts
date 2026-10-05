import { DEFAULTS } from "@config/defaults";
import type { Config } from "@config/types";
import { ChartTheme } from "@config/types";
import type { ForecastData } from "@domain/forecast";
import { ForecastMethod, ForecastSource } from "@domain/forecast";
import { trendIcon } from "@domain/formatting";
import type { StargazerDiffResult } from "@domain/stargazers";
import type { History } from "@domain/types";
import { LOCALES, type Locale } from "@i18n";
import { makeComparisonResults, makeConfig, makeHistory, makeMultiRepoHistory, makeRepoResult } from "@shared/tests";
import { describe, expect, it } from "vitest";
import { COLORS, DARK_PALETTE, LIGHT_PALETTE } from "./constants";
import { generateHtmlReport } from "./html";
import { buildReportModel } from "./report-model";
import type { ReportParams } from "./shared";

const QUICKCHART_CONFIG = /https:\/\/quickchart\.io\/chart\?[^"]*&c=([^"]+)/g;

interface DeltaCellParams {
	color: string;
	delta: string;
}

function deltaCell({ color, delta }: DeltaCellParams): RegExp {
	return new RegExp(`color:${color};font-weight:600;">\\s*${delta.replace("+", "\\+")}\\s*</td>`);
}

interface RenderHtmlParams extends Partial<Omit<ReportParams, "config">> {
	config?: Partial<Config>;
}

function renderHtml({ config, ...overrides }: RenderHtmlParams = {}): string {
	const resolved = makeConfig(config);

	return generateHtmlReport({
		config: resolved,
		model: buildReportModel({
			config: resolved,
			results: makeComparisonResults(),
			baselineSnapshotTimestamp: "2026-01-01T00:00:00Z",
			chartHistories: overrides.history
				? {
						aggregate: overrides.history,
						forRepo: () => overrides.history as History,
						reconstructedForRepo: () => overrides.history as History,
					}
				: null,
			...overrides,
		}),
	});
}

describe("generateHtmlReport", () => {
	const velocityHistory = makeHistory({ starCounts: [100, 200], stepDays: 10 });

	it("renders the velocity section when velocity-metrics is enabled", () => {
		const html = renderHtml({ velocityHistory, config: { velocityMetrics: true } });

		expect(html).toContain('<h2 style="font-size:18px;margin-bottom:12px;">🚀 Growth Velocity</h2>');
		expect(html).toContain("<li><strong>Stars per day:</strong> 10</li>");
	});

	it("renders velocity with only the daily rate when growth and the next Milestone are unavailable", () => {
		const flatHistory = makeHistory({ starCounts: [0, 0], stepDays: 10 });

		const html = renderHtml({ velocityHistory: flatHistory, config: { velocityMetrics: true } });

		expect(html).toContain("Growth Velocity");
		expect(html).toContain("Stars per day");
		expect(html).not.toContain("Growth:</strong>");
	});

	it("colours shrinking growth with the negative colour", () => {
		const decliningHistory = makeHistory({ starCounts: [200, 150], stepDays: 10 });

		const html = renderHtml({
			velocityHistory: decliningHistory,
			config: { velocityMetrics: true },
		});

		expect(html).toContain(`<span style="color:${COLORS.negative};">-25%</span>`);
	});

	it("nests velocity under the forecast section when both are present", () => {
		const forecastData: ForecastData = {
			aggregate: {
				forecasts: [
					{
						method: ForecastMethod.LINEAR_REGRESSION,
						points: [
							{ weekOffset: 1, predicted: 25 },
							{ weekOffset: 2, predicted: 27 },
							{ weekOffset: 3, predicted: 29 },
							{ weekOffset: 4, predicted: 31 },
						],
					},
				],
			},
			repos: [],
		};

		const html = renderHtml({
			velocityHistory,
			forecastData,
			config: { velocityMetrics: true },
		});

		expect(html).toContain('<h3 style="font-size:16px;margin-bottom:8px;">🚀 Growth Velocity</h3>');
		expect(html).not.toContain('<h2 style="font-size:18px;margin-bottom:12px;">🚀 Growth Velocity</h2>');
		expect(html.indexOf("Growth Forecast")).toBeLessThan(html.indexOf("Growth Velocity"));
		expect(html.indexOf("Growth Velocity")).toBeLessThan(html.indexOf("Aggregate Forecast"));
	});

	it("dresses the document from email-theme, never from chart-theme", () => {
		const html = renderHtml({
			config: { chartTheme: ChartTheme.LIGHT, emailTheme: ChartTheme.DARK },
		});

		expect(html).toContain('<meta name="color-scheme" content="dark">');
		expect(html).toContain(DARK_PALETTE.white);
		expect(html).not.toContain(LIGHT_PALETTE.white);
	});

	it("generates valid HTML structure", () => {
		const html = renderHtml();

		expect(html).toContain("<!DOCTYPE html>");
		expect(html).toContain("</html>");
		expect(html).toContain("<table");
	});

	it("includes repo links", () => {
		const html = renderHtml();

		expect(html).toContain('href="https://github.com/user/repo-a"');
	});

	it("colours each Delta cell by its sign", () => {
		const html = renderHtml();

		expect(html).toMatch(deltaCell({ color: COLORS.positive, delta: "+5" }));
		expect(html).toMatch(deltaCell({ color: COLORS.negative, delta: "-2" }));
	});

	it("includes summary stats", () => {
		const html = renderHtml();

		expect(html).toContain(">23</div>");
		expect(html).toContain("Total Stars");
		expect(html).toContain("Net change");
	});

	const TOTAL_LABELS: { locale: Locale; label: string }[] = [
		{ locale: "en", label: "Total Stars" },
		{ locale: "es", label: "Estrellas Totales" },
		{ locale: "ca", label: "Estrelles Totals" },
		{ locale: "it", label: "Stelle Totali" },
	];

	it.each(TOTAL_LABELS)("labels the total as one phrase of the bundle in $locale", ({ locale, label }) => {
		const html = renderHtml({ config: { locale } });

		expect(html).toContain(`>${label}</div>`);
	});

	it("states the total's label for every locale the bundles ship", () => {
		expect(TOTAL_LABELS.map(({ locale }) => locale)).toEqual(LOCALES);
	});

	it("gives the repository table a trend column", () => {
		const html = renderHtml();

		expect(html).toContain(">Trend</th>");
		expect(html).toContain(trendIcon(1));
		expect(html).toContain(trendIcon(-1));
	});

	it("lists new repositories with their Star Count", () => {
		const results = makeComparisonResults();

		results.repos.push({
			name: "fresh",
			fullName: "user/fresh",
			owner: "user",
			current: 7,
			previous: null,
			delta: 0,
			isNew: true,
			isRemoved: false,
		});

		const html = renderHtml({ results });

		expect(html).toContain("New Repositories");
		expect(html).toContain('href="https://github.com/user/fresh"');
		expect(html).toContain("7 stars");
	});

	it("omits the new repositories section when nothing entered the tracked set", () => {
		expect(renderHtml()).not.toContain("New Repositories");
	});

	it("shows removed repos section when applicable", () => {
		const results = makeComparisonResults();

		results.repos.push({
			name: "gone",
			fullName: "user/gone",
			owner: "user",
			current: 0,
			previous: 3,
			delta: -3,
			isNew: false,
			isRemoved: true,
		});

		const html = renderHtml({ results });

		expect(html).toContain("Removed Repositories");
	});

	it("includes charts when history has multiple snapshots", () => {
		const history = makeMultiRepoHistory({ snapshots: [{ "user/repo-a": 20 }, { "user/repo-a": 23 }], stepDays: 1 });

		const html = renderHtml({ history, config: { includeCharts: true } });

		expect(html).toContain("Star Trend");
		expect(html).toContain("https://quickchart.io/chart");
	});

	it("includes comparison chart for top repositories", () => {
		const history = makeMultiRepoHistory({
			snapshots: [
				{ "user/repo-a": 10, "user/repo-b": 10 },
				{ "user/repo-a": 15, "user/repo-b": 10 },
			],
			stepDays: 1,
		});

		const html = renderHtml({ history, config: { includeCharts: true } });

		expect(html).toContain("By Repository");
		expect(html).toContain("Top Repositories");
	});

	it("includes individual repo charts section", () => {
		const history = makeMultiRepoHistory({
			snapshots: [
				{ "user/repo-a": 10, "user/repo-b": 10 },
				{ "user/repo-a": 15, "user/repo-b": 10 },
			],
			stepDays: 1,
		});

		const html = renderHtml({ history, config: { includeCharts: true } });

		expect(html).toContain("Individual Repository Charts");
		expect(html).toContain('alt="user/repo-a"');
		expect(html).toContain('alt="user/repo-b"');
		expect(html).not.toContain("<details>");
	});

	it("heads each individual repo chart with its Star Count and Delta", () => {
		const history = makeMultiRepoHistory({
			snapshots: [
				{ "user/repo-a": 10, "user/repo-b": 10 },
				{ "user/repo-a": 15, "user/repo-b": 8 },
			],
			stepDays: 1,
		});

		const html = renderHtml({ history, config: { includeCharts: true } });

		expect(html).toContain(`user/repo-a: 15 ★ (<span style="color:${COLORS.positive}`);
		expect(html).toContain("+5</span>)");
		expect(html).toContain(`user/repo-b: 8 ★ (<span style="color:${COLORS.negative}`);
		expect(html).toContain("-2</span>)");
	});

	it("applies chart-line-color to the star history, per-repo and forecast charts", () => {
		const history = makeMultiRepoHistory({
			snapshots: [
				{ "user/repo-a": 10, "user/repo-b": 10 },
				{ "user/repo-a": 15, "user/repo-b": 10 },
				{ "user/repo-a": 22, "user/repo-b": 12 },
			],
			stepDays: 1,
		});
		const forecastData: ForecastData = {
			aggregate: {
				forecasts: [
					{
						method: ForecastMethod.LINEAR_REGRESSION,
						points: [{ weekOffset: 1, predicted: 40 }],
					},
				],
			},
			repos: [],
		};

		const html = renderHtml({
			history,
			forecastData,
			config: { includeCharts: true, chartLineColor: "#6b63ff" },
		});
		const configs = [...html.matchAll(QUICKCHART_CONFIG)].map((match) => decodeURIComponent(match[1]));

		expect(configs.filter((config) => config.includes("#6b63ff")).length).toBeGreaterThanOrEqual(3);
		expect(configs[0]).not.toContain(COLORS.accent);
	});

	it("applies chart-line-width to the email chart data lines", () => {
		const history = makeMultiRepoHistory({ snapshots: [{ "user/repo-a": 20 }, { "user/repo-a": 23 }], stepDays: 1 });
		const configsOf = (html: string): string[] =>
			[...html.matchAll(QUICKCHART_CONFIG)].map((match) => decodeURIComponent(match[1]));

		const styled = configsOf(renderHtml({ history, config: { includeCharts: true, chartLineWidth: 5 } }));
		const plain = configsOf(renderHtml({ history, config: { includeCharts: true } }));

		expect(styled.every((config) => config.includes('"borderWidth":5'))).toBe(true);
		expect(plain.every((config) => config.includes(`"borderWidth":${DEFAULTS.chartLineWidth}`))).toBe(true);
	});

	it("includes stargazer section with avatars", () => {
		const stargazerDiff: StargazerDiffResult = {
			entries: [
				{
					repoFullName: "user/repo-a",
					newStargazers: [
						{
							login: "alice",
							avatarUrl: "https://avatars.githubusercontent.com/alice",
							profileUrl: "https://github.com/alice",
							starredAt: "2026-01-15T10:00:00Z",
						},
					],
				},
			],
			totalNew: 1,
		};

		const html = renderHtml({ stargazerDiff });

		expect(html).toContain("New Stargazers");
		expect(html).toContain("alice");
		expect(html).toContain('width="32" height="32"');
		expect(html).toContain("border-radius:50%");
		expect(html).toContain("2026-01-15");
	});

	it("shows no-new-stargazers message when diff is empty", () => {
		const stargazerDiff: StargazerDiffResult = {
			entries: [],
			totalNew: 0,
		};

		const html = renderHtml({ stargazerDiff });

		expect(html).toContain("New Stargazers");
		expect(html).toContain("No new stargazers since last run");
	});

	it("renders the sampled note alongside new stargazers", () => {
		const stargazerDiff: StargazerDiffResult = {
			entries: [
				{
					repoFullName: "user/repo-a",
					newStargazers: [
						{
							login: "alice",
							avatarUrl: "https://avatars.githubusercontent.com/alice",
							profileUrl: "https://github.com/alice",
							starredAt: "2026-01-15T10:00:00Z",
						},
					],
				},
			],
			totalNew: 1,
			sampledRepos: ["user/huge"],
		};

		const html = renderHtml({ stargazerDiff });

		expect(html).toContain("sampled repositories: user/huge");
	});

	it("renders the sampled note when all repos are sampled (no new stargazers)", () => {
		const stargazerDiff: StargazerDiffResult = {
			entries: [],
			totalNew: 0,
			sampledRepos: ["user/huge", "user/big"],
		};

		const html = renderHtml({ stargazerDiff });

		expect(html).toContain("New Stargazers");
		expect(html).toContain("sampled repositories: user/huge, user/big");
	});

	it("includes forecast section with tables", () => {
		const forecastData: ForecastData = {
			aggregate: {
				forecasts: [
					{
						method: ForecastMethod.LINEAR_REGRESSION,
						points: [
							{ weekOffset: 1, predicted: 25 },
							{ weekOffset: 2, predicted: 27 },
							{ weekOffset: 3, predicted: 29 },
							{ weekOffset: 4, predicted: 31 },
						],
					},
					{
						method: ForecastMethod.WEIGHTED_MOVING_AVERAGE,
						points: [
							{ weekOffset: 1, predicted: 24 },
							{ weekOffset: 2, predicted: 25 },
							{ weekOffset: 3, predicted: 26 },
							{ weekOffset: 4, predicted: 27 },
						],
					},
				],
			},
			repos: [
				{
					repoFullName: "user/repo-a",
					source: ForecastSource.OWN,
					forecasts: [
						{
							method: ForecastMethod.LINEAR_REGRESSION,
							points: [
								{ weekOffset: 1, predicted: 17 },
								{ weekOffset: 2, predicted: 19 },
								{ weekOffset: 3, predicted: 21 },
								{ weekOffset: 4, predicted: 23 },
							],
						},
						{
							method: ForecastMethod.WEIGHTED_MOVING_AVERAGE,
							points: [
								{ weekOffset: 1, predicted: 16 },
								{ weekOffset: 2, predicted: 17 },
								{ weekOffset: 3, predicted: 18 },
								{ weekOffset: 4, predicted: 19 },
							],
						},
					],
				},
			],
		};

		const html = renderHtml({ forecastData });

		expect(html).toContain("Growth Forecast");
		expect(html).toContain("Linear Regression");
		expect(html).toContain("Weighted Moving Average");
		expect(html).toContain("Week 1");
		expect(html).toContain('font-size:12px;">25</td>');
		expect(html).toContain("By Repository");
		expect(html).toContain("user/repo-a");
		expect(html).not.toContain("<details>");
	});

	it("uses neutral color for zero delta", () => {
		const html = renderHtml({
			results: makeComparisonResults({
				repos: [
					{
						name: "repo-a",
						fullName: "user/repo-a",
						owner: "user",
						current: 10,
						previous: 10,
						delta: 0,
						isNew: false,
						isRemoved: false,
					},
				],
				summary: {
					totalStars: 10,
					totalPrevious: 10,
					totalDelta: 0,
					newStars: 0,
					lostStars: 0,
					changed: false,
				},
			}),
		});

		expect(html).toMatch(deltaCell({ color: COLORS.neutral, delta: "0" }));
	});

	it("embeds a per-repo forecast chart only when the run drew one", () => {
		const history = makeMultiRepoHistory({
			snapshots: [
				{ "user/repo-a": 10, "user/repo-b": 10 },
				{ "user/repo-a": 15, "user/repo-b": 10 },
			],
			stepDays: 1,
		});
		const forecastData: ForecastData = {
			aggregate: {
				forecasts: [{ method: ForecastMethod.LINEAR_REGRESSION, points: [{ weekOffset: 1, predicted: 25 }] }],
			},
			repos: [
				{
					repoFullName: "user/repo-a",
					source: ForecastSource.OWN,
					forecasts: [{ method: ForecastMethod.LINEAR_REGRESSION, points: [{ weekOffset: 1, predicted: 17 }] }],
				},
			],
		};

		const drawn = renderHtml({ history, forecastData, config: { includeCharts: true } });
		const undrawn = renderHtml({
			history,
			forecastData,
			config: { includeCharts: true },
			drawn: new Set(),
		});
		const titlesIn = (html: string): string[] =>
			[...html.matchAll(QUICKCHART_CONFIG)].map((match) => decodeURIComponent(match[1]));

		expect(titlesIn(drawn).some((config) => config.includes("user/repo-a Growth Forecast"))).toBe(true);
		expect(titlesIn(undrawn).some((config) => config.includes("user/repo-a Growth Forecast"))).toBe(false);
		expect(undrawn).toContain("By Repository");
	});

	it("includes explicit background-color on body", () => {
		const html = renderHtml();

		expect(html).toContain(`background-color:${COLORS.white}`);
	});

	it("escapes every GitHub-sourced string it prints", () => {
		const fullName = "user/repo<b>";
		const forecasts = [{ method: ForecastMethod.LINEAR_REGRESSION, points: [{ weekOffset: 1, predicted: 20 }] }];

		const html = renderHtml({
			results: makeComparisonResults({
				repos: [
					makeRepoResult({ name: "repo<b>", overrides: { current: 15, previous: 10, delta: 5 } }),
					makeRepoResult({ name: "gone<b>", overrides: { current: 0, previous: 3, delta: -3, isRemoved: true } }),
				],
			}),
			history: makeMultiRepoHistory({ snapshots: [{ [fullName]: 10 }, { [fullName]: 15 }], stepDays: 1 }),
			stargazerDiff: {
				entries: [
					{
						repoFullName: fullName,
						newStargazers: [{ login: "<b>", avatarUrl: "<b>", profileUrl: "<b>", starredAt: "<b>" }],
					},
				],
				totalNew: 1,
				sampledRepos: [fullName],
			},
			forecastData: {
				aggregate: { forecasts },
				repos: [{ repoFullName: fullName, source: ForecastSource.OWN, forecasts }],
			},
			config: { includeCharts: true },
		});

		expect(html).toContain("user/repo&lt;b&gt;");
		expect(html).not.toContain("<b>");
	});
});
