import * as core from '@actions/core';
import * as github from '@actions/github';
import { loadConfig } from '@config/loader';
import { compareStars, createSnapshot } from '@domain/comparison';
import { deltaIndicator } from '@domain/formatting';
import { addSnapshot, getLastSnapshot } from '@domain/snapshot';
import type { Summary } from '@domain/types';
import { getTranslations, interpolate } from '@i18n';
import { cleanup, initializeDataBranch } from '@infrastructure/git/worktree';
import { getRepos } from '@infrastructure/github/filters';
import { getEmailConfig, sendEmail } from '@infrastructure/notification/email';
import {
  commitAndPush,
  readHistory,
  writeBadge,
  writeHistory,
  writeReport,
} from '@infrastructure/persistence/storage';
import { generateBadge } from '@presentation/badge';
import { generateHtmlReport } from '@presentation/html';
import { generateMarkdownReport } from '@presentation/markdown';

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

      const markdownReport = generateMarkdownReport({
        results,
        previousTimestamp,
        locale: config.locale,
        history,
        includeCharts: config.includeCharts,
      });
      const htmlReport = generateHtmlReport({
        results,
        previousTimestamp,
        locale: config.locale,
        history,
        includeCharts: config.includeCharts,
      });

      const badge = generateBadge({ totalStars: summary.totalStars, locale: config.locale });
      const snapshot = createSnapshot({ currentRepos: repos, summary });
      const updatedHistory = addSnapshot({ history, snapshot, maxHistory: config.maxHistory });

      writeHistory({ dataDir, history: updatedHistory });
      writeReport({ dataDir, markdown: markdownReport });
      writeBadge({ dataDir, svg: badge });

      const commitMsg = `Update star data — ${summary.totalStars} total (${deltaIndicator(summary.totalDelta)})`;
      commitAndPush({ dataDir, dataBranch: config.dataBranch, message: commitMsg });

      setOutputs(summary, markdownReport, htmlReport);

      const emailConfig = getEmailConfig(config.locale);
      if (emailConfig && (summary.changed || config.sendOnNoChanges)) {
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
  core.setOutput('report', 'No repositories matched the configured filters.');
  core.setOutput('report-html', '<p>No repositories matched the configured filters.</p>');
}

function setOutputs(summary: Summary, markdownReport: string, htmlReport: string): void {
  core.setOutput('report', markdownReport);
  core.setOutput('report-html', htmlReport);
  core.setOutput('total-stars', String(summary.totalStars));
  core.setOutput('stars-changed', String(summary.changed));
  core.setOutput('new-stars', String(summary.newStars));
  core.setOutput('lost-stars', String(summary.lostStars));
}
