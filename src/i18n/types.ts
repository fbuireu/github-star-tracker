export interface InterpolateParams {
  template: string;
  params: Record<string, string | number>;
}

export interface Translations {
  badge: {
    totalStars: string;
  };
  report: {
    title: string;
    total: string;
    change: string;
    comparedTo: string;
    firstRun: string;
    repositories: string;
    stars: string;
    starsCount: string;
    trend: string;
    newRepositories: string;
    removedRepositories: string;
    removedRepoText: string;
    summary: string;
    starsGained: string;
    starsLost: string;
    netChange: string;
    starTrend: string;
    starHistory: string;
    topRepositories: string;
    byRepository: string;
    badges: {
      new: string;
    };
  };
  email: {
    subject: string;
    subjectLine: string;
    defaultFrom: string;
  };
  trends: {
    up: string;
    down: string;
    stable: string;
  };
  footer: {
    generated: string;
    madeBy: string;
  };
}
