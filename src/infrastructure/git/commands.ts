import { execFileSync } from "node:child_process";
import * as core from "@actions/core";
import * as z from "zod/mini";

const GitFailureSchema = z.object({
	stderr: z.catch(z.optional(z.string()), undefined),
	message: z.catch(z.optional(z.string()), undefined),
});

interface ExecuteParams {
	args: string[];
	options?: Record<string, unknown>;
}

export function execute({ args, options = {} }: ExecuteParams): string {
	try {
		return execFileSync("git", args, {
			encoding: "utf8",
			stdio: ["pipe", "pipe", "pipe"],
			...options,
		}).trim();
	} catch (error: unknown) {
		const { stderr, message } = GitFailureSchema.safeParse(error).data ?? {};
		const detail = stderr?.trim() || message || "Unknown error";

		throw new Error(`Git command failed: "git ${args.join(" ")}"\n${detail}`);
	}
}

interface AuthenticatedArgsParams {
	token: string;
	args: string[];
}

export function authenticatedArgs({ token, args }: AuthenticatedArgsParams): string[] {
	const credential = Buffer.from(`x-access-token:${token}`).toString("base64");

	core.setSecret(credential);

	return ["-c", `http.extraheader=AUTHORIZATION: basic ${credential}`, ...args];
}
