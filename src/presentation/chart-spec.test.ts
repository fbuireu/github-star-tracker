import { ChartRange } from "@config/types";
import { STAR_MILESTONES } from "@domain/constants";
import type { ForecastData } from "@domain/forecast";
import { ForecastMethod, ForecastSource } from "@domain/forecast";
import { formatCount, formatDate } from "@domain/formatting";
import type { History } from "@domain/types";
import { LOCALES, type Locale } from "@i18n";
import { makeHistory, makeMultiRepoHistory, makeSnapshot } from "@shared/tests";
import { describe, expect, it } from "vitest";
import type { ChartRequest, ChartSpec } from "./chart-spec";
import { AxisLabels, buildChartSpec, ChartKind, isPlottable, SeriesDash, SeriesWeight } from "./chart-spec";
import { CHART, CHART_COMPARISON_COLORS, LIGHT_PALETTE, MIN_SNAPSHOTS_FOR_CHART, TREND_WINDOW } from "./constants";

const forecastData: ForecastData = {
	aggregate: {
		forecasts: [
			{
				method: ForecastMethod.LINEAR_REGRESSION,
				points: [
					{ weekOffset: 1, predicted: 160 },
					{ weekOffset: 2, predicted: 170 },
				],
			},
			{
				method: ForecastMethod.WEIGHTED_MOVING_AVERAGE,
				points: [
					{ weekOffset: 1, predicted: 155 },
					{ weekOffset: 2, predicted: 158 },
				],
			},
		],
	},
	repos: [],
};

const ownForecast: ForecastData = {
	...forecastData,
	repos: [
		{
			repoFullName: "user/repo-a",
			source: ForecastSource.OWN,
			forecasts: forecastData.aggregate.forecasts,
		},
	],
};

interface SpecOfParams {
	request: ChartRequest;
	axisLabels?: AxisLabels;
	range?: ChartRange;
	maxPoints?: number;
	locale?: Locale;
}

function specOf({
	request,
	axisLabels = AxisLabels.THINNED,
	range,
	maxPoints,
	locale = "en",
}: SpecOfParams): ChartSpec {
	const spec = buildChartSpec({
		request,
		locale,
		palette: LIGHT_PALETTE,
		axisLabels,
		range,
		maxPoints,
	});

	expect(spec).not.toBeNull();

	return spec as ChartSpec;
}

function milestoneValues(spec: ChartSpec): number[] {
	return spec.milestones.map((milestone) => milestone.value);
}

const singleSnapshot: History = makeHistory({ starCounts: [10] });
const multiRepo = makeMultiRepoHistory({
	snapshots: [
		{ "user/repo-a": 50, "user/repo-b": 30 },
		{ "user/repo-a": 70, "user/repo-b": 35 },
		{ "user/repo-a": 90, "user/repo-b": 40 },
	],
});

describe("isPlottable", () => {
	const historyOf = (snapshots: number): History =>
		makeHistory({ starCounts: Array.from({ length: snapshots }, () => 10) });

	it("holds a History of at least MIN_SNAPSHOTS_FOR_CHART Snapshots", () => {
		expect(isPlottable(historyOf(MIN_SNAPSHOTS_FOR_CHART - 1))).toBe(false);
		expect(isPlottable(historyOf(MIN_SNAPSHOTS_FOR_CHART))).toBe(true);
		expect(isPlottable(historyOf(MIN_SNAPSHOTS_FOR_CHART + 1))).toBe(true);
	});

	it("holds an empty History unplottable", () => {
		expect(isPlottable({ snapshots: [] })).toBe(false);
	});
});

