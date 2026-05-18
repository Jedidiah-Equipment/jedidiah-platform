import type { ApiErrorShape, AppCode } from '@pkg/schema';

export const UNEXPECTED_ERROR_MESSAGE = 'Something went wrong. Please try again.';

export function getApiErrorMessage(error: unknown, fallbackMessage = UNEXPECTED_ERROR_MESSAGE): string {
  if (isApiErrorShape(error) && typeof error.message === 'string' && error.message.length > 0) {
    return error.message;
  }

  return fallbackMessage;
}

export function getApiMutationErrorMessage(error: unknown, fallbackMessage: string): string {
  return getApiErrorMessage(error, fallbackMessage);
}

export function getApiQueryErrorMessage(error: unknown, fallbackMessage: string): string | undefined {
  if (!error) return undefined;

  return getApiErrorMessage(error, fallbackMessage);
}

export function getApiErrorAppCode(error: unknown): AppCode | undefined {
  if (!isApiErrorShape(error)) return undefined;

  return typeof error.data?.appCode === 'string' ? (error.data.appCode as AppCode) : undefined;
}

function isApiErrorShape(error: unknown): error is ApiErrorShape {
  return typeof error === 'object' && error !== null;
}
