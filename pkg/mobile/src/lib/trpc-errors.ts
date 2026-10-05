/** A tRPC error the server answered with NOT_FOUND: the record is gone, or this person may not open it. */
export function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('data' in error)) return false;
  const data = error.data;

  return Boolean(data && typeof data === 'object' && 'code' in data && data.code === 'NOT_FOUND');
}
