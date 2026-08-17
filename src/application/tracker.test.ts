import * as core from '@actions/core';
import * as github from '@actions/github';
import { loadConfig } from '@config/loader';
import { ChartTheme } from '@config/types';
import type { ForecastData } from '@domain/forecast';
import { computeForecast, ForecastMethod } from '@domain/forecast';
import { deltaIndicator } from '@domain/formatting';
import { measureRun, recordNotification } from '@domain/measurement';
import { buildStargazerMap, diffStargazers } from '@domain/stargazers';
import { CompareAgainst, NotificationMode } from '@domain/types';
import { getRepos } from '@infrastructure/github/filters';
import { fetchAllStargazers } from '@infrastructure/github/stargazers';
import { getEmailConfig, sendEmail } from '@infrastructure/notification/email';
import type { DataBranch, PublishedArtefacts } from '@infrastructure/persistence/data-branch';
import { withDataBranch } from '@infrastructure/persistence/data-branch';
import { retry } from '@octokit/plugin-retry';
import { generateBadge } from '@presentation/badge';
import type { ChartRequest } from '@presentation/chart-spec';
import { ChartKind } from '@presentation/chart-spec';
import { generateCsvReport } from '@presentation/csv';
import { generateHtmlReport } from '@presentation/html';
import { generateMarkdownReport } from '@presentation/markdown';
import { renderSvgChart } from '@presentation/svg-chart';
import { makeConfig, makeRepoInfo, makeRepoResult, makeStargazerSeries } from '@shared/tests';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { trackStars } from './tracker';

vi.mock('@actions/core', () => ({
  getInput: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  setFailed: vi.fn(),
  debug: vi.fn(),
  setOutput: vi.fn(),
}));
vi.mock('@actions/github', () => ({ getOctokit: vi.fn(() => ({})) }));
vi.mock('@config/loader', () => ({ loadConfig: vi.fn() }));
vi.mock('@domain/measurement', () => ({ measureRun: vi.fn(), recordNotification: vi.fn() }));
vi.mock('@domain/forecast', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@domain/forecast')>()),
  computeForecast: vi.fn(),
}));
vi.mock('@domain/stargazers', () => ({ diffStargazers: vi.fn(), buildStargazerMap: vi.fn() }));
vi.mock('@domain/formatting', () => ({ deltaIndicator: vi.fn() }));
vi.mock('@infrastructure/github/filters', () => ({ getRepos: vi.fn() }));
vi.mock('@infrastructure/github/stargazers', () => ({ fetchAllStargazers: vi.fn() }));
vi.mock('@infrastructure/persistence/data-branch', () => ({ withDataBranch: vi.fn() }));
vi.mock('@infrastructure/persistence/storage', () => ({
  writeHtmlReport: vi.fn().mockReturnValue('/tmp/star-tracker-report.html'),
}));
vi.mock('@infrastructure/notification/email', () => ({
  getEmailConfig: vi.fn(),
  sendEmail: vi.fn(),
}));
vi.mock('@presentation/badge', () => ({ generateBadge: vi.fn() }));
vi.mock('@presentation/csv', () => ({ generateCsvReport: vi.fn() }));
vi.mock('@presentation/html', () => ({ generateHtmlReport: vi.fn() }));
vi.mock('@presentation/markdown', () => ({ generateMarkdownReport: vi.fn() }));
vi.mock('@presentation/svg-chart', () => ({
  renderSvgChart: vi.fn(),
}));
function chartRequests(kind: ChartKind): ChartRequest[] {
  return vi
    .mocked(renderSvgChart)
    .mock.calls.map(([params]) => params.request)
    .filter((request) => request.kind === kind);
}

function mockCharts(svgByKind: Partial<Record<ChartKind, string>>): void {
  vi.mocked(renderSvgChart).mockImplementation(({ request }) => svgByKind[request.kind] ?? null);
}

