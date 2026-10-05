export interface Translations {
	badge: {
		totalStars: string;
	};
	report: {
		title: string;
		total: string;
		totalStars: string;
		change: string;
		comparedTo: string;
		firstRun: string;
		noRepositories: string;
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
		individualRepoCharts: string;
		repoChartHeading: string;
		repoChartTitle: string;
		trendLine: string;
		badges: {
			new: string;
		};
	};
	email: {
		subject: string;
		subjectLine: string;
		defaultFrom: string;
	};
	velocity: {
		sectionTitle: string;
		starsPerDay: string;
		growth: string;
		projection: string;
	};
	footer: {
		generated: string;
		madeBy: string;
	};
	stargazers: {
		sectionTitle: string;
		newStargazers: string;
		starredOn: string;
		noNewStargazers: string;
		stargazerCount: string;
		sampledNote: string;
	};
	forecast: {
		sectionTitle: string;
		week: string;
		linearRegression: string;
		weightedMovingAverage: string;
		aggregate: string;
		byRepository: string;
		repoChartTitle: string;
		method: string;
	};
}
