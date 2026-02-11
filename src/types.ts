export interface Config {
  visibility: 'public' | 'private' | 'all';
  includeArchived: boolean;
  includeForks: boolean;
  excludeRepos: string[];
  onlyRepos: string[];
  minStars: number;
  dataBranch: string;
  maxHistory: number;
  sendOnNoChanges: boolean;
}

export interface RepoInfo {
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  archived: boolean;
  fork: boolean;
  stars: number;
}

export interface SnapshotRepo {
  fullName: string;
  name: string;
  owner: string;
  stars: number;
}

export interface Snapshot {
  timestamp: string;
  totalStars: number;
  repos: SnapshotRepo[];
}

export interface History {
  snapshots: Snapshot[];
}

export interface RepoResult {
  name: string;
  fullName: string;
  owner: string;
  current: number;
  previous: number | null;
  delta: number;
  isNew: boolean;
  isRemoved: boolean;
}

export interface Summary {
  totalStars: number;
  totalPrevious: number;
  totalDelta: number;
  newStars: number;
  lostStars: number;
  changed: boolean;
}

export interface ComparisonResults {
  repos: RepoResult[];
  summary: Summary;
}

export interface EmailConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  to: string;
  from: string;
}
