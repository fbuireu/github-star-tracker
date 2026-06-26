import { LOCALE_MAP } from '@config/defaults';
import type { Locale } from '@i18n';
import { MS_PER_YEAR } from './time';

export const UP_ARROW = '\u2B06\uFE0F';
export const DOWN_ARROW = '\u2B07\uFE0F';
export const DASH = '\u2796';

const compactFormatter = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function formatCount(count: number): string {
  return compactFormatter.format(count);
}

export function deltaIndicator(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `${delta}`;
  return '0';
}

export function formatSignedPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value}%`;
}

export function trendIcon(delta: number): string {
  if (delta > 0) return UP_ARROW;
  if (delta < 0) return DOWN_ARROW;
  return DASH;
}

interface FormatDateParams {
  timestamp: string;
  locale: Locale;
}

export function formatDate({ timestamp, locale }: FormatDateParams): string {
  const date = new Date(timestamp);
  const localeCode = LOCALE_MAP[locale] || LOCALE_MAP.en;

  return date.toLocaleDateString(localeCode, { month: 'short', day: 'numeric' });
}

interface BuildAxisLabelsParams {
  timestamps: string[];
  locale: Locale;
}

/**
 * Builds x-axis labels that scale with the total time span: for histories that
 * span a year or more, only the year is shown (once, at its first occurrence),
 * so a multi-year chart reads as `2023 … 2024 … 2025` instead of a wall of
 * day numbers with no year. Shorter histories keep the day-level `MMM D` label.
 * Empty strings mark positions that should not render a tick.
 */
export function buildAxisLabels({ timestamps, locale }: BuildAxisLabelsParams): string[] {
  const times = timestamps.map((timestamp) => Date.parse(timestamp)).filter(Number.isFinite);

  if (times.length < 2 || Math.max(...times) - Math.min(...times) < MS_PER_YEAR) {
    return timestamps.map((timestamp) => formatDate({ timestamp, locale }));
  }

  let lastYear: number | null = null;

  return timestamps.map((timestamp) => {
    const time = Date.parse(timestamp);
    if (!Number.isFinite(time)) return '';

    const year = new Date(time).getUTCFullYear();
    if (year === lastYear) return '';
    lastYear = year;

    return String(year);
  });
}
