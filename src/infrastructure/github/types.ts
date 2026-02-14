import type { GitHub } from '@actions/github/lib/utils';

export type Octokit = InstanceType<typeof GitHub>;

export interface GitHubRepo {
  name: string;
  full_name: string;
  owner: { login: string };
  private: boolean;
  archived: boolean;
  fork: boolean;
  stargazers_count: number;
}
