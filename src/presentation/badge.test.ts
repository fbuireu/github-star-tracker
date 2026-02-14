import { describe, expect, it } from 'vitest';
import { generateBadge } from './badge';

describe('generateBadge', () => {
  it('generates valid SVG', () => {
    const svg = generateBadge({ totalStars: 42 });
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('includes the star count', () => {
    const svg = generateBadge({ totalStars: 42 });
    expect(svg).toContain('42');
  });

  it('includes the star symbol', () => {
    const svg = generateBadge({ totalStars: 10 });
    expect(svg).toContain('\u2605');
  });

  it('formats large numbers', () => {
    const svg = generateBadge({ totalStars: 1500 });
    expect(svg).toContain('1.5K');
  });

  it('includes label text', () => {
    const svg = generateBadge({ totalStars: 0 });
    expect(svg).toContain('Total Stars');
  });

  it('has correct aria-label for accessibility', () => {
    const svg = generateBadge({ totalStars: 100 });
    expect(svg).toContain('aria-label=');
  });
});
