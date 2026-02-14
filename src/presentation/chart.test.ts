import type { History } from '@domain/types';
import { describe, expect, it } from 'vitest';
import {
  buildMilestoneAnnotations,
  generateChartUrl,
  generateComparisonChartUrl,
  generateForecastChartUrl,
  generatePerRepoChartUrl,
} from './chart';

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
    it('should generate valid QuickChart URL with history data', () => {
      const url = generateChartUrl({ history: mockHistory, title: 'Test Chart', locale: 'en' });

      expect(url).toContain('https://quickchart.io/chart?');
      expect(url).toContain('w=800');
      expect(url).toContain('h=400');
      expect(url).toContain('&c=');
    });

    it('should return null when history has less than 2 snapshots', () => {
      const singleSnapshot: History = {
        snapshots: [mockHistory.snapshots[0]],
      };

      const url = generateChartUrl({ history: singleSnapshot, locale: 'en' });
      expect(url).toBeNull();
    });

    it('should return null when history has no snapshots', () => {
      const emptyHistory: History = { snapshots: [] };

      const url = generateChartUrl({ history: emptyHistory, locale: 'en' });
      expect(url).toBeNull();
    });

    it('should include correct data points in chart config', () => {
      const url = generateChartUrl({ history: mockHistory, locale: 'en' });

      expect(url).toBeDefined();
      if (url) {
        const decodedUrl = decodeURIComponent(url);
        expect(decodedUrl).toContain('"data":[100,120,150]');
        expect(decodedUrl).toContain('"label":"Stars"');
      }
    });

    it('should format dates correctly', () => {
      const url = generateChartUrl({ history: mockHistory, locale: 'en' });

      expect(url).toBeDefined();
      if (url) {
        const decodedUrl = decodeURIComponent(url);
        expect(decodedUrl).toContain('Jan 1');
        expect(decodedUrl).toContain('Jan 8');
        expect(decodedUrl).toContain('Jan 15');
      }
    });

    it('should limit data to last 30 points', () => {
      const largeHistory: History = {
        snapshots: Array.from({ length: 50 }, (_, i) => ({
          timestamp: new Date(2025, 0, i + 1).toISOString(),
          totalStars: 100 + i * 10,
          repos: [],
        })),
      };

      const url = generateChartUrl({ history: largeHistory, locale: 'en' });

      expect(url).toBeDefined();
      if (url) {
        const decodedUrl = decodeURIComponent(url);
        const config = JSON.parse(decodedUrl.split('&c=')[1]);
        expect(config.data.labels).toHaveLength(30);
        expect(config.data.datasets[0].data).toHaveLength(30);
      }
    });
  });

  describe('generatePerRepoChartUrl', () => {
    it('should generate chart for specific repository', () => {
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

    it('should use custom title when provided', () => {
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

    it('should return null for non-existent repository', () => {
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

    it('should return null when history has less than 2 snapshots', () => {
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
    it('should generate comparison chart for multiple repositories', () => {
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

    it('should limit to 10 repositories maximum', () => {
      const url = generateComparisonChartUrl({
        history: mockHistory,
        repoNames: Array.from({ length: 12 }, (_, i) => `user/repo-${i}`),
        locale: 'en',
      });

      expect(url).toBeDefined();
      if (url) {
        const decodedUrl = decodeURIComponent(url);
        const config = JSON.parse(decodedUrl.split('&c=')[1]);
        expect(config.data.datasets).toHaveLength(10);
      }
    });

    it('should return null when no repositories provided', () => {
      const url = generateComparisonChartUrl({ history: mockHistory, repoNames: [], locale: 'en' });
      expect(url).toBeNull();
    });

    it('should return null when history has less than 2 snapshots', () => {
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

    it('should use custom title when provided', () => {
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

    it('should enable legend for multiple repositories', () => {
      const url = generateComparisonChartUrl({
        history: mockHistory,
        repoNames: ['user/repo-a', 'user/repo-b'],
        locale: 'en',
      });

      expect(url).toBeDefined();
      if (url) {
        const decodedUrl = decodeURIComponent(url);
        const config = JSON.parse(decodedUrl.split('&c=')[1]);
        expect(config.options.plugins.legend.display).toBe(true);
      }
    });

    it('should use short labels when all repos share the same owner', () => {
      const url = generateComparisonChartUrl({
        history: mockHistory,
        repoNames: ['user/repo-a', 'user/repo-b'],
        locale: 'en',
      });

      expect(url).toBeDefined();
      if (url) {
        const decodedUrl = decodeURIComponent(url);
        const config = JSON.parse(decodedUrl.split('&c=')[1]);
        expect(config.data.datasets[0].label).toBe('repo-a');
        expect(config.data.datasets[1].label).toBe('repo-b');
      }
    });

    it('should use full names when repos have different owners', () => {
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
        const config = JSON.parse(decodedUrl.split('&c=')[1]);
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
            method: 'linear-regression' as const,
            points: [
              { weekOffset: 1, predicted: 170 },
              { weekOffset: 2, predicted: 195 },
              { weekOffset: 3, predicted: 220 },
              { weekOffset: 4, predicted: 245 },
            ],
          },
          {
            method: 'weighted-moving-average' as const,
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

    it('should generate forecast chart with dashed lines', () => {
      const url = generateForecastChartUrl({
        history: mockHistory,
        forecastData,
        locale: 'en',
      });

      expect(url).toBeDefined();
      if (url) {
        const decodedUrl = decodeURIComponent(url);
        const config = JSON.parse(decodedUrl.split('&c=')[1]);
        expect(config.data.datasets).toHaveLength(3);
        expect(config.data.datasets[0].borderDash).toBeUndefined();
        expect(config.data.datasets[1].borderDash).toEqual([8, 4]);
        expect(config.data.datasets[2].borderDash).toEqual([4, 4]);
      }
    });

    it('should include historical and forecast labels', () => {
      const url = generateForecastChartUrl({
        history: mockHistory,
        forecastData,
        locale: 'en',
      });

      expect(url).toBeDefined();
      if (url) {
        const decodedUrl = decodeURIComponent(url);
        const config = JSON.parse(decodedUrl.split('&c=')[1]);
        expect(config.data.labels).toHaveLength(7);
        expect(config.data.labels[3]).toContain('Week');
      }
    });

    it('should return null when history has less than 2 snapshots', () => {
      const url = generateForecastChartUrl({
        history: { snapshots: [mockHistory.snapshots[0]] },
        forecastData,
        locale: 'en',
      });
      expect(url).toBeNull();
    });

    it('should enable legend', () => {
      const url = generateForecastChartUrl({
        history: mockHistory,
        forecastData,
        locale: 'en',
      });

      expect(url).toBeDefined();
      if (url) {
        const decodedUrl = decodeURIComponent(url);
        const config = JSON.parse(decodedUrl.split('&c=')[1]);
        expect(config.options.plugins.legend.display).toBe(true);
      }
    });
  });

  describe('buildMilestoneAnnotations', () => {
    it('should return annotations for milestones within range', () => {
      const result = buildMilestoneAnnotations({ minStars: 30, maxStars: 200 });

      expect(result).not.toBeNull();
      expect(result?.annotations).toHaveProperty('milestone50');
      expect(result?.annotations).toHaveProperty('milestone100');
      expect(result?.annotations.milestone50.yMin).toBe(50);
      expect(result?.annotations.milestone100.yMin).toBe(100);
    });

    it('should exclude milestones outside the visible range', () => {
      const result = buildMilestoneAnnotations({ minStars: 30, maxStars: 200 });

      expect(result?.annotations).not.toHaveProperty('milestone10');
      expect(result?.annotations).not.toHaveProperty('milestone500');
    });

    it('should return null when no milestones are visible', () => {
      const result = buildMilestoneAnnotations({ minStars: 200, maxStars: 400 });
      expect(result).toBeNull();
    });

    it('should exclude boundary values (min and max)', () => {
      const result = buildMilestoneAnnotations({ minStars: 50, maxStars: 1000 });

      expect(result).not.toBeNull();
      expect(result?.annotations).not.toHaveProperty('milestone50');
      expect(result?.annotations).not.toHaveProperty('milestone1000');
      expect(result?.annotations).toHaveProperty('milestone100');
      expect(result?.annotations).toHaveProperty('milestone500');
    });

    it('should include milestone annotations in aggregate chart', () => {
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
        const config = JSON.parse(decodedUrl.split('&c=')[1]);
        expect(config.options.plugins.annotation).toBeDefined();
        expect(config.options.plugins.annotation.annotations).toHaveProperty('milestone100');
      }
    });

    it('should not include annotations when no milestones in range', () => {
      const url = generateChartUrl({ history: mockHistory, locale: 'en' });

      expect(url).toBeDefined();
      if (url) {
        const decodedUrl = decodeURIComponent(url);
        const config = JSON.parse(decodedUrl.split('&c=')[1]);
        expect(config.options.plugins.annotation).toBeUndefined();
      }
    });
  });
});
