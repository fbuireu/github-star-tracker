import type { ComparisonResults } from '@domain/types';

const CSV_HEADER = 'repository,owner,name,stars,previous,delta,status';

function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replaceAll('"', '""')}"`;
  }
  return field;
}

const REPO_STATUS = {
  new: 'new',
  removed: 'removed',
  active: 'active',
} as const;

function repoStatus(repo: { isNew: boolean; isRemoved: boolean }): string {
  if (repo.isNew) return REPO_STATUS.new;
  if (repo.isRemoved) return REPO_STATUS.removed;
  return REPO_STATUS.active;
}

export function generateCsvReport({ repos }: ComparisonResults): string {
  const rows = repos.map((repo) =>
    [
      escapeCsvField(repo.fullName),
      escapeCsvField(repo.owner),
      escapeCsvField(repo.name),
      repo.current,
      repo.previous ?? '',
      repo.delta,
      repoStatus(repo),
    ].join(','),
  );

  return [CSV_HEADER, ...rows].join('\n');
}
