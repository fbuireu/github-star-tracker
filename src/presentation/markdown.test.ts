import type { Config } from "@config/types";
import type { ForecastData } from "@domain/forecast";
import { ForecastMethod, ForecastSource } from "@domain/forecast";
import type { StargazerDiffResult } from "@domain/stargazers";
import type { History } from "@domain/types";
import { LOCALES, type Locale } from "@i18n";
import { makeComparisonResults, makeConfig, makeHistory, makeMultiRepoHistory, makeRepoResult } from "@shared/tests";
import { describe, expect, it } from "vitest";
import { generateMarkdownReport } from "./markdown";
import { buildReportModel } from "./report-model";
import type { ReportParams } from "./shared";

interface RenderMarkdownParams extends Partial<Omit<ReportParams, "config">> {
	config?: Partial<Config>;
}

function renderMarkdown({ config, ...overrides }: RenderMarkdownParams = {}): string {
	const resolved = makeConfig(config);

	return generateMarkdownReport({
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

describe("generateMarkdownReport", () => {
	it("includes total star count and delta", () => {
		const report = renderMarkdown();

		expect(report).toContain("Total: **23 stars** | Change: **+3**");
	});

	it("includes repository table rows", () => {
		const report = renderMarkdown();

		expect(report).toContain("user/repo-a");
		expect(report).toContain("user/repo-b");
		expect(report).toContain("+5");
		expect(report).toContain("-2");
	});

	const velocityHistory = makeHistory({ starCounts: [100, 200], stepDays: 10 });

	it("renders the velocity section when velocity-metrics is enabled", () => {
		const report = renderMarkdown({ velocityHistory, config: { velocityMetrics: true } });

		expect(report).toContain("\n## 🚀 Growth Velocity\n");
		expect(report).toContain("**Stars per day:** 10");
		expect(report).toContain("**Growth:** +100%");
	});

	it("renders velocity with only the daily rate when growth and the next Milestone are unavailable", () => {
		const flatHistory = makeHistory({ starCounts: [0, 0], stepDays: 10 });

		const report = renderMarkdown({
			velocityHistory: flatHistory,
			config: { velocityMetrics: true },
		});

		expect(report).toContain("Growth Velocity");
		expect(report).toContain("Stars per day");
		expect(report).not.toContain("**Growth:**");
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

		const report = renderMarkdown({
			velocityHistory,
			config: { velocityMetrics: true },
			forecastData,
		});

		expect(report).toContain("\n### 🚀 Growth Velocity\n");
		expect(report).not.toContain("\n## 🚀 Growth Velocity\n");
		expect(report.indexOf("Growth Forecast")).toBeLessThan(report.indexOf("Growth Velocity"));
		expect(report.indexOf("Growth Velocity")).toBeLessThan(report.indexOf("Aggregate Forecast"));
	});

	it("notes the Baseline Snapshot's date, and omits the note on a first run, which has none", () => {
		expect(renderMarkdown()).toContain("> Compared to snapshot from 2026-01-01");
		expect(renderMarkdown({ baselineSnapshotTimestamp: null })).not.toContain("Compared to snapshot from");
	});

	it("prints the Summary of a Run that moved, with its gains, its losses and its signed net change", () => {
		const report = renderMarkdown();

		expect(report).toContain("\n## Summary\n");
		expect(report).toContain("- **Stars gained:** 5");
		expect(report).toContain("- **Stars lost:** 2");
		expect(report).toContain("- **Net change:** +3");
	});

	it("prints the Summary of a Run whose gains and losses cancel, so a rename still shows what it lost", () => {
		const results = makeComparisonResults({
			repos: [
				makeRepoResult({ name: "kept", overrides: { current: 60, previous: 60, delta: 0 } }),
				makeRepoResult({ name: "fresh", overrides: { current: 7, previous: null, isNew: true } }),
				makeRepoResult({ name: "gone", overrides: { current: 0, previous: 7, delta: -7, isRemoved: true } }),
			],
			summary: { totalStars: 67, totalPrevious: 67, totalDelta: 0, newStars: 0, lostStars: 7, changed: true },
		});

		const report = renderMarkdown({ results });

		expect(report).toContain("\n## Summary\n");
		expect(report).toContain("- **Stars gained:** 0");
		expect(report).toContain("- **Stars lost:** 7");
		expect(report).toContain("- **Net change:** 0");
	});

	it("keeps the repository table when no repository is active", () => {
		const report = renderMarkdown({
			results: makeComparisonResults({
				repos: [],
				summary: { totalStars: 0, totalPrevious: 0, totalDelta: 0, newStars: 0, lostStars: 0, changed: false },
			}),
		});

		expect(report).toContain("\n## Repositories\n");
		expect(report).toContain("| Repositories | Stars | Change | Trend |");
	});

	it("shows NEW badge for new repos", () => {
		const results = makeComparisonResults();
		results.repos[0].isNew = true;

		const report = renderMarkdown({ results });

		expect(report).toContain("`NEW`");
	});

	it("includes removed repos section", () => {
		const results = makeComparisonResults();
		results.repos.push({
			name: "old-repo",
			fullName: "user/old-repo",
			owner: "user",
			current: 0,
			previous: 5,
			delta: -5,
			isNew: false,
			isRemoved: true,
		});

		const report = renderMarkdown({ results });

		expect(report).toContain("Removed Repositories");
		expect(report).toContain("user/old-repo");
	});

	it("includes footer with generator link", () => {
		const report = renderMarkdown();

		expect(report).toContain("Generated by [GitHub Star Tracker](https://github.com/fbuireu/github-star-tracker) on ");
	});

	it("includes charts when history has multiple snapshots", () => {
		const history = makeMultiRepoHistory({ snapshots: [{ "user/repo-a": 20 }, { "user/repo-a": 23 }], stepDays: 1 });

		const report = renderMarkdown({ history, config: { includeCharts: true } });

		expect(report).toContain("Star Trend");
		expect(report).toContain("![Star History](./charts/star-history.svg)");
	});

	const STAR_HISTORY_CAPTIONS: { locale: Locale; caption: string }[] = [
		{ locale: "en", caption: "Star History" },
		{ locale: "es", caption: "Historial de estrellas" },
		{ locale: "ca", caption: "Historial d'estrelles" },
		{ locale: "it", caption: "Storico delle stelle" },
	];

	it.each(STAR_HISTORY_CAPTIONS)(
		"captions the star history image from the bundle in $locale",
		({ locale, caption }) => {
			const history = makeMultiRepoHistory({ snapshots: [{ "user/repo-a": 20 }, { "user/repo-a": 23 }], stepDays: 1 });

			const report = renderMarkdown({ history, config: { includeCharts: true, locale } });

			expect(report).toContain(`![${caption}](./charts/star-history.svg)`);
		},
	);

	it("states the star history caption for every locale the bundles ship", () => {
		expect(STAR_HISTORY_CAPTIONS.map(({ locale }) => locale)).toEqual(LOCALES);
	});

	it("includes comparison chart in markdown", () => {
		const history = makeMultiRepoHistory({
			snapshots: [
				{ "user/repo-a": 10, "user/repo-b": 10 },
				{ "user/repo-a": 15, "user/repo-b": 10 },
			],
			stepDays: 1,
		});

		const report = renderMarkdown({ history, config: { includeCharts: true } });

		expect(report).toContain("Top Repositories");
		expect(report).toContain("![Top Repositories](./charts/comparison.svg)");
	});

	it("includes individual repo charts in collapsible section", () => {
		const history = makeMultiRepoHistory({
			snapshots: [
				{ "user/repo-a": 10, "user/repo-b": 10 },
				{ "user/repo-a": 15, "user/repo-b": 10 },
			],
			stepDays: 1,
		});

		const report = renderMarkdown({ history, config: { includeCharts: true } });

		expect(report).toContain("<details>");
		expect(report).toContain("<summary>Individual Repository Charts</summary>");
		expect(report).toContain("#### user/repo-a");
		expect(report).toContain("![user/repo-a](./charts/user-repo-a.svg)");
		expect(report).toContain("#### user/repo-b");
		expect(report).toContain("![user/repo-b](./charts/user-repo-b.svg)");
		expect(report).toContain("</details>");
	});

	it("heads each individual repo chart with its Star Count and Delta", () => {
		const history = makeMultiRepoHistory({
			snapshots: [
				{ "user/repo-a": 10, "user/repo-b": 10 },
				{ "user/repo-a": 15, "user/repo-b": 8 },
			],
			stepDays: 1,
		});

		const report = renderMarkdown({ history, config: { includeCharts: true } });

		expect(report).toContain("#### user/repo-a: 15 ★ (+5)");
		expect(report).toContain("#### user/repo-b: 8 ★ (-2)");
	});

	it("includes stargazer section with new stargazers", () => {
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

		const report = renderMarkdown({ stargazerDiff });

		expect(report).toContain("New Stargazers");
		expect(report).toContain("alice");
		expect(report).toContain("user/repo-a");
		expect(report).toContain("2026-01-15");
		expect(report).toContain("<details>");
	});

	it("shows no-new-stargazers message when diff is empty", () => {
		const stargazerDiff: StargazerDiffResult = {
			entries: [],
			totalNew: 0,
		};

		const report = renderMarkdown({ stargazerDiff });

		expect(report).toContain("New Stargazers");
		expect(report).toContain("No new stargazers since last run");
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

		const report = renderMarkdown({ stargazerDiff });

		expect(report).toContain("sampled repositories: user/huge");
	});

	it("renders the sampled note when all repos are sampled (no new stargazers)", () => {
		const stargazerDiff: StargazerDiffResult = {
			entries: [],
			totalNew: 0,
			sampledRepos: ["user/huge", "user/big"],
		};

		const report = renderMarkdown({ stargazerDiff });

		expect(report).toContain("New Stargazers");
		expect(report).toContain("sampled repositories: user/huge, user/big");
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

		const report = renderMarkdown({ forecastData });

		expect(report).toContain("Growth Forecast");
		expect(report).toContain("Linear Regression");
		expect(report).toContain("Weighted Moving Average");
		expect(report).toContain("| Method | Week 1 | Week 2 | Week 3 | Week 4 |");
		expect(report).toContain("| Linear Regression | 25 | 27 | 29 | 31 |");
		expect(report).toContain("### By Repository");
		expect(report).toContain("| Weighted Moving Average | 16 | 17 | 18 | 19 |");
	});

	it("links each per-repo forecast chart the run actually drew", () => {
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

		const drawn = renderMarkdown({ history, forecastData, config: { includeCharts: true } });
		const undrawn = renderMarkdown({
			history,
			forecastData,
			config: { includeCharts: true },
			drawn: new Set(),
		});

		expect(drawn).toContain("![user/repo-a](./charts/forecast-user-repo-a.svg)");
		expect(undrawn).not.toContain("forecast-user-repo-a.svg");
		expect(undrawn).toContain("By Repository");
	});

	it("escapes every GitHub-sourced string it prints", () => {
		const fullName = "user/repo<b>";
		const forecasts = [{ method: ForecastMethod.LINEAR_REGRESSION, points: [{ weekOffset: 1, predicted: 20 }] }];

		const report = renderMarkdown({
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

		expect(report).toContain("user/repo&lt;b&gt;");
		expect(report).not.toContain("<b>");
	});
});
