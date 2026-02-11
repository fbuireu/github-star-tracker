const BADGE_COLORS = {
  labelBg: '#555',
  valueBg: '#dfb317',
  textFill: '#fff',
  textShadow: '#010101',
  gradientStart: '#bbb',
  clipPathFill: '#fff',
} as const;

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function generateBadge(totalStars: number): string {
  const label = 'total stars';
  const value = `\u2605 ${formatCount(totalStars)}`;

  const labelWidth = label.length * 6.5 + 12;
  const valueWidth = value.length * 7 + 12;
  const totalWidth = labelWidth + valueWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="${BADGE_COLORS.gradientStart}" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="20" rx="3" fill="${BADGE_COLORS.clipPathFill}"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="${BADGE_COLORS.labelBg}"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${BADGE_COLORS.valueBg}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="${BADGE_COLORS.textFill}" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text aria-hidden="true" x="${labelWidth / 2}" y="15" fill="${BADGE_COLORS.textShadow}" fill-opacity=".3">${label}</text>
    <text x="${labelWidth / 2}" y="14">${label}</text>
    <text aria-hidden="true" x="${labelWidth + valueWidth / 2}" y="15" fill="${BADGE_COLORS.textShadow}" fill-opacity=".3">${value}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14">${value}</text>
  </g>
</svg>`;
}
