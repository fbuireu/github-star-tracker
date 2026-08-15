import { ChartTheme } from '@config/types';
import type { ForecastResult } from '@domain/forecast';
import { deltaIndicator, formatSignedPercent, trendIcon } from '@domain/formatting';
import { getTranslations, interpolate } from '@i18n';
import { chartImageUrl } from './chart';
import type { ChartRequest } from './chart-spec';
import { ChartKind } from './chart-spec';
import { SECTION_ICON } from './constants';
import { EscapeDialect, escapeFor } from './escaping';
import {
  buildForecastTable,
  buildReportModel,
  StargazerOutcome,
  type TopRepo,
} from './report-model';
import type { GenerateHtmlReportParams } from './shared';
import { colorSchemeFor, resolvePalette } from './shared';
import type { ColorPalette } from './types';

const escapeHtml = escapeFor(EscapeDialect.MARKUP);

interface DeltaColorParams {
  delta: number;
  palette: ColorPalette;
}

function deltaColor({ delta, palette }: DeltaColorParams): string {
  if (delta > 0) return palette.positive;
  if (delta < 0) return palette.negative;
  return palette.neutral;
}

interface RepoChartHeadingParams {
  repo: TopRepo;
  palette: ColorPalette;
  t: ReturnType<typeof getTranslations>;
}

function repoChartHeading({ repo, palette, t }: RepoChartHeadingParams): string {
  return interpolate({
    template: t.report.repoChartHeading,
    params: {
      name: escapeHtml(repo.fullName),
      count: repo.current,
      delta: `<span style="color:${deltaColor({ delta: repo.delta, palette })};font-weight:600;">${deltaIndicator(repo.delta)}</span>`,
    },
  });
}

