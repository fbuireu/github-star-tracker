import { describe, expect, it } from 'vitest';
import {
  parseBool,
  parseFileBool,
  parseHexColor,
  parseList,
  parseNonNegativeNumber,
  parseNotificationThreshold,
  parsePositiveDecimal,
  parsePositiveNumber,
  toStringList,
} from './parsers';

describe('parseList', () => {
  it('returns undefined for empty string', () => {
    expect(parseList('')).toBeUndefined();
  });

  it('returns undefined for null/undefined', () => {
    expect(parseList(null)).toBeUndefined();
    expect(parseList(undefined)).toBeUndefined();
  });

  it('returns undefined for whitespace only', () => {
    expect(parseList('   ')).toBeUndefined();
  });

  it('splits comma-separated values and trims whitespace', () => {
    expect(parseList('foo, bar , baz')).toEqual(['foo', 'bar', 'baz']);
  });

  it('filters out empty segments', () => {
    expect(parseList('foo,,bar,')).toEqual(['foo', 'bar']);
  });
});

describe('parseBool', () => {
  it('returns undefined for empty/null/undefined', () => {
    expect(parseBool('')).toBeUndefined();
    expect(parseBool(null)).toBeUndefined();
    expect(parseBool(undefined)).toBeUndefined();
  });

  it('parses "true" as true', () => {
    expect(parseBool('true')).toBe(true);
    expect(parseBool(true)).toBe(true);
  });

  it('parses "false" as false', () => {
    expect(parseBool('false')).toBe(false);
    expect(parseBool(false)).toBe(false);
  });

  it('ignores case and surrounding whitespace', () => {
    expect(parseBool('True')).toBe(true);
    expect(parseBool(' TRUE ')).toBe(true);
    expect(parseBool('FALSE')).toBe(false);
  });

  it('returns undefined for unrecognized values instead of disabling the option', () => {
    expect(parseBool('yes')).toBeUndefined();
    expect(parseBool('1')).toBeUndefined();
    expect(parseBool('nope')).toBeUndefined();
  });
});

describe('parseFileBool', () => {
  it('returns undefined for empty/null/undefined', () => {
    expect(parseFileBool('')).toBeUndefined();
    expect(parseFileBool(null)).toBeUndefined();
    expect(parseFileBool(undefined)).toBeUndefined();
  });

  it('passes through real booleans', () => {
    expect(parseFileBool(true)).toBe(true);
    expect(parseFileBool(false)).toBe(false);
  });

  it('accepts the YAML boolean vocabulary', () => {
    expect(parseFileBool('yes')).toBe(true);
    expect(parseFileBool('on')).toBe(true);
    expect(parseFileBool('no')).toBe(false);
    expect(parseFileBool('off')).toBe(false);
  });

  it('treats a quoted "false" as false rather than a truthy string', () => {
    expect(parseFileBool('false')).toBe(false);
    expect(parseFileBool('False')).toBe(false);
  });

  it('returns undefined for unrecognized values', () => {
    expect(parseFileBool('maybe')).toBeUndefined();
    expect(parseFileBool({})).toBeUndefined();
  });
});

