import { describe, expect, it } from 'vitest';
import {
  buildAxisLabels,
  DASH,
  DOWN_ARROW,
  deltaIndicator,
  formatCount,
  formatDate,
  formatSignedPercent,
  trendIcon,
  UP_ARROW,
} from './formatting';

describe('formatCount', () => {
  it('formats small numbers as-is', () => {
    expect(formatCount({ count: 42, locale: 'en' })).toBe('42');
  });

  it('formats thousands with K suffix', () => {
    expect(formatCount({ count: 1500, locale: 'en' })).toBe('1.5K');
  });

  it('formats millions with M suffix', () => {
    expect(formatCount({ count: 2_500_000, locale: 'en' })).toBe('2.5M');
  });

  it('formats zero', () => {
    expect(formatCount({ count: 0, locale: 'en' })).toBe('0');
  });

  it('follows the report locale instead of always using English', () => {
    const english = formatCount({ count: 2_500_000, locale: 'en' });
    const italian = formatCount({ count: 2_500_000, locale: 'it' });

    expect(english).toBe('2.5M');
    expect(italian).not.toBe(english);
  });
});

describe('deltaIndicator', () => {
  it('returns +N for positive deltas', () => {
    expect(deltaIndicator(5)).toBe('+5');
  });

  it('returns -N for negative deltas', () => {
    expect(deltaIndicator(-3)).toBe('-3');
  });

  it('returns 0 for zero delta', () => {
    expect(deltaIndicator(0)).toBe('0');
  });
});

describe('formatSignedPercent', () => {
  it('prefixes a plus sign for non-negative values', () => {
    expect(formatSignedPercent(25)).toBe('+25%');
    expect(formatSignedPercent(0)).toBe('+0%');
  });

  it('keeps the inherent minus sign for negative values', () => {
    expect(formatSignedPercent(-25)).toBe('-25%');
  });
});

describe('trendIcon', () => {
  it('returns up arrow for positive delta', () => {
    expect(trendIcon(1)).toBe(UP_ARROW);
  });

  it('returns down arrow for negative delta', () => {
    expect(trendIcon(-1)).toBe(DOWN_ARROW);
  });

  it('returns dash for zero delta', () => {
    expect(trendIcon(0)).toBe(DASH);
  });
});

describe('formatDate', () => {
  it('formats date in English by default', () => {
    const result = formatDate({ timestamp: '2026-03-15T00:00:00Z', locale: 'en' });

    expect(result).toContain('Mar');
    expect(result).toContain('15');
  });

  it('formats date in Spanish', () => {
    const result = formatDate({ timestamp: '2026-03-15T00:00:00Z', locale: 'es' });

    expect(result).toContain('mar');
  });

  it('formats date in Catalan', () => {
    const result = formatDate({ timestamp: '2026-03-15T00:00:00Z', locale: 'ca' });

    expect(result).toContain('mar');
  });

  it('formats date in Italian', () => {
    const result = formatDate({ timestamp: '2026-03-15T00:00:00Z', locale: 'it' });

    expect(result).toContain('mar');
  });
});

describe('buildAxisLabels', () => {
  it('shows the year once per year for multi-year spans', () => {
    const timestamps = [
      '2023-02-01T12:00:00Z',
      '2023-08-01T12:00:00Z',
      '2024-03-01T12:00:00Z',
      '2024-09-01T12:00:00Z',
      '2025-01-01T12:00:00Z',
    ];

    const labels = buildAxisLabels({ timestamps, locale: 'en' });

    expect(labels).toEqual(['2023', '', '2024', '', '2025']);
  });

  it('emits the year label only at the first occurrence of each year', () => {
    const timestamps = ['2023-01-01T12:00:00Z', '2023-06-01T12:00:00Z', '2024-01-01T12:00:00Z'];

    const labels = buildAxisLabels({ timestamps, locale: 'en' });

    expect(labels.filter(Boolean)).toEqual(['2023', '2024']);
  });

  it('falls back to day-level labels for spans shorter than a year', () => {
    const timestamps = ['2026-01-10T12:00:00Z', '2026-03-15T12:00:00Z'];

    const labels = buildAxisLabels({ timestamps, locale: 'en' });

    expect(labels[0]).toContain('Jan');
    expect(labels[1]).toContain('Mar');
    expect(labels.every((label) => label !== '')).toBe(true);
  });

  it('falls back to day-level labels when fewer than two timestamps exist', () => {
    const labels = buildAxisLabels({ timestamps: ['2026-03-15T12:00:00Z'], locale: 'en' });

    expect(labels[0]).toContain('Mar');
  });
});

describe('unparseable timestamps', () => {
  it('formatDate returns an empty string, so the caller can drop the label', () => {
    expect(formatDate({ timestamp: 'not-a-date', locale: 'en' })).toBe('');
  });

  it('buildAxisLabels emits an empty label for a tick that must not render', () => {
    const labels = buildAxisLabels({
      timestamps: ['2026-01-01T00:00:00Z', 'not-a-date'],
      locale: 'en',
    });

    expect(labels).toHaveLength(2);
    expect(labels[1]).toBe('');
  });
});