export function generateHtmlReport(params: GenerateHtmlReportParams): string {
  const {
    locale,
    theme = ChartTheme.AUTO,
    smoothing,
    curve,
    showPoints,
    beginAtZero,
    range,
    lineWidth,
    milestones,
    customMilestones,
    trendLine,
    lineColor,
  } = params;

  const t = getTranslations(locale);
  const palette = resolvePalette(theme);
  const chartUrl = (request: ChartRequest): string | null =>
    chartImageUrl({
      request,
      locale,
      smoothing,
      curve,
      showPoints,
      beginAtZero,
      theme,
      range,
      lineWidth,
    });
  const model = buildReportModel(params);
  const {
    summary,
    sorted,
    newRepos,
    removedRepos,
    now,
    prev,
    chartHistory: history,
    forecast: forecastData,
  } = model;

  const rows = sorted
    .map((repo) => {
      const badge = repo.isNew
        ? ` <span style="background:${palette.positive};color:${palette.white};padding:1px 6px;border-radius:3px;font-size:11px;">${t.report.badges.new}</span>`
        : '';
      return `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid ${palette.cellBorder};">
          <a href="https://github.com/${escapeHtml(repo.fullName)}" style="color:${palette.link};text-decoration:none;">${escapeHtml(repo.fullName)}</a>${badge}
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid ${palette.cellBorder};text-align:right;">${repo.current}</td>
        <td style="padding:8px 12px;border-bottom:1px solid ${palette.cellBorder};text-align:right;color:${deltaColor({ delta: repo.delta, palette })};font-weight:600;">
          ${deltaIndicator(repo.delta)}
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid ${palette.cellBorder};text-align:center;">${trendIcon(repo.delta)}</td>
      </tr>`;
    })
    .join('');

  const newSection =
    newRepos.length > 0
      ? `
      <div style="margin-top:16px;">
        <h3 style="color:${palette.positive};font-size:14px;">${t.report.newRepositories}</h3>
        <ul>${newRepos
          .map(
            (repo) =>
              `<li><a href="https://github.com/${escapeHtml(repo.fullName)}" style="color:${palette.link};text-decoration:none;">${escapeHtml(repo.fullName)}</a>: ${interpolate({ template: t.report.starsCount, params: { count: repo.current } })}</li>`,
          )
          .join('')}</ul>
      </div>`
      : '';

  const removedSection =
    removedRepos.length > 0
      ? `
      <div style="margin-top:16px;">
        <h3 style="color:${palette.negative};font-size:14px;">${t.report.removedRepositories}</h3>
        <ul>${removedRepos.map((repo) => `<li>${interpolate({ template: t.report.removedRepoText, params: { name: escapeHtml(repo.fullName), count: repo.previous ?? 0 } })}</li>`).join('')}</ul>
      </div>`
      : '';

  const topRepos = model.topRepos;
  const comparisonChartUrl =
    history !== null && topRepos.length > 0
      ? chartUrl({
          kind: ChartKind.COMPARISON,
          history,
          repoNames: topRepos.map((repo) => repo.fullName),
        })
      : null;

  const individualRepoChartsHtml =
    history !== null
      ? topRepos
          .map((repo) => {
            const repoChartUrl = chartUrl({
              kind: ChartKind.PER_REPO,
              history,
              repoFullName: repo.fullName,
              lineColor,
            });
            if (!repoChartUrl) return '';
            return `
        <div style="margin-top:16px;">
          <h4 style="font-size:14px;margin-bottom:8px;">${repoChartHeading({ repo, palette, t })}</h4>
          <img src="${repoChartUrl}" alt="${escapeHtml(repo.fullName)}" style="max-width:100%;height:auto;border-radius:4px;">
        </div>`;
          })
          .filter(Boolean)
          .join('')
      : '';

  const chartSection =
    history !== null
      ? `
      <div style="margin-top:24px;text-align:center;">
        <h2 style="font-size:18px;margin-bottom:12px;">${SECTION_ICON.starTrend} ${t.report.starTrend}</h2>
        <img src="${chartUrl({ kind: ChartKind.STAR_HISTORY, history, milestones, customMilestones, trendLine, lineColor })}" alt="${t.report.starHistory}" style="max-width:100%;height:auto;border-radius:4px;">

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

  const stargazers = model.stargazers;
  const sampledNoteHtml =
    stargazers && stargazers.sampledRepos.length > 0
      ? `<p style="color:${palette.neutral};">${interpolate({ template: t.stargazers.sampledNote, params: { repos: stargazers.sampledRepos.join(', ') } })}</p>`
      : '';

  const stargazerSection =
    stargazers && stargazers.outcome === StargazerOutcome.NEW
      ? `
      <div style="margin-top:24px;">
        <h2 style="font-size:18px;margin-bottom:12px;">${SECTION_ICON.stargazers} ${t.stargazers.sectionTitle}</h2>
        <p>${interpolate({ template: t.stargazers.newStargazers, params: { count: stargazers.totalNew } })}</p>
        ${sampledNoteHtml}
        ${stargazers.entries
          .map(
            (entry) => `
        <div style="margin-top:12px;">
          <h3 style="font-size:14px;margin-bottom:8px;">${escapeHtml(entry.repoFullName)} (${interpolate({ template: t.stargazers.stargazerCount, params: { count: entry.newStargazers.length } })})</h3>
          ${entry.newStargazers
            .map(
              (stargazer) => `
          <div style="display:flex;align-items:center;margin:4px 0;">
            <img src="${escapeHtml(stargazer.avatarUrl)}" width="32" height="32" style="border-radius:50%;margin-right:8px;">
            <a href="${escapeHtml(stargazer.profileUrl)}" style="color:${palette.link};text-decoration:none;font-weight:600;">${escapeHtml(stargazer.login)}</a>
            <span style="color:${palette.neutral};margin-left:8px;font-size:12px;">${interpolate({ template: t.stargazers.starredOn, params: { date: stargazer.starredAt.split('T')[0] } })}</span>
          </div>`,
            )
            .join('')}
        </div>`,
          )
          .join('')}
      </div>`
      : stargazers
        ? `
      <div style="margin-top:24px;">
        <h2 style="font-size:18px;margin-bottom:12px;">${SECTION_ICON.stargazers} ${t.stargazers.sectionTitle}</h2>
        ${sampledNoteHtml}
        <p style="color:${palette.neutral};">${t.stargazers.noNewStargazers}</p>
      </div>`
        : '';

  const velocity = model.velocity;
  const velocityList = velocity
    ? `
        <ul style="margin:0;padding-left:20px;">
          <li><strong>${t.velocity.starsPerDay}:</strong> ${velocity.starsPerDay}</li>
          ${
            velocity.growthPercent !== null
              ? `<li><strong>${t.velocity.growth}:</strong> <span style="color:${deltaColor({ delta: velocity.growthPercent, palette })};">${formatSignedPercent(velocity.growthPercent)}</span></li>`
              : ''
          }
          ${
            velocity.projection
              ? `<li>${interpolate({ template: t.velocity.projection, params: { days: velocity.projection.days, milestone: velocity.projection.milestone } })}</li>`
              : ''
          }
        </ul>`
    : '';

  const forecastSection = forecastData
    ? `
      <div style="margin-top:24px;">
        <h2 style="font-size:18px;margin-bottom:12px;">${SECTION_ICON.forecast} ${t.forecast.sectionTitle}</h2>
        ${
          velocityList
            ? `<div style="margin-bottom:16px;">
          <h3 style="font-size:16px;margin-bottom:8px;">${SECTION_ICON.velocity} ${t.velocity.sectionTitle}</h3>
          ${velocityList}
        </div>`
            : ''
        }
        ${buildHtmlForecastTable({ title: t.forecast.aggregate, forecasts: forecastData.aggregate.forecasts, t, palette })}
        ${
          history !== null
            ? `<div style="margin-top:16px;text-align:center;">
          <img src="${chartUrl({ kind: ChartKind.FORECAST, history, forecastData, lineColor })}" alt="${t.forecast.sectionTitle}" style="max-width:100%;height:auto;border-radius:4px;">
        </div>`
            : ''
        }
        ${
          forecastData.repos.length > 0
            ? `<h3 style="font-size:16px;margin:20px 0 12px;">${t.forecast.byRepository}</h3>`
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

  const velocitySection =
    !model.velocityIsNested && velocityList
      ? `
      <div style="margin-top:24px;">
        <h2 style="font-size:18px;margin-bottom:12px;">${SECTION_ICON.velocity} ${t.velocity.sectionTitle}</h2>
        ${velocityList}
      </div>`
      : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="color-scheme" content="${colorSchemeFor(theme)}"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:${palette.text};background-color:${palette.white};">
  <div style="text-align:center;padding:20px 0;border-bottom:2px solid ${palette.accent};">
    <h1 style="margin:0;font-size:24px;">${t.report.title}</h1>
    <p style="color:${palette.neutral};margin:8px 0 0;">${now} ${model.isFirstRun ? `| ${t.report.firstRun}` : `| ${interpolate({ template: t.report.comparedTo, params: { date: prev } })}`}</p>
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
        <th style="padding:8px 12px;text-align:center;border-bottom:2px solid ${palette.tableHeaderBorder};">${t.report.trend}</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  ${chartSection}

  ${newSection}

  ${removedSection}

  ${stargazerSection}

  ${forecastSection}

  ${velocitySection}

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
  forecasts: ForecastResult[];
  t: ReturnType<typeof getTranslations>;
  palette: ColorPalette;
}

function buildHtmlForecastTable({
  title,
  forecasts,
  t,
  palette,
}: BuildHtmlForecastTableParams): string {
  const table = buildForecastTable({ title, forecasts, t });

  return `
    <h4 style="font-size:14px;margin-bottom:8px;">${table.title}</h4>
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:${palette.tableHeaderBg};">
          <th style="padding:6px 8px;text-align:left;border-bottom:2px solid ${palette.tableHeaderBorder};font-size:12px;">${t.forecast.method}</th>
          ${table.weekHeaders.map((header) => `<th style="padding:6px 8px;text-align:right;border-bottom:2px solid ${palette.tableHeaderBorder};font-size:12px;">${header}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${table.rows
          .map(
            (row) => `
        <tr>
          <td style="padding:6px 8px;border-bottom:1px solid ${palette.cellBorder};font-size:12px;">${row.method}</td>
          ${row.predicted.map((predicted) => `<td style="padding:6px 8px;border-bottom:1px solid ${palette.cellBorder};text-align:right;font-size:12px;">${predicted}</td>`).join('')}
        </tr>`,
          )
          .join('')}
      </tbody>
    </table>`;
}
