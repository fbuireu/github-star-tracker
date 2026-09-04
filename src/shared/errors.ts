export function errorMessage(error: unknown): string {
	const { message } = (error ?? {}) as { message?: unknown };

	return typeof message === "string" && message.trim() !== "" ? message : String(error);
}
