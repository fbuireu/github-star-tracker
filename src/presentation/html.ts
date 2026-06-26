import { ChartRange, ChartTheme } from '@config/types';
import { deltaIndicator } from '@domain/formatting';
import { getTranslations, interpolate } from '@i18n';
import {
  generateChartUrl,
  generateComparisonChartUrl,
  generateForecastChartUrl,
  generatePerRepoChartUrl,
} from './chart';
import { MIN_SNAPSHOTS_FOR_CHART } from './constants';
import type { GenerateReportParams } from './shared';
import {
  buildForecastWeekHeaders,
  forecastMethodLabel,
  prepareReportData,
  resolvePalette,
} from './shared';
import type { ColorPalette } from './types';

interface DeltaColorParams {
  delta: number;
  palette: ColorPalette;
}

function deltaColor({ delta, palette }: DeltaColorParams): string {
  if (delta > 0) return palette.positive;
  if (delta < 0) return palette.negative;
  return palette.neutral;
}

export function generateHtmlReport({
  results,
  previousTimestamp,
  locale,
  history = null,
  includeCharts = true,
  stargazerDiff = null,
  forecastData = null,
  topRepos: topReposCount = 10,
  smoothing = true,
  showPoints = true,
  milestones = true,
  beginAtZero = false,
  theme = ChartTheme.AUTO,
  customMilestones,
  range = ChartRange.ALL,
  trendLine = false,
}: GenerateReportParams): string {
  const { summary } = results;
  const t = getTranslations(locale);
  const palette = resolvePalette(theme);
  const { sorted, removedRepos, now, prev } = prepareReportData({
    results,
    previousTimestamp,
    locale,
  });

  const hasChartHistory =
    includeCharts && history !== null && history.snapshots.length >= MIN_SNAPSHOTS_FOR_CHART;

  const rows = sorted
    .map((repo) => {
      const badge = repo.isNew
        ? ` <span style="background:${palette.positive};color:${palette.white};padding:1px 6px;border-radius:3px;font-size:11px;">${t.report.badges.new}</span>`
        : '';
      return `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid ${palette.cellBorder};">
          <a href="https://github.com/${repo.fullName}" style="color:${palette.link};text-decoration:none;">${repo.fullName}</a>${badge}
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid ${palette.cellBorder};text-align:right;">${repo.current}</td>
        <td style="padding:8px 12px;border-bottom:1px solid ${palette.cellBorder};text-align:right;color:${deltaColor({ delta: repo.delta, palette })};font-weight:600;">
          ${deltaIndicator(repo.delta)}
        </td>
      </tr>`;
    })
    .join('');

  const removedSection =
    removedRepos.length > 0
      ? `
      <div style="margin-top:16px;">
        <h3 style="color:${palette.negative};font-size:14px;">${t.report.removedRepositories}</h3>
        <ul>${removedRepos.map((repo) => `<li>${interpolate({ template: t.report.removedRepoText, params: { name: repo.fullName, count: repo.previous ?? 0 } })}</li>`).join('')}</ul>
      </div>`
      : '';

  const topRepos = sorted.slice(0, topReposCount).map((repo) => repo.fullName);
  const comparisonChartUrl =
    hasChartHistory && topRepos.length > 0
      ? generateComparisonChartUrl({
          history,
          repoNames: topRepos,
          title: t.report.topRepositories,
          locale,
          smoothing,
          showPoints,
          beginAtZero,
          theme,
          range,
        })
      : null;

  const individualRepoChartsHtml = hasChartHistory
    ? topRepos
        .map((repoName) => {
          const chartUrl = generatePerRepoChartUrl({
            history,
            repoFullName: repoName,
            locale,
            smoothing,
            showPoints,
            beginAtZero,
            theme,
            range,
          });
          if (!chartUrl) return '';
          return `
        <div style="margin-top:16px;">
          <h4 style="font-size:14px;margin-bottom:8px;">${repoName}</h4>
          <img src="${chartUrl}" alt="${repoName}" style="max-width:100%;height:auto;border-radius:4px;">
        </div>`;
        })
        .filter(Boolean)
        .join('')
    : '';

  const chartSection = hasChartHistory
    ? `
      <div style="margin-top:24px;text-align:center;">
        <h2 style="font-size:18px;margin-bottom:12px;">📈 ${t.report.starTrend}</h2>
        <img src="${generateChartUrl({ history, title: t.report.starHistory, locale, smoothing, showPoints, milestones, beginAtZero, theme, customMilestones, range, trendLine })}" alt="${t.report.starHistory}" style="max-width:100%;height:auto;border-radius:4px;">

        ${
          comparisonChartUrl
            ? `
        <h3 style="font-size:16px;margin:20px 0 12px;">${t.report.byRepository}</h3>
        <img src="${comparisonChartUrl}" alt="${t.report.topRepositories}" style="max-width:100%;height:auto;border-radius:4px;">`
            : ''
        }
        ${
          individualRepoChartsHtml
            ? `
        <h3 style="font-size:16px;margin:24px 0 12px;">${t.report.individualRepoCharts}</h3>
        ${individualRepoChartsHtml}`
            : ''
        }
      </div>`
    : '';

  const sampledNoteHtml =
    stargazerDiff?.sampledRepos && stargazerDiff.sampledRepos.length > 0
      ? `<p style="color:${palette.neutral};">${interpolate({ template: t.stargazers.sampledNote, params: { repos: stargazerDiff.sampledRepos.join(', ') } })}</p>`
      : '';

  const stargazerSection =
    stargazerDiff && stargazerDiff.totalNew > 0
      ? `
      <div style="margin-top:24px;">
        <h2 style="font-size:18px;margin-bottom:12px;">👤 ${t.stargazers.sectionTitle}</h2>
        <p>${interpolate({ template: t.stargazers.newStargazers, params: { count: stargazerDiff.totalNew } })}</p>
        ${sampledNoteHtml}
        ${stargazerDiff.entries
          .map(
            (entry) => `
        <div style="margin-top:12px;">
          <h3 style="font-size:14px;margin-bottom:8px;">${entry.repoFullName} (${interpolate({ template: t.stargazers.stargazerCount, params: { count: entry.newStargazers.length } })})</h3>
          ${entry.newStargazers
            .map(
              (stargazer) => `
          <div style="display:flex;align-items:center;margin:4px 0;">
            <img src="${stargazer.avatarUrl}" width="32" height="32" style="border-radius:50%;margin-right:8px;">
            <a href="${stargazer.profileUrl}" style="color:${palette.link};text-decoration:none;font-weight:600;">${stargazer.login}</a>
            <span style="color:${palette.neutral};margin-left:8px;font-size:12px;">${interpolate({ template: t.stargazers.starredOn, params: { date: stargazer.starredAt.split('T')[0] } })}</span>
          </div>`,
            )
            .join('')}
        </div>`,
          )
          .join('')}
      </div>`
      : stargazerDiff
        ? `
      <div style="margin-top:24px;">
        <h2 style="font-size:18px;margin-bottom:12px;">👤 ${t.stargazers.sectionTitle}</h2>
        ${sampledNoteHtml}
        <p style="color:${palette.neutral};">${t.stargazers.noNewStargazers}</p>
      </div>`
        : '';

  const forecastSection = forecastData
    ? `
      <div style="margin-top:24px;">
        <h2 style="font-size:18px;margin-bottom:12px;">🔮 ${t.forecast.sectionTitle}</h2>
        ${buildHtmlForecastTable({ title: t.forecast.aggregate, forecasts: forecastData.aggregate.forecasts, t, palette })}
        ${
          hasChartHistory
            ? `<div style="margin-top:16px;text-align:center;">
          <img src="${generateForecastChartUrl({ history, forecastData, locale, smoothing, showPoints, beginAtZero, theme, range })}" alt="${t.forecast.sectionTitle}" style="max-width:100%;height:auto;border-radius:4px;">
        </div>`
            : ''
        }
        ${forecastData.repos
          .map(
            (repo) => `
        <div style="margin-top:16px;">
          ${buildHtmlForecastTable({ title: repo.repoFullName, forecasts: repo.forecasts, t, palette })}
        </div>`,
          )
          .join('')}
      </div>`
    : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="color-scheme" content="${theme === ChartTheme.AUTO ? 'light dark' : theme}"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:${palette.text};background-color:${palette.white};">
  <div style="text-align:center;padding:20px 0;border-bottom:2px solid ${palette.accent};">
    <h1 style="margin:0;font-size:24px;">${t.report.title}</h1>
    <p style="color:${palette.neutral};margin:8px 0 0;">${now} ${prev === t.report.firstRun ? `| ${t.report.firstRun}` : `| ${interpolate({ template: t.report.comparedTo, params: { date: prev } })}`}</p>
  </div>

  <div style="display:flex;justify-content:space-around;padding:20px 0;text-align:center;">
    <div>
      <div style="font-size:28px;font-weight:700;">${summary.totalStars}</div>
      <div style="color:${palette.neutral};font-size:12px;">${t.report.total} ${t.report.stars}</div>
    </div>
    <div>
      <div style="font-size:28px;font-weight:700;color:${deltaColor({ delta: summary.totalDelta, palette })};">${deltaIndicator(summary.totalDelta)}</div>
      <div style="color:${palette.neutral};font-size:12px;">${t.report.netChange}</div>
    </div>
    <div>
      <div style="font-size:28px;font-weight:700;color:${palette.positive};">${summary.newStars}</div>
      <div style="color:${palette.neutral};font-size:12px;">${t.report.starsGained}</div>
    </div>
    <div>
      <div style="font-size:28px;font-weight:700;color:${palette.negative};">${summary.lostStars}</div>
      <div style="color:${palette.neutral};font-size:12px;">${t.report.starsLost}</div>
    </div>
  </div>

  <table style="width:100%;border-collapse:collapse;margin-top:16px;">
    <thead>
      <tr style="background:${palette.tableHeaderBg};">
        <th style="padding:8px 12px;text-align:left;border-bottom:2px solid ${palette.tableHeaderBorder};">${t.report.repositories}</th>
        <th style="padding:8px 12px;text-align:right;border-bottom:2px solid ${palette.tableHeaderBorder};">${t.report.stars}</th>
        <th style="padding:8px 12px;text-align:right;border-bottom:2px solid ${palette.tableHeaderBorder};">${t.report.change}</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  ${chartSection}

  ${removedSection}

  ${stargazerSection}

  ${forecastSection}

  <div style="margin-top:24px;padding-top:16px;border-top:1px solid ${palette.cellBorder};text-align:center;color:${palette.neutral};font-size:12px;">
    ${interpolate({ template: t.footer.generated, params: { project: `<a href="https://github.com/fbuireu/github-star-tracker" style="color:${palette.link};">GitHub Star Tracker</a>`, date: new Date().toISOString() } })}
    <br>
    ${interpolate({ template: t.footer.madeBy, params: { author: `<a href="https://github.com/fbuireu" style="color:${palette.link};">Ferran Buireu</a>` } })}
  </div>
</body>
</html>`;
}

interface BuildHtmlForecastTableParams {
  title: string;
  forecasts: { method: string; points: { weekOffset: number; predicted: number }[] }[];
  t: ReturnType<typeof getTranslations>;
  palette: ColorPalette;
}

function buildHtmlForecastTable({
  title,
  forecasts,
  t,
  palette,
}: BuildHtmlForecastTableParams): string {
  const weekHeaders = buildForecastWeekHeaders(t);

  return `
    <h4 style="font-size:14px;margin-bottom:8px;">${title}</h4>
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:${palette.tableHeaderBg};">
          <th style="padding:6px 8px;text-align:left;border-bottom:2px solid ${palette.tableHeaderBorder};font-size:12px;">${t.forecast.method}</th>
          ${weekHeaders.map((header) => `<th style="padding:6px 8px;text-align:right;border-bottom:2px solid ${palette.tableHeaderBorder};font-size:12px;">${header}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${forecasts
          .map(
            (forecast) => `
        <tr>
          <td style="padding:6px 8px;border-bottom:1px solid ${palette.cellBorder};font-size:12px;">${forecastMethodLabel({ method: forecast.method, t })}</td>
          ${forecast.points.map((point) => `<td style="padding:6px 8px;border-bottom:1px solid ${palette.cellBorder};text-align:right;font-size:12px;">${point.predicted}</td>`).join('')}
        </tr>`,
          )
          .join('')}
      </tbody>
    </table>`;
}
