export interface Stargazer {
  login: string;
  avatarUrl: string;
  profileUrl: string;
  starredAt: string;
}

export interface RepoStargazers {
  repoFullName: string;
  stargazers: Stargazer[];
}

export type StargazerMap = Record<string, string[]>;

export interface StargazerDiffEntry {
  repoFullName: string;
  newStargazers: Stargazer[];
}

export interface StargazerDiffResult {
  entries: StargazerDiffEntry[];
  totalNew: number;
}

interface DiffStargazersParams {
  current: RepoStargazers[];
  previousMap: StargazerMap;
}

export function diffStargazers({
  current,
  previousMap,
}: DiffStargazersParams): StargazerDiffResult {
  const entries: StargazerDiffEntry[] = [];
  let totalNew = 0;

  for (const repo of current) {
    const previousLogins = new Set(previousMap[repo.repoFullName] ?? []);
    const newStargazers = repo.stargazers.filter((s) => !previousLogins.has(s.login));

    if (newStargazers.length > 0) {
      entries.push({ repoFullName: repo.repoFullName, newStargazers });
      totalNew += newStargazers.length;
    }
  }

  return { entries, totalNew };
}

export function buildStargazerMap(repoStargazers: RepoStargazers[]): StargazerMap {
  const map: StargazerMap = {};

  for (const repo of repoStargazers) {
    map[repo.repoFullName] = repo.stargazers.map((s) => s.login);
  }

  return map;
}
