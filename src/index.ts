import * as core from '@actions/core';
import * as github from '@actions/github';
import { loadConfig } from './config';
import { getRepos } from './repos';
import { compareStars, createSnapshot } from './stars';
import { generateMarkdownReport, generateHtmlReport } from './report';
import { generateBadge } from './badge';
import { getEmailConfig, sendEmail } from './email';
import {
  initDataBranch,
  readHistory,
  getLastSnapshot,
  writeHistory,
  writeReport,
  writeBadge,
  commitAndPush,
  cleanup,
} from './data-branch';

let dataDir: string | null = null;

try {
  const token = core.getInput('github-token', { required: true });
  const octokit = github.getOctokit(token);
  const config = loadConfig();

  core.info('Fetching repositories...');
  const repos = await getRepos({ octokit, config });

  if (repos.length === 0) {
    core.warning('No repositories matched the configured filters');
    core.setOutput('total-stars', '0');
    core.setOutput('stars-changed', 'false');
    core.setOutput('new-stars', '0');
    core.setOutput('lost-stars', '0');
    core.setOutput('report', 'No repositories matched the configured filters.');
    core.setOutput('report-html', '<p>No repositories matched the configured filters.</p>');
  } else {
    core.info(`Tracking ${repos.length} repositories...`);

    core.info('Initializing data branch...');
    dataDir = initDataBranch(config.dataBranch);

    const history = readHistory(dataDir);
    const lastSnapshot = getLastSnapshot(history);
    const previousTimestamp = lastSnapshot ? lastSnapshot.timestamp : null;

    core.info('Comparing star counts...');
    const results = compareStars({ currentRepos: repos, previousSnapshot: lastSnapshot });
    const { summary } = results;

    core.info(
      `Total: ${summary.totalStars} stars (${summary.totalDelta >= 0 ? '+' : ''}${summary.totalDelta})`,
    );

    const markdownReport = generateMarkdownReport({ results, previousTimestamp });
    const htmlReport = generateHtmlReport({ results, previousTimestamp });
    const badge = generateBadge(summary.totalStars);

    const snapshot = createSnapshot({ currentRepos: repos, summary });
    history.snapshots.push(snapshot);

    writeHistory({ dataDir, history, maxHistory: config.maxHistory });
    writeReport({ dataDir, markdown: markdownReport });
    writeBadge({ dataDir, svg: badge });

    const commitMsg = `Update star data — ${summary.totalStars} total (${summary.totalDelta >= 0 ? '+' : ''}${summary.totalDelta})`;
    commitAndPush({ dataDir, dataBranch: config.dataBranch, message: commitMsg });

    core.setOutput('report', markdownReport);
    core.setOutput('report-html', htmlReport);
    core.setOutput('total-stars', String(summary.totalStars));
    core.setOutput('stars-changed', String(summary.changed));
    core.setOutput('new-stars', String(summary.newStars));
    core.setOutput('lost-stars', String(summary.lostStars));

    const emailConfig = getEmailConfig();
    if (emailConfig) {
      if (summary.changed || config.sendOnNoChanges) {
        const subject = `Star Tracker: ${summary.totalStars} total stars (${summary.totalDelta >= 0 ? '+' : ''}${summary.totalDelta})`;
        try {
          await sendEmail({ emailConfig, subject, htmlBody: htmlReport });
        } catch (error) {
          core.warning(`Failed to send email: ${(error as Error).message}`);
        }
      } else {
        core.info('No star changes detected, skipping email');
      }
    }
  }
} catch (error) {
  const err = error as Error;
  core.setFailed(`Star Tracker failed: ${err.message}`);
  if (err.stack) {
    core.debug(err.stack);
  }
} finally {
  if (dataDir) {
    cleanup(dataDir);
  }
}
