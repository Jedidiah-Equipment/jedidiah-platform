function trpcErrorCode(error: unknown): unknown {
  if (!error || typeof error !== 'object' || !('data' in error)) return undefined;
  const data = error.data;
  return data && typeof data === 'object' && 'code' in data ? data.code : undefined;
}

/** A tRPC error the server answered with NOT_FOUND: the record is gone. */
export function isNotFoundError(error: unknown): boolean {
  return trpcErrorCode(error) === 'NOT_FOUND';
}

/** A tRPC error the server answered with FORBIDDEN: this person may not open the record in its current state. */
export function isForbiddenError(error: unknown): boolean {
  return trpcErrorCode(error) === 'FORBIDDEN';
}

/** The sentence the server refused with, when it sent one. */
export function trpcErrorMessage(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}
