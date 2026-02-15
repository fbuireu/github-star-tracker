import type { ForecastData } from '@domain/forecast';
import { ForecastMethod } from '@domain/forecast';
import type { History, Snapshot } from '@domain/types';
import { describe, expect, it } from 'vitest';
import { CHART_COMPARISON_COLORS, COLORS } from './constants';
import {
  generateComparisonSvgChart,
  generateForecastSvgChart,
  generatePerRepoSvgChart,
  generateSvgChart,
} from './svg-chart';

function makeSnapshot(timestamp: string, totalStars: number): Snapshot {
  return {
    timestamp,
    totalStars,
    repos: [{ name: 'repo-a', owner: 'user', fullName: 'user/repo-a', stars: totalStars }],
  };
}

function makeHistory(starCounts: number[]): History {
  return {
    snapshots: starCounts.map((stars, i) => {
      const date = new Date(2026, 0, i + 1).toISOString();
      return makeSnapshot(date, stars);
    }),
  };
}

function makeMultiRepoSnapshot(timestamp: string, repoStars: Record<string, number>): Snapshot {
  const repos = Object.entries(repoStars).map(([fullName, stars]) => {
    const [owner, name] = fullName.split('/');
    return { name, owner, fullName, stars };
  });
  const totalStars = repos.reduce((sum, r) => sum + r.stars, 0);
  return { timestamp, totalStars, repos };
}

function makeMultiRepoHistory(snapshots: { repoStars: Record<string, number> }[]): History {
  return {
    snapshots: snapshots.map((s, i) => {
      const date = new Date(2026, 0, i + 1).toISOString();
      return makeMultiRepoSnapshot(date, s.repoStars);
    }),
  };
}

function expectSvg(result: string | null): string {
  expect(result).not.toBeNull();
  return result ?? '';
}

describe('generateSvgChart', () => {
  it('returns null for empty history', () => {
    const result = generateSvgChart({ history: { snapshots: [] }, locale: 'en' });
    expect(result).toBeNull();
  });

  it('returns null for fewer than 2 snapshots', () => {
    const history = makeHistory([10]);
    const result = generateSvgChart({ history, locale: 'en' });
    expect(result).toBeNull();
  });

  it('generates valid SVG structure', () => {
    const history = makeHistory([10, 20, 30]);
    const result = generateSvgChart({ history, locale: 'en' });

    expect(result).toContain('<svg');
    expect(result).toContain('viewBox="0 0 800 400"');
    expect(result).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(result).toContain('</svg>');
  });

  it('includes title', () => {
    const history = makeHistory([10, 20]);
    const result = generateSvgChart({ history, title: 'My Star Chart', locale: 'en' });

    expect(result).toContain('My Star Chart');
  });

  it('uses default title when not provided', () => {
    const history = makeHistory([10, 20]);
    const result = generateSvgChart({ history, locale: 'en' });

    expect(result).toContain('Star History');
  });

  it('includes CSS animations', () => {
    const history = makeHistory([10, 20, 30]);
    const result = generateSvgChart({ history, locale: 'en' });

    expect(result).toContain('@keyframes drawLine');
    expect(result).toContain('@keyframes fadeInPoint');
    expect(result).toContain('stroke-dasharray');
    expect(result).toContain('stroke-dashoffset');
  });

  it('includes data points as circles', () => {
    const history = makeHistory([10, 20, 30, 40, 50]);
    const result = expectSvg(generateSvgChart({ history, locale: 'en' }));

    const circleCount = (result.match(/<circle/g) || []).length;
    expect(circleCount).toBe(5);
  });

  it('includes smooth path with cubic bezier curves', () => {
    const history = makeHistory([10, 20, 30, 40]);
    const result = expectSvg(generateSvgChart({ history, locale: 'en' }));

    expect(result).toContain('<path');
    expect(result).toMatch(/ C[\d.]+,[\d.]+ [\d.]+,[\d.]+ [\d.]+,[\d.]+/);
  });

  it('uses project accent color', () => {
    const history = makeHistory([10, 20]);
    const result = expectSvg(generateSvgChart({ history, locale: 'en' }));

    expect(result).toContain(COLORS.accent);
  });

  it('uses project neutral color', () => {
    const history = makeHistory([10, 20]);
    const result = expectSvg(generateSvgChart({ history, locale: 'en' }));

    expect(result).toContain(COLORS.neutral);
  });

  it('respects locale for date labels', () => {
    const history: History = {
      snapshots: [
        makeSnapshot('2026-03-15T00:00:00Z', 10),
        makeSnapshot('2026-06-20T00:00:00Z', 20),
      ],
    };

    const enResult = expectSvg(generateSvgChart({ history, locale: 'en' }));
    const esResult = expectSvg(generateSvgChart({ history, locale: 'es' }));

    expect(enResult).toContain('Mar');
    expect(esResult).toContain('mar');
  });

  it('includes milestone lines when data range crosses thresholds', () => {
    const history = makeHistory([80, 120, 150]);
    const result = expectSvg(generateSvgChart({ history, locale: 'en' }));

    expect(result).toContain('100');
    expect(result).toContain('stroke-dasharray="6,6"');
  });

  it('does not include milestone lines outside data range', () => {
    const history = makeHistory([10, 20, 30]);
    const result = expectSvg(generateSvgChart({ history, locale: 'en' }));

    expect(result).not.toContain('100 ★');
    expect(result).not.toContain('500 ★');
  });

  it('limits to 30 data points for large histories', () => {
    const stars = Array.from({ length: 50 }, (_, i) => 10 + i);
    const history = makeHistory(stars);
    const result = expectSvg(generateSvgChart({ history, locale: 'en' }));

    const circleCount = (result.match(/<circle/g) || []).length;
    expect(circleCount).toBe(30);
  });

  it('handles equal star counts without errors', () => {
    const history = makeHistory([100, 100, 100]);
    const result = generateSvgChart({ history, locale: 'en' });

    expect(result).not.toBeNull();
    expect(result).toContain('<svg');
  });

  it('includes staggered animation delays on points', () => {
    const history = makeHistory([10, 20, 30]);
    const result = expectSvg(generateSvgChart({ history, locale: 'en' }));

    expect(result).toContain('animation-delay: 1.50s');
    expect(result).toContain('animation-delay: 1.55s');
    expect(result).toContain('animation-delay: 1.60s');
  });
});

