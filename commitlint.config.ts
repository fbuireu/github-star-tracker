import type { UserConfig } from "@commitlint/types";

const RELEASE_COMMIT = /^chore\([a-z0-9-]+\): release \d+\.\d+\.\d+ \[skip ci\]/;

const configuration: UserConfig = {
	extends: ["@commitlint/config-conventional"],
	formatter: "@commitlint/format",
	ignores: [(commit) => RELEASE_COMMIT.test(commit)],
	rules: {
		"scope-case": [2, "always", ["lower-case", "pascal-case", "camel-case"]],
		"header-max-length": [2, "always", 130],
	},
};

export default configuration;
