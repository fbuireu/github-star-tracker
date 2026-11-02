import * as fs from "node:fs";
import * as path from "node:path";
import { build } from "esbuild";

interface TsConfig {
	compilerOptions: { paths: Record<string, string[]> };
}

const tsconfig: TsConfig = JSON.parse(fs.readFileSync("tsconfig.json", "utf8"));

const alias = Object.fromEntries(
	Object.entries(tsconfig.compilerOptions.paths).map(([from, [to]]) => [
		from.replace("/*", ""),
		path.resolve(to.replace("/*", "")),
	]),
);

build({
	entryPoints: ["src/index.ts"],
	bundle: true,
	platform: "node",
	target: "node24",
	format: "cjs",
	outfile: "dist/index.js",
	sourcemap: true,
	alias,
});
