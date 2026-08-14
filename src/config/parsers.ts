const YAML_TRUE = new Set(['true', 'yes', 'on', 'y', '1']);
const YAML_FALSE = new Set(['false', 'no', 'off', 'n', '0']);

function isBlank(
  value: string | number | boolean | null | undefined,
): value is '' | null | undefined {
  return value === '' || value === undefined || value === null;
}

export function parseList(value: string | null | undefined): string[] | undefined {
  if (!value || value.trim() === '') return undefined;

  return value
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export function parseNumberList(value: string | null | undefined): number[] {
  return [
    ...new Set(
      (parseList(value) ?? [])
        .map((segment) => Number.parseInt(segment, 10))
        .filter((parsed) => Number.isFinite(parsed) && parsed > 0),
    ),
  ].sort((a, b) => a - b);
}

export function parsePositiveNumber(value: string | number | null | undefined): number | undefined {
  const parsed = parseNumber(value);

  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}

export function parseNonNegativeNumber(
  value: string | number | null | undefined,
): number | undefined {
  const parsed = parseNumber(value);

  return parsed !== undefined && parsed >= 0 ? parsed : undefined;
}

export function parseBool(value: string | boolean | null | undefined): boolean | undefined {
  if (isBlank(value)) return undefined;
  if (typeof value === 'boolean') return value;

  const normalized = value.trim().toLowerCase();

  if (normalized === 'true') return true;
  if (normalized === 'false') return false;

  return undefined;
}

export function parseFileBool(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;

  const normalized = String(value).trim().toLowerCase();

  if (YAML_TRUE.has(normalized)) return true;
  if (YAML_FALSE.has(normalized)) return false;

  return undefined;
}

export function toStringList(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value.map(String);

  return typeof value === 'string' ? parseList(value) : undefined;
}

const INTEGER_PATTERN = /^[+-]?\d+$/;

function parseNumber(value: string | number | null | undefined): number | undefined {
  if (isBlank(value)) return undefined;

  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.trunc(value) : undefined;
  }

  const trimmed = value.trim();

  return INTEGER_PATTERN.test(trimmed) ? Number.parseInt(trimmed, 10) : undefined;
}

const HEX_COLOR_PATTERN = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function parseHexColor(value: string | null | undefined): string | undefined {
  if (isBlank(value)) return undefined;
  const match = HEX_COLOR_PATTERN.exec(value.trim());

  return match ? `#${match[1].toLowerCase()}` : undefined;
}

export function parseFileHexColor(value: unknown): string | undefined {
  if (typeof value === 'string') return parseHexColor(value);

  return undefined;
}

export function parseDecimal(value: string | number | null | undefined): number | undefined {
  if (isBlank(value)) return undefined;

  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function parseNotificationThreshold(
  value: string | number | null | undefined,
): number | 'auto' | undefined {
  if (isBlank(value)) return undefined;
  if (value === 'auto') return 'auto';

  return parseNumber(value);
}
