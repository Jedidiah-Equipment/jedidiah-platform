import type { AppCode } from '@pkg/schema';
import { TRPCError } from '@trpc/server';

export const UNEXPECTED_ERROR_MESSAGE = 'Something went wrong. Please try again.';

export type TrpcErrorCode = ConstructorParameters<typeof TRPCError>[0]['code'];

type PublicTRPCErrorOptions = {
  appCode: AppCode;
  cause?: unknown;
  code: TrpcErrorCode;
  message: string;
};

type AppCodedTRPCError = TRPCError & {
  appCode?: AppCode;
};

export type CoreErrorMapping<TAppCode extends AppCode = AppCode> = {
  appCode: TAppCode;
  code: TrpcErrorCode;
  message: string;
};

export function createPublicTRPCError(options: PublicTRPCErrorOptions): TRPCError {
  const error = new TRPCError({
    cause: options.cause,
    code: options.code,
    message: options.message,
  }) as AppCodedTRPCError;

  error.appCode = options.appCode;

  return error;
}

export async function mapKnownCoreError<T, TCoreError extends Error>(
  action: () => Promise<T>,
  isKnownError: (error: unknown) => error is TCoreError,
  mapError: (error: TCoreError) => CoreErrorMapping,
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (isKnownError(error)) {
      const mapping = mapError(error);

      throw createPublicTRPCError({
        ...mapping,
        cause: error,
      });
    }

    throw error;
  }
}

/**
 * One family of core errors and the transport it maps to. A family is a *table*, not a switch: the
 * core error's own `code` is already the `appCode`, so all a boundary adds is the HTTP-shaped code
 * and, where the core message is too internal to show, a public one.
 *
 * Declared once beside the feature that raises it and reused by every router that can surface it,
 * which is what stops a second router growing its own copy of the same mapping.
 */
export type CoreErrorFamily = {
  /** The mapping for an error this family owns, or null when the error belongs to someone else. */
  match: (error: unknown) => CoreErrorMapping | null;
};

export function defineCoreErrorFamily<TCoreError extends Error & { code: AppCode }>({
  codes,
  is,
  messages,
}: {
  /** Every code in the family, exhaustively — the `Record` is what makes a missed one a type error. */
  codes: Readonly<Record<TCoreError['code'], TrpcErrorCode>>;
  is: (error: unknown) => error is TCoreError;
  /** Public message per code. Omitted codes surface the core error's own message. */
  messages?: Readonly<Partial<Record<TCoreError['code'], string>>>;
}): CoreErrorFamily {
  // The one erasure in this mechanism, and it is at its edge: the tables above are checked
  // exhaustively against the family's codes by the parameter types, but `AppCode` is a template
  // union, so the runtime lookup needs the plain-string view of the same two objects.
  const codeByAppCode = codes as Readonly<Record<string, TrpcErrorCode | undefined>>;
  const messageByAppCode = (messages ?? {}) as Readonly<Record<string, string | undefined>>;

  return {
    match: (error) => {
      if (!is(error)) return null;

      const code = codeByAppCode[error.code];
      // Reachable only if a class joins a family's `is` guard without joining its error union, which
      // the `codes` Record cannot catch. The core error rides along as `cause` like every other
      // mapped failure, so `serializeError` still logs what actually went wrong.
      if (!code) throw new Error(`Unmapped core error code: ${error.code}`, { cause: error });

      return { appCode: error.code, code, message: messageByAppCode[error.code] ?? error.message };
    },
  };
}

/**
 * Runs `action`, mapping whichever family recognises what it threw. Families are disjoint, so the
 * list at a call site is a statement of what that procedure can fail as — nothing more.
 */
export async function mapCoreErrors<T>(action: () => Promise<T>, ...families: CoreErrorFamily[]): Promise<T> {
  try {
    return await action();
  } catch (error) {
    for (const family of families) {
      const mapping = family.match(error);
      if (mapping) throw createPublicTRPCError({ ...mapping, cause: error });
    }

    throw error;
  }
}

export function createAuthTRPCError(options: Omit<PublicTRPCErrorOptions, 'cause'>): TRPCError {
  return createPublicTRPCError(options);
}

export function getTRPCAppCode(error: TRPCError): AppCode | undefined {
  return (error as AppCodedTRPCError).appCode;
}

export function getTRPCPublicMessage(error: TRPCError, message: string): string {
  if (error.code === 'INTERNAL_SERVER_ERROR' && !getTRPCAppCode(error)) {
    return UNEXPECTED_ERROR_MESSAGE;
  }

  return message;
}

export function shouldLogTRPCError(error: TRPCError): boolean {
  if (getTRPCAppCode(error)) return false;
  if (error.code === 'BAD_REQUEST') return false;

  return error.code === 'INTERNAL_SERVER_ERROR';
}

/**
 * Flattens an error and its `cause` chain into a plain, log-friendly object. pino serializes a bare
 * `Error` (and especially a nested `cause`) to `{}`, which hides the real failure — e.g. an unmapped
 * `INTERNAL_SERVER_ERROR` whose `cause` is the actual thrown error. Use this when logging caught errors.
 */
export function serializeError(error: unknown, depth = 0): unknown {
  if (depth > 5) {
    return { truncated: true };
  }

  if (!(error instanceof Error)) {
    return error == null ? undefined : { value: String(error) };
  }

  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    ...(error.cause === undefined ? {} : { cause: serializeError(error.cause, depth + 1) }),
  };
}

export function assertNever(value: never): never {
  throw new Error(`Unhandled mapping: ${String(value)}`);
}
