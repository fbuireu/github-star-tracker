export function parseList(value: string | null | undefined): string[] {
  if (!value || value.trim() === '') return [];
  return value
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export function parseBool(value: string | boolean | null | undefined): boolean | undefined {
  if (value === '' || value === undefined || value === null) return undefined;
  return value === 'true' || value === true;
}

export function parseNumber(value: string | null | undefined): number | undefined {
  if (value === '' || value === undefined || value === null) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? undefined : n;
}

interface ParseNotificationThresholdParams {
  value: string | null | undefined;
}

export function parseNotificationThreshold({
  value,
}: ParseNotificationThresholdParams): number | 'auto' | undefined {
  if (value === '' || value === undefined || value === null) return undefined;
  if (value === 'auto') return 'auto';
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? undefined : n;
}
