import * as z from "zod/mini";

const FetchErrorSchema = z.object({
	status: z.catch(z.optional(z.number()), undefined),
	message: z.catch(z.optional(z.string()), undefined),
});

export function describeFetchError(error: unknown): string {
	const { status, message } = FetchErrorSchema.safeParse(error).data ?? {};
	const parts = [status === undefined ? "" : `HTTP ${status}`, message?.trim() ?? ""].filter(Boolean);

	return parts.length > 0 ? parts.join(" ") : String(error);
}
