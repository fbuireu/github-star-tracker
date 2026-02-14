import { formatCount } from '@domain/formatting';
import { getTranslations, type Locale } from '@i18n';
import { BADGE, COLORS } from './constants';

interface GenerateBadgeParams {
  totalStars: number;
  locale?: Locale;
}

export function generateBadge({ totalStars, locale = 'en' }: GenerateBadgeParams): string {
  const t = getTranslations(locale);
  const label = t.badge.totalStars;
  const value = `\u2605 ${formatCount(totalStars)}`;

  const labelWidth = label.length * BADGE.labelCharWidth + BADGE.horizontalPadding;
  const valueWidth = value.length * BADGE.valueCharWidth + BADGE.horizontalPadding;
  const totalWidth = labelWidth + valueWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${BADGE.height}" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="${COLORS.gradientStart}" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="${BADGE.height}" rx="${BADGE.borderRadius}" fill="${COLORS.white}"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="${BADGE.height}" fill="${COLORS.muted}"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="${BADGE.height}" fill="${COLORS.accent}"/>
    <rect width="${totalWidth}" height="${BADGE.height}" fill="url(#s)"/>
  </g>
  <g fill="${COLORS.white}" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text aria-hidden="true" x="${labelWidth / 2}" y="15" fill="${COLORS.shadow}" fill-opacity=".3">${label}</text>
    <text x="${labelWidth / 2}" y="14">${label}</text>
    <text aria-hidden="true" x="${labelWidth + valueWidth / 2}" y="15" fill="${COLORS.shadow}" fill-opacity=".3">${value}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14">${value}</text>
  </g>
</svg>`;
}