describe('generatePerRepoSvgChart', () => {
  it('returns null for empty history', () => {
    const result = generatePerRepoSvgChart({
      history: { snapshots: [] },
      repoFullName: 'user/repo-a',
      locale: 'en',
    });
    expect(result).toBeNull();
  });

  it('returns null for fewer than 2 snapshots', () => {
    const history = makeHistory([10]);
    const result = generatePerRepoSvgChart({
      history,
      repoFullName: 'user/repo-a',
      locale: 'en',
    });
    expect(result).toBeNull();
  });

  it('generates valid SVG structure', () => {
    const history = makeMultiRepoHistory([
      { repoStars: { 'user/repo-a': 10, 'user/repo-b': 5 } },
      { repoStars: { 'user/repo-a': 15, 'user/repo-b': 8 } },
    ]);
    const result = generatePerRepoSvgChart({
      history,
      repoFullName: 'user/repo-a',
      locale: 'en',
    });

    expect(result).toContain('<svg');
    expect(result).toContain('</svg>');
  });

  it('uses default title with repo name', () => {
    const history = makeMultiRepoHistory([
      { repoStars: { 'user/repo-a': 10 } },
      { repoStars: { 'user/repo-a': 20 } },
    ]);
    const result = expectSvg(
      generatePerRepoSvgChart({ history, repoFullName: 'user/repo-a', locale: 'en' }),
    );

    expect(result).toContain('user/repo-a Star History');
  });

  it('uses custom title when provided', () => {
    const history = makeMultiRepoHistory([
      { repoStars: { 'user/repo-a': 10 } },
      { repoStars: { 'user/repo-a': 20 } },
    ]);
    const result = expectSvg(
      generatePerRepoSvgChart({
        history,
        repoFullName: 'user/repo-a',
        title: 'Custom Title',
        locale: 'en',
      }),
    );

    expect(result).toContain('Custom Title');
  });

  it('extracts correct repo data', () => {
    const history = makeMultiRepoHistory([
      { repoStars: { 'user/repo-a': 10, 'user/repo-b': 100 } },
      { repoStars: { 'user/repo-a': 20, 'user/repo-b': 200 } },
    ]);
    const result = expectSvg(
      generatePerRepoSvgChart({ history, repoFullName: 'user/repo-a', locale: 'en' }),
    );

    expect(result).toContain(COLORS.accent);
    expect(result).toContain('<circle');
  });

  it('does not include milestones', () => {
    const history = makeMultiRepoHistory([
      { repoStars: { 'user/repo-a': 80 } },
      { repoStars: { 'user/repo-a': 120 } },
    ]);
    const result = expectSvg(
      generatePerRepoSvgChart({ history, repoFullName: 'user/repo-a', locale: 'en' }),
    );

    expect(result).not.toContain('100 ★');
  });
});

