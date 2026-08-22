import type { Config } from "@config/types";
import { EMPTY_SUMMARY, topRepositories } from "@domain/comparison";
import type { ForecastData } from "@domain/forecast";
import { deltaIndicator } from "@domain/formatting";
import type { StargazerDiffResult } from "@domain/stargazers";
import type { ComparisonResults, History, Summary } from "@domain/types";
import { getTranslations, interpolate, type Locale } from "@i18n";
import { generateBadge } from "./badge";
import type { ChartFile, ChartHistories } from "./charts";
import { buildChartFiles } from "./charts";
import { generateCsvReport } from "./csv";
import { generateHtmlReport } from "./html";
import { generateMarkdownReport } from "./markdown";
import { buildReportModel } from "./report-model";
import type { ReportParams } from "./shared";
import { perRepoChartFile } from "./shared";

export interface RenderedRun {
	markdown: string;
	html: string;
	csv: string;
	badge: string;
	charts: ChartFile[];
	emailSubject: string;
}

interface EmailSubjectParams {
	locale: Locale;
	summary: Summary;
}

function emailSubject({ locale, summary }: EmailSubjectParams): string {
	const t = getTranslations(locale);

	return interpolate({
		template: t.email.subjectLine,
		params: {
			subject: t.email.subject,
			totalStars: summary.totalStars,
			delta: deltaIndicator(summary.totalDelta),
		},
	});
}

export function renderEmptyRun(config: Config): RenderedRun {
	const t = getTranslations(config.locale);
	const results: ComparisonResults = { repos: [], summary: EMPTY_SUMMARY };

	return {
		markdown: t.report.noRepositories,
		html: `<p>${t.report.noRepositories}</p>`,
		csv: generateCsvReport(results),
		badge: generateBadge({ totalStars: 0, locale: config.locale }),
		charts: [],
		emailSubject: emailSubject({ locale: config.locale, summary: EMPTY_SUMMARY }),
	};
}

interface RenderRunParams {
	config: Config;
	results: ComparisonResults;
	previousTimestamp: string | null;
	chartHistories: ChartHistories;
	storedHistory: History;
	stargazerDiff?: StargazerDiffResult | null;
	forecastData: ForecastData | null;
	now?: Date;
}

export function renderRun({
	config,
	results,
	previousTimestamp,
	chartHistories,
	storedHistory,
	stargazerDiff,
	forecastData,
	now = new Date(),
}: RenderRunParams): RenderedRun {
	const reportParams: ReportParams = {
		config,
		results,
		previousTimestamp,
		history: chartHistories.aggregate,
		velocityHistory: storedHistory,
		stargazerDiff,
		forecastData,
		now,
	};

	const charts = buildChartFiles({
		config,
		chartHistories,
		forecastData,
		topRepoNames: topRepositories({ repos: results.repos, limit: config.topRepos }),
	});
	const drawn = new Set(charts.map((file) => file.filename));
	const model = buildReportModel({
		...reportParams,
		chartHistories,
		hasChartFile: (repoFullName) => drawn.has(perRepoChartFile(repoFullName)),
	});
	const rendering = { model, config };

	return {
		markdown: generateMarkdownReport(rendering),
		html: generateHtmlReport(rendering),
		csv: generateCsvReport(results),
		badge: generateBadge({ totalStars: results.summary.totalStars, locale: config.locale }),
		emailSubject: emailSubject({ locale: config.locale, summary: results.summary }),
		charts,
	};
}
