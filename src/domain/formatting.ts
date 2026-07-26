import type { Locale } from '@i18n';
import { LOCALE_MAP } from '@i18n';
import { MS_PER_YEAR } from './constants';
import { toEpochMs } from './time';

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
  const epochMs = toEpochMs(timestamp);

  if (epochMs === null) return '';

  const localeCode = LOCALE_MAP[locale] || LOCALE_MAP.en;

  return new Date(epochMs).toLocaleDateString(localeCode, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

interface BuildAxisLabelsParams {
  timestamps: string[];
  locale: Locale;
}

export function buildAxisLabels({ timestamps, locale }: BuildAxisLabelsParams): string[] {
  const times = timestamps
    .map((timestamp) => toEpochMs(timestamp))
    .filter((timeMs): timeMs is number => timeMs !== null);

  if (times.length < 2 || Math.max(...times) - Math.min(...times) < MS_PER_YEAR) {
    return timestamps.map((timestamp) => formatDate({ timestamp, locale }));
  }

  let lastYear: number | null = null;

  return timestamps.map((timestamp) => {
    const time = toEpochMs(timestamp);
    if (time === null) return '';

    const year = new Date(time).getUTCFullYear();
    if (year === lastYear) return '';
    lastYear = year;

    return String(year);
  });
}
