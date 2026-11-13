import { ChartCurve, type ChartRange, type ChartTheme } from "@config/types";
import { intlCode } from "@domain/formatting";
import type { Locale } from "@i18n";
import type { ChartMilestone, ChartRequest, ChartSeries } from "./chart-spec";
import { AxisLabels, buildChartSpec, SeriesDash, SeriesWeight } from "./chart-spec";
import { CHART, CHART_CHROME, CHART_POINT, CHART_TENSION } from "./constants";
import { resolvePalette } from "./shared";
import type { ColorPalette } from "./types";

const BYTE_MAX = 0xff;
const HEX_RADIX = 16;
const HEX_BYTE_DIGITS = 2;
const RGB_DIGITS = 6;
const SHORTHAND_MAX_DIGITS = 4;

const CHART_STYLE = {
	translucentAlpha: 0x33,
	titleFontSize: CHART_CHROME.titleFontSize,
	legendFontSize: 11,
	legendHiddenFontSize: 12,
	milestoneBorderWidth: CHART_CHROME.milestoneStrokeWidth,
	milestoneFontSize: CHART_CHROME.milestoneFontSize,
	milestoneDash: CHART_CHROME.milestoneDash,
	trendDash: [6, 4],
	linearRegressionDash: [8, 4],
	weightedMovingAverageDash: [4, 4],
	comparisonDashes: {
		dotted: [2, 3],
		longDash: [16, 5],
		dashDot: [6, 3, 2, 3],
		longDashDot: [14, 4, 3, 4],
		shortDash: [5, 2],
		fineDots: [2, 2],
		dashDotDot: [10, 3, 2, 3, 2, 3],
		extraLongDash: [24, 6],
		sparseDots: [2, 6],
	},
};

function translucent(color: string): string {
	const digits = color.slice(1);
	const expanded = digits.length <= SHORTHAND_MAX_DIGITS ? [...digits].map((digit) => digit + digit).join("") : digits;
	const ownAlpha = expanded.length > RGB_DIGITS ? Number.parseInt(expanded.slice(RGB_DIGITS), HEX_RADIX) : BYTE_MAX;
	const alpha = Math.round((ownAlpha * CHART_STYLE.translucentAlpha) / BYTE_MAX);

	return `#${expanded.slice(0, RGB_DIGITS)}${alpha.toString(HEX_RADIX).padStart(HEX_BYTE_DIGITS, "0")}`;
}

interface CurveProps {
	tension: number;
	cubicInterpolationMode?: typeof ChartCurve.MONOTONE;
}

const CURVE_PROPS: Record<ChartCurve, CurveProps> = {
	[ChartCurve.CATMULL_ROM]: { tension: CHART_TENSION.smooth },
	[ChartCurve.CUBIC_BEZIER]: { tension: CHART_TENSION.smooth },
	[ChartCurve.MONOTONE]: {
		tension: CHART_TENSION.smooth,
		cubicInterpolationMode: ChartCurve.MONOTONE,
	},
	[ChartCurve.ROUNDED_STEP]: {
		tension: CHART_TENSION.smooth,
		cubicInterpolationMode: ChartCurve.MONOTONE,
	},
};

interface CurvePropsForParams {
	smoothing: boolean;
	curve: ChartCurve;
}

function curvePropsFor({ smoothing, curve }: CurvePropsForParams): CurveProps {
	return smoothing ? CURVE_PROPS[curve] : { tension: CHART_TENSION.straight };
}

interface PointRadiusForParams {
	showPoints: boolean;
	radius: number;
}

function pointRadiusFor({ showPoints, radius }: PointRadiusForParams): number {
	return showPoints ? radius : CHART_POINT.hidden;
}

interface ChartConfig {
	type: "line";
	data: {
		labels: string[];
		datasets: Dataset[];
	};
	options: ChartOptions;
}

interface Dataset {
	label: string;
	data: (number | null)[];
	borderColor: string;
	backgroundColor: string;
	fill: boolean;
	tension: number;
	cubicInterpolationMode?: typeof ChartCurve.MONOTONE;
	pointRadius: number;
	pointHoverRadius: number;
	borderDash?: number[];
	borderWidth: number;
}

interface MilestoneAnnotation {
	type: "line";
	yMin: number;
	yMax: number;
	borderColor: string;
	borderWidth: number;
	borderDash: [number, number];
	label: {
		display: boolean;
		content: string;
		position: "start";
		backgroundColor: string;
		color: string;
		font: { size: number };
	};
}

