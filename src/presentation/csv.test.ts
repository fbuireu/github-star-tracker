import { describe, expect, it } from 'vitest';
import { generateCsvReport } from './csv';

const baseSummary = {
  totalStars: 100,
  totalPrevious: 90,
  totalDelta: 10,
  newStars: 10,
  lostStars: 0,
  changed: true,
};

describe('generateCsvReport', () => {
  it('generates CSV with header and repo rows', () => {
    const csv = generateCsvReport({
      repos: [
        {
          fullName: 'user/repo-a',
          owner: 'user',
          name: 'repo-a',
          current: 60,
          previous: 50,
          delta: 10,
          isNew: false,
          isRemoved: false,
        },
        {
          fullName: 'user/repo-b',
          owner: 'user',
          name: 'repo-b',
          current: 40,
          previous: 40,
          delta: 0,
          isNew: false,
          isRemoved: false,
        },
      ],
      summary: baseSummary,
    });

    const lines = csv.split('\n');
    expect(lines[0]).toBe('repository,owner,name,stars,previous,delta,status');
    expect(lines[1]).toBe('user/repo-a,user,repo-a,60,50,10,active');
    expect(lines[2]).toBe('user/repo-b,user,repo-b,40,40,0,active');
    expect(lines).toHaveLength(3);
  });

  it('marks new repos with status "new"', () => {
    const csv = generateCsvReport({
      repos: [
        {
          fullName: 'user/new-repo',
          owner: 'user',
          name: 'new-repo',
          current: 5,
          previous: null,
          delta: 5,
          isNew: true,
          isRemoved: false,
        },
      ],
      summary: baseSummary,
    });

    expect(csv).toContain('new-repo,5,,5,new');
  });

  it('marks removed repos with status "removed"', () => {
    const csv = generateCsvReport({
      repos: [
        {
          fullName: 'user/old-repo',
          owner: 'user',
          name: 'old-repo',
          current: 0,
          previous: 10,
          delta: -10,
          isNew: false,
          isRemoved: true,
        },
      ],
      summary: baseSummary,
    });

    expect(csv).toContain('old-repo,0,10,-10,removed');
  });

  it('escapes fields containing commas', () => {
    const csv = generateCsvReport({
      repos: [
        {
          fullName: 'org/my,repo',
          owner: 'org',
          name: 'my,repo',
          current: 10,
          previous: 5,
          delta: 5,
          isNew: false,
          isRemoved: false,
        },
      ],
      summary: baseSummary,
    });

    expect(csv).toContain('"org/my,repo"');
    expect(csv).toContain('"my,repo"');
  });

  it('escapes fields containing double quotes', () => {
    const csv = generateCsvReport({
      repos: [
        {
          fullName: 'org/my"repo',
          owner: 'org',
          name: 'my"repo',
          current: 10,
          previous: 5,
          delta: 5,
          isNew: false,
          isRemoved: false,
        },
      ],
      summary: baseSummary,
    });

    expect(csv).toContain('"my""repo"');
  });

  it('returns header only when no repos', () => {
    const csv = generateCsvReport({
      repos: [],
      summary: { ...baseSummary, totalStars: 0 },
    });

    expect(csv).toBe('repository,owner,name,stars,previous,delta,status');
  });
});
