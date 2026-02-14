import { describe, expect, it } from 'vitest';
import {
  generateBadge,
  generateChartUrl,
  generateComparisonChartUrl,
  generateHtmlReport,
  generateMarkdownReport,
  generatePerRepoChartUrl,
  getEmailConfig,
  sendEmail,
} from './index';

describe('reporting/index', () => {
  it('exports generateBadge', () => {
    expect(generateBadge).toBeDefined();
    expect(typeof generateBadge).toBe('function');
  });

  it('exports chart functions', () => {
    expect(generateChartUrl).toBeDefined();
    expect(generateComparisonChartUrl).toBeDefined();
    expect(generatePerRepoChartUrl).toBeDefined();
  });

  it('exports email functions', () => {
    expect(getEmailConfig).toBeDefined();
    expect(sendEmail).toBeDefined();
  });

  it('exports report functions', () => {
    expect(generateHtmlReport).toBeDefined();
    expect(generateMarkdownReport).toBeDefined();
  });
});
