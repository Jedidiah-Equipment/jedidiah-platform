import { TRPCClientError } from '@trpc/client';

function trpcErrorData(error: unknown, key: 'appCode' | 'code'): unknown {
  if (!error || typeof error !== 'object' || !('data' in error)) return undefined;
  const data = error.data;
  return data && typeof data === 'object' && key in data ? (data as Record<string, unknown>)[key] : undefined;
}

function trpcErrorCode(error: unknown): unknown {
  return trpcErrorData(error, 'code');
}

/** The server's stable reason for a refusal (`inventory.actor_disabled`), when it named one. */
export function trpcAppCode(error: unknown): string | undefined {
  const appCode = trpcErrorData(error, 'appCode');
  return typeof appCode === 'string' ? appCode : undefined;
}

/** A tRPC error the server answered with NOT_FOUND: the record is gone. */
export function isNotFoundError(error: unknown): boolean {
  return trpcErrorCode(error) === 'NOT_FOUND';
}

/** A tRPC error the server answered with FORBIDDEN: this person may not open the record in its current state. */
export function isForbiddenError(error: unknown): boolean {
  return trpcErrorCode(error) === 'FORBIDDEN';
}

/**
 * The sentence a failure carries: the server's when it answered, the thrown error's otherwise. A tRPC request that never
 * got an answer (a dropped connection, a gateway in front of the API) carries none, so the caller shows its own.
 */
export function trpcErrorMessage(error: unknown): string | undefined {
  if (error instanceof TRPCClientError && error.shape === undefined) return undefined;
  return error instanceof Error && error.message ? error.message : undefined;
}
