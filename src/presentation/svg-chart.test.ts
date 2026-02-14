import type { History, Snapshot } from '@domain/types';
import { describe, expect, it } from 'vitest';
import { COLORS } from './constants';
import { generateSvgChart } from './svg-chart';

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
