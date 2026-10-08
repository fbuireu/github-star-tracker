import { appendFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

const MIN_THRESHOLD = 85;

const summaryLabel = {
	onTestRunEnd() {
		if (!process.env.GITHUB_STEP_SUMMARY) return;
		appendFileSync(process.env.GITHUB_STEP_SUMMARY, "\n## Vitest run: unit + docs contract\n");
	},
};

export default defineConfig({
	resolve: {
		tsconfigPaths: true,
	},
	test: {
		reporters: process.env.GITHUB_ACTIONS ? ["default", summaryLabel, "github-actions"] : ["default"],
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
