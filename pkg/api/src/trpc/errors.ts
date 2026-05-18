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

export function assertNever(value: never): never {
  throw new Error(`Unhandled mapping: ${String(value)}`);
}
