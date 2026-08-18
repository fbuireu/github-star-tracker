import { ChartCurve } from '@config/types';
import { ForecastMethod } from '@domain/forecast';
import type { History } from '@domain/types';
import { makeMultiRepoHistory } from '@shared/tests';
import { describe, expect, it } from 'vitest';
import { chartImageUrl } from './chart';
import { ChartKind } from './chart-spec';
import { CHART_TENSION } from './constants';

const CHART_CONFIG_PARAM = '&c=';
const CHART_HEIGHT = '&h=';
const CHART_WIDTH = 'w=';

const mockHistory: History = makeMultiRepoHistory(
  [
    { 'user/repo-a': 50, 'user/repo-b': 50 },
    { 'user/repo-a': 70, 'user/repo-b': 50 },
    { 'user/repo-a': 90, 'user/repo-b': 60 },
  ],
  { startMs: Date.UTC(2025, 0, 1) },
);

describe('chart', () => {
  describe('chartImageUrl: star history', () => {
    it('generates valid QuickChart URL with history data', () => {
      const url = chartImageUrl({
        request: { kind: ChartKind.STAR_HISTORY, history: mockHistory, title: 'Test Chart' },
        locale: 'en',
      });

      expect(url).toContain('https://quickchart.io/chart?');
      expect(url).toContain(`${CHART_WIDTH}800`);
      expect(url).toContain(`${CHART_HEIGHT}400`);
      expect(url).toContain(CHART_CONFIG_PARAM);
    });

    it('returns null when history has fewer than 2 snapshots', () => {
      const singleSnapshot: History = {
        snapshots: [mockHistory.snapshots[0]],
      };
      const url = chartImageUrl({
        request: { kind: ChartKind.STAR_HISTORY, history: singleSnapshot },
        locale: 'en',
      });

      expect(url).toBeNull();
    });

    it('returns null when history has no snapshots', () => {
      const emptyHistory: History = { snapshots: [] };
      const url = chartImageUrl({
        request: { kind: ChartKind.STAR_HISTORY, history: emptyHistory },
        locale: 'en',
      });

      expect(url).toBeNull();
    });

    it('includes correct data points in chart config', () => {
      const url = chartImageUrl({
        request: { kind: ChartKind.STAR_HISTORY, history: mockHistory },
        locale: 'en',
      });

      expect(url).not.toBeNull();

      if (url) {
        const decodedUrl = decodeURIComponent(url);

        expect(decodedUrl).toContain('"data":[100,120,150]');
        expect(decodedUrl).toContain('"label":"Stars"');
      }
    });

    it('formats dates correctly', () => {
      const url = chartImageUrl({
        request: { kind: ChartKind.STAR_HISTORY, history: mockHistory },
        locale: 'en',
      });

      expect(url).not.toBeNull();

      if (url) {
        const decodedUrl = decodeURIComponent(url);

        expect(decodedUrl).toContain('Jan 1');
        expect(decodedUrl).toContain('Jan 8');
        expect(decodedUrl).toContain('Jan 15');
      }
    });

    it('limits data to last 30 points', () => {
      const largeHistory: History = {
        snapshots: Array.from({ length: 50 }, (_, index) => ({
          timestamp: new Date(2025, 0, index + 1).toISOString(),
          totalStars: 100 + index * 10,
          repos: [],
        })),
      };

      const url = chartImageUrl({
        request: { kind: ChartKind.STAR_HISTORY, history: largeHistory },
        locale: 'en',
      });

      expect(url).not.toBeNull();
      if (url) {
        const decodedUrl = decodeURIComponent(url);
        const config = JSON.parse(decodedUrl.split(CHART_CONFIG_PARAM)[1]);

        expect(config.data.labels).toHaveLength(30);
        expect(config.data.datasets[0].data).toHaveLength(30);
      }
    });
  });

  describe('chartImageUrl: per repo', () => {
    it('generates chart for specific repository', () => {
      const url = chartImageUrl({
        request: { kind: ChartKind.PER_REPO, history: mockHistory, repoFullName: 'user/repo-a' },
        locale: 'en',
      });

      expect(url).not.toBeNull();

      if (url) {
        const decodedUrl = decodeURIComponent(url);

        expect(decodedUrl).toContain('"data":[50,70,90]');
      }
    });

    it('uses custom title when provided', () => {
      const url = chartImageUrl({
        request: {
          kind: ChartKind.PER_REPO,
          history: mockHistory,
          repoFullName: 'user/repo-a',
          title: 'Custom Title',
        },
        locale: 'en',
      });

      expect(url).not.toBeNull();

      if (url) {
        const decodedUrl = decodeURIComponent(url);

        expect(decodedUrl).toContain('Custom Title');
      }
    });

    it('renders a flat zero series for a repository absent from every snapshot', () => {
      const url = chartImageUrl({
        request: {
          kind: ChartKind.PER_REPO,
          history: mockHistory,
          repoFullName: 'user/non-existent',
        },
        locale: 'en',
      });

      expect(url).not.toBeNull();

      if (url) {
        const decodedUrl = decodeURIComponent(url);

        expect(decodedUrl).toContain('"data":[0,0,0]');
      }
    });

    it('returns null when history has fewer than 2 snapshots', () => {
      const singleSnapshot: History = {
        snapshots: [mockHistory.snapshots[0]],
      };
      const url = chartImageUrl({
        request: { kind: ChartKind.PER_REPO, history: singleSnapshot, repoFullName: 'user/repo-a' },
        locale: 'en',
      });

      expect(url).toBeNull();
    });
  });

  describe('chartImageUrl: comparison', () => {
    it('generates comparison chart for multiple repositories', () => {
      const url = chartImageUrl({
        request: {
          kind: ChartKind.COMPARISON,
          history: mockHistory,
          repoNames: ['user/repo-a', 'user/repo-b'],
        },
        locale: 'en',
      });

      expect(url).not.toBeNull();

      if (url) {
        const decodedUrl = decodeURIComponent(url);

        expect(decodedUrl).toContain('"label":"repo-a"');
        expect(decodedUrl).toContain('"label":"repo-b"');
        expect(decodedUrl).toContain('"data":[50,70,90]');
        expect(decodedUrl).toContain('"data":[50,50,60]');
      }
    });

    it('limits to 10 repositories maximum', () => {
      const url = chartImageUrl({
        request: {
          kind: ChartKind.COMPARISON,
          history: mockHistory,
          repoNames: Array.from({ length: 12 }, (_, index) => `user/repo-${index}`),
        },
        locale: 'en',
      });

      expect(url).not.toBeNull();

      if (url) {
        const decodedUrl = decodeURIComponent(url);
        const config = JSON.parse(decodedUrl.split(CHART_CONFIG_PARAM)[1]);

        expect(config.data.datasets).toHaveLength(10);
      }
    });

    it('returns null when no repositories provided', () => {
      const url = chartImageUrl({
        request: { kind: ChartKind.COMPARISON, history: mockHistory, repoNames: [] },
        locale: 'en',
      });

      expect(url).toBeNull();
    });

    it('returns null when history has fewer than 2 snapshots', () => {
      const singleSnapshot: History = {
        snapshots: [mockHistory.snapshots[0]],
      };
      const url = chartImageUrl({
        request: {
          kind: ChartKind.COMPARISON,
          history: singleSnapshot,
          repoNames: ['user/repo-a'],
        },
        locale: 'en',
      });

      expect(url).toBeNull();
    });

    it('uses custom title when provided', () => {
      const url = chartImageUrl({
        request: {
          kind: ChartKind.COMPARISON,
          history: mockHistory,
          repoNames: ['user/repo-a'],
          title: 'My Comparison',
        },
        locale: 'en',
      });

      expect(url).not.toBeNull();

      if (url) {
        const decodedUrl = decodeURIComponent(url);

        expect(decodedUrl).toContain('My Comparison');
      }
    });

    it('enables legend for multiple repositories', () => {
      const url = chartImageUrl({
        request: {
          kind: ChartKind.COMPARISON,
          history: mockHistory,
          repoNames: ['user/repo-a', 'user/repo-b'],
        },
        locale: 'en',
      });

      expect(url).not.toBeNull();

      if (url) {
        const decodedUrl = decodeURIComponent(url);
        const config = JSON.parse(decodedUrl.split(CHART_CONFIG_PARAM)[1]);

        expect(config.options.plugins.legend.display).toBe(true);
      }
    });

    it('uses short labels when all repos share the same owner', () => {
      const url = chartImageUrl({
        request: {
          kind: ChartKind.COMPARISON,
          history: mockHistory,
          repoNames: ['user/repo-a', 'user/repo-b'],
        },
        locale: 'en',
      });

      expect(url).not.toBeNull();

      if (url) {
        const decodedUrl = decodeURIComponent(url);
        const config = JSON.parse(decodedUrl.split(CHART_CONFIG_PARAM)[1]);

        expect(config.data.datasets[0].label).toBe('repo-a');
        expect(config.data.datasets[1].label).toBe('repo-b');
      }
    });

    it('uses full names when repos have different owners', () => {
      const mixedHistory: History = {
        snapshots: [
          {
            timestamp: '2025-01-01T00:00:00.000Z',
            totalStars: 100,
            repos: [
              { fullName: 'alice/repo-a', name: 'repo-a', owner: 'alice', stars: 50 },
              { fullName: 'bob/repo-b', name: 'repo-b', owner: 'bob', stars: 50 },
            ],
          },
          {
            timestamp: '2025-01-08T00:00:00.000Z',
            totalStars: 120,
            repos: [
              { fullName: 'alice/repo-a', name: 'repo-a', owner: 'alice', stars: 70 },
              { fullName: 'bob/repo-b', name: 'repo-b', owner: 'bob', stars: 50 },
            ],
          },
        ],
      };

      const url = chartImageUrl({
        request: {
          kind: ChartKind.COMPARISON,
          history: mixedHistory,
          repoNames: ['alice/repo-a', 'bob/repo-b'],
        },
        locale: 'en',
      });

      expect(url).not.toBeNull();

      if (url) {
        const decodedUrl = decodeURIComponent(url);
        const config = JSON.parse(decodedUrl.split(CHART_CONFIG_PARAM)[1]);

        expect(config.data.datasets[0].label).toBe('alice/repo-a');
        expect(config.data.datasets[1].label).toBe('bob/repo-b');
      }
    });
  });

  describe('chartImageUrl: forecast', () => {
    const forecastData = {
      aggregate: {
        forecasts: [
          {
            method: ForecastMethod.LINEAR_REGRESSION,
            points: [
              { weekOffset: 1, predicted: 170 },
              { weekOffset: 2, predicted: 195 },
              { weekOffset: 3, predicted: 220 },
              { weekOffset: 4, predicted: 245 },
            ],
          },
          {
            method: ForecastMethod.WEIGHTED_MOVING_AVERAGE,
            points: [
              { weekOffset: 1, predicted: 165 },
              { weekOffset: 2, predicted: 180 },
              { weekOffset: 3, predicted: 195 },
              { weekOffset: 4, predicted: 210 },
            ],
          },
        ],
      },
      repos: [],
    };

    it('generates forecast chart with dashed lines', () => {
      const url = chartImageUrl({
        request: { kind: ChartKind.FORECAST, history: mockHistory, forecastData },
        locale: 'en',
      });

      expect(url).not.toBeNull();

      if (url) {
        const decodedUrl = decodeURIComponent(url);
        const config = JSON.parse(decodedUrl.split(CHART_CONFIG_PARAM)[1]);

        expect(config.data.datasets).toHaveLength(3);
        expect(config.data.datasets[0].borderDash).toBeUndefined();
        expect(config.data.datasets[1].borderDash).toEqual([8, 4]);
        expect(config.data.datasets[2].borderDash).toEqual([4, 4]);
      }
    });

    it('includes historical and forecast labels', () => {
      const url = chartImageUrl({
        request: { kind: ChartKind.FORECAST, history: mockHistory, forecastData },
        locale: 'en',
      });

      expect(url).not.toBeNull();

      if (url) {
        const decodedUrl = decodeURIComponent(url);
        const config = JSON.parse(decodedUrl.split(CHART_CONFIG_PARAM)[1]);

        expect(config.data.labels).toHaveLength(7);
        expect(config.data.labels[3]).toContain('Week');
      }
    });

    it('returns null when history has fewer than 2 snapshots', () => {
      const url = chartImageUrl({
        request: {
          kind: ChartKind.FORECAST,
          history: { snapshots: [mockHistory.snapshots[0]] },
          forecastData,
        },
        locale: 'en',
      });

      expect(url).toBeNull();
    });

    it('enables legend', () => {
      const url = chartImageUrl({
        request: { kind: ChartKind.FORECAST, history: mockHistory, forecastData },
        locale: 'en',
      });

      expect(url).not.toBeNull();

      if (url) {
        const decodedUrl = decodeURIComponent(url);
        const config = JSON.parse(decodedUrl.split(CHART_CONFIG_PARAM)[1]);

        expect(config.options.plugins.legend.display).toBe(true);
      }
    });
  });

  describe('milestone annotations', () => {
    it('includes milestone annotations in aggregate chart', () => {
      const largeHistory: History = {
        snapshots: [
          {
            timestamp: '2025-01-01T00:00:00.000Z',
            totalStars: 80,
            repos: [],
          },
          {
            timestamp: '2025-01-08T00:00:00.000Z',
            totalStars: 120,
            repos: [],
          },
        ],
      };

      const url = chartImageUrl({
        request: { kind: ChartKind.STAR_HISTORY, history: largeHistory },
        locale: 'en',
      });

      expect(url).not.toBeNull();

      if (url) {
        const decodedUrl = decodeURIComponent(url);
        const config = JSON.parse(decodedUrl.split(CHART_CONFIG_PARAM)[1]);

        expect(config.options.plugins.annotation).toBeDefined();
        expect(config.options.plugins.annotation.annotations).toHaveProperty('milestone100');
      }
    });

    it('does not include annotations when no milestones in range', () => {
      const url = chartImageUrl({
        request: { kind: ChartKind.STAR_HISTORY, history: mockHistory },
        locale: 'en',
      });

      expect(url).not.toBeNull();

      if (url) {
        const decodedUrl = decodeURIComponent(url);
        const config = JSON.parse(decodedUrl.split(CHART_CONFIG_PARAM)[1]);

        expect(config.options.plugins.annotation).toBeUndefined();
      }
    });

    it('uses custom milestones in the aggregate chart when provided', () => {
      const largeHistory: History = {
        snapshots: [
          { timestamp: '2025-01-01T00:00:00.000Z', totalStars: 80, repos: [] },
          { timestamp: '2025-01-08T00:00:00.000Z', totalStars: 120, repos: [] },
        ],
      };

      const url = chartImageUrl({
        request: {
          kind: ChartKind.STAR_HISTORY,
          history: largeHistory,
          customMilestones: [90, 110],
        },
        locale: 'en',
      });

      expect(url).not.toBeNull();

      if (url) {
        const config = JSON.parse(decodeURIComponent(url).split(CHART_CONFIG_PARAM)[1]);
        const { annotations } = config.options.plugins.annotation;

        expect(annotations).toHaveProperty('milestone90');
        expect(annotations).toHaveProperty('milestone110');
        expect(annotations).not.toHaveProperty('milestone100');
      }
    });

    it('falls back to default milestones when custom list is empty', () => {
      const largeHistory: History = {
        snapshots: [
          { timestamp: '2025-01-01T00:00:00.000Z', totalStars: 80, repos: [] },
          { timestamp: '2025-01-08T00:00:00.000Z', totalStars: 120, repos: [] },
        ],
      };

      const url = chartImageUrl({
        request: { kind: ChartKind.STAR_HISTORY, history: largeHistory, customMilestones: [] },
        locale: 'en',
      });

      expect(url).not.toBeNull();

      if (url) {
        const config = JSON.parse(decodeURIComponent(url).split(CHART_CONFIG_PARAM)[1]);

        expect(config.options.plugins.annotation.annotations).toHaveProperty('milestone100');
      }
    });

    it('does not include annotations when milestones are disabled', () => {
      const largeHistory: History = {
        snapshots: [
          { timestamp: '2025-01-01T00:00:00.000Z', totalStars: 80, repos: [] },
          { timestamp: '2025-01-08T00:00:00.000Z', totalStars: 120, repos: [] },
        ],
      };

      const url = chartImageUrl({
        request: { kind: ChartKind.STAR_HISTORY, history: largeHistory, milestones: false },
        locale: 'en',
      });

      expect(url).not.toBeNull();
      if (url) {
        const config = JSON.parse(decodeURIComponent(url).split(CHART_CONFIG_PARAM)[1]);

        expect(config.options.plugins.annotation).toBeUndefined();
      }
    });
  });

  describe('smoothing', () => {
    const tensionOf = (url: string): number => {
      const config = JSON.parse(decodeURIComponent(url).split(CHART_CONFIG_PARAM)[1]);
      return config.data.datasets[0].tension;
    };

    it('curves the line with a positive tension by default', () => {
      const url = chartImageUrl({
        request: { kind: ChartKind.STAR_HISTORY, history: mockHistory },
        locale: 'en',
      });

      expect(url).not.toBeNull();
      if (url) expect(tensionOf(url)).toBe(CHART_TENSION.smooth);
    });

    it('curves the line when smoothing is enabled', () => {
      const url = chartImageUrl({
        request: { kind: ChartKind.STAR_HISTORY, history: mockHistory },
        locale: 'en',
        smoothing: true,
      });

      expect(url).not.toBeNull();
      if (url) expect(tensionOf(url)).toBe(CHART_TENSION.smooth);
    });

    it('draws straight segments when smoothing is disabled', () => {
      const url = chartImageUrl({
        request: { kind: ChartKind.STAR_HISTORY, history: mockHistory },
        locale: 'en',
        smoothing: false,
      });

      expect(url).not.toBeNull();
      if (url) expect(tensionOf(url)).toBe(0);
    });

    it('applies the smoothing setting to comparison datasets', () => {
      const url = chartImageUrl({
        request: {
          kind: ChartKind.COMPARISON,
          history: mockHistory,
          repoNames: ['user/repo-a', 'user/repo-b'],
        },
        locale: 'en',
        smoothing: false,
      });

      expect(url).not.toBeNull();
      if (url) {
        const config = JSON.parse(decodeURIComponent(url).split(CHART_CONFIG_PARAM)[1]);

        expect(
          config.data.datasets.every((dataset: { tension: number }) => dataset.tension === 0),
        ).toBe(true);
      }
    });
  });

  describe('curve', () => {
    const firstDataset = (url: string): { tension: number; cubicInterpolationMode?: string } => {
      const config = JSON.parse(decodeURIComponent(url).split(CHART_CONFIG_PARAM)[1]);
      return config.data.datasets[0];
    };

    it('renders the monotone curve as a monotone cubic interpolation by default', () => {
      const url = chartImageUrl({
        request: { kind: ChartKind.STAR_HISTORY, history: mockHistory },
        locale: 'en',
      });

      expect(url).not.toBeNull();
      if (url) expect(firstDataset(url).cubicInterpolationMode).toBe(ChartCurve.MONOTONE);
    });

    it('renders catmull-rom as a tensioned spline without monotone interpolation', () => {
      const url = chartImageUrl({
        request: { kind: ChartKind.STAR_HISTORY, history: mockHistory },
        locale: 'en',
        curve: ChartCurve.CATMULL_ROM,
      });

      expect(url).not.toBeNull();
      if (url) {
        expect(firstDataset(url).tension).toBe(CHART_TENSION.smooth);
        expect(firstDataset(url).cubicInterpolationMode).toBeUndefined();
      }
    });

    it('falls back to monotone interpolation for the rounded-step curve', () => {
      const url = chartImageUrl({
        request: { kind: ChartKind.STAR_HISTORY, history: mockHistory },
        locale: 'en',
        curve: ChartCurve.ROUNDED_STEP,
      });

      expect(url).not.toBeNull();
      if (url) expect(firstDataset(url).cubicInterpolationMode).toBe(ChartCurve.MONOTONE);
    });

    it('renders cubic-bezier as a tensioned spline without monotone interpolation', () => {
      const url = chartImageUrl({
        request: { kind: ChartKind.STAR_HISTORY, history: mockHistory },
        locale: 'en',
        curve: ChartCurve.CUBIC_BEZIER,
      });

      expect(url).not.toBeNull();
      if (url) {
        expect(firstDataset(url).tension).toBe(CHART_TENSION.smooth);
        expect(firstDataset(url).cubicInterpolationMode).toBeUndefined();
      }
    });
  });

  describe('range', () => {
    const weeklyHistory: History = {
      snapshots: Array.from({ length: 40 }, (_, index) => ({
        timestamp: new Date(2025, 0, 1 + index * 7).toISOString(),
        totalStars: 100 + index * 10,
        repos: [],
      })),
    };
    const dataLength = (url: string): number =>
      JSON.parse(decodeURIComponent(url).split(CHART_CONFIG_PARAM)[1]).data.datasets[0].data.length;

    it('plots the full history by default', () => {
      const url = chartImageUrl({
        request: { kind: ChartKind.STAR_HISTORY, history: weeklyHistory },
        locale: 'en',
      });

      expect(url).not.toBeNull();
      if (url) expect(dataLength(url)).toBe(30);
    });

    it('limits the plotted history to the selected time window', () => {
      const all = chartImageUrl({
        request: { kind: ChartKind.STAR_HISTORY, history: weeklyHistory },
        locale: 'en',
      });
      const recent = chartImageUrl({
        request: { kind: ChartKind.STAR_HISTORY, history: weeklyHistory },
        locale: 'en',
        range: '90d',
      });

      expect(all).not.toBeNull();
      expect(recent).not.toBeNull();
      if (all && recent) {
        expect(dataLength(recent)).toBeLessThan(dataLength(all));
        expect(dataLength(recent)).toBeLessThanOrEqual(14);
      }
    });
  });

  describe('trendLine', () => {
    const datasetCount = (url: string): number =>
      JSON.parse(decodeURIComponent(url).split(CHART_CONFIG_PARAM)[1]).data.datasets.length;

    it('does not overlay a trend dataset by default', () => {
      const url = chartImageUrl({
        request: { kind: ChartKind.STAR_HISTORY, history: mockHistory },
        locale: 'en',
      });

      expect(url).not.toBeNull();
      if (url) expect(datasetCount(url)).toBe(1);
    });

    it('overlays a dashed moving-average dataset when enabled', () => {
      const url = chartImageUrl({
        request: { kind: ChartKind.STAR_HISTORY, history: mockHistory, trendLine: true },
        locale: 'en',
      });

      expect(url).not.toBeNull();
      if (url) {
        const config = JSON.parse(decodeURIComponent(url).split(CHART_CONFIG_PARAM)[1]);

        expect(config.data.datasets).toHaveLength(2);
        expect(config.data.datasets[1].borderDash).toBeDefined();
        expect(config.data.datasets[1].fill).toBe(false);
      }
    });
  });

  describe('theme', () => {
    it('uses a light background by default', () => {
      const url = chartImageUrl({
        request: { kind: ChartKind.STAR_HISTORY, history: mockHistory },
        locale: 'en',
      });

      expect(url).not.toBeNull();
      if (url) expect(url).toContain('backgroundColor=%23fff');
    });

    it('uses a dark background and palette for the dark theme', () => {
      const url = chartImageUrl({
        request: { kind: ChartKind.STAR_HISTORY, history: mockHistory },
        locale: 'en',
        theme: 'dark',
      });

      expect(url).not.toBeNull();
      if (url) {
        expect(url).toContain('backgroundColor=%230d1117');
        const config = JSON.parse(decodeURIComponent(url).split(CHART_CONFIG_PARAM)[1]);
        expect(config.options.scales.y.ticks.color).toBe('#8b949e');
      }
    });
  });

  describe('beginAtZero', () => {
    const beginAtZeroOf = (url: string): boolean => {
      const config = JSON.parse(decodeURIComponent(url).split(CHART_CONFIG_PARAM)[1]);
      return config.options.scales.y.beginAtZero;
    };

    it('does not begin the Y-axis at zero by default', () => {
      const url = chartImageUrl({
        request: { kind: ChartKind.STAR_HISTORY, history: mockHistory },
        locale: 'en',
      });

      expect(url).not.toBeNull();
      if (url) expect(beginAtZeroOf(url)).toBe(false);
    });

    it('begins the Y-axis at zero when enabled', () => {
      const url = chartImageUrl({
        request: { kind: ChartKind.STAR_HISTORY, history: mockHistory },
        locale: 'en',
        beginAtZero: true,
      });

      expect(url).not.toBeNull();
      if (url) expect(beginAtZeroOf(url)).toBe(true);
    });
  });

  describe('showPoints', () => {
    const pointRadiusOf = (url: string): number => {
      const config = JSON.parse(decodeURIComponent(url).split(CHART_CONFIG_PARAM)[1]);
      return config.data.datasets[0].pointRadius;
    };

    it('draws point markers by default', () => {
      const url = chartImageUrl({
        request: { kind: ChartKind.STAR_HISTORY, history: mockHistory },
        locale: 'en',
      });

      expect(url).not.toBeNull();
      if (url) expect(pointRadiusOf(url)).toBeGreaterThan(0);
    });

    it('hides point markers when disabled', () => {
      const url = chartImageUrl({
        request: { kind: ChartKind.STAR_HISTORY, history: mockHistory },
        locale: 'en',
        showPoints: false,
      });

      expect(url).not.toBeNull();
      if (url) expect(pointRadiusOf(url)).toBe(0);
    });

    it('hides markers on every comparison dataset when disabled', () => {
      const url = chartImageUrl({
        request: {
          kind: ChartKind.COMPARISON,
          history: mockHistory,
          repoNames: ['user/repo-a', 'user/repo-b'],
        },
        locale: 'en',
        showPoints: false,
      });

      expect(url).not.toBeNull();
      if (url) {
        const config = JSON.parse(decodeURIComponent(url).split(CHART_CONFIG_PARAM)[1]);

        expect(
          config.data.datasets.every(
            (dataset: { pointRadius: number }) => dataset.pointRadius === 0,
          ),
        ).toBe(true);
      }
    });
  });
});
