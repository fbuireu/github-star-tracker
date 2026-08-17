import { ChartRange } from '@config/types';
import { STAR_MILESTONES } from '@domain/constants';
import type { ForecastData } from '@domain/forecast';
import { ForecastMethod } from '@domain/forecast';
import { formatCount } from '@domain/formatting';
import type { History } from '@domain/types';
import type { Locale } from '@i18n';
import { makeHistory, makeMultiRepoHistory } from '@shared/tests';
import { describe, expect, it } from 'vitest';
import type { ChartRequest, ChartSpec } from './chart-spec';
import {
  AxisLabels,
  buildChartSpec,
  ChartKind,
  SeriesDash,
  SeriesWeight,
  selectChartSnapshots,
} from './chart-spec';
import { CHART_COMPARISON_COLORS, LIGHT_PALETTE, TREND_WINDOW } from './constants';

const forecastData: ForecastData = {
  aggregate: {
    forecasts: [
      {
        method: ForecastMethod.LINEAR_REGRESSION,
        points: [
          { weekOffset: 1, predicted: 160 },
          { weekOffset: 2, predicted: 170 },
        ],
      },
      {
        method: ForecastMethod.WEIGHTED_MOVING_AVERAGE,
        points: [
          { weekOffset: 1, predicted: 155 },
          { weekOffset: 2, predicted: 158 },
        ],
      },
    ],
  },
  repos: [],
};

interface SpecOf {
  request: ChartRequest;
  axisLabels?: AxisLabels;
  range?: ChartRange;
  maxPoints?: number;
  locale?: Locale;
}

function specOf({
  request,
  axisLabels = AxisLabels.THINNED,
  range,
  maxPoints,
  locale = 'en',
}: SpecOf): ChartSpec {
  const spec = buildChartSpec({
    request,
    locale,
    palette: LIGHT_PALETTE,
    axisLabels,
    range,
    maxPoints,
  });

  expect(spec).not.toBeNull();

  return spec as ChartSpec;
}

function milestoneValues(spec: ChartSpec): number[] {
  return spec.milestones.map((milestone) => milestone.value);
}

const singleSnapshot: History = makeHistory([10]);
const multiRepo = makeMultiRepoHistory([
  { 'user/repo-a': 50, 'user/repo-b': 30 },
  { 'user/repo-a': 70, 'user/repo-b': 35 },
  { 'user/repo-a': 90, 'user/repo-b': 40 },
]);