describe("buildChartSpec", () => {
	describe("too little history", () => {
		const requests: ChartRequest[] = [
			{ kind: ChartKind.STAR_HISTORY, history: singleSnapshot },
			{ kind: ChartKind.PER_REPO, history: singleSnapshot, repoFullName: "user/repo-a" },
			{ kind: ChartKind.COMPARISON, history: singleSnapshot, repoNames: ["user/repo-a"] },
			{ kind: ChartKind.FORECAST, history: singleSnapshot, forecastData },
			{ kind: ChartKind.PER_REPO_FORECAST, history: singleSnapshot, forecastData, repoFullName: "user/repo-a" },
		];

		it("returns null for every kind below 2 snapshots", () => {
			const specs = requests.map((request) =>
				buildChartSpec({
					request,
					locale: "en",
					palette: LIGHT_PALETTE,
					axisLabels: AxisLabels.THINNED,
				}),
			);

			expect(specs).toEqual([null, null, null, null, null]);
		});

		it("returns null for a comparison with no repositories", () => {
			const spec = buildChartSpec({
				request: { kind: ChartKind.COMPARISON, history: multiRepo, repoNames: [] },
				locale: "en",
				palette: LIGHT_PALETTE,
				axisLabels: AxisLabels.THINNED,
			});

			expect(spec).toBeNull();
		});
	});

	describe("default titles", () => {
		it("names each kind from the locale bundle, or the repository itself", () => {
			const history = makeHistory({ starCounts: [10, 20, 30] });
			const titles = [
				specOf({ request: { kind: ChartKind.STAR_HISTORY, history } }).title,
				specOf({
					request: { kind: ChartKind.PER_REPO, history: multiRepo, repoFullName: "user/repo-a" },
				}).title,
				specOf({
					request: { kind: ChartKind.COMPARISON, history: multiRepo, repoNames: ["user/repo-a"] },
				}).title,
				specOf({ request: { kind: ChartKind.FORECAST, history, forecastData } }).title,
				specOf({
					request: {
						kind: ChartKind.PER_REPO_FORECAST,
						history: multiRepo,
						forecastData: ownForecast,
						repoFullName: "user/repo-a",
					},
				}).title,
			];

			expect(titles).toEqual([
				"Star History",
				"user/repo-a Star History",
				"Top Repositories",
				"Growth Forecast",
				"user/repo-a Growth Forecast",
			]);
		});

		const LOCALIZED_TEXT: { locale: Locale; perRepo: string; perRepoForecast: string; stars: string }[] = [
			{
				locale: "en",
				perRepo: "user/repo-a Star History",
				perRepoForecast: "user/repo-a Growth Forecast",
				stars: "Stars",
			},
			{
				locale: "es",
				perRepo: "Historial de Estrellas: user/repo-a",
				perRepoForecast: "Previsión de Crecimiento: user/repo-a",
				stars: "Estrellas",
			},
			{
				locale: "ca",
				perRepo: "Historial d'Estrelles: user/repo-a",
				perRepoForecast: "Previsió de Creixement: user/repo-a",
				stars: "Estrelles",
			},
			{
				locale: "it",
				perRepo: "Storia delle Stelle: user/repo-a",
				perRepoForecast: "Previsione di Crescita: user/repo-a",
				stars: "Stelle",
			},
		];

		it.each(LOCALIZED_TEXT)(
			"titles the per-repository Charts and labels the Star Count series in $locale",
			({ locale, perRepo, perRepoForecast, stars }) => {
				const history = makeHistory({ starCounts: [10, 20, 30] });
				const perRepoSpec = specOf({
					request: { kind: ChartKind.PER_REPO, history: multiRepo, repoFullName: "user/repo-a" },
					locale,
				});
				const perRepoForecastSpec = specOf({
					request: {
						kind: ChartKind.PER_REPO_FORECAST,
						history: multiRepo,
						forecastData: ownForecast,
						repoFullName: "user/repo-a",
					},
					locale,
				});
				const starHistorySpec = specOf({ request: { kind: ChartKind.STAR_HISTORY, history }, locale });

				expect(perRepoSpec.title).toBe(perRepo);
				expect(perRepoForecastSpec.title).toBe(perRepoForecast);
				expect(perRepoSpec.series[0].label).toBe(stars);
				expect(starHistorySpec.series[0].label).toBe(stars);
			},
		);

		it("states the expected text for every locale the bundles ship", () => {
			expect(LOCALIZED_TEXT.map(({ locale }) => locale)).toEqual(LOCALES);
		});

		it("lets an explicit title win, whatever the kind", () => {
			const history = makeHistory({ starCounts: [10, 20, 30] });
			const requests: ChartRequest[] = [
				{ kind: ChartKind.STAR_HISTORY, history, title: "Mine" },
				{ kind: ChartKind.PER_REPO, history: multiRepo, repoFullName: "user/repo-a", title: "Mine" },
				{ kind: ChartKind.COMPARISON, history: multiRepo, repoNames: ["user/repo-a"], title: "Mine" },
				{ kind: ChartKind.FORECAST, history, forecastData, title: "Mine" },
				{
					kind: ChartKind.PER_REPO_FORECAST,
					history: multiRepo,
					forecastData: ownForecast,
					repoFullName: "user/repo-a",
					title: "Mine",
				},
			];

			expect(requests.map((request) => specOf({ request }).title)).toEqual(requests.map(() => "Mine"));
		});
	});

	describe("star history", () => {
		it("plots the total series, filled and unbroken", () => {
			const spec = specOf({
				request: { kind: ChartKind.STAR_HISTORY, history: makeHistory({ starCounts: [10, 20, 30] }) },
			});

			expect(spec.series).toHaveLength(1);
			expect(spec.series[0]).toMatchObject({
				data: [10, 20, 30],
				fill: true,
				dash: SeriesDash.NONE,
				weight: SeriesWeight.PRIMARY,
				color: LIGHT_PALETTE.accent,
			});
			expect(spec.showLegend).toBe(false);
		});

		it("honours an explicit line colour", () => {
			const spec = specOf({
				request: {
					kind: ChartKind.STAR_HISTORY,
					history: makeHistory({ starCounts: [10, 20] }),
					lineColor: "#6f42c1",
				},
			});

			expect(spec.series[0].color).toBe("#6f42c1");
		});

		it("draws a Milestone past ten thousand Stars as readily as a small one", () => {
			const spec = specOf({
				request: { kind: ChartKind.STAR_HISTORY, history: makeHistory({ starCounts: [12_000, 60_000, 120_000] }) },
			});

			expect(spec.milestones).toEqual([
				{ value: 50_000, label: "50K ★" },
				{ value: 100_000, label: "100K ★" },
			]);
		});

		it("adds a trailing-average trend series that carries no emphasis", () => {
			const values = [10, 20, 30, 40];
			const spec = specOf({
				request: { kind: ChartKind.STAR_HISTORY, history: makeHistory({ starCounts: values }), trendLine: true },
			});

			expect(spec.series).toHaveLength(2);
			expect(spec.series[1]).toMatchObject({
				dash: SeriesDash.TREND,
				weight: SeriesWeight.HIDDEN,
				fill: false,
				color: LIGHT_PALETTE.neutral,
			});
			expect(spec.series[1].data).toEqual([10, 15, 20, 25]);
			expect(values.length).toBeLessThanOrEqual(TREND_WINDOW);
		});

		it("resolves milestones: custom beats built-in, empty falls back, off is none even beside a custom list", () => {
			const history = makeHistory({ starCounts: [10, 600] });
			const resolved = [
				milestoneValues(specOf({ request: { kind: ChartKind.STAR_HISTORY, history } })),
				milestoneValues(
					specOf({
						request: { kind: ChartKind.STAR_HISTORY, history, customMilestones: [90, 110] },
					}),
				),
				milestoneValues(specOf({ request: { kind: ChartKind.STAR_HISTORY, history, customMilestones: [] } })),
				milestoneValues(specOf({ request: { kind: ChartKind.STAR_HISTORY, history, milestones: false } })),
				milestoneValues(
					specOf({
						request: { kind: ChartKind.STAR_HISTORY, history, milestones: false, customMilestones: [90, 110] },
					}),
				),
			];

			expect(resolved).toEqual([[50, 100, 500], [90, 110], [50, 100, 500], [], []]);
			expect(STAR_MILESTONES).toContain(500);
		});

		it("labels each milestone once, in the spec, using the requested locale", () => {
			const request = {
				kind: ChartKind.STAR_HISTORY,
				history: makeHistory({ starCounts: [10, 6000] }),
				customMilestones: [1000],
			} as const;

			expect(specOf({ request }).milestones).toEqual([{ value: 1000, label: "1K ★" }]);
			expect(specOf({ request, locale: "es" }).milestones).toEqual([
				{ value: 1000, label: `${formatCount({ count: 1000, locale: "es" })} ★` },
			]);
		});

		it("keeps only the milestones strictly inside the observed extremes", () => {
			const spec = specOf({
				request: {
					kind: ChartKind.STAR_HISTORY,
					history: makeHistory({ starCounts: [10, 100] }),
					customMilestones: [10, 50, 100],
				},
			});

			expect(milestoneValues(spec)).toEqual([50]);
		});
	});

	describe("per repo", () => {
		it("reads the repository out of every snapshot and carries no milestones", () => {
			const spec = specOf({
				request: { kind: ChartKind.PER_REPO, history: multiRepo, repoFullName: "user/repo-b" },
			});

			expect(spec.series).toHaveLength(1);
			expect(spec.series[0].data).toEqual([30, 35, 40]);
			expect(spec.milestones).toEqual([]);
			expect(spec.showLegend).toBe(false);
		});

		it("honours an explicit line colour", () => {
			const spec = specOf({
				request: { kind: ChartKind.PER_REPO, history: multiRepo, repoFullName: "user/repo-a", lineColor: "#6f42c1" },
			});

			expect(spec.series[0].color).toBe("#6f42c1");
		});

		it("yields a flat zero series for a repository absent from every snapshot", () => {
			const spec = specOf({
				request: { kind: ChartKind.PER_REPO, history: multiRepo, repoFullName: "user/ghost" },
			});

			expect(spec.series[0].data).toEqual([0, 0, 0]);
		});
	});

	describe("comparison", () => {
		it("shortens labels only when every repository shares one owner", () => {
			const sameOwner = specOf({
				request: {
					kind: ChartKind.COMPARISON,
					history: multiRepo,
					repoNames: ["user/repo-a", "user/repo-b"],
				},
			});
			const mixedOwners = specOf({
				request: {
					kind: ChartKind.COMPARISON,
					history: makeMultiRepoHistory({
						snapshots: [
							{ "alice/repo-a": 10, "bob/repo-b": 20 },
							{ "alice/repo-a": 15, "bob/repo-b": 25 },
						],
					}),
					repoNames: ["alice/repo-a", "bob/repo-b"],
				},
			});

			expect(sameOwner.series.map((series) => series.label)).toEqual(["repo-a", "repo-b"]);
			expect(mixedOwners.series.map((series) => series.label)).toEqual(["alice/repo-a", "bob/repo-b"]);
		});

		it("plots each repository's own series", () => {
			const spec = specOf({
				request: { kind: ChartKind.COMPARISON, history: multiRepo, repoNames: ["user/repo-a", "user/repo-b"] },
			});

			expect(spec.series.map((series) => series.data)).toEqual([
				[50, 70, 90],
				[30, 35, 40],
			]);
		});

		it("caps the set at ten and assigns colours by position", () => {
			const repoNames = Array.from({ length: 12 }, (_, index) => `user/repo-${index}`);
			const spec = specOf({
				request: { kind: ChartKind.COMPARISON, history: multiRepo, repoNames },
			});

			expect(spec.series).toHaveLength(10);
			expect(spec.series.map((series) => series.color)).toEqual([...CHART_COMPARISON_COLORS]);
			expect(spec.showLegend).toBe(true);
			expect(spec.series.every((series) => series.fill === false)).toBe(true);
		});
	});

	describe("forecast", () => {
		const history = makeHistory({ starCounts: [100, 120, 150] });

		it("continues the observed series into one series per Forecast Method", () => {
			const spec = specOf({ request: { kind: ChartKind.FORECAST, history, forecastData } });

			expect(spec.series.map((series) => series.dash)).toEqual([
				SeriesDash.NONE,
				SeriesDash.LINEAR_REGRESSION,
				SeriesDash.WEIGHTED_MOVING_AVERAGE,
			]);
			expect(spec.series[0].data).toEqual([100, 120, 150, null, null]);
			expect(spec.series[1].data).toEqual([null, null, 150, 160, 170]);
			expect(spec.series[2].data).toEqual([null, null, 150, 155, 158]);
		});

		it("names its series and colours the forecasts apart from the observed line", () => {
			const spec = specOf({ request: { kind: ChartKind.FORECAST, history, forecastData } });

			expect(spec.series.map((series) => series.label)).toEqual([
				"Star History",
				"Linear Regression",
				"Weighted Moving Average",
			]);
			expect(spec.series.map((series) => series.color)).toEqual([
				LIGHT_PALETTE.accent,
				LIGHT_PALETTE.positive,
				LIGHT_PALETTE.negative,
			]);
			expect(spec.showLegend).toBe(true);
		});

		it("applies an explicit line colour to the observed series only", () => {
			const colours = [
				specOf({ request: { kind: ChartKind.FORECAST, history, forecastData, lineColor: "#6f42c1" } }),
				specOf({
					request: {
						kind: ChartKind.PER_REPO_FORECAST,
						history: multiRepo,
						forecastData: ownForecast,
						repoFullName: "user/repo-a",
						lineColor: "#6f42c1",
					},
				}),
			].map((spec) => spec.series.map((series) => series.color));

			expect(colours).toEqual([
				["#6f42c1", LIGHT_PALETTE.positive, LIGHT_PALETTE.negative],
				["#6f42c1", LIGHT_PALETTE.positive, LIGHT_PALETTE.negative],
			]);
		});

		it("appends a week label per forecast point", () => {
			const spec = specOf({ request: { kind: ChartKind.FORECAST, history, forecastData } });

			expect(spec.labels).toHaveLength(5);
			expect(spec.labels.slice(-2)).toEqual(["Week 1", "Week 2"]);
		});

		it("plots one repository's own series and its own Forecast when asked for it", () => {
			const perRepo: ForecastData = {
				...forecastData,
				repos: [
					{
						repoFullName: "user/repo-a",
						source: ForecastSource.OWN,
						forecasts: [
							{
								method: ForecastMethod.LINEAR_REGRESSION,
								points: [
									{ weekOffset: 1, predicted: 100 },
									{ weekOffset: 2, predicted: 110 },
								],
							},
							{
								method: ForecastMethod.WEIGHTED_MOVING_AVERAGE,
								points: [
									{ weekOffset: 1, predicted: 95 },
									{ weekOffset: 2, predicted: 98 },
								],
							},
						],
					},
				],
			};

			const spec = specOf({
				request: {
					kind: ChartKind.PER_REPO_FORECAST,
					history: multiRepo,
					forecastData: perRepo,
					repoFullName: "user/repo-a",
				},
			});

			expect(spec.title).toBe("user/repo-a Growth Forecast");
			expect(spec.series[0].data).toEqual([50, 70, 90, null, null]);
			expect(spec.series[1].data).toEqual([null, null, 90, 100, 110]);
			expect(spec.series[2].data).toEqual([null, null, 90, 95, 98]);
		});

		it("returns null for a repository the forecast does not cover", () => {
			const spec = buildChartSpec({
				request: { kind: ChartKind.PER_REPO_FORECAST, history: multiRepo, forecastData, repoFullName: "user/ghost" },
				locale: "en",
				palette: LIGHT_PALETTE,
				axisLabels: AxisLabels.DATES,
			});

			expect(spec).toBeNull();
		});

		it("always dates its x-axis, whatever the adapter asks for", () => {
			const thinned = specOf({
				request: { kind: ChartKind.FORECAST, history, forecastData },
				axisLabels: AxisLabels.THINNED,
			});
			const dated = specOf({
				request: { kind: ChartKind.FORECAST, history, forecastData },
				axisLabels: AxisLabels.DATES,
			});

			expect(thinned.labels).toEqual(dated.labels);
		});
	});

	describe("windowing", () => {
		const history = makeHistory({ starCounts: [10, 20, 30, 40, 50] });
		const spread = makeHistory({ starCounts: [10, 20, 30], stepDays: 20 });
		const unreadable = makeSnapshot({ timestamp: "not-a-date", totalStars: 35 });

		it("thins x-axis labels to years for a multi-year history, or dates them in full", () => {
			const multiYear = makeHistory({ starCounts: [10, 20, 30], stepDays: 400 });
			const thinned = specOf({
				request: { kind: ChartKind.STAR_HISTORY, history: multiYear },
				axisLabels: AxisLabels.THINNED,
			});
			const dated = specOf({
				request: { kind: ChartKind.STAR_HISTORY, history: multiYear },
				axisLabels: AxisLabels.DATES,
			});

			expect(thinned.labels).toEqual(["2026", "2027", "2028"]);
			expect(dated.labels).toEqual(["Jan 1", "Feb 5", "Mar 11"]);
		});

		it("downsamples evenly, keeping the first and last snapshot", () => {
			const spec = specOf({
				request: { kind: ChartKind.STAR_HISTORY, history },
				maxPoints: 3,
			});

			expect(spec.series[0].data).toEqual([10, 30, 50]);
		});

		it("filters by range before downsampling", () => {
			const spec = specOf({
				request: {
					kind: ChartKind.STAR_HISTORY,
					history: makeHistory({ starCounts: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100], stepDays: 10 }),
				},
				range: ChartRange.D30,
				maxPoints: 2,
			});

			expect(spec.series[0].data).toEqual([70, 100]);
		});

		it("keeps every snapshot when the range is unbounded", () => {
			const spec = specOf({
				request: {
					kind: ChartKind.STAR_HISTORY,
					history: makeHistory({ starCounts: [10, 20, 30, 40, 50], stepDays: 10 }),
				},
				range: ChartRange.ALL,
			});

			expect(spec.series[0].data).toEqual([10, 20, 30, 40, 50]);
		});

		it("spans the whole window at evenly spaced points, keeping both endpoints", () => {
			const dense = makeHistory({ starCounts: Array.from({ length: 100 }, (_, index) => index), stepDays: 1 });
			const { data } = specOf({ request: { kind: ChartKind.STAR_HISTORY, history: dense }, maxPoints: 5 }).series[0];

			expect(data).toHaveLength(5);
			expect(data[0]).toBe(0);
			expect(data.at(-1)).toBe(99);
		});

		it("keeps chart-range meaningful once the window exceeds maxPoints", () => {
			const dense = makeHistory({ starCounts: Array.from({ length: 400 }, (_, index) => index), stepDays: 1 });
			const firstPlotted = (range: ChartRange): number | null =>
				specOf({ request: { kind: ChartKind.STAR_HISTORY, history: dense }, range, maxPoints: 30 }).series[0].data[0];

			expect(firstPlotted(ChartRange.Y1)).not.toBe(firstPlotted(ChartRange.ALL));
		});

		it("plots at most CHART.maxDataPoints snapshots when no limit is given", () => {
			const dense = makeHistory({ starCounts: Array.from({ length: CHART.maxDataPoints + 20 }, (_, index) => index) });
			const { data } = specOf({ request: { kind: ChartKind.STAR_HISTORY, history: dense } }).series[0];

			expect(data).toHaveLength(CHART.maxDataPoints);
			expect(data[0]).toBe(0);
			expect(data.at(-1)).toBe(CHART.maxDataPoints + 19);
		});

		it("dates its x-axis in the requested locale", () => {
			const history: History = {
				snapshots: [
					makeSnapshot({ timestamp: "2026-03-15T00:00:00Z", totalStars: 10 }),
					makeSnapshot({ timestamp: "2026-06-20T00:00:00Z", totalStars: 20 }),
				],
			};
			const request = { kind: ChartKind.STAR_HISTORY, history } as const;

			expect(specOf({ request, locale: "en" }).labels).toEqual(["Mar 15", "Jun 20"]);
			expect(specOf({ request, locale: "es" }).labels).toEqual([
				formatDate({ timestamp: "2026-03-15T00:00:00Z", locale: "es" }),
				formatDate({ timestamp: "2026-06-20T00:00:00Z", locale: "es" }),
			]);
			expect(specOf({ request, locale: "es" }).labels).not.toEqual(specOf({ request, locale: "en" }).labels);
		});

		it("plots only the newest snapshot when maxPoints is 1", () => {
			const spec = specOf({ request: { kind: ChartKind.STAR_HISTORY, history }, maxPoints: 1 });

			expect(spec.series[0].data).toEqual([50]);
		});

		it("plots every snapshot when maxPoints is 0", () => {
			const spec = specOf({ request: { kind: ChartKind.STAR_HISTORY, history }, maxPoints: 0 });

			expect(spec.series[0].data).toEqual([10, 20, 30, 40, 50]);
		});

		it("skips a snapshot whose timestamp cannot be parsed", () => {
			const spec = specOf({
				request: { kind: ChartKind.STAR_HISTORY, history: { snapshots: [unreadable, ...spread.snapshots] } },
				range: ChartRange.D30,
			});

			expect(spec.series[0].data).toEqual([20, 30]);
		});

		it("leaves the series unfiltered when the newest timestamp is unparseable", () => {
			const spec = specOf({
				request: { kind: ChartKind.STAR_HISTORY, history: { snapshots: [...spread.snapshots, unreadable] } },
				range: ChartRange.D30,
			});

			expect(spec.series[0].data).toEqual([10, 20, 30, 35]);
		});
	});
});
