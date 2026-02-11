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
  if (delta > 0) return '\u2B06\uFE0F';
  if (delta < 0) return '\u2B07\uFE0F';
  return '\u2796';
}
