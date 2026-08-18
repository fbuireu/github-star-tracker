import type { ForecastResult } from '@domain/forecast';
import { deltaIndicator, formatSignedPercent, trendIcon } from '@domain/formatting';
import { getTranslations, interpolate, type Translations } from '@i18n';
import { CHART_FILES, SECTION_ICON } from './constants';
import { EscapeDialect, escapeFor } from './escaping';
import { buildForecastTable, StargazerOutcome, type TopRepo } from './report-model';
import type { RenderReportParams } from './shared';
import { perRepoChartFile } from './shared';

const escapeMarkdown = escapeFor(EscapeDialect.MARKDOWN);
const escapeMarkup = escapeFor(EscapeDialect.MARKUP);

interface RepoChartHeadingParams {
  repo: TopRepo;
  t: Translations;
}

function repoChartHeading({ repo, t }: RepoChartHeadingParams): string {
  return interpolate({
    template: t.report.repoChartHeading,
    params: {
      name: escapeMarkdown(repo.fullName),
      count: repo.current,
      delta: deltaIndicator(repo.delta),
    },
  });
}

export function generateMarkdownReport({ model, config }: RenderReportParams): string {
  const t = getTranslations(config.locale);
  const {
    summary,
    sorted,
    newRepos,
    removedRepos,
    now,
    prev,
    chartHistory,
    forecast: forecastData,
  } = model;

  const header = [
    `# ${t.report.title}`,
    '',
    `**${now}** | ${t.report.total}: **${interpolate({ template: t.report.starsCount, params: { count: summary.totalStars } })}** | ${t.report.change}: **${deltaIndicator(summary.totalDelta)}**`,
    '',
  ];

  const comparison = model.isFirstRun
    ? []
    : [`> ${interpolate({ template: t.report.comparedTo, params: { date: prev } })}`, ''];

  const topRepos = model.topRepos;
  const hasComparisonChart = model.showComparisonChart;

  const individualRepoCharts =
    chartHistory !== null
      ? topRepos.flatMap((repo) => [
          `#### ${repoChartHeading({ repo, t })}`,
          '',
          `![${escapeMarkdown(repo.fullName)}](./charts/${perRepoChartFile(repo.fullName)})`,
          '',
        ])
      : [];

  const chartSection =
    chartHistory !== null
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
            return `| [${escapeMarkdown(repo.fullName)}](https://github.com/${escapeMarkdown(repo.fullName)})${badge} | ${repo.current} | ${deltaIndicator(repo.delta)} | ${trendIcon(repo.delta)} |`;
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
              `- [${escapeMarkdown(repo.fullName)}](https://github.com/${escapeMarkdown(repo.fullName)}): ${interpolate({ template: t.report.starsCount, params: { count: repo.current } })}`,
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
              params: { name: escapeMarkdown(repo.fullName), count: repo.previous ?? 0 },
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

  const stargazers = model.stargazers;
  const sampledNote =
    stargazers && stargazers.sampledRepos.length > 0
      ? [
          interpolate({
            template: t.stargazers.sampledNote,
            params: { repos: stargazers.sampledRepos.join(', ') },
          }),
          '',
        ]
      : [];

  const stargazerSection =
    stargazers && stargazers.outcome === StargazerOutcome.NEW
      ? [
          `## ${SECTION_ICON.stargazers} ${t.stargazers.sectionTitle}`,
          '',
          interpolate({
            template: t.stargazers.newStargazers,
            params: { count: stargazers.totalNew },
          }),
          '',
          ...sampledNote,
          ...stargazers.entries.flatMap((entry) => [
            '<details>',
            `<summary>${escapeMarkup(entry.repoFullName)} (${interpolate({ template: t.stargazers.stargazerCount, params: { count: entry.newStargazers.length } })})</summary>`,
            '',
            ...entry.newStargazers.map(
              (stargazer) =>
                `- <img src="${escapeMarkup(stargazer.avatarUrl)}" width="20" height="20" style="border-radius:50%;vertical-align:middle;"> [${escapeMarkdown(stargazer.login)}](${escapeMarkdown(stargazer.profileUrl)}): ${interpolate({ template: t.stargazers.starredOn, params: { date: stargazer.starredAt.split('T')[0] } })}`,
            ),
            '',
            '</details>',
            '',
          ]),
        ]
      : stargazers
        ? [
            `## ${SECTION_ICON.stargazers} ${t.stargazers.sectionTitle}`,
            '',
            ...sampledNote,
            t.stargazers.noNewStargazers,
            '',
          ]
        : [];

  const velocity = model.velocity;
  const velocityLines = velocity
    ? [
        `- **${t.velocity.starsPerDay}:** ${velocity.starsPerDay}`,
        ...(velocity.growthPercent !== null
          ? [`- **${t.velocity.growth}:** ${formatSignedPercent(velocity.growthPercent)}`]
          : []),
        ...(velocity.projection
          ? [
              `- ${interpolate({ template: t.velocity.projection, params: { days: velocity.projection.days, milestone: velocity.projection.milestone } })}`,
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
        renderForecastTable({
          title: t.forecast.aggregate,
          forecasts: forecastData.aggregate.forecasts,
          t,
        }),
        ...(chartHistory !== null
          ? ['', `![${t.forecast.sectionTitle}](./charts/${CHART_FILES.forecast})`, '']
          : []),
        ...(forecastData.repos.length > 0
          ? [
              `### ${t.forecast.byRepository}`,
              '',
              ...forecastData.repos.flatMap((repo) => [
                '<details>',
                `<summary>${escapeMarkup(repo.repoFullName)}</summary>`,
                '',
                renderForecastTable({
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
    !model.velocityIsNested && velocityLines.length > 0
      ? [`## ${SECTION_ICON.velocity} ${t.velocity.sectionTitle}`, '', ...velocityLines, '']
      : [];

  const footer = [
    '---',
    `*${interpolate({ template: t.footer.generated, params: { project: '[GitHub Star Tracker](https://github.com/fbuireu/github-star-tracker)', date: model.generatedAt } })}*`,
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

interface RenderForecastTableParams {
  title: string;
  forecasts: ForecastResult[];
  t: Translations;
}

function renderForecastTable({ title, forecasts, t }: RenderForecastTableParams): string {
  const table = buildForecastTable({ title, forecasts, t });

  return [
    `**${table.title}**`,
    '',
    `| ${t.forecast.method} | ${table.weekHeaders.join(' | ')} |`,
    `|:---|${table.weekHeaders.map(() => '---:').join('|')}|`,
    ...table.rows.map((row) => `| ${row.method} | ${row.predicted.map(String).join(' | ')} |`),
  ].join('\n');
}
