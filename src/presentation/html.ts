import { deltaIndicator } from '@domain/formatting';
import { getTranslations, interpolate } from '@i18n';
import { generateChartUrl, generateComparisonChartUrl } from './chart';
import { COLORS, TOP_REPOS_COUNT } from './constants';
import type { GenerateReportParams } from './shared';
import { prepareReportData } from './shared';

function deltaColor(delta: number): string {
  if (delta > 0) return COLORS.positive;
  if (delta < 0) return COLORS.negative;
  return COLORS.neutral;
}

export function generateHtmlReport({
  results,
  previousTimestamp,
  locale,
  history = null,
  includeCharts = true,
}: GenerateReportParams): string {
  const { summary } = results;
  const t = getTranslations(locale);
  const { sorted, removedRepos, now, prev } = prepareReportData({
    results,
    previousTimestamp,
    locale,
  });

  const rows = sorted
    .map((repo) => {
      const badge = repo.isNew
        ? ` <span style="background:${COLORS.positive};color:${COLORS.white};padding:1px 6px;border-radius:3px;font-size:11px;">${t.report.badges.new}</span>`
        : '';
      return `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid ${COLORS.cellBorder};">
          <a href="https://github.com/${repo.fullName}" style="color:${COLORS.link};text-decoration:none;">${repo.fullName}</a>${badge}
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid ${COLORS.cellBorder};text-align:right;">${repo.current}</td>
        <td style="padding:8px 12px;border-bottom:1px solid ${COLORS.cellBorder};text-align:right;color:${deltaColor(repo.delta)};font-weight:600;">
          ${deltaIndicator(repo.delta)}
        </td>
      </tr>`;
    })
    .join('');

  const removedSection =
    removedRepos.length > 0
      ? `
      <div style="margin-top:16px;">
        <h3 style="color:${COLORS.negative};font-size:14px;">${t.report.removedRepositories}</h3>
        <ul>${removedRepos.map((repo) => `<li>${interpolate({ template: t.report.removedRepoText, params: { name: repo.fullName, count: repo.previous ?? 0 } })}</li>`).join('')}</ul>
      </div>`
      : '';

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
      ? `
      <div style="margin-top:24px;text-align:center;">
        <h2 style="font-size:18px;margin-bottom:12px;">📈 ${t.report.starTrend}</h2>
        <img src="${generateChartUrl({ history, title: t.report.starHistory, locale })}" alt="${t.report.starHistory}" style="max-width:100%;height:auto;border-radius:4px;">
        ${
          comparisonChartUrl
            ? `
        <h3 style="font-size:16px;margin:20px 0 12px;">${t.report.byRepository}</h3>
        <img src="${comparisonChartUrl}" alt="${t.report.topRepositories}" style="max-width:100%;height:auto;border-radius:4px;">`
            : ''
        }
      </div>`
      : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:${COLORS.text};">
  <div style="text-align:center;padding:20px 0;border-bottom:2px solid ${COLORS.accent};">
    <h1 style="margin:0;font-size:24px;">${t.report.title}</h1>
    <p style="color:${COLORS.neutral};margin:8px 0 0;">${now} ${prev === t.report.firstRun ? `| ${t.report.firstRun}` : `| ${interpolate({ template: t.report.comparedTo, params: { date: prev } })}`}</p>
  </div>

  <div style="display:flex;justify-content:space-around;padding:20px 0;text-align:center;">
    <div>
      <div style="font-size:28px;font-weight:700;">${summary.totalStars}</div>
      <div style="color:${COLORS.neutral};font-size:12px;">${t.report.total} ${t.report.stars}</div>
    </div>
    <div>
      <div style="font-size:28px;font-weight:700;color:${deltaColor(summary.totalDelta)};">${deltaIndicator(summary.totalDelta)}</div>
      <div style="color:${COLORS.neutral};font-size:12px;">${t.report.netChange}</div>
    </div>
    <div>
      <div style="font-size:28px;font-weight:700;color:${COLORS.positive};">${summary.newStars}</div>
      <div style="color:${COLORS.neutral};font-size:12px;">${t.report.starsGained}</div>
    </div>
    <div>
      <div style="font-size:28px;font-weight:700;color:${COLORS.negative};">${summary.lostStars}</div>
      <div style="color:${COLORS.neutral};font-size:12px;">${t.report.starsLost}</div>
    </div>
  </div>

  <table style="width:100%;border-collapse:collapse;margin-top:16px;">
    <thead>
      <tr style="background:${COLORS.tableHeaderBg};">
        <th style="padding:8px 12px;text-align:left;border-bottom:2px solid ${COLORS.tableHeaderBorder};">${t.report.repositories}</th>
        <th style="padding:8px 12px;text-align:right;border-bottom:2px solid ${COLORS.tableHeaderBorder};">${t.report.stars}</th>
        <th style="padding:8px 12px;text-align:right;border-bottom:2px solid ${COLORS.tableHeaderBorder};">${t.report.change}</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  ${chartSection}

  ${removedSection}

  <div style="margin-top:24px;padding-top:16px;border-top:1px solid ${COLORS.cellBorder};text-align:center;color:${COLORS.neutral};font-size:12px;">
    ${interpolate({ template: t.footer.generated, params: { project: `<a href="https://github.com/fbuireu/github-star-tracker" style="color:${COLORS.link};">GitHub Star Tracker</a>`, date: new Date().toISOString() } })}
    <br>
    ${interpolate({ template: t.footer.madeBy, params: { author: `<a href="https://github.com/fbuireu" style="color:${COLORS.link};">Ferran Buireu</a>` } })}
  </div>
</body>
</html>`;
}