const defaultConfig = makeConfig({ dataBranch: 'star-data', notificationThreshold: 0 });
const defaultSummary = {
  totalStars: 100,
  totalPrevious: 90,
  totalDelta: 10,
  newStars: 12,
  lostStars: 2,
  changed: true,
};
const defaultRepos = [makeRepoInfo('repo-a', 60), makeRepoInfo('repo-b', 40)];
const defaultHistory = { snapshots: [] };
const defaultSnapshot = { timestamp: '2026-01-01T00:00:00Z', totalStars: 100, repos: [] };
const defaultUpdatedHistory = { snapshots: [defaultSnapshot] };
const defaultResults = { repos: [], summary: defaultSummary };
const branch = {
  readHistory: vi.fn(),
  readStargazers: vi.fn(),
  publish: vi.fn(),
} satisfies DataBranch;
function published(): PublishedArtefacts {
  return branch.publish.mock.calls[0][0];
}
function publishedChart(filename: string): { filename: string; svg: string } | undefined {
  return published().charts.find((chart) => chart.filename === filename);
}
type Measurement = ReturnType<typeof measureRun>;
function mockMeasurement(overrides: Partial<Measurement> = {}): Measurement {
  const measurement: Measurement = {
    baselineTimestamp: null,
    results: defaultResults,
    summary: defaultSummary,
    updatedHistory: { ...defaultUpdatedHistory },
    droppedSnapshots: 0,
    thresholdReached: true,
    ...overrides,
  };
  vi.mocked(measureRun).mockReturnValue(measurement);
  return measurement;
}
function setupDefaults() {
  vi.mocked(core.getInput).mockImplementation((name: string) => {
    if (name === 'github-token') return 'fake-token';
    return '';
  });
  vi.mocked(loadConfig).mockReturnValue(defaultConfig);
  vi.mocked(getRepos).mockResolvedValue(defaultRepos);
  vi.mocked(withDataBranch).mockImplementation(({ run }) => run(branch as unknown as DataBranch));
  branch.readHistory.mockReturnValue(defaultHistory);
  mockMeasurement();
  vi.mocked(recordNotification).mockImplementation(({ history, totalStars }) => ({
    ...history,
    starsAtLastNotification: totalStars,
  }));
  vi.mocked(deltaIndicator).mockReturnValue('+10');
  vi.mocked(generateMarkdownReport).mockReturnValue('# MD Report');
  vi.mocked(generateHtmlReport).mockReturnValue('<p>HTML</p>');
  vi.mocked(generateBadge).mockReturnValue('<svg>badge</svg>');
  vi.mocked(getEmailConfig).mockReturnValue(null);
  vi.mocked(sendEmail).mockResolvedValue(true);
  vi.mocked(computeForecast).mockReturnValue(null);
  vi.mocked(generateCsvReport).mockReturnValue('repository,owner,name,stars,previous,delta,status');
  vi.mocked(renderSvgChart).mockReturnValue(null);
  vi.mocked(fetchAllStargazers).mockResolvedValue([]);
  branch.readStargazers.mockReturnValue({});
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
    expect(withDataBranch).toHaveBeenCalledWith(
      expect.objectContaining({ dataBranch: 'star-data', readOnly: false, token: 'fake-token' }),
    );
    expect(branch.readHistory).toHaveBeenCalled();
    expect(measureRun).toHaveBeenCalled();
    expect(generateMarkdownReport).toHaveBeenCalled();
    expect(generateHtmlReport).toHaveBeenCalled();
    expect(generateBadge).toHaveBeenCalled();
    expect(published()).toEqual(
      expect.objectContaining({
        report: '# MD Report',
        badge: '<svg>badge</svg>',
        csv: 'repository,owner,name,stars,previous,delta,status',
      }),
    );
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
    expect(withDataBranch).not.toHaveBeenCalled();
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
      mockMeasurement({ summary: { ...defaultSummary, changed: false } });
      vi.mocked(getEmailConfig).mockReturnValue(emailConfig);
      await trackStars();
      expect(sendEmail).toHaveBeenCalled();
      expect(core.setOutput).toHaveBeenCalledWith('notification-sent', 'true');
      expect(core.setOutput).toHaveBeenCalledWith('should-notify', 'false');
    });
    it('reports notification-sent false when the transport is unconfigured', async () => {
      vi.mocked(getEmailConfig).mockReturnValue(null);
      await trackStars();
      expect(sendEmail).not.toHaveBeenCalled();
      expect(core.setOutput).toHaveBeenCalledWith('notification-sent', 'false');
    });
    it('skips email when no changes and sendOnNoChanges is false', async () => {
      mockMeasurement({ summary: { ...defaultSummary, changed: false } });
      vi.mocked(getEmailConfig).mockReturnValue(emailConfig);
      await trackStars();
      expect(sendEmail).not.toHaveBeenCalled();
      expect(core.info).toHaveBeenCalledWith('No stars changed since the baseline, skipping email');
    });
    it('skips email when threshold is not reached', async () => {
      vi.mocked(loadConfig).mockReturnValue({ ...defaultConfig, notificationThreshold: 10 });
      mockMeasurement({ thresholdReached: false });
      vi.mocked(getEmailConfig).mockReturnValue(emailConfig);
      await trackStars();
      expect(sendEmail).not.toHaveBeenCalled();
      expect(core.setOutput).toHaveBeenCalledWith('should-notify', 'false');
      expect(core.info).toHaveBeenCalledWith('Notification threshold not reached, skipping email');
    });
    it('sends email when threshold is reached', async () => {
      vi.mocked(loadConfig).mockReturnValue({ ...defaultConfig, notificationThreshold: 5 });
      mockMeasurement({ thresholdReached: true });
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
    it('reports a failure raised inside the data branch run', async () => {
      branch.readHistory.mockImplementation(() => {
        throw new Error('read failed');
      });
      await trackStars();
      expect(core.setFailed).toHaveBeenCalledWith('Star Tracker failed: read failed');
    });
  });
  describe('outputs', () => {
    it('sets all outputs correctly', async () => {
      await trackStars();
      expect(core.setOutput).toHaveBeenCalledWith('report', '# MD Report');
      expect(core.setOutput).toHaveBeenCalledWith('report-html', '<p>HTML</p>');
      expect(core.setOutput).toHaveBeenCalledWith(
        'report-html-path',
        '/tmp/star-tracker-report.html',
      );
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
    it('skips stargazer fetch when charts and tracking are both off', async () => {
      vi.mocked(loadConfig).mockReturnValue({
        ...defaultConfig,
        includeCharts: false,
        trackStargazers: false,
      });
      await trackStars();
      expect(fetchAllStargazers).not.toHaveBeenCalled();
      expect(branch.readStargazers).not.toHaveBeenCalled();
    });
    it('fetches and diffs stargazers when trackStargazers is true', async () => {
      vi.mocked(loadConfig).mockReturnValue({ ...defaultConfig, trackStargazers: true });
      vi.mocked(diffStargazers).mockReturnValue({ entries: [], totalNew: 3 });
      await trackStars();
      expect(fetchAllStargazers).toHaveBeenCalled();
      expect(branch.readStargazers).toHaveBeenCalled();
      expect(diffStargazers).toHaveBeenCalled();
      expect(buildStargazerMap).toHaveBeenCalled();
      expect(published().stargazerMap).toBeDefined();
      expect(core.setOutput).toHaveBeenCalledWith('new-stargazers', '3');
    });
    it('fetches stargazers for the historical chart without writing the stargazer map', async () => {
      await trackStars();
      expect(fetchAllStargazers).toHaveBeenCalledTimes(1);
      expect(published().stargazerMap).toBeUndefined();
      expect(diffStargazers).not.toHaveBeenCalled();
      expect(core.setOutput).toHaveBeenCalledWith('new-stargazers', '0');
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
      branch.readHistory.mockReturnValue({ snapshots: historyWithSnapshots.snapshots.slice(0, 1) });
      mockMeasurement({ updatedHistory: historyWithSnapshots });
      mockCharts({ [ChartKind.STAR_HISTORY]: '<svg>chart</svg>' });
      await trackStars();
      expect(renderSvgChart).toHaveBeenCalledWith(
        expect.objectContaining({
          locale: 'en',
          request: expect.objectContaining({
            kind: ChartKind.STAR_HISTORY,
            history: historyWithSnapshots,
          }),
        }),
      );
      expect(publishedChart('star-history.svg')?.svg).toBe('<svg>chart</svg>');
    });
    it('draws each per-repo chart on its own timeline, not the shared global one', async () => {
      vi.mocked(getRepos).mockResolvedValue([
        makeRepoInfo('old', 100, { owner: 'u', fullName: 'u/old' }),
        makeRepoInfo('new', 30, { owner: 'u', fullName: 'u/new' }),
      ]);
      mockMeasurement({
        results: {
          repos: [
            makeRepoResult('old', { fullName: 'u/old', owner: 'u', current: 100 }),
            makeRepoResult('new', { fullName: 'u/new', owner: 'u', current: 30 }),
          ],
          summary: defaultSummary,
        },
      });
      vi.mocked(fetchAllStargazers).mockResolvedValue([
        {
          repoFullName: 'u/old',
          stargazers: makeStargazerSeries({
            count: 100,
            startMs: Date.UTC(2025, 0, 1),
            stepDays: 5,
          }),
        },
        {
          repoFullName: 'u/new',
          stargazers: makeStargazerSeries({ count: 30, startMs: Date.UTC(2026, 4, 25) }),
        },
      ]);
      const perRepo: Record<string, { snapshots: { timestamp: string; totalStars: number }[] }> =
        {};
      vi.mocked(renderSvgChart).mockImplementation(({ request }) => {
        if (request.kind === ChartKind.PER_REPO) perRepo[request.repoFullName] = request.history;
        return '<svg/>';
      });
      await trackStars();
      const series = perRepo['u/new'].snapshots.map((snapshot) => snapshot.totalStars);
      expect(perRepo['u/new'].snapshots[0].timestamp.startsWith('2026-05')).toBe(true);
      expect(series[0]).toBeGreaterThan(0);
      expect(series.at(-1)).toBe(30);
    });
    it('falls back to stored snapshots for a repo whose stargazers were unreachable (#148)', async () => {
      vi.mocked(getRepos).mockResolvedValue([
        makeRepoInfo('reachable', 100, { owner: 'u', fullName: 'u/reachable' }),
        makeRepoInfo('restricted', 54_000, { owner: 'u', fullName: 'u/restricted' }),
      ]);
      const unreachableResults = {
        repos: [
          makeRepoResult('reachable', { fullName: 'u/reachable', owner: 'u', current: 100 }),
          makeRepoResult('restricted', { fullName: 'u/restricted', owner: 'u', current: 54_000 }),
        ],
        summary: defaultSummary,
      };
      const storedSnapshots = {
        snapshots: [
          {
            timestamp: '2026-06-01T00:00:00Z',
            totalStars: 53_950,
            repos: [{ fullName: 'u/restricted', name: 'restricted', owner: 'u', stars: 53_900 }],
          },
          {
            timestamp: '2026-06-08T00:00:00Z',
            totalStars: 54_100,
            repos: [{ fullName: 'u/restricted', name: 'restricted', owner: 'u', stars: 54_000 }],
          },
        ],
      };
      mockMeasurement({ results: unreachableResults, updatedHistory: storedSnapshots });
      vi.mocked(fetchAllStargazers).mockResolvedValue([
        {
          repoFullName: 'u/reachable',
          stargazers: makeStargazerSeries({
            count: 100,
            startMs: Date.UTC(2025, 0, 1),
            stepDays: 5,
          }),
        },
        { repoFullName: 'u/restricted', stargazers: [] },
      ]);
      const perRepo: Record<string, { snapshots: { totalStars: number }[] }> = {};
      vi.mocked(renderSvgChart).mockImplementation(({ request }) => {
        if (request.kind === ChartKind.PER_REPO) perRepo[request.repoFullName] = request.history;
        return '<svg/>';
      });
      await trackStars();
      expect(perRepo['u/restricted']).toBe(storedSnapshots);
      expect(perRepo['u/reachable']).not.toBe(storedSnapshots);
    });
    it('hands both report renderers the same params, config included', async () => {
      const config = {
        ...defaultConfig,
        chartTheme: ChartTheme.LIGHT,
        emailTheme: ChartTheme.DARK,
      };
      vi.mocked(loadConfig).mockReturnValue(config);
      await trackStars();

      const markdownParams = vi.mocked(generateMarkdownReport).mock.calls[0][0];
      const htmlParams = vi.mocked(generateHtmlReport).mock.calls[0][0];

      expect(markdownParams.config).toBe(config);
      expect(htmlParams).toBe(markdownParams);
    });
    it('skips SVG chart when includeCharts is false', async () => {
      vi.mocked(loadConfig).mockReturnValue({ ...defaultConfig, includeCharts: false });
      const historyWithSnapshots = {
        snapshots: [
          { timestamp: '2026-01-01T00:00:00Z', totalStars: 80, repos: [] },
          { timestamp: '2026-01-02T00:00:00Z', totalStars: 100, repos: [] },
        ],
      };
      branch.readHistory.mockReturnValue(historyWithSnapshots);
      await trackStars();
      expect(renderSvgChart).not.toHaveBeenCalled();
      expect(published().charts).toHaveLength(0);
    });
    it('skips SVG chart when history has fewer than 2 snapshots', async () => {
      await trackStars();
      expect(renderSvgChart).not.toHaveBeenCalled();
      expect(published().charts).toHaveLength(0);
    });
    it('skips writeChart when the star-history chart comes back null', async () => {
      const historyWithSnapshots = {
        snapshots: [
          { timestamp: '2026-01-01T00:00:00Z', totalStars: 80, repos: [] },
          { timestamp: '2026-01-02T00:00:00Z', totalStars: 100, repos: [] },
        ],
      };
      branch.readHistory.mockReturnValue({ snapshots: historyWithSnapshots.snapshots.slice(0, 1) });
      mockMeasurement({ updatedHistory: historyWithSnapshots });
      vi.mocked(renderSvgChart).mockReturnValue(null);
      await trackStars();
      expect(renderSvgChart).toHaveBeenCalled();
      expect(published().charts).toHaveLength(0);
    });
  });
  describe('per-repo, comparison and forecast charts', () => {
    const twoSnapshots = {
      snapshots: [
        { timestamp: '2026-01-01T00:00:00Z', totalStars: 80, repos: [] },
        { timestamp: '2026-01-02T00:00:00Z', totalStars: 100, repos: [] },
      ],
    };
    const resultsWithRepos = {
      repos: [
        makeRepoResult('repo-a', { current: 60 }),
        makeRepoResult('repo-b', { current: 40 }),
        makeRepoResult('repo-c', { current: 10, isRemoved: true }),
      ],
      summary: defaultSummary,
    };
    const forecastData: ForecastData = {
      aggregate: {
        forecasts: [
          { method: ForecastMethod.LINEAR_REGRESSION, points: [{ weekOffset: 1, predicted: 110 }] },
        ],
      },
      repos: [],
    };
    beforeEach(() => {
      mockMeasurement({ results: resultsWithRepos, updatedHistory: twoSnapshots });
      vi.mocked(computeForecast).mockReturnValue(forecastData);
    });
    it('writes per-repo, comparison and forecast charts when they are generated', async () => {
      mockCharts({
        [ChartKind.PER_REPO]: '<svg>repo</svg>',
        [ChartKind.COMPARISON]: '<svg>cmp</svg>',
        [ChartKind.FORECAST]: '<svg>fc</svg>',
      });
      await trackStars();
      expect(chartRequests(ChartKind.PER_REPO)).toContainEqual(
        expect.objectContaining({ repoFullName: 'user/repo-a' }),
      );
      expect(publishedChart('user-repo-a.svg')?.svg).toBe('<svg>repo</svg>');
      expect(publishedChart('comparison.svg')?.svg).toBe('<svg>cmp</svg>');
      expect(chartRequests(ChartKind.FORECAST)).toContainEqual(
        expect.objectContaining({ forecastData }),
      );
      expect(publishedChart('forecast.svg')?.svg).toBe('<svg>fc</svg>');
    });
    it('excludes removed repos from the chart set', async () => {
      mockCharts({ [ChartKind.PER_REPO]: '<svg>repo</svg>' });
      await trackStars();
      expect(chartRequests(ChartKind.PER_REPO)).not.toContainEqual(
        expect.objectContaining({ repoFullName: 'user/repo-c' }),
      );
    });
    it('skips writing charts that come back null', async () => {
      await trackStars();
      expect(chartRequests(ChartKind.PER_REPO).length).toBeGreaterThan(0);
      expect(chartRequests(ChartKind.COMPARISON).length).toBeGreaterThan(0);
      expect(chartRequests(ChartKind.FORECAST).length).toBeGreaterThan(0);
      expect(publishedChart('forecast.svg')).toBeUndefined();
    });
    it('skips the forecast chart when no forecast data is available', async () => {
      vi.mocked(computeForecast).mockReturnValue(null);
      await trackStars();
      expect(chartRequests(ChartKind.FORECAST)).toHaveLength(0);
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
      expect(github.getOctokit).toHaveBeenCalledWith('fake-token', undefined, retry);
    });
    it('passes baseUrl when github-api-url input is set', async () => {
      vi.mocked(core.getInput).mockImplementation((name: string) => {
        if (name === 'github-token') return 'fake-token';
        if (name === 'github-api-url') return 'https://github.example.com/api/v3';
        return '';
      });
      await trackStars();
      expect(github.getOctokit).toHaveBeenCalledWith(
        'fake-token',
        { baseUrl: 'https://github.example.com/api/v3' },
        retry,
      );
    });
    it('falls back to GITHUB_API_URL env var when input is empty', async () => {
      process.env.GITHUB_API_URL = 'https://ghes.corp.com/api/v3';
      await trackStars();
      expect(github.getOctokit).toHaveBeenCalledWith(
        'fake-token',
        { baseUrl: 'https://ghes.corp.com/api/v3' },
        retry,
      );
    });
    it('prefers input over GITHUB_API_URL env var', async () => {
      process.env.GITHUB_API_URL = 'https://ghes-env.corp.com/api/v3';
      vi.mocked(core.getInput).mockImplementation((name: string) => {
        if (name === 'github-token') return 'fake-token';
        if (name === 'github-api-url') return 'https://ghes-input.corp.com/api/v3';
        return '';
      });
      await trackStars();
      expect(github.getOctokit).toHaveBeenCalledWith(
        'fake-token',
        { baseUrl: 'https://ghes-input.corp.com/api/v3' },
        retry,
      );
    });
  });
  describe('data flow', () => {
    it('hands the tracked set and the stored history to the measurement', async () => {
      await trackStars();
      expect(measureRun).toHaveBeenCalledWith(
        expect.objectContaining({ trackedSet: defaultRepos, storedHistory: defaultHistory }),
      );
    });
    it('passes maxHistory from config to the measurement', async () => {
      vi.mocked(loadConfig).mockReturnValue({ ...defaultConfig, maxHistory: 26 });
      await trackStars();
      expect(measureRun).toHaveBeenCalledWith(expect.objectContaining({ maxHistory: 26 }));
    });
    it('updates starsAtLastNotification when notifying', async () => {
      mockMeasurement({ thresholdReached: true });
      await trackStars();
      expect(recordNotification).toHaveBeenCalledWith(expect.objectContaining({ totalStars: 100 }));
      expect(published().history.starsAtLastNotification).toBe(100);
    });
    it('does not update starsAtLastNotification when threshold not reached', async () => {
      mockMeasurement({ thresholdReached: false, summary: { ...defaultSummary, changed: true } });
      await trackStars();
      expect(recordNotification).not.toHaveBeenCalled();
      expect(published().history.starsAtLastNotification).toBeUndefined();
    });
    it('passes notificationThreshold to the measurement', async () => {
      vi.mocked(loadConfig).mockReturnValue({ ...defaultConfig, notificationThreshold: 'auto' });
      await trackStars();
      expect(measureRun).toHaveBeenCalledWith(
        expect.objectContaining({ notificationThreshold: 'auto' }),
      );
    });
    it('passes notificationMode to the measurement', async () => {
      vi.mocked(loadConfig).mockReturnValue({
        ...defaultConfig,
        notificationMode: NotificationMode.GAINS,
      });
      await trackStars();
      expect(measureRun).toHaveBeenCalledWith(
        expect.objectContaining({ notificationMode: NotificationMode.GAINS }),
      );
    });
    it('passes compareAgainst to the measurement as the comparison window', async () => {
      vi.mocked(loadConfig).mockReturnValue({
        ...defaultConfig,
        compareAgainst: CompareAgainst.D7,
      });
      await trackStars();
      expect(measureRun).toHaveBeenCalledWith(
        expect.objectContaining({ comparisonWindow: CompareAgainst.D7 }),
      );
    });
    it('derives previousTimestamp from the measured baseline when present', async () => {
      mockMeasurement({ baselineTimestamp: '2026-01-01T00:00:00Z' });
      await trackStars();
      expect(generateMarkdownReport).toHaveBeenCalledWith(
        expect.objectContaining({ previousTimestamp: '2026-01-01T00:00:00Z' }),
      );
    });
    it('warns when max-history drops stored snapshots', async () => {
      mockMeasurement({ droppedSnapshots: 3 });
      await trackStars();
      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('drops the oldest 3'));
    });
    it('does not warn about max-history when nothing is dropped', async () => {
      await trackStars();
      expect(core.warning).not.toHaveBeenCalledWith(expect.stringContaining('drops the oldest'));
    });
    it('passes the stored history as velocityHistory, not the resolved chart history', async () => {
      const measurement = mockMeasurement();
      await trackStars();
      const params = vi.mocked(generateMarkdownReport).mock.calls[0][0];
      expect(params.velocityHistory).toBeDefined();
      expect(params.velocityHistory).toBe(measurement.updatedHistory);
    });
    it('does not advance the notification baseline when the email fails to send', async () => {
      vi.mocked(getEmailConfig).mockReturnValue({
        host: 'smtp.test.com',
        port: 587,
        username: 'user',
        password: 'pass',
        to: 'to@test.com',
        from: 'from@test.com',
      });
      vi.mocked(sendEmail).mockRejectedValue(new Error('smtp down'));
      await trackStars();
      expect(published().history.starsAtLastNotification).toBeUndefined();
    });
    it('does not advance the notification baseline when SMTP is configured without a recipient', async () => {
      vi.mocked(getEmailConfig).mockReturnValue({
        host: 'smtp.test.com',
        port: 587,
        username: 'user',
        password: 'pass',
        to: '',
        from: 'from@test.com',
      });
      vi.mocked(sendEmail).mockResolvedValue(false);
      await trackStars();
      expect(published().history.starsAtLastNotification).toBeUndefined();
    });
    it('includes delta indicator in commit message', async () => {
      vi.mocked(deltaIndicator).mockReturnValue('+10');
      await trackStars();
      expect(published().commitMessage).toContain('+10');
    });
    it('hands the read-only flag to the data branch rather than skipping the publish', async () => {
      vi.mocked(loadConfig).mockReturnValue({ ...defaultConfig, readOnly: true });
      await trackStars();
      expect(withDataBranch).toHaveBeenCalledWith(expect.objectContaining({ readOnly: true }));
      expect(branch.publish).toHaveBeenCalled();
    });
    it('still builds the report and sets outputs on a read-only run', async () => {
      vi.mocked(loadConfig).mockReturnValue({ ...defaultConfig, readOnly: true });
      await trackStars();
      expect(generateMarkdownReport).toHaveBeenCalled();
      expect(core.setOutput).toHaveBeenCalledWith('total-stars', '100');
    });
    it('still sends the email on a read-only run', async () => {
      vi.mocked(loadConfig).mockReturnValue({ ...defaultConfig, readOnly: true });
      vi.mocked(getEmailConfig).mockReturnValue({
        host: 'smtp.test.com',
        port: 587,
        username: 'user',
        password: 'pass',
        to: 'to@test.com',
        from: 'from@test.com',
      });
      mockMeasurement({ thresholdReached: true });
      await trackStars();
      expect(sendEmail).toHaveBeenCalled();
    });
  });
});
