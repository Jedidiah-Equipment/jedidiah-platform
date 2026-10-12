import type { PushErrorCode } from '@pkg/schema';

export class PushError extends Error {
  constructor(
    readonly code: PushErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PushError';
  }
}

export const isPushError = (error: unknown): error is PushError => error instanceof PushError;
