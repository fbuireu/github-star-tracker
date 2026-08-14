import { describe, expect, it } from 'vitest';
import { shouldNotify } from './notification';
import { NotificationMode } from './types';

describe("shouldNotify with an 'auto' threshold", () => {
  function firesAt({ totalStars, gained }: { totalStars: number; gained: number }): boolean {
    return shouldNotify({
      totalStars,
      starsAtLastNotification: totalStars - gained,
      threshold: 'auto',
    });
  }

  it.each([
    { band: 'up to 50 stars', totalStars: 50, threshold: 1 },
    { band: '51 to 200 stars', totalStars: 200, threshold: 5 },
    { band: '201 to 500 stars', totalStars: 500, threshold: 10 },
    { band: 'above 500 stars', totalStars: 1000, threshold: 20 },
  ])('scales the threshold to $threshold for a set of $band', ({ totalStars, threshold }) => {
    expect(firesAt({ totalStars, gained: threshold })).toBe(true);
    expect(firesAt({ totalStars, gained: threshold - 1 })).toBe(false);
  });

  it('reads the band from the current total, so crossing a boundary raises the bar', () => {
    expect(firesAt({ totalStars: 50, gained: 1 })).toBe(true);
    expect(firesAt({ totalStars: 51, gained: 1 })).toBe(false);
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

  it('defaults to net mode', () => {
    expect(shouldNotify({ totalStars: 95, starsAtLastNotification: 100, threshold: 5 })).toBe(
      shouldNotify({
        totalStars: 95,
        starsAtLastNotification: 100,
        threshold: 5,
        mode: NotificationMode.NET,
      }),
    );
  });

  it('ignores star loss in gains mode', () => {
    expect(
      shouldNotify({
        totalStars: 95,
        starsAtLastNotification: 100,
        threshold: 5,
        mode: NotificationMode.GAINS,
      }),
    ).toBe(false);
  });

  it('returns true in gains mode when the total rises by the threshold', () => {
    expect(
      shouldNotify({
        totalStars: 600,
        starsAtLastNotification: 100,
        threshold: 500,
        mode: NotificationMode.GAINS,
      }),
    ).toBe(true);
  });

  it('returns false in gains mode when the rise is below the threshold', () => {
    expect(
      shouldNotify({
        totalStars: 599,
        starsAtLastNotification: 100,
        threshold: 500,
        mode: NotificationMode.GAINS,
      }),
    ).toBe(false);
  });

  it('accumulates across runs in gains mode until the threshold trips', () => {
    const starsAtLastNotification = 40_000;

    expect(
      shouldNotify({
        totalStars: 40_300,
        starsAtLastNotification,
        threshold: 500,
        mode: NotificationMode.GAINS,
      }),
    ).toBe(false);
    expect(
      shouldNotify({
        totalStars: 40_500,
        starsAtLastNotification,
        threshold: 500,
        mode: NotificationMode.GAINS,
      }),
    ).toBe(true);
  });

  it('returns true when threshold is 0 regardless of mode', () => {
    expect(
      shouldNotify({
        totalStars: 95,
        starsAtLastNotification: 100,
        threshold: 0,
        mode: NotificationMode.GAINS,
      }),
    ).toBe(true);
  });

  it('uses adaptive threshold in gains mode', () => {
    expect(
      shouldNotify({
        totalStars: 1000,
        starsAtLastNotification: 1015,
        threshold: 'auto',
        mode: NotificationMode.GAINS,
      }),
    ).toBe(false);
    expect(
      shouldNotify({
        totalStars: 1020,
        starsAtLastNotification: 1000,
        threshold: 'auto',
        mode: NotificationMode.GAINS,
      }),
    ).toBe(true);
  });
});