describe('generateComparisonSvgChart', () => {
  it('returns null for empty history', () => {
    const result = generateComparisonSvgChart({
      history: { snapshots: [] },
      repoNames: ['user/repo-a'],
      locale: 'en',
    });
    expect(result).toBeNull();
  });

  it('returns null for empty repo names', () => {
    const history = makeHistory([10, 20]);
    const result = generateComparisonSvgChart({
      history,
      repoNames: [],
      locale: 'en',
    });
    expect(result).toBeNull();
  });

  it('generates valid SVG with legend', () => {
    const history = makeMultiRepoHistory([
      { repoStars: { 'user/repo-a': 10, 'user/repo-b': 5 } },
      { repoStars: { 'user/repo-a': 15, 'user/repo-b': 8 } },
    ]);
    const result = expectSvg(
      generateComparisonSvgChart({
        history,
        repoNames: ['user/repo-a', 'user/repo-b'],
        locale: 'en',
      }),
    );

    expect(result).toContain('<svg');
    expect(result).toContain('class="legend"');
  });

  it('uses comparison colors', () => {
    const history = makeMultiRepoHistory([
      { repoStars: { 'user/repo-a': 10, 'user/repo-b': 5 } },
      { repoStars: { 'user/repo-a': 15, 'user/repo-b': 8 } },
    ]);
    const result = expectSvg(
      generateComparisonSvgChart({
        history,
        repoNames: ['user/repo-a', 'user/repo-b'],
        locale: 'en',
      }),
    );

    expect(result).toContain(CHART_COMPARISON_COLORS[0]);
    expect(result).toContain(CHART_COMPARISON_COLORS[1]);
  });

  it('uses short labels when single owner', () => {
    const history = makeMultiRepoHistory([
      { repoStars: { 'user/repo-a': 10, 'user/repo-b': 5 } },
      { repoStars: { 'user/repo-a': 15, 'user/repo-b': 8 } },
    ]);
    const result = expectSvg(
      generateComparisonSvgChart({
        history,
        repoNames: ['user/repo-a', 'user/repo-b'],
        locale: 'en',
      }),
    );

    expect(result).toContain('>repo-a<');
    expect(result).toContain('>repo-b<');
  });

  it('uses full names when multiple owners', () => {
    const history = makeMultiRepoHistory([
      { repoStars: { 'alice/repo-a': 10, 'bob/repo-b': 5 } },
      { repoStars: { 'alice/repo-a': 15, 'bob/repo-b': 8 } },
    ]);
    const result = expectSvg(
      generateComparisonSvgChart({
        history,
        repoNames: ['alice/repo-a', 'bob/repo-b'],
        locale: 'en',
      }),
    );

    expect(result).toContain('alice/repo-a');
    expect(result).toContain('bob/repo-b');
  });

  it('caps at maxComparison repos', () => {
    const repoStars: Record<string, number> = {};
    const repoNames: string[] = [];
    for (let i = 0; i < 15; i++) {
      const name = `user/repo-${i}`;
      repoStars[name] = 10 + i;
      repoNames.push(name);
    }
    const history = makeMultiRepoHistory([
      { repoStars },
      { repoStars: Object.fromEntries(Object.entries(repoStars).map(([k, v]) => [k, v + 5])) },
    ]);

    const result = expectSvg(generateComparisonSvgChart({ history, repoNames, locale: 'en' }));

    const pathCount = (result.match(/<path d="M/g) || []).length;
    expect(pathCount).toBeLessThanOrEqual(10);
  });

  it('includes title', () => {
    const history = makeMultiRepoHistory([
      { repoStars: { 'user/repo-a': 10 } },
      { repoStars: { 'user/repo-a': 20 } },
    ]);
    const result = expectSvg(
      generateComparisonSvgChart({
        history,
        repoNames: ['user/repo-a'],
        title: 'My Comparison',
        locale: 'en',
      }),
    );

    expect(result).toContain('My Comparison');
  });
});

describe('generateForecastSvgChart', () => {
  const forecastData: ForecastData = {
    aggregate: {
      forecasts: [
        {
          method: ForecastMethod.LINEAR_REGRESSION,
          points: [
            { weekOffset: 1, predicted: 35 },
            { weekOffset: 2, predicted: 40 },
            { weekOffset: 3, predicted: 45 },
            { weekOffset: 4, predicted: 50 },
          ],
        },
        {
          method: ForecastMethod.WEIGHTED_MOVING_AVERAGE,
          points: [
            { weekOffset: 1, predicted: 33 },
            { weekOffset: 2, predicted: 36 },
            { weekOffset: 3, predicted: 39 },
            { weekOffset: 4, predicted: 42 },
          ],
        },
      ],
    },
    repos: [],
  };

  it('returns null for empty history', () => {
    const result = generateForecastSvgChart({
      history: { snapshots: [] },
      forecastData,
      locale: 'en',
    });
    expect(result).toBeNull();
  });

  it('returns null for fewer than 2 snapshots', () => {
    const history = makeHistory([10]);
    const result = generateForecastSvgChart({ history, forecastData, locale: 'en' });
    expect(result).toBeNull();
  });

  it('generates valid SVG with legend', () => {
    const history = makeHistory([10, 20, 30]);
    const result = expectSvg(generateForecastSvgChart({ history, forecastData, locale: 'en' }));

    expect(result).toContain('<svg');
    expect(result).toContain('class="legend"');
    expect(result).toContain('</svg>');
  });

  it('includes dashed lines for forecast', () => {
    const history = makeHistory([10, 20, 30]);
    const result = expectSvg(generateForecastSvgChart({ history, forecastData, locale: 'en' }));

    expect(result).toContain('stroke-dasharray="8,4"');
  });

  it('uses correct colors for 3 datasets', () => {
    const history = makeHistory([10, 20, 30]);
    const result = expectSvg(generateForecastSvgChart({ history, forecastData, locale: 'en' }));

    expect(result).toContain(COLORS.accent);
    expect(result).toContain(COLORS.positive);
    expect(result).toContain(COLORS.negative);
  });

  it('includes forecast labels in legend', () => {
    const history = makeHistory([10, 20, 30]);
    const result = expectSvg(generateForecastSvgChart({ history, forecastData, locale: 'en' }));

    expect(result).toContain('Star History');
    expect(result).toContain('Linear Regression');
    expect(result).toContain('Weighted Moving Average');
  });

  it('includes week labels', () => {
    const history = makeHistory([10, 20, 30]);
    const result = expectSvg(generateForecastSvgChart({ history, forecastData, locale: 'en' }));

    expect(result).toContain('Week 1');
  });

  it('uses custom title when provided', () => {
    const history = makeHistory([10, 20, 30]);
    const result = expectSvg(
      generateForecastSvgChart({
        history,
        forecastData,
        locale: 'en',
        title: 'Custom Forecast',
      }),
    );

    expect(result).toContain('Custom Forecast');
  });

  it('respects locale', () => {
    const history: History = {
      snapshots: [
        makeSnapshot('2026-03-15T00:00:00Z', 10),
        makeSnapshot('2026-06-20T00:00:00Z', 20),
      ],
    };

    const enResult = expectSvg(generateForecastSvgChart({ history, forecastData, locale: 'en' }));
    const esResult = expectSvg(generateForecastSvgChart({ history, forecastData, locale: 'es' }));

    expect(enResult).toContain('Mar');
    expect(esResult).toContain('mar');
  });
});
