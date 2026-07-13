import * as core from '@actions/core';
import * as github from '@actions/github';
import { loadConfig } from '@config/loader';
import { compareStars, createSnapshot } from '@domain/comparison';
import { computeForecast } from '@domain/forecast';
import { deltaIndicator } from '@domain/formatting';
import { shouldNotify } from '@domain/notification';
import { addSnapshot, getLastSnapshot } from '@domain/snapshot';
import { buildStarHistory } from '@domain/star-history';
import { buildStargazerMap, diffStargazers, type RepoStargazers } from '@domain/stargazers';
import type { Summary } from '@domain/types';
import { getTranslations, interpolate } from '@i18n';
import { cleanup, initializeDataBranch } from '@infrastructure/git/worktree';
import { getRepos } from '@infrastructure/github/filters';
import { fetchAllStargazers } from '@infrastructure/github/stargazers';
import { getEmailConfig, sendEmail } from '@infrastructure/notification/email';
import {
  commitAndPush,
  readHistory,
  readStargazers,
  writeBadge,
  writeChart,
  writeCsv,
  writeHistory,
  writeHtmlReport,
  writeReport,
  writeStargazers,
} from '@infrastructure/persistence/storage';
import { generateBadge } from '@presentation/badge';
import { MIN_SNAPSHOTS_FOR_CHART } from '@presentation/constants';
import { generateCsvReport } from '@presentation/csv';
import { generateHtmlReport } from '@presentation/html';
import { generateMarkdownReport } from '@presentation/markdown';
import {
  generateComparisonSvgChart,
  generateForecastSvgChart,
  generatePerRepoSvgChart,
  generateSvgChart,
} from '@presentation/svg-chart';

interface WithDataDirParams {
  branch: string;
  fn: (dataDir: string) => Promise<void>;
}

async function withDataDir({ branch, fn }: WithDataDirParams): Promise<void> {
  const dataDir = initializeDataBranch(branch);
  try {
    await fn(dataDir);
  } finally {
    cleanup(dataDir);
  }
}

