import type { ComparisonResults } from '@domain/types';

const CSV_HEADER = 'repository,owner,name,stars,previous,delta,status';
export const NEW_LINE = '\n';

const FORMULA_TRIGGERS = ['=', '+', '-', '@'];

function escapeCsvField(field: string): string {
  const neutralized = FORMULA_TRIGGERS.some((trigger) => field.startsWith(trigger))
    ? `'${field}`
    : field;

  if (
    neutralized.includes(',') ||
    neutralized.includes('"') ||
    neutralized.includes(NEW_LINE) ||
    neutralized !== field
  ) {
    return `"${neutralized.replaceAll('"', '""')}"`;
  }

  return neutralized;
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

  return [CSV_HEADER, ...rows].join(NEW_LINE);
}