interface AnnotationPlugin {
	annotations: Record<string, MilestoneAnnotation>;
}

interface ChartOptions {
	responsive: boolean;
	maintainAspectRatio: boolean;
	locale: string;
	plugins: {
		legend: {
			display: boolean;
			position: "top";
			labels: {
				color: string;
				font: { size: number };
			};
		};
		title: {
			display: boolean;
			text: string;
			color: string;
			font: { size: number; weight: "bold" };
		};
		annotation?: AnnotationPlugin;
	};
	scales: {
		x: {
			grid: { color: string };
			ticks: { color: string };
		};
		y: {
			grid: { color: string };
			ticks: { color: string };
			beginAtZero: boolean;
		};
	};
}

interface BuildMilestoneAnnotationsParams {
	milestones: readonly ChartMilestone[];
	palette: ColorPalette;
}

function buildMilestoneAnnotations({ milestones, palette }: BuildMilestoneAnnotationsParams): AnnotationPlugin | null {
	if (milestones.length === 0) return null;

	const annotations: Record<string, MilestoneAnnotation> = {};

	for (const milestone of milestones) {
		annotations[`milestone${milestone.value}`] = {
			type: "line",
			yMin: milestone.value,
			yMax: milestone.value,
			borderColor: palette.neutral,
			borderWidth: CHART_STYLE.milestoneBorderWidth,
			borderDash: CHART_STYLE.milestoneDash,
			label: {
				display: true,
				content: milestone.label,
				position: "start",
				backgroundColor: translucent(palette.neutral),
				color: palette.neutral,
				font: { size: CHART_STYLE.milestoneFontSize },
			},
		};
	}

	return { annotations };
}

interface BuildChartOptionsParams {
	title: string;
	showLegend: boolean;
	beginAtZero: boolean;
	locale: Locale;
	palette: ColorPalette;
	annotation?: AnnotationPlugin | null;
}

function buildChartOptions({
	title,
	showLegend,
	beginAtZero,
	locale,
	palette,
	annotation,
}: BuildChartOptionsParams): ChartOptions {
	return {
		responsive: true,
		maintainAspectRatio: false,
		locale: intlCode(locale),
		plugins: {
			legend: {
				display: showLegend,
				position: "top",
				labels: {
					color: palette.text,
					font: {
						size: showLegend ? CHART_STYLE.legendFontSize : CHART_STYLE.legendHiddenFontSize,
					},
				},
			},
			title: {
				display: true,
				text: title,
				color: palette.text,
				font: { size: CHART_STYLE.titleFontSize, weight: "bold" },
			},
			...(annotation ? { annotation } : {}),
		},
		scales: {
			x: {
				grid: { color: palette.cellBorder },
				ticks: { color: palette.neutral },
			},
			y: {
				grid: { color: palette.cellBorder },
				ticks: { color: palette.neutral },
				beginAtZero,
			},
		},
	};
}

interface BuildChartUrlParams {
	config: ChartConfig;
	palette: ColorPalette;
}

function buildChartUrl({ config, palette }: BuildChartUrlParams): string {
	const encodedConfig = encodeURIComponent(JSON.stringify(config));
	const backgroundColor = encodeURIComponent(palette.white);

	return `https://quickchart.io/chart?v=${CHART.chartJsVersion}&w=${CHART.width}&h=${CHART.height}&backgroundColor=${backgroundColor}&c=${encodedConfig}`;
}

interface SeriesStroke {
	pattern: number[] | null;
	translucentPoints: boolean;
}

