function isBlank(value: string | boolean | null | undefined): value is '' | null | undefined {
  return value === '' || value === undefined || value === null;
}

export function parseList(value: string | null | undefined): string[] {
  if (!value || value.trim() === '') return [];
  return value
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export function parseBool(value: string | boolean | null | undefined): boolean | undefined {
  if (isBlank(value)) return undefined;
  return value === 'true' || value === true;
}

export function parseNumber(value: string | null | undefined): number | undefined {
  if (isBlank(value)) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? undefined : n;
}

const HEX_COLOR_PATTERN = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function parseHexColor(value: string | null | undefined): string | undefined {
  if (isBlank(value)) return undefined;
  const match = HEX_COLOR_PATTERN.exec(value.trim());

  return match ? `#${match[1].toLowerCase()}` : undefined;
}

export function parseDecimal(value: string | null | undefined): number | undefined {
  if (isBlank(value)) return undefined;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function parseNotificationThreshold(
  value: string | null | undefined,
): number | 'auto' | undefined {
  if (isBlank(value)) return undefined;
  if (value === 'auto') return 'auto';
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? undefined : n;
}
