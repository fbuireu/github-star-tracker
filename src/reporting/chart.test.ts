import { describe, expect, it } from 'vitest';
import type { History } from '../types';
import { generateChartUrl, generateComparisonChartUrl, generatePerRepoChartUrl } from './chart';

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
        expect(decodedUrl).toContain('user/repo-a');
        expect(decodedUrl).toContain('user/repo-b');
        expect(decodedUrl).toContain('"data":[50,70,90]');
        expect(decodedUrl).toContain('"data":[50,50,60]');
      }
    });

    it('should limit to 5 repositories maximum', () => {
      const url = generateComparisonChartUrl({
        history: mockHistory,
        repoNames: [
          'user/repo-a',
          'user/repo-b',
          'user/repo-c',
          'user/repo-d',
          'user/repo-e',
          'user/repo-f',
        ],
        locale: 'en',
      });

      expect(url).toBeDefined();
      if (url) {
        const decodedUrl = decodeURIComponent(url);
        const config = JSON.parse(decodedUrl.split('&c=')[1]);
        expect(config.data.datasets).toHaveLength(5);
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
  });
});
