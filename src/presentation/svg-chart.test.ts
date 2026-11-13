import { ChartAxisSide, ChartCurve, ChartRange, ChartTheme } from "@config/types";
import type { ForecastData } from "@domain/forecast";
import { ForecastMethod } from "@domain/forecast";
import type { History, Snapshot } from "@domain/types";
import { describe, expect, it } from "vitest";
import { AxisLabels, buildChartSpec, ChartKind, type ChartRequest } from "./chart-spec";
import { CHART, COLORS, DARK_PALETTE, LIGHT_PALETTE, SVG_CHART } from "./constants";
import { renderSvgChart } from "./svg-chart";

type RenderChartParams = Pick<Parameters<typeof renderSvgChart>[0], "request" | "locale"> &
	Partial<Omit<Parameters<typeof renderSvgChart>[0], "request" | "locale">>;

const CHART_STYLE = {
	lineWidth: 2.5,
	yAxisSide: ChartAxisSide.LEFT,
	smoothing: true,
	curve: ChartCurve.MONOTONE,
	showPoints: true,
	animate: true,
	beginAtZero: false,
	theme: ChartTheme.AUTO,
	maxPoints: CHART.maxDataPoints,
	range: ChartRange.ALL,
};

function renderChart(params: RenderChartParams): string | null {
	return renderSvgChart({ ...CHART_STYLE, ...params });
}

function starHistory(history: History): ChartRequest {
	return { kind: ChartKind.STAR_HISTORY, history, milestones: true, customMilestones: [], trendLine: false };
}