describe('buildChartSpec', () => {
  describe('too little history', () => {
    const requests: ChartRequest[] = [
      { kind: ChartKind.STAR_HISTORY, history: singleSnapshot },
      { kind: ChartKind.PER_REPO, history: singleSnapshot, repoFullName: 'user/repo-a' },
      { kind: ChartKind.COMPARISON, history: singleSnapshot, repoNames: ['user/repo-a'] },
      { kind: ChartKind.FORECAST, history: singleSnapshot, forecastData },
    ];

    it('returns null for every kind below 2 snapshots', () => {
      const specs = requests.map((request) =>
        buildChartSpec({
          request,
          locale: 'en',
          palette: LIGHT_PALETTE,
          axisLabels: AxisLabels.THINNED,
        }),
      );

      expect(specs).toEqual([null, null, null, null]);
    });

    it('returns null for a comparison with no repositories', () => {
      const spec = buildChartSpec({
        request: { kind: ChartKind.COMPARISON, history: multiRepo, repoNames: [] },
        locale: 'en',
        palette: LIGHT_PALETTE,
        axisLabels: AxisLabels.THINNED,
      });

      expect(spec).toBeNull();
    });
  });

  describe('default titles', () => {
    it('names each kind from the locale bundle, or the repository itself', () => {
      const history = makeHistory([10, 20, 30]);
      const titles = [
        specOf({ request: { kind: ChartKind.STAR_HISTORY, history } }).title,
        specOf({
          request: { kind: ChartKind.PER_REPO, history: multiRepo, repoFullName: 'user/repo-a' },
        }).title,
        specOf({
          request: { kind: ChartKind.COMPARISON, history: multiRepo, repoNames: ['user/repo-a'] },
        }).title,
        specOf({ request: { kind: ChartKind.FORECAST, history, forecastData } }).title,
      ];

      expect(titles).toEqual([
        'Star History',
        'user/repo-a Star History',
        'Top Repositories',
        'Growth Forecast',
      ]);
    });

    it('lets an explicit title win', () => {
      const spec = specOf({
        request: { kind: ChartKind.STAR_HISTORY, history: makeHistory([10, 20]), title: 'Mine' },
      });

      expect(spec.title).toBe('Mine');
    });
  });

  describe('star history', () => {
    it('plots the total series, filled and unbroken', () => {
      const spec = specOf({
        request: { kind: ChartKind.STAR_HISTORY, history: makeHistory([10, 20, 30]) },
      });

      expect(spec.series).toHaveLength(1);
      expect(spec.series[0]).toMatchObject({
        data: [10, 20, 30],
        fill: true,
        dash: SeriesDash.NONE,
        weight: SeriesWeight.PRIMARY,
        color: LIGHT_PALETTE.accent,
      });
      expect(spec.showLegend).toBe(false);
    });

    it('honours an explicit line colour', () => {
      const spec = specOf({
        request: {
          kind: ChartKind.STAR_HISTORY,
          history: makeHistory([10, 20]),
          lineColor: '#6f42c1',
        },
      });

      expect(spec.series[0].color).toBe('#6f42c1');
    });

    it('adds a trailing-average trend series that carries no emphasis', () => {
      const values = [10, 20, 30, 40];
      const spec = specOf({
        request: { kind: ChartKind.STAR_HISTORY, history: makeHistory(values), trendLine: true },
      });

      expect(spec.series).toHaveLength(2);
      expect(spec.series[1]).toMatchObject({
        dash: SeriesDash.TREND,
        weight: SeriesWeight.HIDDEN,
        fill: false,
        color: LIGHT_PALETTE.neutral,
      });
      expect(spec.series[1].data).toEqual([10, 15, 20, 25]);
      expect(values.length).toBeLessThanOrEqual(TREND_WINDOW);
    });

    it('resolves milestones: custom beats built-in, empty falls back, off is none', () => {
      const history = makeHistory([10, 600]);
      const resolved = [
        milestoneValues(specOf({ request: { kind: ChartKind.STAR_HISTORY, history } })),
        milestoneValues(
          specOf({
            request: { kind: ChartKind.STAR_HISTORY, history, customMilestones: [90, 110] },
          }),
        ),
        milestoneValues(
          specOf({ request: { kind: ChartKind.STAR_HISTORY, history, customMilestones: [] } }),
        ),
        milestoneValues(
          specOf({ request: { kind: ChartKind.STAR_HISTORY, history, milestones: false } }),
        ),
      ];

      expect(resolved).toEqual([[50, 100, 500], [90, 110], [50, 100, 500], []]);
      expect(STAR_MILESTONES).toContain(500);
    });

    it('labels each milestone once, in the spec, using the requested locale', () => {
      const request = {
        kind: ChartKind.STAR_HISTORY,
        history: makeHistory([10, 6000]),
        customMilestones: [1000],
      } as const;

      expect(specOf({ request }).milestones).toEqual([{ value: 1000, label: '1K ★' }]);
      expect(specOf({ request, locale: 'es' }).milestones).toEqual([
        { value: 1000, label: `${formatCount({ count: 1000, locale: 'es' })} ★` },
      ]);
    });

    it('keeps only the milestones strictly inside the observed extremes', () => {
      const spec = specOf({
        request: {
          kind: ChartKind.STAR_HISTORY,
          history: makeHistory([10, 100]),
          customMilestones: [10, 50, 100],
        },
      });

      expect(milestoneValues(spec)).toEqual([50]);
    });

    it('measures the extremes across every series, not just the primary one', () => {
      const values = [10, 20, 30, 40];
      const spec = specOf({
        request: {
          kind: ChartKind.STAR_HISTORY,
          history: makeHistory(values),
          customMilestones: [12, 25, 35],
          trendLine: true,
        },
      });

      expect(spec.series).toHaveLength(2);
      expect(milestoneValues(spec)).toEqual([12, 25, 35]);
    });
  });

  describe('per repo', () => {
    it('reads the repository out of every snapshot and carries no milestones', () => {
      const spec = specOf({
        request: { kind: ChartKind.PER_REPO, history: multiRepo, repoFullName: 'user/repo-b' },
      });

      expect(spec.series).toHaveLength(1);
      expect(spec.series[0].data).toEqual([30, 35, 40]);
      expect(spec.milestones).toEqual([]);
      expect(spec.showLegend).toBe(false);
    });

    it('yields a flat zero series for a repository absent from every snapshot', () => {
      const spec = specOf({
        request: { kind: ChartKind.PER_REPO, history: multiRepo, repoFullName: 'user/ghost' },
      });

      expect(spec.series[0].data).toEqual([0, 0, 0]);
    });
  });

  describe('comparison', () => {
    it('shortens labels only when every repository shares one owner', () => {
      const sameOwner = specOf({
        request: {
          kind: ChartKind.COMPARISON,
          history: multiRepo,
          repoNames: ['user/repo-a', 'user/repo-b'],
        },
      });
      const mixedOwners = specOf({
        request: {
          kind: ChartKind.COMPARISON,
          history: makeMultiRepoHistory([
            { 'alice/repo-a': 10, 'bob/repo-b': 20 },
            { 'alice/repo-a': 15, 'bob/repo-b': 25 },
          ]),
          repoNames: ['alice/repo-a', 'bob/repo-b'],
        },
      });

      expect(sameOwner.series.map((series) => series.label)).toEqual(['repo-a', 'repo-b']);
      expect(mixedOwners.series.map((series) => series.label)).toEqual([
        'alice/repo-a',
        'bob/repo-b',
      ]);
    });

    it('caps the set at ten and assigns colours by position', () => {
      const repoNames = Array.from({ length: 12 }, (_, index) => `user/repo-${index}`);
      const spec = specOf({
        request: { kind: ChartKind.COMPARISON, history: multiRepo, repoNames },
      });

      expect(spec.series).toHaveLength(10);
      expect(spec.series.map((series) => series.color)).toEqual([...CHART_COMPARISON_COLORS]);
      expect(spec.showLegend).toBe(true);
      expect(spec.series.every((series) => series.fill === false)).toBe(true);
    });
  });

  describe('forecast', () => {
    const history = makeHistory([100, 120, 150]);

    it('continues the observed series into one series per Forecast Method', () => {
      const spec = specOf({ request: { kind: ChartKind.FORECAST, history, forecastData } });

      expect(spec.series.map((series) => series.dash)).toEqual([
        SeriesDash.NONE,
        SeriesDash.LINEAR_REGRESSION,
        SeriesDash.WEIGHTED_MOVING_AVERAGE,
      ]);
      expect(spec.series[0].data).toEqual([100, 120, 150, null, null]);
      expect(spec.series[1].data).toEqual([null, null, 150, 160, 170]);
      expect(spec.series[2].data).toEqual([null, null, 150, 155, 158]);
    });

    it('appends a week label per forecast point', () => {
      const spec = specOf({ request: { kind: ChartKind.FORECAST, history, forecastData } });

      expect(spec.labels).toHaveLength(5);
      expect(spec.labels.slice(-2)).toEqual(['Week 1', 'Week 2']);
    });

    it('always dates its x-axis, whatever the adapter asks for', () => {
      const thinned = specOf({
        request: { kind: ChartKind.FORECAST, history, forecastData },
        axisLabels: AxisLabels.THINNED,
      });
      const dated = specOf({
        request: { kind: ChartKind.FORECAST, history, forecastData },
        axisLabels: AxisLabels.DATES,
      });

      expect(thinned.labels).toEqual(dated.labels);
    });
  });

  describe('windowing', () => {
    const history = makeHistory([10, 20, 30, 40, 50]);

    it('thins x-axis labels to years for a multi-year history, or dates them in full', () => {
      const multiYear = makeHistory([10, 20, 30], { stepDays: 400 });
      const thinned = specOf({
        request: { kind: ChartKind.STAR_HISTORY, history: multiYear },
        axisLabels: AxisLabels.THINNED,
      });
      const dated = specOf({
        request: { kind: ChartKind.STAR_HISTORY, history: multiYear },
        axisLabels: AxisLabels.DATES,
      });

      expect(thinned.labels).toEqual(['2026', '2027', '2028']);
      expect(dated.labels).toEqual(['Jan 1', 'Feb 5', 'Mar 11']);
    });

    it('downsamples evenly, keeping the first and last snapshot', () => {
      const spec = specOf({
        request: { kind: ChartKind.STAR_HISTORY, history },
        maxPoints: 3,
      });

      expect(spec.series[0].data).toEqual([10, 30, 50]);
    });

    it('filters by range before downsampling', () => {
      const spec = specOf({
        request: {
          kind: ChartKind.STAR_HISTORY,
          history: makeHistory([10, 20, 30, 40, 50], { stepDays: 10 }),
        },
        range: ChartRange.D30,
      });

      expect(spec.series[0].data).toEqual([20, 30, 40, 50]);
    });
  });
});