const SERIES_STROKES: Record<SeriesDash, SeriesStroke> = {
	[SeriesDash.NONE]: { pattern: null, translucentPoints: true },
	[SeriesDash.TREND]: { pattern: CHART_STYLE.trendDash, translucentPoints: false },
	[SeriesDash.LINEAR_REGRESSION]: { pattern: CHART_STYLE.linearRegressionDash, translucentPoints: false },
	[SeriesDash.WEIGHTED_MOVING_AVERAGE]: { pattern: CHART_STYLE.weightedMovingAverageDash, translucentPoints: false },
	[SeriesDash.DOTTED]: { pattern: CHART_STYLE.comparisonDashes.dotted, translucentPoints: true },
	[SeriesDash.LONG_DASH]: { pattern: CHART_STYLE.comparisonDashes.longDash, translucentPoints: true },
	[SeriesDash.DASH_DOT]: { pattern: CHART_STYLE.comparisonDashes.dashDot, translucentPoints: true },
	[SeriesDash.LONG_DASH_DOT]: { pattern: CHART_STYLE.comparisonDashes.longDashDot, translucentPoints: true },
	[SeriesDash.SHORT_DASH]: { pattern: CHART_STYLE.comparisonDashes.shortDash, translucentPoints: true },
	[SeriesDash.FINE_DOTS]: { pattern: CHART_STYLE.comparisonDashes.fineDots, translucentPoints: true },
	[SeriesDash.DASH_DOT_DOT]: { pattern: CHART_STYLE.comparisonDashes.dashDotDot, translucentPoints: true },
	[SeriesDash.EXTRA_LONG_DASH]: { pattern: CHART_STYLE.comparisonDashes.extraLongDash, translucentPoints: true },
	[SeriesDash.SPARSE_DOTS]: { pattern: CHART_STYLE.comparisonDashes.sparseDots, translucentPoints: true },
};

const POINT_SIZES: Record<SeriesWeight, { radius: number; hoverRadius: number }> = {
	[SeriesWeight.PRIMARY]: {
		radius: CHART_POINT.primaryRadius,
		hoverRadius: CHART_POINT.primaryHoverRadius,
	},
	[SeriesWeight.SECONDARY]: {
		radius: CHART_POINT.secondaryRadius,
		hoverRadius: CHART_POINT.secondaryHoverRadius,
	},
	[SeriesWeight.HIDDEN]: { radius: CHART_POINT.hidden, hoverRadius: CHART_POINT.hidden },
};

interface ToDatasetParams {
	series: ChartSeries;
	curveProps: CurveProps;
	showPoints: boolean;
	lineWidth: number;
}

function toDataset({ series, curveProps, showPoints, lineWidth }: ToDatasetParams): Dataset {
	const { pattern, translucentPoints } = SERIES_STROKES[series.dash];
	const point = POINT_SIZES[series.weight];

	return {
		label: series.label,
		data: series.data,
		borderColor: series.color,
		backgroundColor: translucentPoints ? translucent(series.color) : "transparent",
		fill: series.fill,
		...curveProps,
		pointRadius:
			series.weight === SeriesWeight.HIDDEN ? CHART_POINT.hidden : pointRadiusFor({ showPoints, radius: point.radius }),
		pointHoverRadius: point.hoverRadius,
		borderWidth: lineWidth,
		...(pattern ? { borderDash: pattern } : {}),
	};
}

interface ChartImageUrlParams {
	request: ChartRequest;
	locale: Locale;
	smoothing: boolean;
	curve: ChartCurve;
	showPoints: boolean;
	beginAtZero: boolean;
	theme: ChartTheme;
	range: ChartRange;
	lineWidth: number;
}

export function chartImageUrl({
	request,
	locale,
	smoothing,
	curve,
	showPoints,
	beginAtZero,
	theme,
	range,
	lineWidth,
}: ChartImageUrlParams): string | null {
	const palette = resolvePalette(theme);
	const spec = buildChartSpec({
		request,
		locale,
		palette,
		axisLabels: AxisLabels.DATES,
		range,
	});

	if (spec === null) return null;

	const curveProps = curvePropsFor({ smoothing, curve });
	const datasets = spec.series.map((series) => toDataset({ series, curveProps, showPoints, lineWidth }));
	const annotation = buildMilestoneAnnotations({ milestones: spec.milestones, palette });

	return buildChartUrl({
		config: buildChartConfig({
			labels: spec.labels,
			datasets,
			title: spec.title,
			showLegend: spec.showLegend,
			beginAtZero,
			locale,
			palette,
			annotation,
		}),
		palette,
	});
}

interface BuildChartConfigParams {
	labels: string[];
	datasets: Dataset[];
	title: string;
	showLegend: boolean;
	beginAtZero: boolean;
	locale: Locale;
	palette: ColorPalette;
	annotation?: AnnotationPlugin | null;
}

function buildChartConfig({
	labels,
	datasets,
	title,
	showLegend,
	beginAtZero,
	locale,
	palette,
	annotation,
}: BuildChartConfigParams): ChartConfig {
	return {
		type: "line",
		data: { labels, datasets },
		options: buildChartOptions({ title, showLegend, beginAtZero, locale, palette, annotation }),
	};
}
