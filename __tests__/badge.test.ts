import { describe, expect, it } from 'vitest';
import { generateBadge } from '../src/reporting/badge';
import { formatCount } from '../src/utils';

describe('formatCount', () => {
  it('returns raw number for values under 1000', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(42)).toBe('42');
    expect(formatCount(999)).toBe('999');
  });

  it('formats thousands with K suffix', () => {
    expect(formatCount(1000)).toBe('1K');
    expect(formatCount(1500)).toBe('1.5K');
    expect(formatCount(99999)).toBe('100K');
  });

  it('formats millions with M suffix', () => {
    expect(formatCount(1000000)).toBe('1M');
    expect(formatCount(2500000)).toBe('2.5M');
  });
});

describe('generateBadge', () => {
  it('generates valid SVG', () => {
    const svg = generateBadge(42);
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('includes the star count', () => {
    const svg = generateBadge(42);
    expect(svg).toContain('42');
  });

  it('includes the star symbol', () => {
    const svg = generateBadge(10);
    expect(svg).toContain('\u2605');
  });

  it('formats large numbers', () => {
    const svg = generateBadge(1500);
    expect(svg).toContain('1.5K');
  });

  it('includes label text', () => {
    const svg = generateBadge(0);
    expect(svg).toContain('total stars');
  });

  it('has correct aria-label for accessibility', () => {
    const svg = generateBadge(100);
    expect(svg).toContain('aria-label=');
  });
});
