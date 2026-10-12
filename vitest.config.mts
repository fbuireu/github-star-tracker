import { defineConfig } from "vitest/config";
import { GithubActionsReporter, type Reporter, type TestModule } from "vitest/node";

const MIN_THRESHOLD = 85;

const jobSummary = (titleOf: (testModules: readonly TestModule[]) => string): Reporter => {
	const github = new GithubActionsReporter();

	return {
		onInit: (vitest) => github.onInit(vitest),
		onTestCaseAnnotate: (testCase, annotation) => github.onTestCaseAnnotate(testCase, annotation),
		onTestRunEnd: (testModules, unhandledErrors) => {
			if (testModules.length === 0 && unhandledErrors.length === 0) return;
			github.options.jobSummary.title = titleOf(testModules);
			github.onTestRunEnd(testModules, unhandledErrors);
		},
	};
};

const DOCS_CONTRACT = "docs/docs-consistency.test.ts";

const suitesRun = (testModules: readonly TestModule[]) => {
	const suites = new Set<string>(
		testModules.map((module) => (module.moduleId.endsWith(DOCS_CONTRACT) ? "docs contract" : "unit")),
	);

	return `Vitest run: ${["unit", "docs contract"].filter((suite) => suites.has(suite)).join(" + ")}`;
};

export default defineConfig({
	resolve: {
		tsconfigPaths: true,
	},
	test: {
		reporters: process.env.GITHUB_ACTIONS ? ["default", jobSummary(suitesRun)] : ["default"],
		globals: true,
		testTimeout: 20_000,
		coverage: {
			provider: "v8",
			reporter: ["text", "lcov"],
			include: ["src/**/*.ts"],
			exclude: ["src/index.ts", "src/**/{types,defaults,constants}.ts", "src/**/*.test.ts", "src/shared/tests/**"],
			thresholds: {
				lines: MIN_THRESHOLD,
				functions: MIN_THRESHOLD,
				branches: MIN_THRESHOLD,
				statements: MIN_THRESHOLD,
			},
		},
	},
});
