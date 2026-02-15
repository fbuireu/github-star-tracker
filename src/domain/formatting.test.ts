import { describe, expect, it } from 'vitest';
import { deltaIndicator, formatCount, formatDate, trendIcon } from './formatting';

describe('formatCount', () => {
  it('formats small numbers as-is', () => {
    expect(formatCount(42)).toBe('42');
  });

  it('formats thousands with K suffix', () => {
    expect(formatCount(1500)).toBe('1.5K');
  });

  it('formats millions with M suffix', () => {
    expect(formatCount(2_500_000)).toBe('2.5M');
  });

  it('formats zero', () => {
    expect(formatCount(0)).toBe('0');
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

describe('trendIcon', () => {
  it('returns up arrow for positive delta', () => {
    expect(trendIcon(1)).toBe('\u2B06\uFE0F');
  });

  it('returns down arrow for negative delta', () => {
    expect(trendIcon(-1)).toBe('\u2B07\uFE0F');
  });

  it('returns dash for zero delta', () => {
    expect(trendIcon(0)).toBe('\u2796');
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
