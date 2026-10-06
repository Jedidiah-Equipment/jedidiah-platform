/** The server answered with its own reason, such as nothing heard or the speech model being down. */
export class TranscriptionRefusedError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TranscriptionRefusedError';
  }
}
