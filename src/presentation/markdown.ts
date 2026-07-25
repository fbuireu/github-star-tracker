import type { ForecastResult } from '@domain/forecast';
import { deltaIndicator, formatSignedPercent, trendIcon } from '@domain/formatting';
import { computeVelocity } from '@domain/velocity';
import { getTranslations, interpolate } from '@i18n';
import { CHART_FILES, MIN_SNAPSHOTS_FOR_CHART, SECTION_ICON } from './constants';
import type { GenerateReportParams } from './shared';
import {
  buildForecastWeekHeaders,
  forecastMethodLabel,
  perRepoChartFile,
  prepareReportData,
} from './shared';

export function generateMarkdownReport({
  results,
  previousTimestamp,
  locale,
  history = null,
  includeCharts = true,
  stargazerDiff = null,
  forecastData = null,
  topRepos: topReposCount = 10,
  velocityMetrics = false,
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

  const topRepos = sorted.slice(0, topReposCount).map((repo) => repo.fullName);
  const hasComparisonChart = hasChartHistory && topRepos.length > 0;

  const individualRepoCharts = hasChartHistory
    ? topRepos.flatMap((repoName) => [
        `#### ${repoName}`,
        '',
        `![${repoName}](./charts/${perRepoChartFile(repoName)})`,
        '',
      ])
    : [];

  const chartSection = hasChartHistory
    ? [
        `## ${SECTION_ICON.starTrend} ${t.report.starTrend}`,
        '',
        `![Star History](./charts/${CHART_FILES.starHistory})`,
        '',
        ...(hasComparisonChart
          ? [
              `### ${t.report.byRepository}`,
              '',
              `![${t.report.topRepositories}](./charts/${CHART_FILES.comparison})`,
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
              `- [${repo.fullName}](https://github.com/${repo.fullName}): ${interpolate({ template: t.report.starsCount, params: { count: repo.current } })}`,
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

  const sampledNote =
    stargazerDiff?.sampledRepos && stargazerDiff.sampledRepos.length > 0
      ? [
          interpolate({
            template: t.stargazers.sampledNote,
            params: { repos: stargazerDiff.sampledRepos.join(', ') },
          }),
          '',
        ]
      : [];

  const stargazerSection =
    stargazerDiff && stargazerDiff.totalNew > 0
      ? [
          `## ${SECTION_ICON.stargazers} ${t.stargazers.sectionTitle}`,
          '',
          interpolate({
            template: t.stargazers.newStargazers,
            params: { count: stargazerDiff.totalNew },
          }),
          '',
          ...sampledNote,
          ...stargazerDiff.entries.flatMap((entry) => [
            '<details>',
            `<summary>${entry.repoFullName} (${interpolate({ template: t.stargazers.stargazerCount, params: { count: entry.newStargazers.length } })})</summary>`,
            '',
            ...entry.newStargazers.map(
              (stargazer) =>
                `- <img src="${stargazer.avatarUrl}" width="20" height="20" style="border-radius:50%;vertical-align:middle;"> [${stargazer.login}](${stargazer.profileUrl}): ${interpolate({ template: t.stargazers.starredOn, params: { date: stargazer.starredAt.split('T')[0] } })}`,
            ),
            '',
            '</details>',
            '',
          ]),
        ]
      : stargazerDiff
        ? [
            `## ${SECTION_ICON.stargazers} ${t.stargazers.sectionTitle}`,
            '',
            ...sampledNote,
            t.stargazers.noNewStargazers,
            '',
          ]
        : [];

  const velocity = velocityMetrics && history ? computeVelocity({ history }) : null;
  const velocityLines = velocity
    ? [
        `- **${t.velocity.starsPerDay}:** ${velocity.starsPerDay}`,
        ...(velocity.growthPercent !== null
          ? [`- **${t.velocity.growth}:** ${formatSignedPercent(velocity.growthPercent)}`]
          : []),
        ...(velocity.nextMilestone !== null && velocity.daysToNextMilestone !== null
          ? [
              `- ${interpolate({ template: t.velocity.projection, params: { days: velocity.daysToNextMilestone, milestone: velocity.nextMilestone } })}`,
            ]
          : []),
      ]
    : [];

  const forecastSection = forecastData
    ? [
        `## ${SECTION_ICON.forecast} ${t.forecast.sectionTitle}`,
        '',
        ...(velocityLines.length > 0
          ? [`### ${SECTION_ICON.velocity} ${t.velocity.sectionTitle}`, '', ...velocityLines, '']
          : []),
        buildForecastTable({
          title: t.forecast.aggregate,
          forecasts: forecastData.aggregate.forecasts,
          t,
        }),
        ...(hasChartHistory
          ? ['', `![${t.forecast.sectionTitle}](./charts/${CHART_FILES.forecast})`, '']
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

  const velocitySection =
    !forecastData && velocityLines.length > 0
      ? [`## ${SECTION_ICON.velocity} ${t.velocity.sectionTitle}`, '', ...velocityLines, '']
      : [];

  const footer = [
    '---',
    `*${interpolate({ template: t.footer.generated, params: { project: '[GitHub Star Tracker](https://github.com/fbuireu/github-star-tracker)', date: new Date().toISOString() } })}*`,
    `<div align="center">`,
    '',
    `*${interpolate({ template: t.footer.madeBy, params: { author: '[Ferran Buireu](https://github.com/fbuireu)' } })}*`,
    '',
    `</div>`,
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
    ...velocitySection,
    ...footer,
  ].join('\n');
}

interface BuildForecastTableParams {
  title: string;
  forecasts: ForecastResult[];
  t: ReturnType<typeof getTranslations>;
}

function buildForecastTable({ title, forecasts, t }: BuildForecastTableParams): string {
  const weekHeaders = buildForecastWeekHeaders(t);

  const lines = [
    `**${title}**`,
    '',
    `| ${t.forecast.method} | ${weekHeaders.join(' | ')} |`,
    `|:---|${weekHeaders.map(() => '---:').join('|')}|`,
    ...forecasts.map(
      (forecast) =>
        `| ${forecastMethodLabel({ method: forecast.method, t })} | ${forecast.points.map((point) => String(point.predicted)).join(' | ')} |`,
    ),
  ];

  return lines.join('\n');
}
