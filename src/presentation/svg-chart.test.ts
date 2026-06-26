import type { ForecastData } from '@domain/forecast';
import { ForecastMethod } from '@domain/forecast';
import type { History, Snapshot } from '@domain/types';
import { describe, expect, it } from 'vitest';
import { CHART_COMPARISON_COLORS, COLORS, DARK_PALETTE, LIGHT_PALETTE } from './constants';
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
    snapshots: starCounts.map((stars, index) => {
      const date = new Date(2026, 0, index + 1).toISOString();
      return makeSnapshot(date, stars);
    }),
  };
}

function makeMultiRepoSnapshot(timestamp: string, repoStars: Record<string, number>): Snapshot {
  const repos = Object.entries(repoStars).map(([fullName, stars]) => {
    const [owner, name] = fullName.split('/');
    return { name, owner, fullName, stars };
  });
  const totalStars = repos.reduce((sum, repo) => sum + repo.stars, 0);

  return { timestamp, totalStars, repos };
}

function makeMultiRepoHistory(snapshots: { repoStars: Record<string, number> }[]): History {
  return {
    snapshots: snapshots.map((snapshot, index) => {
      const date = new Date(2026, 0, index + 1).toISOString();
      return makeMultiRepoSnapshot(date, snapshot.repoStars);
    }),
  };
}

function expectSvg(result: string | null): string {
  expect(result).not.toBeNull();

  return result ?? '';
}

