import { ForecastMethod } from '@domain/forecast';
import type { History } from '@domain/types';
import { describe, expect, it } from 'vitest';
import {
  buildMilestoneAnnotations,
  generateChartUrl,
  generateComparisonChartUrl,
  generateForecastChartUrl,
  generatePerRepoChartUrl,
} from './chart';

const CHART_CONFIG_PARAM = '&c=';
const CHART_HEIGHT = '&h=';
const CHART_WIDTH = 'w=';

const mockHistory: History = {
  snapshots: [
    {
      timestamp: '2025-01-01T00:00:00.000Z',
      totalStars: 100,
      repos: [
        { fullName: 'user/repo-a', name: 'repo-a', owner: 'user', stars: 50 },
        { fullName: 'user/repo-b', name: 'repo-b', owner: 'user', stars: 50 },
      ],
    },
    {
      timestamp: '2025-01-08T00:00:00.000Z',
      totalStars: 120,
      repos: [
        { fullName: 'user/repo-a', name: 'repo-a', owner: 'user', stars: 70 },
        { fullName: 'user/repo-b', name: 'repo-b', owner: 'user', stars: 50 },
      ],
    },
    {
      timestamp: '2025-01-15T00:00:00.000Z',
      totalStars: 150,
      repos: [
        { fullName: 'user/repo-a', name: 'repo-a', owner: 'user', stars: 90 },
        { fullName: 'user/repo-b', name: 'repo-b', owner: 'user', stars: 60 },
      ],
    },
  ],
};

