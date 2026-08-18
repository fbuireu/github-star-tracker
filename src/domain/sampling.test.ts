import { describe, expect, it } from 'vitest';
import { MAX_REACHABLE_STARGAZERS } from './constants';
import {
  coveredStars,
  MAX_REACHABLE_PAGE,
  reachablePages,
  STARGAZER_PAGE_SIZE,
  sampledPages,
  shouldSample,
} from './sampling';

describe('shouldSample', () => {
  it('samples only above the threshold, and only when smart sampling is on', () => {
    const outcomes = [
      shouldSample({ stars: 5000, smartSampling: true, threshold: 1000 }),
      shouldSample({ stars: 1000, smartSampling: true, threshold: 1000 }),
      shouldSample({ stars: 5000, smartSampling: false, threshold: 1000 }),
    ];

    expect(outcomes).toEqual([true, false, false]);
  });
});

describe('reachablePages', () => {
  it('always offers at least one page, even for a repository with no stars', () => {
    expect(reachablePages(0)).toBe(1);
    expect(reachablePages(1)).toBe(1);
  });

  it('rounds a partial page up', () => {
    expect(reachablePages(101)).toBe(2);
    expect(reachablePages(200)).toBe(2);
  });

  it('stops at the paging ceiling GitHub enforces', () => {
    expect(reachablePages(MAX_REACHABLE_STARGAZERS * 10)).toBe(MAX_REACHABLE_PAGE);
    expect(MAX_REACHABLE_PAGE).toBe(MAX_REACHABLE_STARGAZERS / STARGAZER_PAGE_SIZE);
  });
});

describe('sampledPages', () => {
  it('reads every page when the repository has fewer than the budget', () => {
    expect(sampledPages({ totalStars: 250, maxPages: 10 })).toEqual([1, 2, 3]);
  });

  it('reads only the first page when the budget is one', () => {
    expect(sampledPages({ totalStars: 100_000, maxPages: 1 })).toEqual([1]);
  });

  it('treats a non-positive budget as one page rather than none', () => {
    expect(sampledPages({ totalStars: 100_000, maxPages: 0 })).toEqual([1]);
    expect(sampledPages({ totalStars: 100_000, maxPages: -5 })).toEqual([1]);
  });

  it('spreads the budget across the range, keeping the first and the last page', () => {
    const pages = sampledPages({ totalStars: 1000, maxPages: 4 });

    expect(pages).toEqual([1, 4, 7, 10]);
    expect(pages[0]).toBe(1);
    expect(pages.at(-1)).toBe(reachablePages(1000));
  });

  it('returns pages in ascending order with no duplicates when rounding collides', () => {
    const pages = sampledPages({ totalStars: 300, maxPages: 5 });

    expect(pages).toEqual([...new Set(pages)]);
    expect(pages).toEqual([...pages].sort((earlier, later) => earlier - later));
    expect(pages.at(-1)).toBe(3);
  });

  it('never asks for a page beyond the paging ceiling', () => {
    const pages = sampledPages({ totalStars: MAX_REACHABLE_STARGAZERS * 10, maxPages: 6 });

    expect(Math.max(...pages)).toBeLessThanOrEqual(MAX_REACHABLE_PAGE);
  });
});

describe('coveredStars', () => {
  it('counts a full page for every page read', () => {
    expect(coveredStars({ lastFetchedPage: 3, totalStars: 5000 })).toBe(300);
  });

  it('never claims to cover more stars than the repository has', () => {
    expect(coveredStars({ lastFetchedPage: 3, totalStars: 120 })).toBe(120);
  });

  it('covers nothing when no page was read', () => {
    expect(coveredStars({ lastFetchedPage: 0, totalStars: 5000 })).toBe(0);
  });
});
