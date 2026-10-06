import type { TranscriptionErrorCode } from '@pkg/schema/contracting';

export class TranscriptionError extends Error {
  constructor(
    readonly code: TranscriptionErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'TranscriptionError';
  }
}
export const isTranscriptionError = (error: unknown): error is TranscriptionError =>
  error instanceof TranscriptionError;
