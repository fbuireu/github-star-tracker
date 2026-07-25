export const CompareAgainst = {
  LAST_RUN: 'last-run',
  H24: '24h',
  D7: '7d',
  D30: '30d',
} as const;

export type CompareAgainst = (typeof CompareAgainst)[keyof typeof CompareAgainst];

export const NotificationMode = {
  NET: 'net',
  GAINS: 'gains',
} as const;

export type NotificationMode = (typeof NotificationMode)[keyof typeof NotificationMode];

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
  starsAtLastNotification?: number;
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
