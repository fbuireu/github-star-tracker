import type { Config } from '@config/types';
import type { ForecastData } from '@domain/forecast';
import type { StargazerDiffResult } from '@domain/stargazers';
import type { ComparisonResults, History } from '@domain/types';
import { generateBadge } from './badge';
import type { ChartFile, ChartHistories } from './charts';
import { buildChartFiles } from './charts';
import { generateCsvReport } from './csv';
import { generateHtmlReport } from './html';
import { generateMarkdownReport } from './markdown';
import { buildReportModel } from './report-model';
import type { ReportParams } from './shared';

export interface RenderedRun {
  markdown: string;
  html: string;
  csv: string;
  badge: string;
  charts: ChartFile[];
}

interface RenderRunParams {
  config: Config;
  results: ComparisonResults;
  previousTimestamp: string | null;
  chartHistories: ChartHistories;
  storedHistory: History;
  stargazerDiff?: StargazerDiffResult | null;
  forecastData: ForecastData | null;
}

export function renderRun({
  config,
  results,
  previousTimestamp,
  chartHistories,
  storedHistory,
  stargazerDiff,
  forecastData,
}: RenderRunParams): RenderedRun {
  const reportParams: ReportParams = {
    config,
    results,
    previousTimestamp,
    history: chartHistories.aggregate,
    velocityHistory: storedHistory,
    stargazerDiff,
    forecastData,
  };

  const model = buildReportModel(reportParams);
  const rendering = { model, config };

  return {
    markdown: generateMarkdownReport(rendering),
    html: generateHtmlReport(rendering),
    csv: generateCsvReport(results),
    badge: generateBadge({ totalStars: results.summary.totalStars, locale: config.locale }),
    charts: buildChartFiles({
      config,
      chartHistories,
      forecastData,
      topRepoNames: model.topRepos.map((repo) => repo.fullName),
    }),
  };
}