const PLOT_TOP_Y = SVG_CHART.margin.top;
const PLOT_BOTTOM_Y = CHART.height - SVG_CHART.margin.bottom;
const LINE_PATH_D = /<path d="([^"]+)" fill="none"/;
const PATH_MOVE_AND_FIRST_SEGMENT = /^M[\d.]+,[\d.]+ L[\d.]+,[\d.]+/;
const COORDINATE_PAIR = /(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)/g;
const Y_COORDINATE = /,(\d+(?:\.\d+)?)/g;
const DATA_POINT_CIRCLE = /<circle/g;
const CUBIC_BEZIER_COMMAND = / C[\d.]+,[\d.]+ [\d.]+,[\d.]+ [\d.]+,[\d.]+/;
const THOUSANDS_AXIS_LABEL = />\d+(\.\d+)?K<\/text>/;
const FEBRUARY_AXIS_LABEL = />Feb \d/;
const CONSECUTIVE_XML_ATTRIBUTES = /="[^"]*"="[^"]*"/;

interface MakeSnapshotParams {
	timestamp: string;
	totalStars: number;
}

function makeSnapshot({ timestamp, totalStars }: MakeSnapshotParams): Snapshot {
	return {
		timestamp,
		totalStars,
		repos: [{ name: "repo-a", owner: "user", fullName: "user/repo-a", stars: totalStars }],
	};
}

function makeHistory(starCounts: number[]): History {
	return {
		snapshots: starCounts.map((stars, index) => {
			const date = new Date(Date.UTC(2026, 0, index + 1)).toISOString();
			return makeSnapshot({ timestamp: date, totalStars: stars });
		}),
	};
}

interface MakeMultiRepoSnapshotParams {
	timestamp: string;
	repoStars: Record<string, number>;
}

function makeMultiRepoSnapshot({ timestamp, repoStars }: MakeMultiRepoSnapshotParams): Snapshot {
	const repos = Object.entries(repoStars).map(([fullName, stars]) => {
		const [owner, name] = fullName.split("/");
		return { name, owner, fullName, stars };
	});
	const totalStars = repos.reduce((sum, repo) => sum + repo.stars, 0);

	return { timestamp, totalStars, repos };
}

function makeMultiRepoHistory(snapshots: { repoStars: Record<string, number> }[]): History {
	return {
		snapshots: snapshots.map((snapshot, index) => {
			const date = new Date(Date.UTC(2026, 0, index + 1)).toISOString();
			return makeMultiRepoSnapshot({ timestamp: date, repoStars: snapshot.repoStars });
		}),
	};
}

function expectSvg(result: string | null): string {
	expect(result).not.toBeNull();

	return result ?? "";
}

function linePathYs(svg: string): number[] {
	const match = svg.match(LINE_PATH_D);
	const d = match?.[1] ?? "";

	return [...d.matchAll(COORDINATE_PAIR)].map((coordinate) => Number(coordinate[2]));
}

describe("renderSvgChart: star history", () => {
	it("returns null for fewer than 2 snapshots", () => {
		const history = makeHistory([10]);
		const result = renderChart({
			request: starHistory(history),
			locale: "en",
		});
		expect(result).toBeNull();
	});

	it("labels the x-axis by year for multi-year histories", () => {
		const history: History = {
			snapshots: [
				makeSnapshot({ timestamp: "2023-02-01T12:00:00Z", totalStars: 10 }),
				makeSnapshot({ timestamp: "2023-09-01T12:00:00Z", totalStars: 40 }),
				makeSnapshot({ timestamp: "2024-04-01T12:00:00Z", totalStars: 90 }),
				makeSnapshot({ timestamp: "2025-01-01T12:00:00Z", totalStars: 150 }),
			],
		};

		const svg = expectSvg(renderChart({ request: starHistory(history), locale: "en" }));

		expect(svg).toContain(">2023<");
		expect(svg).toContain(">2024<");
		expect(svg).toContain(">2025<");
		expect(svg).not.toMatch(FEBRUARY_AXIS_LABEL);
	});

	it("generates valid SVG structure", () => {
		const history = makeHistory([10, 20, 30]);
		const result = renderChart({
			request: starHistory(history),
			locale: "en",
		});

		expect(result).toContain("<svg");
		expect(result).toContain('viewBox="0 0 800 400"');
		expect(result).toContain('xmlns="http://www.w3.org/2000/svg"');
		expect(result).toContain("</svg>");
	});

	it("uses a prefers-color-scheme media query for the auto theme", () => {
		const history = makeHistory([10, 20, 30]);
		const result = expectSvg(renderChart({ request: starHistory(history), locale: "en" }));

		expect(result).toContain("@media (prefers-color-scheme: dark)");
	});

	it("forces the light palette without a media query for the light theme", () => {
		const history = makeHistory([10, 20, 30]);
		const result = expectSvg(
			renderChart({
				request: starHistory(history),
				locale: "en",
				theme: "light",
			}),
		);

		expect(result).not.toContain("prefers-color-scheme");
		expect(result).toContain(".chart-bg { fill: #fff; }");
	});

	it("forces the dark palette without a media query for the dark theme", () => {
		const history = makeHistory([10, 20, 30]);
		const result = expectSvg(
			renderChart({
				request: starHistory(history),
				locale: "en",
				theme: "dark",
			}),
		);

		expect(result).not.toContain("prefers-color-scheme");
		expect(result).toContain(".chart-bg { fill: #0d1117; }");
	});

	it("includes CSS animations", () => {
		const history = makeHistory([10, 20, 30]);
		const result = renderChart({
			request: starHistory(history),
			locale: "en",
		});

		expect(result).toContain("@keyframes drawLine");
		expect(result).toContain("@keyframes fadeInPoint");
		expect(result).toContain("stroke-dasharray");
		expect(result).toContain("stroke-dashoffset");
	});

	it("omits CSS animations when animation is disabled", () => {
		const history = makeHistory([10, 20, 30]);
		const result = expectSvg(
			renderChart({
				request: starHistory(history),
				locale: "en",
				animate: false,
			}),
		);

		expect(result).not.toContain("@keyframes");
		expect(result).not.toContain("animation:");
		expect(result).not.toContain("stroke-dashoffset");
		expect(result).toContain("<circle");
	});

	it("includes data points as circles", () => {
		const history = makeHistory([10, 20, 30, 40, 50]);
		const result = expectSvg(renderChart({ request: starHistory(history), locale: "en" }));
		const circleCount = [...result.matchAll(DATA_POINT_CIRCLE)].length;

		expect(circleCount).toBe(5);
	});

	it("omits data point circles when showPoints is disabled", () => {
		const history = makeHistory([10, 20, 30, 40, 50]);
		const result = expectSvg(
			renderChart({
				request: starHistory(history),
				locale: "en",
				showPoints: false,
			}),
		);

		expect(result).not.toContain("<circle");
	});

	it("respects locale for date labels", () => {
		const history: History = {
			snapshots: [
				makeSnapshot({ timestamp: "2026-03-15T00:00:00Z", totalStars: 10 }),
				makeSnapshot({ timestamp: "2026-06-20T00:00:00Z", totalStars: 20 }),
			],
		};
		const enResult = expectSvg(renderChart({ request: starHistory(history), locale: "en" }));
		const esResult = expectSvg(renderChart({ request: starHistory(history), locale: "es" }));

		expect(enResult).toContain("Mar");
		expect(esResult).toContain("mar");
	});

	it("draws each Milestone of the spec as a labelled dashed line", () => {
		const request = starHistory(makeHistory([80, 620, 700]));
		const spec = buildChartSpec({
			request,
			locale: "en",
			palette: LIGHT_PALETTE,
			axisLabels: AxisLabels.THINNED,
			range: ChartRange.ALL,
		});
		const result = expectSvg(renderChart({ request, locale: "en" }));
		const milestones = spec?.milestones ?? [];

		expect(milestones.length).toBeGreaterThan(1);
		for (const { label } of milestones) {
			expect(result).toContain(`>${label}</text>`);
		}
		expect(result.match(/stroke-dasharray="6,6"/g)).toHaveLength(milestones.length);
	});

	it("floors the Y-axis at zero when beginAtZero is enabled", () => {
		const history = makeHistory([80, 120, 150]);
		const zoomed = expectSvg(renderChart({ request: starHistory(history), locale: "en" }));
		const fromZero = expectSvg(
			renderChart({
				request: starHistory(history),
				locale: "en",
				beginAtZero: true,
			}),
		);

		expect(zoomed).not.toContain(">0</text>");
		expect(fromZero).toContain(">0</text>");
	});

	it("formats large axis values compactly so labels do not overflow", () => {
		const history = makeHistory([10_000, 30_000, 50_000]);
		const result = expectSvg(renderChart({ request: starHistory(history), locale: "en" }));

		expect(result).toMatch(THOUSANDS_AXIS_LABEL);
		expect(result).not.toContain("50,000");
	});

	it("anchors the line to the baseline so it starts from zero, not mid-air", () => {
		const history = makeHistory([5, 20, 40]);
		const result = expectSvg(renderChart({ request: starHistory(history), locale: "en" }));
		const ys = linePathYs(result);
		const baselineY = PLOT_BOTTOM_Y;

		expect(ys[0]).toBe(baselineY);
		expect(ys[1]).toBeLessThan(baselineY);
		expect([...result.matchAll(DATA_POINT_CIRCLE)].length).toBe(3);
	});

	it("handles equal star counts without errors", () => {
		const history = makeHistory([100, 100, 100]);
		const result = renderChart({
			request: starHistory(history),
			locale: "en",
		});

		expect(result).not.toBeNull();
		expect(result).toContain("<svg");
	});

	it("includes staggered animation delays on points", () => {
		const history = makeHistory([10, 20, 30]);
		const result = expectSvg(renderChart({ request: starHistory(history), locale: "en" }));

		expect(result).toContain("animation-delay: 1.50s");
		expect(result).toContain("animation-delay: 1.55s");
		expect(result).toContain("animation-delay: 1.60s");
	});

	it("includes CSS class names for themed elements", () => {
		const history = makeHistory([10, 20]);
		const result = expectSvg(renderChart({ request: starHistory(history), locale: "en" }));

		expect(result).toContain('class="chart-bg"');
		expect(result).toContain('class="chart-text"');
		expect(result).toContain('class="chart-muted"');
		expect(result).toContain('class="chart-grid"');
		expect(result).toContain('class="chart-axis"');
	});

	it("uses light palette values in default CSS rules", () => {
		const history = makeHistory([10, 20]);
		const result = expectSvg(renderChart({ request: starHistory(history), locale: "en" }));

		expect(result).toContain(`.chart-bg { fill: ${LIGHT_PALETTE.white}; }`);
		expect(result).toContain(`.chart-text { fill: ${LIGHT_PALETTE.text}; }`);
		expect(result).toContain(`.chart-muted { fill: ${LIGHT_PALETTE.neutral}; }`);
		expect(result).toContain(`.chart-grid { stroke: ${LIGHT_PALETTE.cellBorder}; }`);
		expect(result).toContain(`.chart-axis { stroke: ${LIGHT_PALETTE.neutral}; }`);
	});

	it("uses dark palette values in media query block", () => {
		const history = makeHistory([10, 20]);
		const svg = expectSvg(renderChart({ request: starHistory(history), locale: "en" }));
		const result = svg.slice(svg.indexOf("@media (prefers-color-scheme: dark)"));

		expect(result).toContain(`.chart-bg { fill: ${DARK_PALETTE.white}; }`);
		expect(result).toContain(`.chart-text { fill: ${DARK_PALETTE.text}; }`);
		expect(result).toContain(`.chart-muted { fill: ${DARK_PALETTE.neutral}; }`);
		expect(result).toContain(`.chart-grid { stroke: ${DARK_PALETTE.cellBorder}; }`);
		expect(result).toContain(`.chart-axis { stroke: ${DARK_PALETTE.neutral}; }`);
	});

	it("keeps data colors inline rather than in CSS classes", () => {
		const history = makeHistory([10, 20, 30]);
		const result = expectSvg(renderChart({ request: starHistory(history), locale: "en" }));

		expect(result).toContain(`stroke="${COLORS.accent}"`);
		expect(result).toContain(`fill="${COLORS.accent}"`);
	});

	it("applies a custom line width to data lines", () => {
		const history = makeHistory([10, 20, 30]);
		const result = expectSvg(
			renderChart({
				request: starHistory(history),
				locale: "en",
				lineWidth: 5,
			}),
		);

		expect(result).toContain('stroke-width="5"');
	});

	it("does not let the smoothed line overshoot below the axis on valleys", () => {
		const history = makeHistory([5, 5, 100, 5, 5]);
		const result = expectSvg(renderChart({ request: starHistory(history), locale: "en" }));
		const ys = linePathYs(result);

		expect(Math.max(...ys)).toBeLessThanOrEqual(PLOT_BOTTOM_Y);
		expect(Math.min(...ys)).toBeGreaterThanOrEqual(PLOT_TOP_Y);
	});

	it("does not overshoot above the top axis on spikes", () => {
		const history = makeHistory([2, 3, 4, 5, 1000]);
		const result = expectSvg(renderChart({ request: starHistory(history), locale: "en" }));
		const ys = linePathYs(result);

		expect(Math.max(...ys)).toBeLessThanOrEqual(PLOT_BOTTOM_Y);
		expect(Math.min(...ys)).toBeGreaterThanOrEqual(PLOT_TOP_Y);
	});

	it("limits points to maxPoints", () => {
		const history = makeHistory([10, 20, 30, 40, 50]);
		const result = expectSvg(
			renderChart({
				request: starHistory(history),
				locale: "en",
				maxPoints: 3,
			}),
		);

		expect([...result.matchAll(DATA_POINT_CIRCLE)].length).toBe(3);
	});

	it("renders y-axis labels on the left by default", () => {
		const history = makeHistory([10, 20, 30]);
		const result = expectSvg(renderChart({ request: starHistory(history), locale: "en" }));

		expect(result).toContain('text-anchor="end"');
		expect(result).toContain('<line x1="60" y1="50" x2="60"');
	});

	it("renders y-axis labels and axis line on the right when configured", () => {
		const history = makeHistory([10, 20, 30]);
		const result = expectSvg(
			renderChart({
				request: starHistory(history),
				locale: "en",
				yAxisSide: "right",
			}),
		);

		expect(result).toContain('x="778" y=');
		expect(result).toContain('text-anchor="start"');
		expect(result).toContain('<line x1="770" y1="50" x2="770"');
		expect(result).not.toContain('text-anchor="end"');
	});

	it("uses smooth cubic curves by default", () => {
		const history = makeHistory([10, 20, 30, 40]);
		const result = expectSvg(renderChart({ request: starHistory(history), locale: "en" }));

		expect(result).toMatch(CUBIC_BEZIER_COMMAND);
	});

	it("draws straight segments when smoothing is disabled", () => {
		const history = makeHistory([10, 20, 30, 40]);
		const result = expectSvg(
			renderChart({
				request: starHistory(history),
				locale: "en",
				smoothing: false,
			}),
		);
		const linePath = result.match(LINE_PATH_D)?.[1] ?? "";

		expect(linePath).toContain(" L");
		expect(linePath).not.toContain(" C");
	});

	const curveYsOf = (svg: string): number[] => {
		const d = svg.match(LINE_PATH_D)?.[1] ?? "";
		const body = d.replace(PATH_MOVE_AND_FIRST_SEGMENT, "");
		return [...body.matchAll(Y_COORDINATE)].map((coordinate) => Number(coordinate[1]));
	};

	it("rounds the catmull-rom curve past the data point at an asymmetric valley", () => {
		const history = makeHistory([100, 5, 200]);
		const smooth = curveYsOf(
			expectSvg(
				renderChart({
					request: starHistory(history),
					locale: "en",
					curve: ChartCurve.CATMULL_ROM,
				}),
			),
		);
		const straight = curveYsOf(
			expectSvg(
				renderChart({
					request: starHistory(history),
					locale: "en",
					smoothing: false,
				}),
			),
		);

		expect(Math.max(...smooth)).toBeGreaterThan(Math.max(...straight));
		expect(Math.max(...smooth)).toBeLessThanOrEqual(PLOT_BOTTOM_Y);
	});

	it("does not overshoot the data point at a valley with the monotone curve", () => {
		const history = makeHistory([100, 5, 200]);
		const smooth = curveYsOf(
			expectSvg(
				renderChart({
					request: starHistory(history),
					locale: "en",
					curve: ChartCurve.MONOTONE,
				}),
			),
		);
		const straight = curveYsOf(
			expectSvg(
				renderChart({
					request: starHistory(history),
					locale: "en",
					smoothing: false,
				}),
			),
		);

		expect(Math.max(...smooth)).toBeLessThanOrEqual(Math.max(...straight) + 0.01);
	});

	it("defaults to the monotone curve, which does not overshoot", () => {
		const history = makeHistory([100, 5, 200]);
		const defaulted = curveYsOf(expectSvg(renderChart({ request: starHistory(history), locale: "en" })));
		const monotone = curveYsOf(
			expectSvg(
				renderChart({
					request: starHistory(history),
					locale: "en",
					curve: ChartCurve.MONOTONE,
				}),
			),
		);

		expect(defaulted).toEqual(monotone);
	});

	it("keeps plateaus flat and never dips below them with the monotone curve", () => {
		const history = makeHistory([1, 1, 1, 2, 3, 3, 3]);
		const ys = curveYsOf(
			expectSvg(
				renderChart({
					request: starHistory(history),
					locale: "en",
					curve: ChartCurve.MONOTONE,
				}),
			),
		);
		const straight = curveYsOf(
			expectSvg(
				renderChart({
					request: starHistory(history),
					locale: "en",
					smoothing: false,
				}),
			),
		);

		expect(Math.max(...ys)).toBeLessThanOrEqual(Math.max(...straight) + 0.01);
		expect(Math.min(...ys)).toBeGreaterThanOrEqual(Math.min(...straight) - 0.01);
	});

	it("rounds corners with quadratic segments for the rounded-step curve", () => {
		const history = makeHistory([1, 1, 1, 2, 3, 3, 3]);
		const result = expectSvg(
			renderChart({
				request: starHistory(history),
				locale: "en",
				curve: ChartCurve.ROUNDED_STEP,
			}),
		);
		const linePath = result.match(LINE_PATH_D)?.[1] ?? "";

		expect(linePath).toContain(" Q");
	});

	it("uses cubic segments without overshoot for the cubic-bezier curve", () => {
		const history = makeHistory([1, 1, 1, 2, 3, 3, 3]);
		const result = expectSvg(
			renderChart({
				request: starHistory(history),
				locale: "en",
				curve: ChartCurve.CUBIC_BEZIER,
			}),
		);
		const straight = expectSvg(
			renderChart({
				request: starHistory(history),
				locale: "en",
				smoothing: false,
			}),
		);
		const linePath = result.match(LINE_PATH_D)?.[1] ?? "";

		expect(linePath).toContain(" C");
		expect(Math.max(...curveYsOf(result))).toBeLessThanOrEqual(Math.max(...curveYsOf(straight)) + 0.01);
		expect(Math.min(...curveYsOf(result))).toBeGreaterThanOrEqual(Math.min(...curveYsOf(straight)) - 0.01);
	});
});

describe("renderSvgChart: per repo", () => {
	it("generates valid SVG structure", () => {
		const history = makeMultiRepoHistory([
			{ repoStars: { "user/repo-a": 10, "user/repo-b": 5 } },
			{ repoStars: { "user/repo-a": 15, "user/repo-b": 8 } },
		]);
		const result = renderChart({
			request: { kind: ChartKind.PER_REPO, history, repoFullName: "user/repo-a" },
			locale: "en",
		});

		expect(result).toContain("<svg");
		expect(result).toContain("</svg>");
	});
});

describe("renderSvgChart: comparison", () => {
	it("generates valid SVG with legend", () => {
		const history = makeMultiRepoHistory([
			{ repoStars: { "user/repo-a": 10, "user/repo-b": 5 } },
			{ repoStars: { "user/repo-a": 15, "user/repo-b": 8 } },
		]);
		const result = expectSvg(
			renderChart({
				request: { kind: ChartKind.COMPARISON, history, repoNames: ["user/repo-a", "user/repo-b"] },
				locale: "en",
			}),
		);

		expect(result).toContain("<svg");
		expect(result).toContain('class="legend"');
	});

	it("applies a custom line width to every comparison line", () => {
		const history = makeMultiRepoHistory([
			{ repoStars: { "user/repo-a": 10, "user/repo-b": 5 } },
			{ repoStars: { "user/repo-a": 15, "user/repo-b": 8 } },
		]);
		const result = expectSvg(
			renderChart({
				request: { kind: ChartKind.COMPARISON, history, repoNames: ["user/repo-a", "user/repo-b"] },
				locale: "en",
				lineWidth: 5,
			}),
		);

		expect(result.match(/stroke-width="5"/g)).toHaveLength(2);
	});
});

describe("renderSvgChart: forecast", () => {
	const forecastData: ForecastData = {
		aggregate: {
			forecasts: [
				{
					method: ForecastMethod.LINEAR_REGRESSION,
					points: [
						{ weekOffset: 1, predicted: 35 },
						{ weekOffset: 2, predicted: 40 },
						{ weekOffset: 3, predicted: 45 },
						{ weekOffset: 4, predicted: 50 },
					],
				},
				{
					method: ForecastMethod.WEIGHTED_MOVING_AVERAGE,
					points: [
						{ weekOffset: 1, predicted: 33 },
						{ weekOffset: 2, predicted: 36 },
						{ weekOffset: 3, predicted: 39 },
						{ weekOffset: 4, predicted: 42 },
					],
				},
			],
		},
		repos: [],
	};

	it("draws the forecast series with the dark palette when theme is dark", () => {
		const result = renderChart({
			request: { kind: ChartKind.FORECAST, history: makeHistory([10, 20, 30]), forecastData },
			locale: "en",
			theme: ChartTheme.DARK,
		});

		expect(result).toContain(DARK_PALETTE.positive);
		expect(result).toContain(DARK_PALETTE.negative);
		expect(result).not.toContain(LIGHT_PALETTE.positive);
		expect(result).not.toContain(LIGHT_PALETTE.negative);
	});

	it("generates valid SVG with legend", () => {
		const history = makeHistory([10, 20, 30]);
		const result = expectSvg(
			renderChart({
				request: { kind: ChartKind.FORECAST, history, forecastData },
				locale: "en",
			}),
		);

		expect(result).toContain("<svg");
		expect(result).toContain('class="legend"');
		expect(result).toContain("</svg>");
	});

	it("includes dashed lines for forecast", () => {
		const history = makeHistory([10, 20, 30]);
		const result = expectSvg(
			renderChart({
				request: { kind: ChartKind.FORECAST, history, forecastData },
				locale: "en",
			}),
		);

		expect(result).toContain('stroke-dasharray="8,4"');
	});

	it("draws the label of every series of the spec in the legend", () => {
		const request = { kind: ChartKind.FORECAST, history: makeHistory([10, 20, 30]), forecastData } as const;
		const spec = buildChartSpec({
			request,
			locale: "en",
			palette: LIGHT_PALETTE,
			axisLabels: AxisLabels.THINNED,
			range: ChartRange.ALL,
		});
		const result = expectSvg(renderChart({ request, locale: "en" }));
		const series = spec?.series ?? [];

		expect(series).toHaveLength(3);
		for (const { label } of series) {
			expect(result).toContain(`>${label}</text>`);
		}
	});

	it("generates valid XML attributes in legend for dashed datasets", () => {
		const history = makeHistory([10, 20, 30]);
		const result = expectSvg(
			renderChart({
				request: { kind: ChartKind.FORECAST, history, forecastData },
				locale: "en",
			}),
		);

		expect(result).not.toMatch(CONSECUTIVE_XML_ATTRIBUTES);
	});
});

const REDUCED_MOTION_QUERY = "@media (prefers-reduced-motion: no-preference)";
const STYLE_BLOCK = /<style>([\s\S]*?)<\/style>/;
const LEGEND_BLOCK = /<g class="legend">([\s\S]*?)<\/g>/;
const DASH_ARRAY = /stroke-dasharray="([^"]+)"/;
const SVG_FORECAST_DASH = "8,4";

