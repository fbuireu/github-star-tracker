import { execFileSync } from "node:child_process";
import * as core from "@actions/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authenticatedArgs, execute } from "./commands";

vi.mock("node:child_process", () => ({
	execFileSync: vi.fn(),
}));
vi.mock("@actions/core", () => ({
	setSecret: vi.fn(),
}));

describe("execute", () => {
	beforeEach(() => {
		vi.mocked(execFileSync).mockReset();
	});

	it("returns trimmed output from execFileSync", () => {
		vi.mocked(execFileSync).mockReturnValue("  output  ");

		expect(execute({ args: ["status"] })).toBe("output");
	});

	it("invokes git with an argument array and never a shell string", () => {
		vi.mocked(execFileSync).mockReturnValue("ok");

		execute({ args: ["status"], options: { cwd: "/tmp" } });

		expect(execFileSync).toHaveBeenCalledWith("git", ["status"], {
			encoding: "utf8",
			stdio: ["pipe", "pipe", "pipe"],
			cwd: "/tmp",
		});
	});

	it("passes arguments containing shell metacharacters through verbatim", () => {
		vi.mocked(execFileSync).mockReturnValue("ok");

		execute({ args: ["commit", "-m", "Update: 12 total (+3); rm -rf /"] });

		expect(execFileSync).toHaveBeenCalledWith(
			"git",
			["commit", "-m", "Update: 12 total (+3); rm -rf /"],
			expect.anything(),
		);
	});

	it("throws error with stderr when command fails", () => {
		const error = new Error("exec failed") as Error & { stderr?: string };

		error.stderr = "  fatal: not a repo  ";

		vi.mocked(execFileSync).mockImplementation(() => {
			throw error;
		});

		expect(() => execute({ args: ["log"] })).toThrow('Git command failed: "git log"\nfatal: not a repo');
	});

	it("throws error with message when no stderr", () => {
		const error = new Error("spawn failed");
		vi.mocked(execFileSync).mockImplementation(() => {
			throw error;
		});

		expect(() => execute({ args: ["push"] })).toThrow('Git command failed: "git push"\nspawn failed');
	});

	it("throws error with Unknown error when no stderr or message", () => {
		vi.mocked(execFileSync).mockImplementation(() => {
			throw {};
		});

		expect(() => execute({ args: ["fetch"] })).toThrow('Git command failed: "git fetch"\nUnknown error');
	});

	it.each([
		{ label: "a string", thrown: "fatal: not a git repository" },
		{ label: "undefined", thrown: undefined },
	])("throws error with Unknown error when the throw is $label, which carries no stderr or message", ({ thrown }) => {
		vi.mocked(execFileSync).mockImplementation(() => {
			throw thrown;
		});

		expect(() => execute({ args: ["gc"] })).toThrow('Git command failed: "git gc"\nUnknown error');
	});
});

describe("authenticatedArgs", () => {
	it("prefixes one basic-auth extraheader and masks the credential it builds", () => {
		const credential = Buffer.from("x-access-token:secret-token").toString("base64");

		expect(authenticatedArgs({ token: "secret-token", args: ["fetch", "origin", "main"] })).toEqual([
			"-c",
			`http.extraheader=AUTHORIZATION: basic ${credential}`,
			"fetch",
			"origin",
			"main",
		]);
		expect(core.setSecret).toHaveBeenCalledWith(credential);
	});
});
