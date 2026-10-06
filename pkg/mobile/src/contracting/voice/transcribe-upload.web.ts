import type { Transcription } from '@pkg/schema/contracting';

export class TranscriptionRefusedError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TranscriptionRefusedError';
  }
}

export async function transcribeRecording(_uri: string, _purpose: string): Promise<Transcription> {
  throw new Error('Voice notes are not available on the web');
}
