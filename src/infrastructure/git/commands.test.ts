import { describe, expect, it, vi } from "vitest";
import { execute } from "./commands";

vi.mock("node:child_process", () => ({
	execFileSync: vi.fn(),
}));

describe("execute", () => {
	it("returns trimmed output from execFileSync", async () => {
		const { execFileSync } = await import("node:child_process");

		vi.mocked(execFileSync).mockReturnValue("  output  ");

		expect(execute({ args: ["status"] })).toBe("output");
	});

	it("invokes git with an argument array and never a shell string", async () => {
		const { execFileSync } = await import("node:child_process");

		vi.mocked(execFileSync).mockReturnValue("ok");

		execute({ args: ["status"], options: { cwd: "/tmp" } });

		expect(execFileSync).toHaveBeenCalledWith("git", ["status"], {
			encoding: "utf8",
			stdio: ["pipe", "pipe", "pipe"],
			cwd: "/tmp",
		});
	});

	it("passes arguments containing shell metacharacters through verbatim", async () => {
		const { execFileSync } = await import("node:child_process");

		vi.mocked(execFileSync).mockReturnValue("ok");

		execute({ args: ["commit", "-m", "Update: 12 total (+3); rm -rf /"] });

		expect(execFileSync).toHaveBeenCalledWith(
			"git",
			["commit", "-m", "Update: 12 total (+3); rm -rf /"],
			expect.anything(),
		);
	});

	it("throws error with stderr when command fails", async () => {
		const { execFileSync } = await import("node:child_process");
		const error = new Error("exec failed") as Error & { stderr?: string };

		error.stderr = "  fatal: not a repo  ";

		vi.mocked(execFileSync).mockImplementation(() => {
			throw error;
		});

		expect(() => execute({ args: ["log"] })).toThrow('Git command failed: "git log"\nfatal: not a repo');
	});

	it("throws error with message when no stderr", async () => {
		const { execFileSync } = await import("node:child_process");
		const error = new Error("spawn failed");
		vi.mocked(execFileSync).mockImplementation(() => {
			throw error;
		});

		expect(() => execute({ args: ["push"] })).toThrow('Git command failed: "git push"\nspawn failed');
	});

	it("throws error with Unknown error when no stderr or message", async () => {
		const { execFileSync } = await import("node:child_process");

		vi.mocked(execFileSync).mockImplementation(() => {
			throw {};
		});

		expect(() => execute({ args: ["fetch"] })).toThrow('Git command failed: "git fetch"\nUnknown error');
	});
});
