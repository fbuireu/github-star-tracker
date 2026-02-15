import * as core from '@actions/core';
import * as github from '@actions/github';
import { loadConfig } from '@config/loader';
import { compareStars, createSnapshot } from '@domain/comparison';
import { computeForecast } from '@domain/forecast';
import { deltaIndicator } from '@domain/formatting';
import { shouldNotify } from '@domain/notification';
import { addSnapshot, getLastSnapshot } from '@domain/snapshot';
import { buildStargazerMap, diffStargazers } from '@domain/stargazers';
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
  writeHistory,
  writeReport,
  writeStargazers,
} from '@infrastructure/persistence/storage';
import { generateBadge } from '@presentation/badge';
import { MIN_SNAPSHOTS_FOR_CHART } from '@presentation/constants';
import { generateHtmlReport } from '@presentation/html';
import { generateMarkdownReport } from '@presentation/markdown';
import {
  generateComparisonSvgChart,
  generateForecastSvgChart,
  generatePerRepoSvgChart,
  generateSvgChart,
} from '@presentation/svg-chart';

async function withDataDir(branch: string, fn: (dataDir: string) => Promise<void>): Promise<void> {
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
    const octokit = github.getOctokit(token);
    const t = getTranslations(config.locale);

    core.info('Fetching repositories...');
    const repos = await getRepos({ octokit, config });

    if (repos.length === 0) {
      core.warning('No repositories matched the configured filters');
      setEmptyOutputs();
      return;
    }

    await withDataDir(config.dataBranch, async (dataDir) => {
      core.info(`Tracking ${repos.length} repositories...`);

      const history = readHistory(dataDir);
      const lastSnapshot = getLastSnapshot(history);
      const previousTimestamp = lastSnapshot ? lastSnapshot.timestamp : null;

      core.info('Comparing star counts...');
      const results = compareStars({ currentRepos: repos, previousSnapshot: lastSnapshot });
      const { summary } = results;

      core.info(`Total: ${summary.totalStars} stars (${deltaIndicator(summary.totalDelta)})`);

      let stargazerDiff = null;
      if (config.trackStargazers) {
        core.info('Fetching stargazers...');
        const repoStargazers = await fetchAllStargazers({ octokit, repos });
        const previousMap = readStargazers(dataDir);
        stargazerDiff = diffStargazers({ current: repoStargazers, previousMap });
        const updatedMap = buildStargazerMap(repoStargazers);
        writeStargazers({ dataDir, stargazerMap: updatedMap });
        core.info(`Found ${stargazerDiff.totalNew} new stargazers`);
      }

      const sorted = [...results.repos]
        .filter((r) => !r.isRemoved)
        .sort((a, b) => b.current - a.current);
      const topRepoNames = sorted.slice(0, config.topRepos).map((r) => r.fullName);
      const forecastData = computeForecast({ history, topRepoNames });

      const markdownReport = generateMarkdownReport({
        results,
        previousTimestamp,
        locale: config.locale,
        history,
        includeCharts: config.includeCharts,
        stargazerDiff,
        forecastData,
        topRepos: config.topRepos,
      });
      const htmlReport = generateHtmlReport({
        results,
        previousTimestamp,
        locale: config.locale,
        history,
        includeCharts: config.includeCharts,
        stargazerDiff,
        forecastData,
        topRepos: config.topRepos,
      });

      const badge = generateBadge({ totalStars: summary.totalStars, locale: config.locale });
      const snapshot = createSnapshot({ currentRepos: repos, summary });
      const updatedHistory = addSnapshot({ history, snapshot, maxHistory: config.maxHistory });

      const thresholdReached = shouldNotify({
        totalStars: summary.totalStars,
        starsAtLastNotification: history.starsAtLastNotification,
        threshold: config.notificationThreshold,
      });
      const notify = summary.changed && thresholdReached;

      if (notify) {
        updatedHistory.starsAtLastNotification = summary.totalStars;
      }

      writeHistory({ dataDir, history: updatedHistory });
      writeReport({ dataDir, markdown: markdownReport });
      writeBadge({ dataDir, svg: badge });

      if (config.includeCharts && history.snapshots.length >= MIN_SNAPSHOTS_FOR_CHART) {
        const svgChart = generateSvgChart({
          history,
          title: t.report.starHistory,
          locale: config.locale,
        });
        if (svgChart) {
          writeChart({ dataDir, filename: 'star-history.svg', svg: svgChart });
        }

        for (const repoName of topRepoNames) {
          const repoChart = generatePerRepoSvgChart({
            history,
            repoFullName: repoName,
            locale: config.locale,
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
          });
          if (forecastChart) {
            writeChart({ dataDir, filename: 'forecast.svg', svg: forecastChart });
          }
        }
      }

      const commitMsg = `Update star data — ${summary.totalStars} total (${deltaIndicator(summary.totalDelta)})`;
      commitAndPush({ dataDir, dataBranch: config.dataBranch, message: commitMsg });

      setOutputs({
        summary,
        markdownReport,
        htmlReport,
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
  core.setOutput('report-html', '<p>No repositories matched the configured filters.</p>');
}

interface SetOutputsParams {
  summary: Summary;
  markdownReport: string;
  htmlReport: string;
  shouldNotify: boolean;
  newStargazers: number;
}

function setOutputs({
  summary,
  markdownReport,
  htmlReport,
  shouldNotify,
  newStargazers,
}: SetOutputsParams): void {
  core.setOutput('report', markdownReport);
  core.setOutput('report-html', htmlReport);
  core.setOutput('total-stars', String(summary.totalStars));
  core.setOutput('stars-changed', String(summary.changed));
  core.setOutput('new-stars', String(summary.newStars));
  core.setOutput('lost-stars', String(summary.lostStars));
  core.setOutput('should-notify', String(shouldNotify));
  core.setOutput('new-stargazers', String(newStargazers));
}