export async function trackStars(): Promise<void> {
  try {
    const config = loadConfig();
    const token = core.getInput('github-token', { required: true });
    const apiUrl = core.getInput('github-api-url') || process.env.GITHUB_API_URL || '';
    const octokit = github.getOctokit(token, ...(apiUrl ? [{ baseUrl: apiUrl }] : []));
    const t = getTranslations(config.locale);

    core.info('Fetching repositories...');

    const repos = await getRepos({ octokit, config });

    if (repos.length === 0) {
      core.warning('No repositories matched the configured filters');

      setEmptyOutputs();
      return;
    }

    await withDataDir({
      branch: config.dataBranch,
      fn: async (dataDir) => {
        core.info(`Tracking ${repos.length} repositories...`);

        const storedHistory = readHistory(dataDir);
        const lastSnapshot = getLastSnapshot(storedHistory);
        const previousTimestamp = lastSnapshot ? lastSnapshot.timestamp : null;

        core.info('Comparing star counts...');

        const results = compareStars({ currentRepos: repos, previousSnapshot: lastSnapshot });
        const { summary } = results;

        core.info(`Total: ${summary.totalStars} stars (${deltaIndicator(summary.totalDelta)})`);

        let repoStargazers: RepoStargazers[] = [];
        if (config.includeCharts || config.trackStargazers) {
          core.info('Fetching stargazers...');

          repoStargazers = await fetchAllStargazers({
            octokit,
            repos,
            smartSampling: config.smartSampling,
            smartSamplingThreshold: config.smartSamplingThreshold,
            smartSamplingPages: config.smartSamplingPages,
          });
        }

        let stargazerDiff = null;
        if (config.trackStargazers) {
          const previousMap = readStargazers(dataDir);

          stargazerDiff = diffStargazers({ current: repoStargazers, previousMap });

          writeStargazers({ dataDir, stargazerMap: buildStargazerMap(repoStargazers) });

          core.info(`Found ${stargazerDiff.totalNew} new stargazers`);
        }

        const snapshot = createSnapshot({ currentRepos: repos, summary });
        const updatedHistory = addSnapshot({
          history: storedHistory,
          snapshot,
          maxHistory: config.maxHistory,
        });

        const sorted = [...results.repos]
          .filter((repo) => !repo.isRemoved)
          .sort((repoA, repoB) => repoB.current - repoA.current);
        const topRepoNames = sorted.slice(0, config.topRepos).map((repo) => repo.fullName);

        const chartNow = new Date();
        const repoTotals = repos.map((repo) => ({
          fullName: repo.fullName,
          name: repo.name,
          owner: repo.owner,
          stars: repo.stars,
        }));

        const starHistory = config.includeCharts
          ? buildStarHistory({
              repoStargazers,
              repos: repoTotals,
              maxPoints: config.chartMaxPoints,
              now: chartNow,
            })
          : { snapshots: [] };
        const history =
          starHistory.snapshots.length >= MIN_SNAPSHOTS_FOR_CHART ? starHistory : updatedHistory;

        const forecastData = computeForecast({ history, topRepoNames });

        const reportParams = {
          results,
          previousTimestamp,
          locale: config.locale,
          history,
          includeCharts: config.includeCharts,
          stargazerDiff,
          forecastData,
          topRepos: config.topRepos,
          smoothing: config.chartSmoothing,
          curve: config.chartCurve,
          showPoints: config.chartShowPoints,
          milestones: config.chartMilestones,
          beginAtZero: config.chartBeginAtZero,
          theme: config.chartTheme,
          customMilestones: config.chartCustomMilestones,
          range: config.chartRange,
          trendLine: config.chartTrendLine,
          velocityMetrics: config.velocityMetrics,
        };
        const markdownReport = generateMarkdownReport(reportParams);
        const htmlReport = generateHtmlReport(reportParams);

        const csvReport = generateCsvReport(results);
        const badge = generateBadge({ totalStars: summary.totalStars, locale: config.locale });
        const thresholdReached = shouldNotify({
          totalStars: summary.totalStars,
          starsAtLastNotification: storedHistory.starsAtLastNotification,
          threshold: config.notificationThreshold,
        });
        const notify = summary.changed && thresholdReached;

        if (notify) {
          updatedHistory.starsAtLastNotification = summary.totalStars;
        }

        writeHistory({ dataDir, history: updatedHistory });
        writeReport({ dataDir, markdown: markdownReport });
        writeBadge({ dataDir, svg: badge });
        writeCsv({ dataDir, csv: csvReport });

        if (config.includeCharts && history.snapshots.length >= MIN_SNAPSHOTS_FOR_CHART) {
          const svgChart = generateSvgChart({
            history,
            title: t.report.starHistory,
            locale: config.locale,
            lineColor: config.chartLineColor,
            lineWidth: config.chartLineWidth,
            maxPoints: config.chartMaxPoints,
            yAxisSide: config.chartYAxisSide,
            smoothing: config.chartSmoothing,
            curve: config.chartCurve,
            showPoints: config.chartShowPoints,
            animate: config.chartAnimation,
            beginAtZero: config.chartBeginAtZero,
            theme: config.chartTheme,
            milestones: config.chartMilestones,
            customMilestones: config.chartCustomMilestones,
            range: config.chartRange,
            trendLine: config.chartTrendLine,
          });
          if (svgChart) {
            writeChart({ dataDir, filename: 'star-history.svg', svg: svgChart });
          }

          for (const repoName of topRepoNames) {
            const repoTotal = repoTotals.find((repo) => repo.fullName === repoName);
            const repoStarHistory = repoTotal
              ? buildStarHistory({
                  repoStargazers: repoStargazers.filter(
                    (stargazerEntry) => stargazerEntry.repoFullName === repoName,
                  ),
                  repos: [repoTotal],
                  maxPoints: config.chartMaxPoints,
                  now: chartNow,
                })
              : { snapshots: [] };
            // When this repo's stargazers were unreachable, the reconstructed global
            // history carries no real signal for it, so fall back to the stored
            // per-run snapshots, which hold observed counts.
            const repoHistory =
              repoStarHistory.snapshots.length >= MIN_SNAPSHOTS_FOR_CHART
                ? repoStarHistory
                : updatedHistory;
            const repoChart = generatePerRepoSvgChart({
              history: repoHistory,
              repoFullName: repoName,
              locale: config.locale,
              lineColor: config.chartLineColor,
              lineWidth: config.chartLineWidth,
              maxPoints: config.chartMaxPoints,
              yAxisSide: config.chartYAxisSide,
              smoothing: config.chartSmoothing,
              curve: config.chartCurve,
              showPoints: config.chartShowPoints,
              animate: config.chartAnimation,
              beginAtZero: config.chartBeginAtZero,
              theme: config.chartTheme,
              range: config.chartRange,
            });

            if (repoChart) {
              const filename = `${repoName.replace('/', '-')}.svg`;
              writeChart({ dataDir, filename, svg: repoChart });
            }
          }

          if (topRepoNames.length > 0) {
            const comparisonChart = generateComparisonSvgChart({
              history,
              repoNames: topRepoNames,
              title: t.report.topRepositories,
              locale: config.locale,
              lineWidth: config.chartLineWidth,
              maxPoints: config.chartMaxPoints,
              yAxisSide: config.chartYAxisSide,
              smoothing: config.chartSmoothing,
              curve: config.chartCurve,
              showPoints: config.chartShowPoints,
              animate: config.chartAnimation,
              beginAtZero: config.chartBeginAtZero,
              theme: config.chartTheme,
              range: config.chartRange,
            });

            if (comparisonChart) {
              writeChart({ dataDir, filename: 'comparison.svg', svg: comparisonChart });
            }
          }

          if (forecastData) {
            const forecastChart = generateForecastSvgChart({
              history,
              forecastData,
              locale: config.locale,
              lineColor: config.chartLineColor,
              lineWidth: config.chartLineWidth,
              maxPoints: config.chartMaxPoints,
              yAxisSide: config.chartYAxisSide,
              smoothing: config.chartSmoothing,
              curve: config.chartCurve,
              showPoints: config.chartShowPoints,
              animate: config.chartAnimation,
              beginAtZero: config.chartBeginAtZero,
              theme: config.chartTheme,
              range: config.chartRange,
            });

            if (forecastChart) {
              writeChart({ dataDir, filename: 'forecast.svg', svg: forecastChart });
            }
          }
        }

        const commitMsg = `Update star data: ${summary.totalStars} total (${deltaIndicator(summary.totalDelta)})`;
        commitAndPush({ dataDir, dataBranch: config.dataBranch, message: commitMsg, token });

        setOutputs({
          summary,
          markdownReport,
          htmlReport,
          csvReport,
          shouldNotify: notify,
          newStargazers: stargazerDiff?.totalNew ?? 0,
        });

        const emailConfig = getEmailConfig(config.locale);
        if (emailConfig && (notify || config.sendOnNoChanges)) {
          const subject = interpolate({
            template: t.email.subjectLine,
            params: {
              subject: t.email.subject,
              totalStars: summary.totalStars,
              delta: deltaIndicator(summary.totalDelta),
            },
          });

          try {
            await sendEmail({ emailConfig, subject, htmlBody: htmlReport });
          } catch (error) {
            core.warning(`Failed to send email: ${(error as Error).message}`);
          }
        } else if (emailConfig) {
          core.info('No star changes detected, skipping email');
        }
      },
    });
  } catch (error) {
    const err = error as Error;
    core.setFailed(`Star Tracker failed: ${err.message}`);

    if (err.stack) core.debug(err.stack);
  }
}