function linePathYs(svg: string): number[] {
  const match = svg.match(/<path d="([^"]+)" fill="none"/);
  const d = match?.[1] ?? '';

  return [...d.matchAll(/(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)/g)].map((coordinate) =>
    Number(coordinate[2]),
  );
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

  it('labels the x-axis by year for multi-year histories', () => {
    const history: History = {
      snapshots: [
        makeSnapshot('2023-02-01T12:00:00Z', 10),
        makeSnapshot('2023-09-01T12:00:00Z', 40),
        makeSnapshot('2024-04-01T12:00:00Z', 90),
        makeSnapshot('2025-01-01T12:00:00Z', 150),
      ],
    };

    const svg = expectSvg(generateSvgChart({ history, locale: 'en' }));

    expect(svg).toContain('>2023<');
    expect(svg).toContain('>2024<');
    expect(svg).toContain('>2025<');
    expect(svg).not.toMatch(/>Feb \d/);
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

  it('uses a prefers-color-scheme media query for the auto theme', () => {
    const history = makeHistory([10, 20, 30]);
    const result = expectSvg(generateSvgChart({ history, locale: 'en' }));

    expect(result).toContain('@media (prefers-color-scheme: dark)');
  });

  it('forces the light palette without a media query for the light theme', () => {
    const history = makeHistory([10, 20, 30]);
    const result = expectSvg(generateSvgChart({ history, locale: 'en', theme: 'light' }));

    expect(result).not.toContain('prefers-color-scheme');
    expect(result).toContain('.chart-bg { fill: #fff; }');
  });

  it('forces the dark palette without a media query for the dark theme', () => {
    const history = makeHistory([10, 20, 30]);
    const result = expectSvg(generateSvgChart({ history, locale: 'en', theme: 'dark' }));

    expect(result).not.toContain('prefers-color-scheme');
    expect(result).toContain('.chart-bg { fill: #0d1117; }');
  });

  it('includes CSS animations', () => {
    const history = makeHistory([10, 20, 30]);
    const result = generateSvgChart({ history, locale: 'en' });

    expect(result).toContain('@keyframes drawLine');
    expect(result).toContain('@keyframes fadeInPoint');
    expect(result).toContain('stroke-dasharray');
    expect(result).toContain('stroke-dashoffset');
  });

  it('omits CSS animations when animation is disabled', () => {
    const history = makeHistory([10, 20, 30]);
    const result = expectSvg(generateSvgChart({ history, locale: 'en', animate: false }));

    expect(result).not.toContain('@keyframes');
    expect(result).not.toContain('animation:');
    expect(result).not.toContain('stroke-dashoffset');
    expect(result).toContain('<circle');
  });

  it('includes data points as circles', () => {
    const history = makeHistory([10, 20, 30, 40, 50]);
    const result = expectSvg(generateSvgChart({ history, locale: 'en' }));
    const circleCount = (result.match(/<circle/g) || []).length;

    expect(circleCount).toBe(5);
  });

  it('omits data point circles when showPoints is disabled', () => {
    const history = makeHistory([10, 20, 30, 40, 50]);
    const result = expectSvg(generateSvgChart({ history, locale: 'en', showPoints: false }));

    expect(result).not.toContain('<circle');
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

  it('floors the Y-axis at zero when beginAtZero is enabled', () => {
    const history = makeHistory([80, 120, 150]);
    const zoomed = expectSvg(generateSvgChart({ history, locale: 'en' }));
    const fromZero = expectSvg(generateSvgChart({ history, locale: 'en', beginAtZero: true }));

    expect(zoomed).not.toContain('>0</text>');
    expect(fromZero).toContain('>0</text>');
  });

  it('omits milestone lines when milestones are disabled', () => {
    const history = makeHistory([80, 120, 150]);
    const result = expectSvg(generateSvgChart({ history, locale: 'en', milestones: false }));

    expect(result).not.toContain('100 ★');
    expect(result).not.toContain('stroke-dasharray="6,6"');
  });

  it('formats large axis values compactly so labels do not overflow', () => {
    const history = makeHistory([10_000, 30_000, 50_000]);
    const result = expectSvg(generateSvgChart({ history, locale: 'en' }));

    expect(result).toMatch(/>\d+(\.\d+)?K<\/text>/);
    expect(result).not.toContain('50,000');
  });

  it('does not include milestone lines outside data range', () => {
    const history = makeHistory([10, 20, 30]);
    const result = expectSvg(generateSvgChart({ history, locale: 'en' }));

    expect(result).not.toContain('100 ★');
    expect(result).not.toContain('500 ★');
  });

  it('limits to 30 data points for large histories', () => {
    const stars = Array.from({ length: 50 }, (_, index) => 10 + index);
    const history = makeHistory(stars);
    const result = expectSvg(generateSvgChart({ history, locale: 'en' }));
    const circleCount = (result.match(/<circle/g) || []).length;

    expect(circleCount).toBe(30);
  });

  it('anchors the line to the baseline so it starts from zero, not mid-air', () => {
    const history = makeHistory([5, 20, 40]);
    const result = expectSvg(generateSvgChart({ history, locale: 'en' }));
    const ys = linePathYs(result);
    const baselineY = 400 - 50;

    expect(ys[0]).toBe(baselineY);
    expect(ys[1]).toBeLessThan(baselineY);
    expect((result.match(/<circle/g) || []).length).toBe(3);
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

  it('includes prefers-color-scheme media query', () => {
    const history = makeHistory([10, 20]);
    const result = expectSvg(generateSvgChart({ history, locale: 'en' }));

    expect(result).toContain('@media (prefers-color-scheme: dark)');
  });

  it('includes CSS class names for themed elements', () => {
    const history = makeHistory([10, 20]);
    const result = expectSvg(generateSvgChart({ history, locale: 'en' }));

    expect(result).toContain('class="chart-bg"');
    expect(result).toContain('class="chart-text"');
    expect(result).toContain('class="chart-muted"');
    expect(result).toContain('class="chart-grid"');
    expect(result).toContain('class="chart-axis"');
  });

  it('uses light palette values in default CSS rules', () => {
    const history = makeHistory([10, 20]);
    const result = expectSvg(generateSvgChart({ history, locale: 'en' }));

    expect(result).toContain(`.chart-bg { fill: ${LIGHT_PALETTE.white}; }`);
    expect(result).toContain(`.chart-text { fill: ${LIGHT_PALETTE.text}; }`);
    expect(result).toContain(`.chart-muted { fill: ${LIGHT_PALETTE.neutral}; }`);
    expect(result).toContain(`.chart-grid { stroke: ${LIGHT_PALETTE.cellBorder}; }`);
    expect(result).toContain(`.chart-axis { stroke: ${LIGHT_PALETTE.neutral}; }`);
  });

  it('uses dark palette values in media query block', () => {
    const history = makeHistory([10, 20]);
    const result = expectSvg(generateSvgChart({ history, locale: 'en' }));

    expect(result).toContain(`.chart-bg { fill: ${DARK_PALETTE.white}; }`);
    expect(result).toContain(`.chart-text { fill: ${DARK_PALETTE.text}; }`);
    expect(result).toContain(`.chart-muted { fill: ${DARK_PALETTE.neutral}; }`);
    expect(result).toContain(`.chart-grid { stroke: ${DARK_PALETTE.cellBorder}; }`);
    expect(result).toContain(`.chart-axis { stroke: ${DARK_PALETTE.neutral}; }`);
  });

  it('keeps data colors inline rather than in CSS classes', () => {
    const history = makeHistory([10, 20, 30]);
    const result = expectSvg(generateSvgChart({ history, locale: 'en' }));

    expect(result).toContain(`stroke="${COLORS.accent}"`);
    expect(result).toContain(`fill="${COLORS.accent}"`);
  });

  it('applies a custom line color', () => {
    const history = makeHistory([10, 20, 30]);
    const result = expectSvg(generateSvgChart({ history, locale: 'en', lineColor: '#6f42c1' }));

    expect(result).toContain('stroke="#6f42c1"');
    expect(result).not.toContain(COLORS.accent);
  });

  it('applies a custom line width to data lines', () => {
    const history = makeHistory([10, 20, 30]);
    const result = expectSvg(generateSvgChart({ history, locale: 'en', lineWidth: 5 }));

    expect(result).toContain('stroke-width="5"');
  });

  it('uses default accent color and width when no overrides given', () => {
    const history = makeHistory([10, 20, 30]);
    const result = expectSvg(generateSvgChart({ history, locale: 'en' }));

    expect(result).toContain(`stroke="${COLORS.accent}"`);
    expect(result).toContain('stroke-width="2.5"');
  });

  it('does not let the smoothed line overshoot below the axis on valleys', () => {
    const history = makeHistory([5, 5, 100, 5, 5]);
    const result = expectSvg(generateSvgChart({ history, locale: 'en' }));
    const ys = linePathYs(result);

    // bottom axis is at CHART.height - margin.bottom = 350, top axis at margin.top = 50
    expect(Math.max(...ys)).toBeLessThanOrEqual(350);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(50);
  });

  it('does not overshoot above the top axis on spikes', () => {
    const history = makeHistory([2, 3, 4, 5, 1000]);
    const result = expectSvg(generateSvgChart({ history, locale: 'en' }));
    const ys = linePathYs(result);

    expect(Math.max(...ys)).toBeLessThanOrEqual(350);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(50);
  });

  it('limits points to maxPoints', () => {
    const history = makeHistory([10, 20, 30, 40, 50]);
    const result = expectSvg(generateSvgChart({ history, locale: 'en', maxPoints: 3 }));

    expect((result.match(/<circle/g) || []).length).toBe(3);
  });

  it('plots the full history when maxPoints is 0', () => {
    const stars = Array.from({ length: 40 }, (_, index) => 10 + index);
    const history = makeHistory(stars);
    const result = expectSvg(generateSvgChart({ history, locale: 'en', maxPoints: 0 }));

    expect((result.match(/<circle/g) || []).length).toBe(40);
  });

  it('renders y-axis labels on the left by default', () => {
    const history = makeHistory([10, 20, 30]);
    const result = expectSvg(generateSvgChart({ history, locale: 'en' }));

    expect(result).toContain('text-anchor="end"');
    expect(result).toContain('<line x1="60" y1="50" x2="60"');
  });

  it('renders y-axis labels and axis line on the right when configured', () => {
    const history = makeHistory([10, 20, 30]);
    const result = expectSvg(generateSvgChart({ history, locale: 'en', yAxisSide: 'right' }));

    expect(result).toContain('x="778" y=');
    expect(result).toContain('text-anchor="start"');
    expect(result).toContain('<line x1="770" y1="50" x2="770"');
    expect(result).not.toContain('text-anchor="end"');
  });

  it('uses smooth cubic curves by default', () => {
    const history = makeHistory([10, 20, 30, 40]);
    const result = expectSvg(generateSvgChart({ history, locale: 'en' }));

    expect(result).toMatch(/ C[\d.]+,[\d.]+ [\d.]+,[\d.]+ [\d.]+,[\d.]+/);
  });

  it('draws straight segments when smoothing is disabled', () => {
    const history = makeHistory([10, 20, 30, 40]);
    const result = expectSvg(generateSvgChart({ history, locale: 'en', smoothing: false }));
    const linePath = result.match(/<path d="([^"]+)" fill="none"/)?.[1] ?? '';

    expect(linePath).toContain(' L');
    expect(linePath).not.toContain(' C');
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

  it('applies a custom line color', () => {
    const history = makeMultiRepoHistory([
      { repoStars: { 'user/repo-a': 10 } },
      { repoStars: { 'user/repo-a': 20 } },
    ]);
    const result = expectSvg(
      generatePerRepoSvgChart({
        history,
        repoFullName: 'user/repo-a',
        locale: 'en',
        lineColor: '#6f42c1',
      }),
    );

    expect(result).toContain('stroke="#6f42c1"');
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

    for (let index = 0; index < 15; index++) {
      const name = `user/repo-${index}`;
      repoStars[name] = 10 + index;
      repoNames.push(name);
    }

    const history = makeMultiRepoHistory([
      { repoStars },
      {
        repoStars: Object.fromEntries(
          Object.entries(repoStars).map(([name, stars]) => [name, stars + 5]),
        ),
      },
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

  it('keeps the comparison palette and applies a custom line width', () => {
    const history = makeMultiRepoHistory([
      { repoStars: { 'user/repo-a': 10, 'user/repo-b': 5 } },
      { repoStars: { 'user/repo-a': 15, 'user/repo-b': 8 } },
    ]);
    const result = expectSvg(
      generateComparisonSvgChart({
        history,
        repoNames: ['user/repo-a', 'user/repo-b'],
        locale: 'en',
        lineWidth: 5,
      }),
    );

    expect(result).toContain(CHART_COMPARISON_COLORS[0]);
    expect(result).toContain(CHART_COMPARISON_COLORS[1]);
    expect(result).toContain('stroke-width="5"');
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

  it('generates valid XML attributes in legend for dashed datasets', () => {
    const history = makeHistory([10, 20, 30]);
    const result = expectSvg(generateForecastSvgChart({ history, forecastData, locale: 'en' }));
    const CONSECUTIVE_XML_ATTRIBUTES = /="[^"]*"="[^"]*"/;

    expect(result).not.toMatch(CONSECUTIVE_XML_ATTRIBUTES);
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

  it('applies custom color to the historical series only, keeping trend colors', () => {
    const history = makeHistory([10, 20, 30]);
    const result = expectSvg(
      generateForecastSvgChart({ history, forecastData, locale: 'en', lineColor: '#6f42c1' }),
    );

    expect(result).toContain('#6f42c1');
    expect(result).toContain(COLORS.positive);
    expect(result).toContain(COLORS.negative);
  });
});
