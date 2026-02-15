import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@actions/core', () => ({
  getInput: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  setFailed: vi.fn(),
  debug: vi.fn(),
  setOutput: vi.fn(),
}));

vi.mock('@actions/github', () => ({
  getOctokit: vi.fn(() => ({})),
}));

vi.mock('@config/loader', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('@domain/comparison', () => ({
  compareStars: vi.fn(),
  createSnapshot: vi.fn(),
}));

vi.mock('@domain/forecast', () => ({
  computeForecast: vi.fn(),
}));

vi.mock('@domain/stargazers', () => ({
  diffStargazers: vi.fn(),
  buildStargazerMap: vi.fn(),
}));

vi.mock('@domain/formatting', () => ({
  deltaIndicator: vi.fn(),
}));

vi.mock('@domain/notification', () => ({
  shouldNotify: vi.fn(),
}));

vi.mock('@domain/snapshot', () => ({
  getLastSnapshot: vi.fn(),
  addSnapshot: vi.fn(),
}));

vi.mock('@i18n', () => ({
  getTranslations: vi.fn(),
  interpolate: ({
    template,
    params,
  }: {
    template: string;
    params: Record<string, string | number>;
  }) =>
    template.replace(/\{(\w+)\}/g, (_, key: string) =>
      key in params ? String(params[key]) : `{${key}}`,
    ),
}));

vi.mock('@infrastructure/github/filters', () => ({
  getRepos: vi.fn(),
}));

vi.mock('@infrastructure/github/stargazers', () => ({
  fetchAllStargazers: vi.fn(),
}));

vi.mock('@infrastructure/git/worktree', () => ({
  initializeDataBranch: vi.fn(),
  cleanup: vi.fn(),
}));

vi.mock('@infrastructure/persistence/storage', () => ({
  readHistory: vi.fn(),
  readStargazers: vi.fn(),
  writeHistory: vi.fn(),
  writeReport: vi.fn(),
  writeBadge: vi.fn(),
  writeChart: vi.fn(),
  writeCsv: vi.fn(),
  writeStargazers: vi.fn(),
  commitAndPush: vi.fn(),
}));

vi.mock('@infrastructure/notification/email', () => ({
  getEmailConfig: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock('@presentation/badge', () => ({
  generateBadge: vi.fn(),
}));

vi.mock('@presentation/csv', () => ({
  generateCsvReport: vi.fn(),
}));

vi.mock('@presentation/html', () => ({
  generateHtmlReport: vi.fn(),
}));

vi.mock('@presentation/markdown', () => ({
  generateMarkdownReport: vi.fn(),
}));

vi.mock('@presentation/svg-chart', () => ({
  generateSvgChart: vi.fn(),
}));

import * as core from '@actions/core';
import * as github from '@actions/github';
import { loadConfig } from '@config/loader';
import { Visibility } from '@config/types';
import { compareStars, createSnapshot } from '@domain/comparison';
import { computeForecast } from '@domain/forecast';
import { deltaIndicator } from '@domain/formatting';
import { shouldNotify } from '@domain/notification';
import { addSnapshot, getLastSnapshot } from '@domain/snapshot';
import { buildStargazerMap, diffStargazers } from '@domain/stargazers';
import { getTranslations } from '@i18n';
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
  writeReport,
  writeStargazers,
} from '@infrastructure/persistence/storage';
import { generateBadge } from '@presentation/badge';
import { generateCsvReport } from '@presentation/csv';
import { generateHtmlReport } from '@presentation/html';
import { generateMarkdownReport } from '@presentation/markdown';
import { generateSvgChart } from '@presentation/svg-chart';
import { trackStars } from './tracker';

const defaultConfig = {
  visibility: Visibility.ALL,
  includeArchived: false,
  includeForks: false,
  excludeRepos: [],
  onlyRepos: [],
  minStars: 0,
  dataBranch: 'star-data',
  maxHistory: 52,
  sendOnNoChanges: false,
  includeCharts: true,
  locale: 'en' as const,
  notificationThreshold: 0,
  trackStargazers: false,
  topRepos: 10,
};

const defaultSummary = {
  totalStars: 100,
  totalPrevious: 90,
  totalDelta: 10,
  newStars: 12,
  lostStars: 2,
  changed: true,
};

const defaultRepos = [
  {
    owner: 'user',
    name: 'repo-a',
    fullName: 'user/repo-a',
    private: false,
    archived: false,
    fork: false,
    stars: 60,
  },
  {
    owner: 'user',
    name: 'repo-b',
    fullName: 'user/repo-b',
    private: false,
    archived: false,
    fork: false,
    stars: 40,
  },
];

const defaultHistory = { snapshots: [] };
const defaultSnapshot = { timestamp: '2026-01-01T00:00:00Z', totalStars: 100, repos: [] };
const defaultUpdatedHistory = { snapshots: [defaultSnapshot] };
const defaultResults = { repos: [], summary: defaultSummary };
const defaultTranslations = {
  badge: { totalStars: 'Total Stars' },
  report: {
    title: 'Star Report',
    total: 'Total',
    change: 'Change',
    comparedTo: 'Compared to',
    firstRun: 'First run',
    repositories: 'Repositories',
    stars: 'Stars',
    starsCount: '{count} stars',
    trend: 'Trend',
    newRepositories: 'New',
    removedRepositories: 'Removed',
    removedRepoText: '{name} — was {count} stars',
    summary: 'Summary',
    starsGained: 'Stars gained',
    starsLost: 'Stars lost',
    netChange: 'Net change',
    starTrend: 'Star Trend',
    starHistory: 'Star History',
    topRepositories: 'Top Repos',
    byRepository: 'By Repo',
    individualRepoCharts: 'Individual Repository Charts',
    badges: { new: 'NEW' },
  },
  email: {
    subject: 'Star Report',
    subjectLine: '{subject}: {totalStars} ({delta})',
    defaultFrom: 'noreply@example.com',
  },
  trends: { up: 'Up', down: 'Down', stable: 'Stable' },
  footer: { generated: 'Generated by {project} on {date}', madeBy: 'Made by {author}' },
  stargazers: {
    sectionTitle: 'New Stargazers',
    newStargazers: '{count} new stargazers since last run',
    starredOn: 'starred on {date}',
    noNewStargazers: 'No new stargazers since last run',
    stargazerCount: '{count} new',
  },
  forecast: {
    sectionTitle: 'Growth Forecast',
    predictedStars: 'Predicted Stars',
    week: 'Week {n}',
    linearRegression: 'Linear Regression',
    weightedMovingAverage: 'Weighted Moving Average',
    aggregate: 'Aggregate Forecast',
    byRepository: 'By Repository',
    insufficientData: 'Not enough data',
    method: 'Method',
    predicted: 'Predicted',
  },
};

function setupDefaults() {
  vi.mocked(core.getInput).mockImplementation((name: string) => {
    if (name === 'github-token') return 'fake-token';
    return '';
  });
  vi.mocked(loadConfig).mockReturnValue(defaultConfig);
  vi.mocked(getTranslations).mockReturnValue(defaultTranslations);
  vi.mocked(getRepos).mockResolvedValue(defaultRepos);
  vi.mocked(initializeDataBranch).mockReturnValue('.star-data');
  vi.mocked(readHistory).mockReturnValue(defaultHistory);
  vi.mocked(getLastSnapshot).mockReturnValue(null);
  vi.mocked(compareStars).mockReturnValue(defaultResults);
  vi.mocked(deltaIndicator).mockReturnValue('+10');
  vi.mocked(generateMarkdownReport).mockReturnValue('# MD Report');
  vi.mocked(generateHtmlReport).mockReturnValue('<p>HTML</p>');
  vi.mocked(generateBadge).mockReturnValue('<svg>badge</svg>');
  vi.mocked(createSnapshot).mockReturnValue(defaultSnapshot);
  vi.mocked(addSnapshot).mockReturnValue({ ...defaultUpdatedHistory });
  vi.mocked(shouldNotify).mockReturnValue(true);
  vi.mocked(getEmailConfig).mockReturnValue(null);
  vi.mocked(sendEmail).mockResolvedValue(true);
  vi.mocked(computeForecast).mockReturnValue(null);
  vi.mocked(generateCsvReport).mockReturnValue('repository,owner,name,stars,previous,delta,status');
  vi.mocked(generateSvgChart).mockReturnValue(null);
  vi.mocked(fetchAllStargazers).mockResolvedValue([]);
  vi.mocked(readStargazers).mockReturnValue({});
  vi.mocked(diffStargazers).mockReturnValue({ entries: [], totalNew: 0 });
  vi.mocked(buildStargazerMap).mockReturnValue({});
}

describe('trackStars', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaults();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs the full happy path', async () => {
    await trackStars();

    expect(loadConfig).toHaveBeenCalled();
    expect(getRepos).toHaveBeenCalled();
    expect(initializeDataBranch).toHaveBeenCalledWith('star-data');
    expect(readHistory).toHaveBeenCalledWith('.star-data');
    expect(compareStars).toHaveBeenCalled();
    expect(generateMarkdownReport).toHaveBeenCalled();
    expect(generateHtmlReport).toHaveBeenCalled();
    expect(generateBadge).toHaveBeenCalled();
    expect(writeHistory).toHaveBeenCalled();
    expect(writeReport).toHaveBeenCalled();
    expect(writeBadge).toHaveBeenCalled();
    expect(writeCsv).toHaveBeenCalled();
    expect(commitAndPush).toHaveBeenCalled();
    expect(core.setOutput).toHaveBeenCalled();
  });

  it('sets empty outputs and returns early when no repos match', async () => {
    vi.mocked(getRepos).mockResolvedValue([]);

    await trackStars();

    expect(core.warning).toHaveBeenCalledWith('No repositories matched the configured filters');
    expect(core.setOutput).toHaveBeenCalledWith('total-stars', '0');
    expect(core.setOutput).toHaveBeenCalledWith('stars-changed', 'false');
    expect(core.setOutput).toHaveBeenCalledWith('new-stars', '0');
    expect(core.setOutput).toHaveBeenCalledWith('lost-stars', '0');
    expect(initializeDataBranch).not.toHaveBeenCalled();
  });

  describe('email', () => {
    const emailConfig = {
      host: 'smtp.test.com',
      port: 587,
      username: 'user',
      password: 'pass',
      to: 'to@test.com',
      from: 'from@test.com',
    };

    it('sends email when changes are detected', async () => {
      vi.mocked(getEmailConfig).mockReturnValue(emailConfig);

      await trackStars();

      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ emailConfig, htmlBody: '<p>HTML</p>' }),
      );
    });

    it('sends email when no changes but sendOnNoChanges is true', async () => {
      vi.mocked(loadConfig).mockReturnValue({ ...defaultConfig, sendOnNoChanges: true });
      vi.mocked(compareStars).mockReturnValue({
        ...defaultResults,
        summary: { ...defaultSummary, changed: false },
      });
      vi.mocked(getEmailConfig).mockReturnValue(emailConfig);

      await trackStars();

      expect(sendEmail).toHaveBeenCalled();
    });

    it('skips email when no changes and sendOnNoChanges is false', async () => {
      vi.mocked(compareStars).mockReturnValue({
        ...defaultResults,
        summary: { ...defaultSummary, changed: false },
      });
      vi.mocked(getEmailConfig).mockReturnValue(emailConfig);

      await trackStars();

      expect(sendEmail).not.toHaveBeenCalled();
      expect(core.info).toHaveBeenCalledWith('No star changes detected, skipping email');
    });

    it('skips email when threshold is not reached', async () => {
      vi.mocked(loadConfig).mockReturnValue({ ...defaultConfig, notificationThreshold: 10 });
      vi.mocked(shouldNotify).mockReturnValue(false);
      vi.mocked(getEmailConfig).mockReturnValue(emailConfig);

      await trackStars();

      expect(sendEmail).not.toHaveBeenCalled();
      expect(core.setOutput).toHaveBeenCalledWith('should-notify', 'false');
    });

    it('sends email when threshold is reached', async () => {
      vi.mocked(loadConfig).mockReturnValue({ ...defaultConfig, notificationThreshold: 5 });
      vi.mocked(shouldNotify).mockReturnValue(true);
      vi.mocked(getEmailConfig).mockReturnValue(emailConfig);

      await trackStars();

      expect(sendEmail).toHaveBeenCalled();
      expect(core.setOutput).toHaveBeenCalledWith('should-notify', 'true');
    });

    it('skips email when getEmailConfig returns null', async () => {
      vi.mocked(getEmailConfig).mockReturnValue(null);

      await trackStars();

      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('catches email errors and logs a warning', async () => {
      vi.mocked(getEmailConfig).mockReturnValue(emailConfig);
      vi.mocked(sendEmail).mockRejectedValue(new Error('SMTP timeout'));

      await trackStars();

      expect(core.warning).toHaveBeenCalledWith('Failed to send email: SMTP timeout');
      expect(core.setFailed).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('calls setFailed on top-level error', async () => {
      vi.mocked(loadConfig).mockImplementation(() => {
        throw new Error('config broken');
      });

      await trackStars();

      expect(core.setFailed).toHaveBeenCalledWith('Star Tracker failed: config broken');
    });

    it('logs stack trace on error via debug', async () => {
      const err = new Error('boom');
      err.stack = 'Error: boom\n    at test.ts:1';
      vi.mocked(loadConfig).mockImplementation(() => {
        throw err;
      });

      await trackStars();

      expect(core.debug).toHaveBeenCalledWith('Error: boom\n    at test.ts:1');
    });

    it('runs cleanup even when the callback throws', async () => {
      vi.mocked(readHistory).mockImplementation(() => {
        throw new Error('read failed');
      });

      await trackStars();

      expect(cleanup).toHaveBeenCalledWith('.star-data');
    });
  });

  describe('outputs', () => {
    it('sets all outputs correctly', async () => {
      await trackStars();

      expect(core.setOutput).toHaveBeenCalledWith('report', '# MD Report');
      expect(core.setOutput).toHaveBeenCalledWith('report-html', '<p>HTML</p>');
      expect(core.setOutput).toHaveBeenCalledWith('total-stars', '100');
      expect(core.setOutput).toHaveBeenCalledWith('stars-changed', 'true');
      expect(core.setOutput).toHaveBeenCalledWith('new-stars', '12');
      expect(core.setOutput).toHaveBeenCalledWith('lost-stars', '2');
      expect(core.setOutput).toHaveBeenCalledWith('should-notify', 'true');
      expect(core.setOutput).toHaveBeenCalledWith('new-stargazers', '0');
    });

    it('sets default outputs for empty repos', async () => {
      vi.mocked(getRepos).mockResolvedValue([]);

      await trackStars();

      expect(core.setOutput).toHaveBeenCalledWith(
        'report',
        'No repositories matched the configured filters.',
      );
      expect(core.setOutput).toHaveBeenCalledWith(
        'report-html',
        '<p>No repositories matched the configured filters.</p>',
      );
      expect(core.setOutput).toHaveBeenCalledWith('should-notify', 'false');
      expect(core.setOutput).toHaveBeenCalledWith('new-stargazers', '0');
    });
  });

  describe('stargazer tracking', () => {
    it('skips stargazer fetch when trackStargazers is false', async () => {
      await trackStars();

      expect(fetchAllStargazers).not.toHaveBeenCalled();
      expect(readStargazers).not.toHaveBeenCalled();
    });

    it('fetches and diffs stargazers when trackStargazers is true', async () => {
      vi.mocked(loadConfig).mockReturnValue({ ...defaultConfig, trackStargazers: true });
      vi.mocked(diffStargazers).mockReturnValue({ entries: [], totalNew: 3 });

      await trackStars();

      expect(fetchAllStargazers).toHaveBeenCalled();
      expect(readStargazers).toHaveBeenCalledWith('.star-data');
      expect(diffStargazers).toHaveBeenCalled();
      expect(buildStargazerMap).toHaveBeenCalled();
      expect(writeStargazers).toHaveBeenCalled();
      expect(core.setOutput).toHaveBeenCalledWith('new-stargazers', '3');
    });
  });

  describe('svg chart', () => {
    it('generates and writes SVG chart when history has enough snapshots', async () => {
      const historyWithSnapshots = {
        snapshots: [
          { timestamp: '2026-01-01T00:00:00Z', totalStars: 80, repos: [] },
          { timestamp: '2026-01-02T00:00:00Z', totalStars: 100, repos: [] },
        ],
      };
      vi.mocked(readHistory).mockReturnValue(historyWithSnapshots);
      vi.mocked(generateSvgChart).mockReturnValue('<svg>chart</svg>');

      await trackStars();

      expect(generateSvgChart).toHaveBeenCalledWith(
        expect.objectContaining({ history: historyWithSnapshots, locale: 'en' }),
      );
      expect(writeChart).toHaveBeenCalledWith({
        dataDir: '.star-data',
        filename: 'star-history.svg',
        svg: '<svg>chart</svg>',
      });
    });

    it('skips SVG chart when includeCharts is false', async () => {
      vi.mocked(loadConfig).mockReturnValue({ ...defaultConfig, includeCharts: false });
      const historyWithSnapshots = {
        snapshots: [
          { timestamp: '2026-01-01T00:00:00Z', totalStars: 80, repos: [] },
          { timestamp: '2026-01-02T00:00:00Z', totalStars: 100, repos: [] },
        ],
      };
      vi.mocked(readHistory).mockReturnValue(historyWithSnapshots);

      await trackStars();

      expect(generateSvgChart).not.toHaveBeenCalled();
      expect(writeChart).not.toHaveBeenCalled();
    });

    it('skips SVG chart when history has fewer than 2 snapshots', async () => {
      await trackStars();

      expect(generateSvgChart).not.toHaveBeenCalled();
      expect(writeChart).not.toHaveBeenCalled();
    });

    it('skips writeChart when generateSvgChart returns null', async () => {
      const historyWithSnapshots = {
        snapshots: [
          { timestamp: '2026-01-01T00:00:00Z', totalStars: 80, repos: [] },
          { timestamp: '2026-01-02T00:00:00Z', totalStars: 100, repos: [] },
        ],
      };
      vi.mocked(readHistory).mockReturnValue(historyWithSnapshots);
      vi.mocked(generateSvgChart).mockReturnValue(null);

      await trackStars();

      expect(generateSvgChart).toHaveBeenCalled();
      expect(writeChart).not.toHaveBeenCalled();
    });
  });

  describe('github enterprise (GHES)', () => {
    const savedApiUrl = process.env.GITHUB_API_URL;

    beforeEach(() => {
      delete process.env.GITHUB_API_URL;
    });

    afterEach(() => {
      if (savedApiUrl !== undefined) {
        process.env.GITHUB_API_URL = savedApiUrl;
      } else {
        delete process.env.GITHUB_API_URL;
      }
    });

    it('calls getOctokit without baseUrl when no API URL is configured', async () => {
      await trackStars();

      expect(github.getOctokit).toHaveBeenCalledWith('fake-token');
    });

    it('passes baseUrl when github-api-url input is set', async () => {
      vi.mocked(core.getInput).mockImplementation((name: string) => {
        if (name === 'github-token') return 'fake-token';
        if (name === 'github-api-url') return 'https://github.example.com/api/v3';
        return '';
      });

      await trackStars();

      expect(github.getOctokit).toHaveBeenCalledWith('fake-token', {
        baseUrl: 'https://github.example.com/api/v3',
      });
    });

    it('falls back to GITHUB_API_URL env var when input is empty', async () => {
      process.env.GITHUB_API_URL = 'https://ghes.corp.com/api/v3';

      await trackStars();

      expect(github.getOctokit).toHaveBeenCalledWith('fake-token', {
        baseUrl: 'https://ghes.corp.com/api/v3',
      });
    });

    it('prefers input over GITHUB_API_URL env var', async () => {
      process.env.GITHUB_API_URL = 'https://ghes-env.corp.com/api/v3';
      vi.mocked(core.getInput).mockImplementation((name: string) => {
        if (name === 'github-token') return 'fake-token';
        if (name === 'github-api-url') return 'https://ghes-input.corp.com/api/v3';
        return '';
      });

      await trackStars();

      expect(github.getOctokit).toHaveBeenCalledWith('fake-token', {
        baseUrl: 'https://ghes-input.corp.com/api/v3',
      });
    });
  });

  describe('data flow', () => {
    it('passes maxHistory from config to addSnapshot', async () => {
      vi.mocked(loadConfig).mockReturnValue({ ...defaultConfig, maxHistory: 26 });

      await trackStars();

      expect(addSnapshot).toHaveBeenCalledWith(expect.objectContaining({ maxHistory: 26 }));
    });

    it('updates starsAtLastNotification when notifying', async () => {
      vi.mocked(shouldNotify).mockReturnValue(true);

      await trackStars();

      expect(writeHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          history: expect.objectContaining({ starsAtLastNotification: 100 }),
        }),
      );
    });

    it('does not update starsAtLastNotification when threshold not reached', async () => {
      vi.mocked(shouldNotify).mockReturnValue(false);
      vi.mocked(compareStars).mockReturnValue({
        ...defaultResults,
        summary: { ...defaultSummary, changed: true },
      });

      await trackStars();

      expect(writeHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          history: expect.not.objectContaining({ starsAtLastNotification: expect.anything() }),
        }),
      );
    });

    it('passes notificationThreshold to shouldNotify', async () => {
      vi.mocked(loadConfig).mockReturnValue({ ...defaultConfig, notificationThreshold: 'auto' });

      await trackStars();

      expect(shouldNotify).toHaveBeenCalledWith(expect.objectContaining({ threshold: 'auto' }));
    });

    it('includes delta indicator in commit message', async () => {
      vi.mocked(deltaIndicator).mockReturnValue('+10');

      await trackStars();

      expect(commitAndPush).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('+10'),
        }),
      );
    });
  });
});