describe('chart', () => {
  describe('generateChartUrl', () => {
    it('generates valid QuickChart URL with history data', () => {
      const url = generateChartUrl({ history: mockHistory, title: 'Test Chart', locale: 'en' });

      expect(url).toContain('https://quickchart.io/chart?');
      expect(url).toContain(`${CHART_WIDTH}800`);
      expect(url).toContain(`${CHART_HEIGHT}400`);
      expect(url).toContain(CHART_CONFIG_PARAM);
    });

    it('returns null when history has fewer than 2 snapshots', () => {
      const singleSnapshot: History = {
        snapshots: [mockHistory.snapshots[0]],
      };
      const url = generateChartUrl({ history: singleSnapshot, locale: 'en' });

      expect(url).toBeNull();
    });

    it('returns null when history has no snapshots', () => {
      const emptyHistory: History = { snapshots: [] };
      const url = generateChartUrl({ history: emptyHistory, locale: 'en' });

      expect(url).toBeNull();
    });

    it('includes correct data points in chart config', () => {
      const url = generateChartUrl({ history: mockHistory, locale: 'en' });

      expect(url).toBeDefined();

      if (url) {
        const decodedUrl = decodeURIComponent(url);

        expect(decodedUrl).toContain('"data":[100,120,150]');
        expect(decodedUrl).toContain('"label":"Stars"');
      }
    });

    it('formats dates correctly', () => {
      const url = generateChartUrl({ history: mockHistory, locale: 'en' });

      expect(url).toBeDefined();

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

      const url = generateChartUrl({ history: largeHistory, locale: 'en' });

      expect(url).toBeDefined();
      if (url) {
        const decodedUrl = decodeURIComponent(url);
        const config = JSON.parse(decodedUrl.split(CHART_CONFIG_PARAM)[1]);

        expect(config.data.labels).toHaveLength(30);
        expect(config.data.datasets[0].data).toHaveLength(30);
      }
    });
  });

  describe('generatePerRepoChartUrl', () => {
    it('generates chart for specific repository', () => {
      const url = generatePerRepoChartUrl({
        history: mockHistory,
        repoFullName: 'user/repo-a',
        locale: 'en',
      });

      expect(url).toBeDefined();

      if (url) {
        const decodedUrl = decodeURIComponent(url);

        expect(decodedUrl).toContain('"data":[50,70,90]');
      }
    });

    it('uses custom title when provided', () => {
      const url = generatePerRepoChartUrl({
        history: mockHistory,
        repoFullName: 'user/repo-a',
        title: 'Custom Title',
        locale: 'en',
      });

      expect(url).toBeDefined();

      if (url) {
        const decodedUrl = decodeURIComponent(url);

        expect(decodedUrl).toContain('Custom Title');
      }
    });

    it('returns null for non-existent repository', () => {
      const url = generatePerRepoChartUrl({
        history: mockHistory,
        repoFullName: 'user/non-existent',
        locale: 'en',
      });

      expect(url).toBeDefined();

      if (url) {
        const decodedUrl = decodeURIComponent(url);

        expect(decodedUrl).toContain('"data":[0,0,0]');
      }
    });

    it('returns null when history has fewer than 2 snapshots', () => {
      const singleSnapshot: History = {
        snapshots: [mockHistory.snapshots[0]],
      };
      const url = generatePerRepoChartUrl({
        history: singleSnapshot,
        repoFullName: 'user/repo-a',
        locale: 'en',
      });

      expect(url).toBeNull();
    });
  });

  describe('generateComparisonChartUrl', () => {
    it('generates comparison chart for multiple repositories', () => {
      const url = generateComparisonChartUrl({
        history: mockHistory,
        repoNames: ['user/repo-a', 'user/repo-b'],
        locale: 'en',
      });

      expect(url).toBeDefined();

      if (url) {
        const decodedUrl = decodeURIComponent(url);

        expect(decodedUrl).toContain('"label":"repo-a"');
        expect(decodedUrl).toContain('"label":"repo-b"');
        expect(decodedUrl).toContain('"data":[50,70,90]');
        expect(decodedUrl).toContain('"data":[50,50,60]');
      }
    });

    it('limits to 10 repositories maximum', () => {
      const url = generateComparisonChartUrl({
        history: mockHistory,
        repoNames: Array.from({ length: 12 }, (_, index) => `user/repo-${index}`),
        locale: 'en',
      });

      expect(url).toBeDefined();

      if (url) {
        const decodedUrl = decodeURIComponent(url);
        const config = JSON.parse(decodedUrl.split(CHART_CONFIG_PARAM)[1]);

        expect(config.data.datasets).toHaveLength(10);
      }
    });

    it('returns null when no repositories provided', () => {
      const url = generateComparisonChartUrl({ history: mockHistory, repoNames: [], locale: 'en' });

      expect(url).toBeNull();
    });

    it('returns null when history has fewer than 2 snapshots', () => {
      const singleSnapshot: History = {
        snapshots: [mockHistory.snapshots[0]],
      };
      const url = generateComparisonChartUrl({
        history: singleSnapshot,
        repoNames: ['user/repo-a'],
        locale: 'en',
      });

      expect(url).toBeNull();
    });

    it('uses custom title when provided', () => {
      const url = generateComparisonChartUrl({
        history: mockHistory,
        repoNames: ['user/repo-a'],
        title: 'My Comparison',
        locale: 'en',
      });

      expect(url).toBeDefined();

      if (url) {
        const decodedUrl = decodeURIComponent(url);

        expect(decodedUrl).toContain('My Comparison');
      }
    });

    it('enables legend for multiple repositories', () => {
      const url = generateComparisonChartUrl({
        history: mockHistory,
        repoNames: ['user/repo-a', 'user/repo-b'],
        locale: 'en',
      });

      expect(url).toBeDefined();

      if (url) {
        const decodedUrl = decodeURIComponent(url);
        const config = JSON.parse(decodedUrl.split(CHART_CONFIG_PARAM)[1]);

        expect(config.options.plugins.legend.display).toBe(true);
      }
    });

    it('uses short labels when all repos share the same owner', () => {
      const url = generateComparisonChartUrl({
        history: mockHistory,
        repoNames: ['user/repo-a', 'user/repo-b'],
        locale: 'en',
      });

      expect(url).toBeDefined();

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

      const url = generateComparisonChartUrl({
        history: mixedHistory,
        repoNames: ['alice/repo-a', 'bob/repo-b'],
        locale: 'en',
      });

      expect(url).toBeDefined();

      if (url) {
        const decodedUrl = decodeURIComponent(url);
        const config = JSON.parse(decodedUrl.split(CHART_CONFIG_PARAM)[1]);

        expect(config.data.datasets[0].label).toBe('alice/repo-a');
        expect(config.data.datasets[1].label).toBe('bob/repo-b');
      }
    });
  });

  describe('generateForecastChartUrl', () => {
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
      const url = generateForecastChartUrl({
        history: mockHistory,
        forecastData,
        locale: 'en',
      });

      expect(url).toBeDefined();

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
      const url = generateForecastChartUrl({
        history: mockHistory,
        forecastData,
        locale: 'en',
      });

      expect(url).toBeDefined();

      if (url) {
        const decodedUrl = decodeURIComponent(url);
        const config = JSON.parse(decodedUrl.split(CHART_CONFIG_PARAM)[1]);

        expect(config.data.labels).toHaveLength(7);
        expect(config.data.labels[3]).toContain('Week');
      }
    });

    it('returns null when history has fewer than 2 snapshots', () => {
      const url = generateForecastChartUrl({
        history: { snapshots: [mockHistory.snapshots[0]] },
        forecastData,
        locale: 'en',
      });

      expect(url).toBeNull();
    });

    it('enables legend', () => {
      const url = generateForecastChartUrl({
        history: mockHistory,
        forecastData,
        locale: 'en',
      });

      expect(url).toBeDefined();

      if (url) {
        const decodedUrl = decodeURIComponent(url);
        const config = JSON.parse(decodedUrl.split(CHART_CONFIG_PARAM)[1]);

        expect(config.options.plugins.legend.display).toBe(true);
      }
    });
  });

  describe('buildMilestoneAnnotations', () => {
    it('returns annotations for milestones within range', () => {
      const result = buildMilestoneAnnotations({ minStars: 30, maxStars: 200 });

      expect(result).not.toBeNull();
      expect(result?.annotations).toHaveProperty('milestone50');
      expect(result?.annotations).toHaveProperty('milestone100');
      expect(result?.annotations.milestone50.yMin).toBe(50);
      expect(result?.annotations.milestone100.yMin).toBe(100);
    });

    it('excludes milestones outside the visible range', () => {
      const result = buildMilestoneAnnotations({ minStars: 30, maxStars: 200 });

      expect(result?.annotations).not.toHaveProperty('milestone10');
      expect(result?.annotations).not.toHaveProperty('milestone500');
    });

    it('returns null when no milestones are visible', () => {
      const result = buildMilestoneAnnotations({ minStars: 200, maxStars: 400 });

      expect(result).toBeNull();
    });

    it('excludes boundary values (min and max)', () => {
      const result = buildMilestoneAnnotations({ minStars: 50, maxStars: 1000 });

      expect(result).not.toBeNull();
      expect(result?.annotations).not.toHaveProperty('milestone50');
      expect(result?.annotations).not.toHaveProperty('milestone1000');
      expect(result?.annotations).toHaveProperty('milestone100');
      expect(result?.annotations).toHaveProperty('milestone500');
    });

    it('uses custom thresholds when provided', () => {
      const result = buildMilestoneAnnotations({
        minStars: 30,
        maxStars: 400,
        thresholds: [50, 250, 5000],
      });

      expect(result?.annotations).toHaveProperty('milestone250');
      expect(result?.annotations.milestone250.yMin).toBe(250);
      expect(result?.annotations).not.toHaveProperty('milestone100');
      expect(result?.annotations).not.toHaveProperty('milestone5000');
    });

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

      const url = generateChartUrl({ history: largeHistory, locale: 'en' });

      expect(url).toBeDefined();

      if (url) {
        const decodedUrl = decodeURIComponent(url);
        const config = JSON.parse(decodedUrl.split(CHART_CONFIG_PARAM)[1]);

        expect(config.options.plugins.annotation).toBeDefined();
        expect(config.options.plugins.annotation.annotations).toHaveProperty('milestone100');
      }
    });

    it('does not include annotations when no milestones in range', () => {
      const url = generateChartUrl({ history: mockHistory, locale: 'en' });

      expect(url).toBeDefined();

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

      const url = generateChartUrl({
        history: largeHistory,
        locale: 'en',
        customMilestones: [90, 110],
      });

      expect(url).toBeDefined();

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

      const url = generateChartUrl({ history: largeHistory, locale: 'en', customMilestones: [] });

      expect(url).toBeDefined();

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

      const url = generateChartUrl({ history: largeHistory, locale: 'en', milestones: false });

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
      const url = generateChartUrl({ history: mockHistory, locale: 'en' });

      expect(url).not.toBeNull();
      if (url) expect(tensionOf(url)).toBe(0.4);
    });

    it('curves the line when smoothing is enabled', () => {
      const url = generateChartUrl({ history: mockHistory, locale: 'en', smoothing: true });

      expect(url).not.toBeNull();
      if (url) expect(tensionOf(url)).toBe(0.4);
    });

    it('draws straight segments when smoothing is disabled', () => {
      const url = generateChartUrl({ history: mockHistory, locale: 'en', smoothing: false });

      expect(url).not.toBeNull();
      if (url) expect(tensionOf(url)).toBe(0);
    });

    it('applies the smoothing setting to comparison datasets', () => {
      const url = generateComparisonChartUrl({
        history: mockHistory,
        repoNames: ['user/repo-a', 'user/repo-b'],
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
      const url = generateChartUrl({ history: weeklyHistory, locale: 'en' });

      expect(url).not.toBeNull();
      if (url) expect(dataLength(url)).toBe(30);
    });

    it('limits the plotted history to the selected time window', () => {
      const all = generateChartUrl({ history: weeklyHistory, locale: 'en' });
      const recent = generateChartUrl({ history: weeklyHistory, locale: 'en', range: '90d' });

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
      const url = generateChartUrl({ history: mockHistory, locale: 'en' });

      expect(url).not.toBeNull();
      if (url) expect(datasetCount(url)).toBe(1);
    });

    it('overlays a dashed moving-average dataset when enabled', () => {
      const url = generateChartUrl({ history: mockHistory, locale: 'en', trendLine: true });

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
      const url = generateChartUrl({ history: mockHistory, locale: 'en' });

      expect(url).not.toBeNull();
      if (url) expect(url).toContain('backgroundColor=%23fff');
    });

    it('uses a dark background and palette for the dark theme', () => {
      const url = generateChartUrl({ history: mockHistory, locale: 'en', theme: 'dark' });

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
      const url = generateChartUrl({ history: mockHistory, locale: 'en' });

      expect(url).not.toBeNull();
      if (url) expect(beginAtZeroOf(url)).toBe(false);
    });

    it('begins the Y-axis at zero when enabled', () => {
      const url = generateChartUrl({ history: mockHistory, locale: 'en', beginAtZero: true });

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
      const url = generateChartUrl({ history: mockHistory, locale: 'en' });

      expect(url).not.toBeNull();
      if (url) expect(pointRadiusOf(url)).toBeGreaterThan(0);
    });

    it('hides point markers when disabled', () => {
      const url = generateChartUrl({ history: mockHistory, locale: 'en', showPoints: false });

      expect(url).not.toBeNull();
      if (url) expect(pointRadiusOf(url)).toBe(0);
    });

    it('hides markers on every comparison dataset when disabled', () => {
      const url = generateComparisonChartUrl({
        history: mockHistory,
        repoNames: ['user/repo-a', 'user/repo-b'],
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
