import { describe, expect, it } from 'vitest';
import {
  generateBadge,
  generateChartUrl,
  generateComparisonChartUrl,
  generateHtmlReport,
  generateMarkdownReport,
  generatePerRepoChartUrl,
} from './index';

describe('presentation/index', () => {
  it('exports generateBadge', () => {
    expect(generateBadge).toBeDefined();
    expect(typeof generateBadge).toBe('function');
  });

  it('exports chart functions', () => {
    expect(generateChartUrl).toBeDefined();
    expect(generateComparisonChartUrl).toBeDefined();
    expect(generatePerRepoChartUrl).toBeDefined();
  });

  it('exports report functions', () => {
    expect(generateHtmlReport).toBeDefined();
    expect(generateMarkdownReport).toBeDefined();
  });
});
