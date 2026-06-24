export interface Stargazer {
  login: string;
  avatarUrl: string;
  profileUrl: string;
  starredAt: string;
}

export interface RepoStargazers {
  repoFullName: string;
  stargazers: Stargazer[];
  sampled?: boolean;
}

export type StargazerMap = Record<string, string[]>;

export interface StargazerDiffEntry {
  repoFullName: string;
  newStargazers: Stargazer[];
}

export interface StargazerDiffResult {
  entries: StargazerDiffEntry[];
  totalNew: number;
  sampledRepos?: string[];
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
  const sampledRepos: string[] = [];
  let totalNew = 0;

  for (const repo of current) {
    if (repo.sampled) {
      sampledRepos.push(repo.repoFullName);
      continue;
    }

    const previousLogins = new Set(previousMap[repo.repoFullName] ?? []);
    const newStargazers = repo.stargazers
      .filter((s) => !previousLogins.has(s.login))
      .sort((a, b) => b.starredAt.localeCompare(a.starredAt));

    if (newStargazers.length > 0) {
      entries.push({ repoFullName: repo.repoFullName, newStargazers });
      totalNew += newStargazers.length;
    }
  }

  return { entries, totalNew, sampledRepos: sampledRepos.length > 0 ? sampledRepos : undefined };
}

export function buildStargazerMap(repoStargazers: RepoStargazers[]): StargazerMap {
  const map: StargazerMap = {};

  for (const repo of repoStargazers) {
    if (repo.sampled) continue;
    map[repo.repoFullName] = repo.stargazers.map((s) => s.login);
  }

  return map;
}
