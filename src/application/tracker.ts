import * as core from '@actions/core';
import * as github from '@actions/github';
import { loadConfig } from '@config/loader';
import { EMPTY_SUMMARY, topRepositories } from '@domain/comparison';
import { computeForecast } from '@domain/forecast';
import { deltaIndicator } from '@domain/formatting';
import { measureRun } from '@domain/measurement';
import { Delivery, notificationIsDue, settleNotification } from '@domain/notification';
import {
  buildStargazerMap,
  diffStargazers,
  type RepoStargazers,
  type StargazerMap,
} from '@domain/stargazers';
import type { Summary } from '@domain/types';
import { getRepos } from '@infrastructure/github/filters';
import { fetchAllStargazers } from '@infrastructure/github/stargazers';
import { getEmailConfig, sendEmail } from '@infrastructure/notification/email';
import { withDataBranch } from '@infrastructure/persistence/data-branch';
import { writeHtmlReport } from '@infrastructure/persistence/storage';
import { retry } from '@octokit/plugin-retry';
import { resolveChartHistories } from '@presentation/charts';
import type { RenderedRun } from '@presentation/run';
import { renderEmptyRun, renderRun } from '@presentation/run';

export async function trackStars(): Promise<void> {
  try {
    const config = loadConfig();
    const token = core.getInput('github-token', { required: true });
    const apiUrl = core.getInput('github-api-url') || process.env.GITHUB_API_URL || '';
    const octokit = github.getOctokit(token, apiUrl ? { baseUrl: apiUrl } : undefined, retry);

    core.info('Fetching repositories...');

    const repos = await getRepos({ octokit, config });

    if (repos.length === 0) {
      core.warning('No repositories matched the configured filters');

      setOutputs({ summary: EMPTY_SUMMARY, rendered: renderEmptyRun(config), newStargazers: 0 });
      return;
    }

    await withDataBranch({
      dataBranch: config.dataBranch,
      readOnly: config.readOnly,
      token,
      run: async (branch) => {
        core.info(`Tracking ${repos.length} repositories...`);

        const storedHistory = branch.readHistory();
        const measurement = measureRun({
          trackedSet: repos,
          storedHistory,
          comparisonWindow: config.compareAgainst,
          maxHistory: config.maxHistory,
          notificationThreshold: config.notificationThreshold,
          notificationMode: config.notificationMode,
        });
        const { results, summary, updatedHistory } = measurement;
        const previousTimestamp = measurement.baselineTimestamp;

        core.info(`Comparing star counts (baseline: ${previousTimestamp ?? 'first run'})...`);
        core.info(`Total: ${summary.totalStars} stars (${deltaIndicator(summary.totalDelta)})`);

        if (measurement.droppedSnapshots > 0) {
          core.warning(
            `max-history is ${config.maxHistory} but ${storedHistory.snapshots.length} snapshots are stored, so this run drops the oldest ${measurement.droppedSnapshots}. Raise max-history before this run if you want to keep them.`,
          );
        }

        let repoStargazers: RepoStargazers[] = [];
        if (config.includeCharts || config.trackStargazers) {
          core.info('Fetching stargazers...');

          repoStargazers = await fetchAllStargazers({ octokit, repos, config });
        }

        let stargazerDiff = null;
        let stargazerMap: StargazerMap | undefined;

        if (config.trackStargazers) {
          const previousMap = branch.readStargazers();

          stargazerDiff = diffStargazers({ current: repoStargazers, previousMap });
          stargazerMap = buildStargazerMap({ repoStargazers, previousMap });

          core.info(`Found ${stargazerDiff.totalNew} new stargazers`);
        }

        const topRepoNames = topRepositories({ repos: results.repos, limit: config.topRepos });

        const chartHistories = resolveChartHistories({
          config,
          storedHistory: updatedHistory,
          repos: repos.map(({ fullName, name, owner, stars }) => ({
            fullName,
            name,
            owner,
            stars,
          })),
          repoStargazers,
        });
        const forecastData = computeForecast({
          history: chartHistories.aggregate,
          topRepoNames,
          historyForRepo: chartHistories.forRepo,
        });

        const rendered = renderRun({
          config,
          results,
          previousTimestamp,
          chartHistories,
          storedHistory: updatedHistory,
          stargazerDiff,
          forecastData,
        });
        const notify = notificationIsDue({
          changed: summary.changed,
          thresholdReached: measurement.thresholdReached,
        });

        const emailConfig = getEmailConfig(config.locale);
        let delivery: Delivery = Delivery.NOT_ATTEMPTED;

        if (emailConfig && (notify || config.sendOnNoChanges)) {
          try {
            const sent = await sendEmail({
              emailConfig,
              subject: rendered.emailSubject,
              htmlBody: rendered.html,
            });

            delivery = sent ? Delivery.SENT : Delivery.FAILED;
          } catch (error) {
            core.warning(`Failed to send email: ${(error as Error).message}`);
            delivery = Delivery.FAILED;
          }
        } else if (emailConfig) {
          core.info(
            summary.changed
              ? 'Notification threshold not reached, skipping email'
              : 'No stars changed since the baseline, skipping email',
          );
        }

        const notification = settleNotification({
          changed: summary.changed,
          thresholdReached: measurement.thresholdReached,
          delivery,
          history: updatedHistory,
          totalStars: summary.totalStars,
        });

        branch.publish({
          history: notification.historyToPersist,
          stargazerMap,
          report: rendered.markdown,
          badge: rendered.badge,
          csv: rendered.csv,
          charts: rendered.charts,
          commitMessage: `Update star data: ${summary.totalStars} total (${deltaIndicator(summary.totalDelta)})`,
        });

        setOutputs({
          summary,
          rendered,
          shouldNotify: notification.shouldNotify,
          notificationSent: notification.notificationSent,
          newStargazers: stargazerDiff?.totalNew ?? 0,
        });
      },
    });
  } catch (error) {
    const err = error as Error;
    core.setFailed(`Star Tracker failed: ${err.message}`);

    if (err.stack) core.debug(err.stack);
  }
}

interface SetOutputsParams {
  summary: Summary;
  rendered: RenderedRun;
  shouldNotify?: boolean;
  notificationSent?: boolean;
  newStargazers: number;
}

function setOutputs({
  summary,
  rendered,
  shouldNotify = false,
  notificationSent = false,
  newStargazers,
}: SetOutputsParams): void {
  core.setOutput('report', rendered.markdown);
  core.setOutput('report-html', rendered.html);
  core.setOutput('report-html-path', writeHtmlReport({ htmlReport: rendered.html }));
  core.setOutput('report-csv', rendered.csv);
  core.setOutput('total-stars', String(summary.totalStars));
  core.setOutput('stars-changed', String(summary.changed));
  core.setOutput('new-stars', String(summary.newStars));
  core.setOutput('lost-stars', String(summary.lostStars));
  core.setOutput('should-notify', String(shouldNotify));
  core.setOutput('notification-sent', String(notificationSent));
  core.setOutput('new-stargazers', String(newStargazers));
}