function setEmptyOutputs(): void {
  core.setOutput('total-stars', '0');
  core.setOutput('stars-changed', 'false');
  core.setOutput('new-stars', '0');
  core.setOutput('lost-stars', '0');
  core.setOutput('should-notify', 'false');
  core.setOutput('new-stargazers', '0');
  core.setOutput('report', 'No repositories matched the configured filters.');
  const htmlReport = '<p>No repositories matched the configured filters.</p>';
  core.setOutput('report-html', htmlReport);
  core.setOutput('report-html-path', writeHtmlReport({ htmlReport }));
  core.setOutput('report-csv', '');
}

interface SetOutputsParams {
  summary: Summary;
  markdownReport: string;
  htmlReport: string;
  csvReport: string;
  shouldNotify: boolean;
  newStargazers: number;
}

function setOutputs({
  summary,
  markdownReport,
  htmlReport,
  csvReport,
  shouldNotify,
  newStargazers,
}: SetOutputsParams): void {
  core.setOutput('report', markdownReport);
  core.setOutput('report-html', htmlReport);
  core.setOutput('report-html-path', writeHtmlReport({ htmlReport }));
  core.setOutput('report-csv', csvReport);
  core.setOutput('total-stars', String(summary.totalStars));
  core.setOutput('stars-changed', String(summary.changed));
  core.setOutput('new-stars', String(summary.newStars));
  core.setOutput('lost-stars', String(summary.lostStars));
  core.setOutput('should-notify', String(shouldNotify));
  core.setOutput('new-stargazers', String(newStargazers));
}
