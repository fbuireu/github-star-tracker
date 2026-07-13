export function describeFetchError(error: unknown): string {
  const { status, message } = (error ?? {}) as { status?: number; message?: string };
  const parts = [typeof status === 'number' ? `HTTP ${status}` : '', message?.trim() ?? ''].filter(
    Boolean,
  );

  return parts.length > 0 ? parts.join(' ') : String(error);
}
