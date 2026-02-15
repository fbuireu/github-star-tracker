import { FORECAST_WEEKS, ForecastMethod } from '@domain/forecast';
import { deltaIndicator, trendIcon } from '@domain/formatting';
import { getTranslations, interpolate } from '@i18n';
import { MIN_SNAPSHOTS_FOR_CHART } from './constants';
import type { GenerateReportParams } from './shared';
import { prepareReportData } from './shared';

export function generateMarkdownReport({
  results,
  previousTimestamp,
  locale,
  history = null,
  includeCharts = true,
  stargazerDiff = null,
  forecastData = null,
  topRepos: topReposCount = 10,
}: GenerateReportParams): string {
  const { summary } = results;
  const t = getTranslations(locale);
  const { sorted, newRepos, removedRepos, now, prev } = prepareReportData({
    results,
    previousTimestamp,
    locale,
  });

  const hasChartHistory =
    includeCharts && history !== null && history.snapshots.length >= MIN_SNAPSHOTS_FOR_CHART;

  const header = [
    `# ${t.report.title}`,
    '',
    `**${now}** | ${t.report.total}: **${interpolate({ template: t.report.starsCount, params: { count: summary.totalStars } })}** | ${t.report.change}: **${deltaIndicator(summary.totalDelta)}**`,
    '',
  ];

  const comparison =
    prev === t.report.firstRun
      ? []
      : [`> ${interpolate({ template: t.report.comparedTo, params: { date: prev } })}`, ''];

  const topRepos = sorted.slice(0, topReposCount).map((r) => r.fullName);
  const hasComparisonChart = hasChartHistory && topRepos.length > 0;

  const individualRepoCharts = hasChartHistory
    ? topRepos.flatMap((repoName) => {
        const filename = `${repoName.replace('/', '-')}.svg`;
        return [`#### ${repoName}`, '', `![${repoName}](./charts/${filename})`, ''];
      })
    : [];

  const chartSection = hasChartHistory
    ? [
        `## 📈 ${t.report.starTrend}`,
        '',
        `![Star History](./charts/star-history.svg)`,
        '',
        ...(hasComparisonChart
          ? [
              `### ${t.report.byRepository}`,
              '',
              `![${t.report.topRepositories}](./charts/comparison.svg)`,
              '',
            ]
          : []),
        ...(individualRepoCharts.length > 0
          ? [
              '<details>',
              `<summary>${t.report.individualRepoCharts}</summary>`,
              '',
              ...individualRepoCharts,
              '</details>',
              '',
            ]
          : []),
      ]
    : [];

  const repoTable =
    sorted.length > 0
      ? [
          `## ${t.report.repositories}`,
          '',
          `| ${t.report.repositories} | ${t.report.stars} | ${t.report.change} | ${t.report.trend} |`,
          '|:-----------|------:|-------:|:-----:|',
          ...sorted.map((repo) => {
            const badge = repo.isNew ? ` \`${t.report.badges.new}\`` : '';
            return `| [${repo.fullName}](https://github.com/${repo.fullName})${badge} | ${repo.current} | ${deltaIndicator(repo.delta)} | ${trendIcon(repo.delta)} |`;
          }),
          '',
        ]
      : [];

  const newSection =
    newRepos.length > 0
      ? [
          `## ${t.report.newRepositories}`,
          '',
          ...newRepos.map(
            (repo) =>
              `- [${repo.fullName}](https://github.com/${repo.fullName}) — ${interpolate({ template: t.report.starsCount, params: { count: repo.current } })}`,
          ),
          '',
        ]
      : [];

  const removedSection =
    removedRepos.length > 0
      ? [
          `## ${t.report.removedRepositories}`,
          '',
          ...removedRepos.map((repo) =>
            interpolate({
              template: t.report.removedRepoText,
              params: { name: repo.fullName, count: repo.previous ?? 0 },
            }),
          ),
          '',
        ]
      : [];

  const summarySection =
    summary.totalDelta === 0
      ? []
      : [
          `## ${t.report.summary}`,
          '',
          `- **${t.report.starsGained}:** ${summary.newStars}`,
          `- **${t.report.starsLost}:** ${summary.lostStars}`,
          `- **${t.report.netChange}:** ${deltaIndicator(summary.totalDelta)}`,
          '',
        ];

  const stargazerSection =
    stargazerDiff && stargazerDiff.totalNew > 0
      ? [
          `## 👤 ${t.stargazers.sectionTitle}`,
          '',
          interpolate({
            template: t.stargazers.newStargazers,
            params: { count: stargazerDiff.totalNew },
          }),
          '',
          ...stargazerDiff.entries.flatMap((entry) => [
            '<details>',
            `<summary>${entry.repoFullName} (${interpolate({ template: t.stargazers.stargazerCount, params: { count: entry.newStargazers.length } })})</summary>`,
            '',
            ...entry.newStargazers.map(
              (s) =>
                `- <img src="${s.avatarUrl}" width="20" height="20" style="border-radius:50%;vertical-align:middle;"> [${s.login}](${s.profileUrl}) — ${interpolate({ template: t.stargazers.starredOn, params: { date: s.starredAt.split('T')[0] } })}`,
            ),
            '',
            '</details>',
            '',
          ]),
        ]
      : stargazerDiff
        ? [`## 👤 ${t.stargazers.sectionTitle}`, '', t.stargazers.noNewStargazers, '']
        : [];

  const forecastSection = forecastData
    ? [
        `## 🔮 ${t.forecast.sectionTitle}`,
        '',
        buildForecastTable({
          title: t.forecast.aggregate,
          forecasts: forecastData.aggregate.forecasts,
          t,
        }),
        ...(hasChartHistory
          ? ['', `![${t.forecast.sectionTitle}](./charts/forecast.svg)`, '']
          : []),
        ...(forecastData.repos.length > 0
          ? [
              `### ${t.forecast.byRepository}`,
              '',
              ...forecastData.repos.flatMap((repo) => [
                '<details>',
                `<summary>${repo.repoFullName}</summary>`,
                '',
                buildForecastTable({
                  title: repo.repoFullName,
                  forecasts: repo.forecasts,
                  t,
                }),
                '',
                '</details>',
                '',
              ]),
            ]
          : []),
      ]
    : [];

  const footer = [
    '---',
    `*${interpolate({ template: t.footer.generated, params: { project: '[GitHub Star Tracker](https://github.com/fbuireu/github-star-tracker)', date: new Date().toISOString() } })}*`,
    `*${interpolate({ template: t.footer.madeBy, params: { author: '[Ferran Buireu](https://github.com/fbuireu)' } })}*`,
  ];

  return [
    ...header,
    ...comparison,
    ...chartSection,
    ...repoTable,
    ...newSection,
    ...removedSection,
    ...summarySection,
    ...stargazerSection,
    ...forecastSection,
    ...footer,
  ].join('\n');
}

interface BuildForecastTableParams {
  title: string;
  forecasts: { method: string; points: { weekOffset: number; predicted: number }[] }[];
  t: ReturnType<typeof getTranslations>;
}

function buildForecastTable({ title, forecasts, t }: BuildForecastTableParams): string {
  const weekHeaders = Array.from({ length: FORECAST_WEEKS }, (_, i) =>
    interpolate({ template: t.forecast.week, params: { n: i + 1 } }),
  );

  const methodLabel = (method: string): string => {
    if (method === ForecastMethod.LINEAR_REGRESSION) return t.forecast.linearRegression;
    if (method === ForecastMethod.WEIGHTED_MOVING_AVERAGE) return t.forecast.weightedMovingAverage;
    return method;
  };

  const lines = [
    `**${title}**`,
    '',
    `| ${t.forecast.method} | ${weekHeaders.join(' | ')} |`,
    `|:---|${weekHeaders.map(() => '---:').join('|')}|`,
    ...forecasts.map(
      (f) =>
        `| ${methodLabel(f.method)} | ${f.points.map((p) => String(p.predicted)).join(' | ')} |`,
    ),
  ];

  return lines.join('\n');
}