function styleOf(svg: string): string {
	return svg.match(STYLE_BLOCK)?.[1] ?? "";
}

interface WithoutMediaBlockParams {
	style: string;
	query: string;
}

function withoutMediaBlock({ style, query }: WithoutMediaBlockParams): string {
	const start = style.indexOf(query);
	if (start === -1) return style;

	const open = style.indexOf("{", start);
	let depth = 0;
	for (let index = open; index < style.length; index++) {
		if (style[index] === "{") depth++;
		if (style[index] === "}") depth--;
		if (depth === 0) return style.slice(0, start) + style.slice(index + 1);
	}

	return style;
}

function legendDashes(svg: string): (string | null)[] {
	const legend = svg.match(LEGEND_BLOCK)?.[1] ?? "";

	return [...legend.matchAll(/<line [^>]*\/>/g)].map((line) => line[0].match(DASH_ARRAY)?.[1] ?? null);
}

function lineDashes(svg: string): (string | null)[] {
	return [...svg.matchAll(/<path d="[^"]+" fill="none"[^>]*\/>/g)].map(
		(path) => path[0].match(DASH_ARRAY)?.[1] ?? null,
	);
}

const COMPARISON_REPOS = Array.from({ length: 10 }, (_, index) => `user/repo-${index}`);

function comparisonSvg(overrides: Partial<Parameters<typeof renderSvgChart>[0]> = {}): string {
	const history = makeMultiRepoHistory([
		{ repoStars: Object.fromEntries(COMPARISON_REPOS.map((name, index) => [name, 10 + index])) },
		{ repoStars: Object.fromEntries(COMPARISON_REPOS.map((name, index) => [name, 20 + index * 2])) },
	]);

	return expectSvg(
		renderChart({
			request: { kind: ChartKind.COMPARISON, history, repoNames: COMPARISON_REPOS },
			locale: "en",
			...overrides,
		}),
	);
}

