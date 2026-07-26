import type { Locale } from '@i18n';
import { LOCALE_MAP } from '@i18n';
import { MS_PER_YEAR } from './constants';
import { toEpochMs } from './time';

export const UP_ARROW = '\u2B06\uFE0F';
export const DOWN_ARROW = '\u2B07\uFE0F';
export const DASH = '\u2796';

const COMPACT_MAX_FRACTION_DIGITS = 1;
const compactFormatters = new Map<string, Intl.NumberFormat>();

function compactFormatter(locale: Locale): Intl.NumberFormat {
  const localeCode = LOCALE_MAP[locale] || LOCALE_MAP.en;
  const cached = compactFormatters.get(localeCode);

  if (cached) return cached;

  const formatter = new Intl.NumberFormat(localeCode, {
    notation: 'compact',
    maximumFractionDigits: COMPACT_MAX_FRACTION_DIGITS,
  });

  compactFormatters.set(localeCode, formatter);

  return formatter;
}

interface FormatCountParams {
  count: number;
  locale: Locale;
}

export function formatCount({ count, locale }: FormatCountParams): string {
  return compactFormatter(locale).format(count);
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
