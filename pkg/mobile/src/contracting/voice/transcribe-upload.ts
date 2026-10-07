import { TRANSCRIBE_PATH, TRANSCRIBE_TIMEOUT_MS } from '@pkg/domain/contracting';
import { Transcription } from '@pkg/schema/contracting';
import { filePart } from '@/lib/file-part';
import { postMultipart } from '@/lib/multipart-upload';
import { addBreadcrumb } from '@/lib/observability';

const RECORDING_MISSING = 'The recording is no longer available. Record it again.';
const TRANSCRIBE_FAILED = 'Transcription failed';

/** One recording in, its text out; the server's refusal or the connection's failure throws as `postMultipart` says. */
export async function transcribeRecording(uri: string, purpose: string): Promise<Transcription> {
  const audio = await filePart(uri, RECORDING_MISSING);
  const body = new FormData();
  body.append('purpose', purpose);
  body.append('audio', audio, 'voice-note.m4a');
  addBreadcrumb('contracting', 'voice note upload', { bytes: audio.size });
  return postMultipart(TRANSCRIBE_PATH, body, {
    timeoutMs: TRANSCRIBE_TIMEOUT_MS,
    failedMessage: TRANSCRIBE_FAILED,
    output: Transcription,
  });
}