describe("renderSvgChart: reduced motion", () => {
	it("puts every animation rule, the hidden start of the points and the draw-on set-up inside the no-preference query", () => {
		const svg = expectSvg(renderChart({ request: starHistory(makeHistory([10, 20, 30])), locale: "en" }));
		const style = styleOf(svg);
		const inside = style.slice(style.indexOf(REDUCED_MOTION_QUERY));
		const outside = withoutMediaBlock({ style, query: REDUCED_MOTION_QUERY });

		expect(style.match(/@media \(prefers-reduced-motion/g)).toHaveLength(1);
		expect(inside).toContain("@keyframes drawLine");
		expect(inside).toContain("@keyframes fadeInPoint");
		expect(inside).toContain(".data-point {");
		expect(inside).toContain("opacity: 0;");
		expect(inside).toContain("stroke-dasharray:");
		expect(inside).toContain("stroke-dashoffset:");
		expect(outside).not.toMatch(/animation|@keyframes|opacity|stroke-dash/);
		expect(outside).toContain(".chart-bg");
	});

	it("leaves nothing that hides a point or a line outside the query in an auto-theme chart", () => {
		const svg = expectSvg(renderChart({ request: starHistory(makeHistory([10, 20, 30])), locale: "en" }));
		const outside = withoutMediaBlock({ style: styleOf(svg), query: REDUCED_MOTION_QUERY });

		expect(outside).toContain("prefers-color-scheme: dark");
		expect(outside).not.toMatch(/\.data-point|\.data-line|opacity|stroke-dash/);
		expect(svg).not.toMatch(/<circle[^>]*opacity/);
		expect(svg).not.toMatch(/<path[^>]*stroke-dashoffset/);
	});

	it("emits no motion query at all when the animation is off", () => {
		const svg = expectSvg(
			renderChart({ request: starHistory(makeHistory([10, 20, 30])), locale: "en", animate: false }),
		);

		expect(styleOf(svg)).not.toContain("prefers-reduced-motion");
		expect(styleOf(svg)).not.toMatch(/animation|@keyframes|opacity|stroke-dash/);
	});
});

describe("renderSvgChart: description", () => {
	it("names the SVG as an image and gives it the description of the spec as its title", () => {
		const request = starHistory(makeHistory([10, 20, 30]));
		const spec = buildChartSpec({
			request,
			locale: "en",
			palette: LIGHT_PALETTE,
			axisLabels: AxisLabels.THINNED,
			range: ChartRange.ALL,
		});
		const svg = expectSvg(renderChart({ request, locale: "en" }));

		expect(spec?.description).toBe("Star history from 2026-01-01 to 2026-01-03: 10 to 30 stars");
		expect(svg).toMatch(
			/^<svg [^>]*role="img">\n {2}<title>Star history from 2026-01-01 to 2026-01-03: 10 to 30 stars<\/title>/,
		);
	});

	it("describes the chart in the language of the run", () => {
		const svg = expectSvg(renderChart({ request: starHistory(makeHistory([10, 20, 30])), locale: "es" }));

		expect(svg).toContain("<title>Historial de estrellas del 2026-01-01 al 2026-01-03: de 10 a 30 estrellas</title>");
	});

	it("escapes a repository name in the title for XML", () => {
		const history = makeMultiRepoHistory([{ repoStars: { 'o&<">/r': 1 } }, { repoStars: { 'o&<">/r': 4 } }]);
		const svg = expectSvg(
			renderChart({ request: { kind: ChartKind.PER_REPO, history, repoFullName: 'o&<">/r' }, locale: "en" }),
		);

		expect(svg).toContain(
			"<title>Star history of o&amp;&lt;&quot;&gt;/r from 2026-01-01 to 2026-01-02: 1 to 4 stars</title>",
		);
		expect(svg).not.toContain('o&<">');
	});
});

describe("renderSvgChart: comparison dash patterns", () => {
	it("draws the first series solid and every later one with a dash pattern of its own", () => {
		const dashes = lineDashes(comparisonSvg());

		expect(dashes).toHaveLength(COMPARISON_REPOS.length);
		expect(dashes[0]).toBeNull();
		expect(dashes.slice(1).every((dash) => dash !== null)).toBe(true);
		expect(new Set(dashes).size).toBe(COMPARISON_REPOS.length);
	});

	it("keeps every comparison pattern apart from the pattern the forecast and trend lines use", () => {
		const forecastPattern = SVG_FORECAST_DASH;

		expect(lineDashes(comparisonSvg())).not.toContain(forecastPattern);
	});

	it("draws each legend swatch as a line with the dash of its series, and no colour block", () => {
		const svg = comparisonSvg();
		const legend = svg.match(LEGEND_BLOCK)?.[1] ?? "";

		expect(legend).not.toContain("<rect");
		expect(legendDashes(svg)).toEqual(lineDashes(svg));
	});

	it("draws the line of a patterned series at once, with the pattern the legend shows", () => {
		const svg = comparisonSvg();
		const style = styleOf(svg);

		expect(style).toContain(".data-line-0 {");
		expect(style).not.toContain(".data-line-1 {");
		expect(svg).toContain('class="data-line-0"');
		expect(svg).not.toContain('class="data-line-1"');
	});

	it("still marks the points of a patterned series", () => {
		expect([...comparisonSvg().matchAll(DATA_POINT_CIRCLE)]).toHaveLength(COMPARISON_REPOS.length * 2);
	});

	it("draws the forecast legend swatches as dashed lines of the forecast pattern", () => {
		const forecastData: ForecastData = {
			aggregate: {
				forecasts: [
					{ method: ForecastMethod.LINEAR_REGRESSION, points: [{ weekOffset: 1, predicted: 35 }] },
					{ method: ForecastMethod.WEIGHTED_MOVING_AVERAGE, points: [{ weekOffset: 1, predicted: 33 }] },
				],
			},
			repos: [],
		};
		const svg = expectSvg(
			renderChart({
				request: { kind: ChartKind.FORECAST, history: makeHistory([10, 20, 30]), forecastData },
				locale: "en",
			}),
		);

		expect(legendDashes(svg)).toEqual([null, SVG_FORECAST_DASH, SVG_FORECAST_DASH]);
		expect(svg.match(LEGEND_BLOCK)?.[1]).not.toContain("<rect");
	});
});
