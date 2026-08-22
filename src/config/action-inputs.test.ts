import * as fs from "node:fs";
import * as path from "node:path";
import { DEFAULT_SMTP_PORT } from "@infrastructure/notification/email";
import * as yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import { DEFAULTS } from "./defaults";
import { DEFAULT_CONFIG_PATH, toActionInputName } from "./loader";

interface ActionInput {
	description: string;
	required?: boolean;
	default?: string;
}

interface ActionManifest {
	inputs: Record<string, ActionInput>;
	outputs: Record<string, { description: string }>;
}

const manifest = yaml.load(fs.readFileSync(path.resolve("action.yml"), "utf8")) as ActionManifest;

const OVERRIDABLE = Object.keys(DEFAULTS).filter((key) => key !== "sendOnNoChanges");

const DECLARED_OUTPUTS = [
	"lost-stars",
	"new-stargazers",
	"new-stars",
	"notification-sent",
	"report",
	"report-csv",
	"report-html",
	"report-html-path",
	"should-notify",
	"stars-changed",
	"total-stars",
];

describe("config-path default", () => {
	it("matches DEFAULT_CONFIG_PATH in @config/loader", () => {
		expect(manifest.inputs["config-path"].default).toBe(DEFAULT_CONFIG_PATH);
	});
});

describe("smtp-port default", () => {
	it("matches DEFAULT_SMTP_PORT in @infrastructure/notification/email", () => {
		expect(manifest.inputs["smtp-port"].default).toBe(DEFAULT_SMTP_PORT);
	});
});

describe("send-on-no-changes default", () => {
	it("matches DEFAULTS.sendOnNoChanges in @config/defaults", () => {
		expect(manifest.inputs["send-on-no-changes"].default).toBe(String(DEFAULTS.sendOnNoChanges));
	});
});

describe("action.yml inputs", () => {
	it.each(OVERRIDABLE)("declares an input for the %s config key", (key) => {
		expect(manifest.inputs).toHaveProperty(toActionInputName(key));
	});

	it.each(OVERRIDABLE)("leaves the %s default empty so the config file can win", (key) => {
		expect(manifest.inputs[toActionInputName(key)].default ?? "").toBe("");
	});

	it("keeps a default only on inputs with no config file counterpart", () => {
		const overridableInputs = new Set(OVERRIDABLE.map(toActionInputName));
		const withDefaults = Object.entries(manifest.inputs)
			.filter(([, input]) => (input.default ?? "") !== "")
			.map(([name]) => name);

		expect(withDefaults.filter((name) => overridableInputs.has(name))).toEqual([]);
		expect(withDefaults.sort()).toEqual(["config-path", "send-on-no-changes", "smtp-port"]);
	});
});

describe("action.yml outputs", () => {
	it("declares exactly the eleven outputs setOutputs emits, alphabetically", () => {
		expect(Object.keys(manifest.outputs)).toEqual(DECLARED_OUTPUTS);
	});

	it("describes every output", () => {
		const undescribed = Object.entries(manifest.outputs)
			.filter(([, output]) => (output.description ?? "").trim() === "")
			.map(([name]) => name);

		expect(undescribed).toEqual([]);
	});
});
