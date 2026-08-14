import { formatCount } from '@domain/formatting';
import { getTranslations, type Locale } from '@i18n';
import { BADGE, COLORS } from './constants';
import { EscapeDialect, escapeFor } from './escaping';

const escapeXml = escapeFor(EscapeDialect.XML);

interface GenerateBadgeParams {
  totalStars: number;
  locale: Locale;
}

export function generateBadge({ totalStars, locale }: GenerateBadgeParams): string {
  const t = getTranslations(locale);
  const rawLabel = t.badge.totalStars;
  const rawValue = `\u2605 ${formatCount({ count: totalStars, locale })}`;
  const labelWidth = rawLabel.length * BADGE.labelCharWidth + BADGE.horizontalPadding;
  const valueWidth = rawValue.length * BADGE.valueCharWidth + BADGE.horizontalPadding;
  const totalWidth = labelWidth + valueWidth;
  const label = escapeXml(rawLabel);
  const value = escapeXml(rawValue);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${BADGE.height}" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="${COLORS.gradientStart}" stop-opacity="${BADGE.gradientOpacity}"/>
    <stop offset="1" stop-opacity="${BADGE.gradientOpacity}"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="${BADGE.height}" rx="${BADGE.borderRadius}" fill="${COLORS.white}"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="${BADGE.height}" fill="${COLORS.muted}"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="${BADGE.height}" fill="${COLORS.accent}"/>
    <rect width="${totalWidth}" height="${BADGE.height}" fill="url(#s)"/>
  </g>
  <g fill="${COLORS.white}" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="${BADGE.fontSize}">
    <text aria-hidden="true" x="${labelWidth / 2}" y="${BADGE.shadowBaseline}" fill="${COLORS.shadow}" fill-opacity="${BADGE.shadowOpacity}">${label}</text>
    <text x="${labelWidth / 2}" y="${BADGE.textBaseline}">${label}</text>
    <text aria-hidden="true" x="${labelWidth + valueWidth / 2}" y="${BADGE.shadowBaseline}" fill="${COLORS.shadow}" fill-opacity="${BADGE.shadowOpacity}">${value}</text>
    <text x="${labelWidth + valueWidth / 2}" y="${BADGE.textBaseline}">${value}</text>
  </g>
</svg>`;
}
