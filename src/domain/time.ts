export function toEpochMs(timestamp: string): number | null {
	const parsed = new Date(timestamp).getTime();

	return Number.isFinite(parsed) ? parsed : null;
}
