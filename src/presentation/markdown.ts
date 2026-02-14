import { deltaIndicator, trendIcon } from '@domain/formatting';
import { getTranslations, interpolate } from '@i18n';
import { generateChartUrl, generateComparisonChartUrl } from './chart';
import { TOP_REPOS_COUNT } from './constants';
import type { GenerateReportParams } from './shared';
import { prepareReportData } from './shared';

export function generateMarkdownReport({
  results,
  previousTimestamp,
  locale,
  history = null,
  includeCharts = true,
}: GenerateReportParams): string {
  const { summary } = results;
  const t = getTranslations(locale);
  const { sorted, newRepos, removedRepos, now, prev } = prepareReportData({
    results,
    previousTimestamp,
    locale,
  });

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

  const topRepos = sorted.slice(0, TOP_REPOS_COUNT).map((r) => r.fullName);
  const comparisonChartUrl =
    includeCharts && history && history.snapshots.length >= 2 && topRepos.length > 0
      ? generateComparisonChartUrl({
          history,
          repoNames: topRepos,
          title: t.report.topRepositories,
          locale,
        })
      : null;

  const chartSection =
    includeCharts && history && history.snapshots.length >= 2
      ? [
          `## 📈 ${t.report.starTrend}`,
          '',
          `![Star History](${generateChartUrl({ history, title: t.report.starHistory, locale })})`,
          '',
          ...(comparisonChartUrl
            ? [
                `### ${t.report.byRepository}`,
                '',
                `![${t.report.topRepositories}](${comparisonChartUrl})`,
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
    ...footer,
  ].join('\n');
}
