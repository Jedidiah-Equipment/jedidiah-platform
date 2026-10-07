/** The server answered with its own reason, such as nothing heard or the speech model being down. */
export class TranscriptionRefusedError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'TranscriptionRefusedError';
  }
}

export type TranscriptionFailure = 'timeout' | 'network' | 'server';

/** No answer the server meant: the request timed out, never reached it, or came back without a reason. */
export class TranscriptionFailedError extends Error {
  constructor(
    readonly reason: TranscriptionFailure,
    readonly status: number | null,
    options?: { cause?: unknown },
  ) {
    super('Transcription failed', options);
    this.name = 'TranscriptionFailedError';
  }
}