describe('toStringList', () => {
  it('returns undefined for null/undefined', () => {
    expect(toStringList(null)).toBeUndefined();
    expect(toStringList(undefined)).toBeUndefined();
  });

  it('passes through arrays', () => {
    expect(toStringList(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('preserves an empty array', () => {
    expect(toStringList([])).toEqual([]);
  });

  it('splits a scalar string', () => {
    expect(toStringList('a, b')).toEqual(['a', 'b']);
  });

  it('stringifies non-string array entries', () => {
    expect(toStringList([1, 2])).toEqual(['1', '2']);
  });

  it('returns undefined for other shapes', () => {
    expect(toStringList({})).toBeUndefined();
  });
});

describe('parsePositiveNumber', () => {
  it('rejects zero and negatives so callers fall back to their default', () => {
    expect(parsePositiveNumber('0')).toBeUndefined();
    expect(parsePositiveNumber('-1')).toBeUndefined();
    expect(parsePositiveNumber('52')).toBe(52);
  });
});

describe('parseNonNegativeNumber', () => {
  it('accepts zero but rejects negatives', () => {
    expect(parseNonNegativeNumber('0')).toBe(0);
    expect(parseNonNegativeNumber('-5')).toBeUndefined();
  });
});

describe('integer coercion, through the signed parsers that use it', () => {
  it('returns undefined for empty/null/undefined', () => {
    expect(parseNonNegativeNumber('')).toBeUndefined();
    expect(parseNonNegativeNumber(null)).toBeUndefined();
  });

  it('parses valid integers', () => {
    expect(parseNonNegativeNumber('42')).toBe(42);
    expect(parseNonNegativeNumber('0')).toBe(0);
  });

  it('returns undefined for non-numeric strings', () => {
    expect(parseNonNegativeNumber('abc')).toBeUndefined();
  });

  it('rejects partially numeric strings instead of truncating them', () => {
    expect(parseNonNegativeNumber('1o')).toBeUndefined();
    expect(parseNonNegativeNumber('42abc')).toBeUndefined();
    expect(parseNonNegativeNumber('3.7')).toBeUndefined();
  });

  it('accepts surrounding whitespace and a sign', () => {
    expect(parseNonNegativeNumber(' 42 ')).toBe(42);
    expect(parsePositiveNumber(' 42 ')).toBe(42);
    expect(parseNotificationThreshold('-5')).toBe(-5);
  });

  it('truncates real numbers coming from the config file', () => {
    expect(parseNonNegativeNumber(7)).toBe(7);
    expect(parseNonNegativeNumber(7.9)).toBe(7);
    expect(parseNonNegativeNumber(Number.POSITIVE_INFINITY)).toBeUndefined();
  });
});

describe('parseHexColor', () => {
  it('returns undefined for empty/null/undefined', () => {
    expect(parseHexColor('')).toBeUndefined();
    expect(parseHexColor(null)).toBeUndefined();
    expect(parseHexColor(undefined)).toBeUndefined();
  });

  it('accepts 3/4/6/8-digit hex and lowercases', () => {
    expect(parseHexColor('#abc')).toBe('#abc');
    expect(parseHexColor('#abcd')).toBe('#abcd');
    expect(parseHexColor('#AABBCC')).toBe('#aabbcc');
    expect(parseHexColor('#aabbccdd')).toBe('#aabbccdd');
  });

  it('accepts hex without the leading # and normalizes it', () => {
    expect(parseHexColor('6b63ff')).toBe('#6b63ff');
    expect(parseHexColor('AABBCC')).toBe('#aabbcc');
    expect(parseHexColor('abc')).toBe('#abc');
  });

  it('trims surrounding whitespace', () => {
    expect(parseHexColor('  #6F42C1  ')).toBe('#6f42c1');
  });

  it('returns undefined for invalid colors', () => {
    expect(parseHexColor('red')).toBeUndefined();
    expect(parseHexColor('#xyz')).toBeUndefined();
    expect(parseHexColor('#12')).toBeUndefined();
    expect(parseHexColor('#1234567')).toBeUndefined();
  });
});

describe('parsePositiveDecimal', () => {
  it('returns undefined for empty/null/undefined', () => {
    expect(parsePositiveDecimal('')).toBeUndefined();
    expect(parsePositiveDecimal(null)).toBeUndefined();
    expect(parsePositiveDecimal(undefined)).toBeUndefined();
  });

  it('parses positive decimals and integers', () => {
    expect(parsePositiveDecimal('2.5')).toBe(2.5);
    expect(parsePositiveDecimal('3')).toBe(3);
  });

  it('returns undefined for non-positive, non-finite or non-numeric values', () => {
    expect(parsePositiveDecimal('abc')).toBeUndefined();
    expect(parsePositiveDecimal('0')).toBeUndefined();
    expect(parsePositiveDecimal('-1')).toBeUndefined();
    expect(parsePositiveDecimal('Infinity')).toBeUndefined();
    expect(parsePositiveDecimal('1e999')).toBeUndefined();
  });
});

describe('parseNotificationThreshold', () => {
  it('returns undefined for empty/null/undefined', () => {
    expect(parseNotificationThreshold('')).toBeUndefined();
    expect(parseNotificationThreshold(null)).toBeUndefined();
    expect(parseNotificationThreshold(undefined)).toBeUndefined();
  });

  it('returns "auto" for "auto"', () => {
    expect(parseNotificationThreshold('auto')).toBe('auto');
  });

  it('parses valid integers', () => {
    expect(parseNotificationThreshold('0')).toBe(0);
    expect(parseNotificationThreshold('5')).toBe(5);
    expect(parseNotificationThreshold('10')).toBe(10);
  });

  it('returns undefined for non-numeric strings', () => {
    expect(parseNotificationThreshold('abc')).toBeUndefined();
  });
});
