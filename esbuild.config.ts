import * as path from "node:path";
import { build } from "esbuild";
import tsconfig from "./tsconfig.json";

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
