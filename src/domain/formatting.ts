import { LOCALE_MAP } from '@config/defaults';
import type { Locale } from '@i18n';

export const UP_ARROW = '\u2B06\uFE0F';
export const DOWN_ARROW = '\u2B07\uFE0F';
export const DASH = '\u2796';

const compactFormatter = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function formatCount(n: number): string {
  return compactFormatter.format(n);
}

export function deltaIndicator(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `${delta}`;
  return '0';
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
