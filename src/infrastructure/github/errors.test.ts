import { describe, expect, it } from 'vitest';
import { describeFetchError } from './errors';

describe('describeFetchError', () => {
  it('combines HTTP status and message', () => {
    expect(describeFetchError(Object.assign(new Error('Not Found'), { status: 404 }))).toBe(
      'HTTP 404 Not Found',
    );
  });

  it('falls back to the status alone when the message is blank', () => {
    expect(describeFetchError(Object.assign(new Error(''), { status: 500 }))).toBe('HTTP 500');
  });

  it('falls back to the message alone when there is no status', () => {
    expect(describeFetchError(new Error('Network Error'))).toBe('Network Error');
  });

  it('never returns a blank string for an empty Error', () => {
    expect(describeFetchError(new Error(''))).toBe('Error');
  });

  it('never throws for null or undefined', () => {
    expect(describeFetchError(null)).toBe('null');
    expect(describeFetchError(undefined)).toBe('undefined');
  });

  it('describes a non-Error throw', () => {
    expect(describeFetchError('a plain string error')).toBe('a plain string error');
    expect(describeFetchError({ some: 'object' })).toBe('[object Object]');
  });
});
