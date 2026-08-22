import type { UserConfig } from "@commitlint/types";

const configuration: UserConfig = {
	extends: ["@commitlint/config-conventional"],
	formatter: "@commitlint/format",
	rules: {
		"scope-case": [2, "always", ["lower-case", "pascal-case", "camel-case"]],
		"header-max-length": [2, "always", 130],
	},
};

export default configuration;
