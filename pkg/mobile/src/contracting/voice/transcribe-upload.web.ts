import type { Transcription } from '@pkg/schema/contracting';

export { TranscriptionRefusedError } from './transcription-refused';

export async function transcribeRecording(_uri: string, _purpose: string): Promise<Transcription> {
  throw new Error('Voice notes are not available on the web');
}
