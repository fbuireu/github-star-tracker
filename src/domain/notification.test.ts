import { describe, expect, it } from 'vitest';
import { getAdaptiveThreshold, shouldNotify } from './notification';

describe('getAdaptiveThreshold', () => {
  it('returns 1 for 0 stars', () => {
    expect(getAdaptiveThreshold(0)).toBe(1);
  });

  it('returns 1 for 25 stars', () => {
    expect(getAdaptiveThreshold(25)).toBe(1);
  });

  it('returns 1 for 50 stars (upper boundary)', () => {
    expect(getAdaptiveThreshold(50)).toBe(1);
  });

  it('returns 5 for 51 stars', () => {
    expect(getAdaptiveThreshold(51)).toBe(5);
  });

  it('returns 5 for 200 stars (upper boundary)', () => {
    expect(getAdaptiveThreshold(200)).toBe(5);
  });

  it('returns 10 for 201 stars', () => {
    expect(getAdaptiveThreshold(201)).toBe(10);
  });

  it('returns 10 for 500 stars (upper boundary)', () => {
    expect(getAdaptiveThreshold(500)).toBe(10);
  });

  it('returns 20 for 501 stars', () => {
    expect(getAdaptiveThreshold(501)).toBe(20);
  });

  it('returns 20 for 1000 stars', () => {
    expect(getAdaptiveThreshold(1000)).toBe(20);
  });
});

describe('shouldNotify', () => {
  it('returns true when threshold is 0', () => {
    expect(shouldNotify({ totalStars: 100, starsAtLastNotification: 100, threshold: 0 })).toBe(
      true,
    );
  });

  it('returns false when delta is below threshold', () => {
    expect(shouldNotify({ totalStars: 103, starsAtLastNotification: 100, threshold: 5 })).toBe(
      false,
    );
  });

  it('returns true when delta equals threshold', () => {
    expect(shouldNotify({ totalStars: 105, starsAtLastNotification: 100, threshold: 5 })).toBe(
      true,
    );
  });

  it('returns true when delta exceeds threshold', () => {
    expect(shouldNotify({ totalStars: 107, starsAtLastNotification: 100, threshold: 5 })).toBe(
      true,
    );
  });

  it('treats starsAtLastNotification undefined as 0', () => {
    expect(shouldNotify({ totalStars: 5, starsAtLastNotification: undefined, threshold: 5 })).toBe(
      true,
    );
  });

  it('considers absolute delta (star loss)', () => {
    expect(shouldNotify({ totalStars: 95, starsAtLastNotification: 100, threshold: 5 })).toBe(true);
  });

  it('uses adaptive threshold when set to auto', () => {
    expect(shouldNotify({ totalStars: 30, starsAtLastNotification: 29, threshold: 'auto' })).toBe(
      true,
    );
  });

  it('uses adaptive threshold for higher star counts', () => {
    expect(shouldNotify({ totalStars: 103, starsAtLastNotification: 100, threshold: 'auto' })).toBe(
      false,
    );
  });

  it('returns true with auto when delta meets adaptive threshold', () => {
    expect(shouldNotify({ totalStars: 105, starsAtLastNotification: 100, threshold: 'auto' })).toBe(
      true,
    );
  });
});