describe('selectChartSnapshots', () => {
  const snapshots = [
    { timestamp: '2026-01-01T00:00:00Z' },
    { timestamp: '2026-02-01T00:00:00Z' },
    { timestamp: '2026-03-01T00:00:00Z' },
  ];

  it('keeps every snapshot when the range is unbounded', () => {
    expect(selectChartSnapshots({ snapshots, range: ChartRange.ALL })).toHaveLength(3);
  });

  it('drops snapshots outside the range window', () => {
    const windowed = selectChartSnapshots({ snapshots, range: ChartRange.D30 });

    expect(windowed).toEqual([{ timestamp: '2026-02-01T00:00:00Z' }, snapshots[2]]);
  });

  it('downsamples across the window instead of keeping only the tail', () => {
    expect(selectChartSnapshots({ snapshots, maxPoints: 2 })).toEqual([snapshots[0], snapshots[2]]);
  });

  it('spans the whole window at evenly spaced points, keeping both endpoints', () => {
    const dense = Array.from({ length: 100 }, (_, index) => ({
      timestamp: new Date(Date.UTC(2026, 0, 1) + index * 86_400_000).toISOString(),
    }));

    const picked = selectChartSnapshots({ snapshots: dense, maxPoints: 5 });

    expect(picked).toHaveLength(5);
    expect(picked[0]).toBe(dense[0]);
    expect(picked.at(-1)).toBe(dense.at(-1));
  });

  it('keeps chart-range meaningful once the window exceeds maxPoints', () => {
    const dense = Array.from({ length: 400 }, (_, index) => ({
      timestamp: new Date(Date.UTC(2025, 0, 1) + index * 86_400_000).toISOString(),
    }));

    const year = selectChartSnapshots({ snapshots: dense, range: ChartRange.Y1, maxPoints: 30 });
    const everything = selectChartSnapshots({
      snapshots: dense,
      range: ChartRange.ALL,
      maxPoints: 30,
    });

    expect(year[0]).not.toBe(everything[0]);
  });

  it('returns only the newest entry when maxPoints is 1', () => {
    expect(selectChartSnapshots({ snapshots, maxPoints: 1 })).toEqual([snapshots[2]]);
  });

  it('copies rather than aliases when maxPoints is 0', () => {
    const result = selectChartSnapshots({ snapshots, maxPoints: 0 });

    expect(result).toEqual(snapshots);
    expect(result).not.toBe(snapshots);
  });

  it('skips a snapshot whose timestamp cannot be parsed', () => {
    const withCorrupt = [{ timestamp: 'not-a-date' }, ...snapshots];

    expect(selectChartSnapshots({ snapshots: withCorrupt, range: ChartRange.D30 })).toEqual([
      snapshots[1],
      snapshots[2],
    ]);
  });

  it('leaves the series unfiltered when the newest timestamp is unparseable', () => {
    const trailingCorrupt = [...snapshots, { timestamp: 'not-a-date' }];

    expect(selectChartSnapshots({ snapshots: trailingCorrupt, range: ChartRange.D30 })).toEqual(
      trailingCorrupt,
    );
  });
});
