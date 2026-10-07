import { TRANSCRIBE_PATH, TRANSCRIBE_TIMEOUT_MS } from '@pkg/domain/contracting';
import { Transcription } from '@pkg/schema/contracting';
import { z } from 'zod';
import { authedFetch } from '@/lib/authed-fetch';
import { addBreadcrumb } from '@/lib/observability';
import { audioPart } from './audio-part';
import { TranscriptionFailedError, TranscriptionRefusedError } from './transcription-errors';

export { TranscriptionFailedError, TranscriptionRefusedError };

const RefusalBody = z
  .object({ message: z.string().optional(), data: z.object({ appCode: z.string().optional() }).nullish() })
  .catch({});

/**
 * One recording in, its text out. A refusal throws {@link TranscriptionRefusedError}; no usable answer throws
 * {@link TranscriptionFailedError}.
 */
export async function transcribeRecording(uri: string, purpose: string): Promise<Transcription> {
  const audio = await audioPart(uri);
  const body = new FormData();
  body.append('purpose', purpose);
  body.append('audio', audio, 'voice-note.m4a');
  addBreadcrumb('contracting', 'voice note upload', { bytes: audio.size });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS);
  let status: number | null = null;
  try {
    const response = await authedFetch(TRANSCRIBE_PATH, { method: 'POST', body, signal: controller.signal });
    status = response.status;
    if (response.ok) return Transcription.parse(await response.json());
    if ((status >= 400 && status < 500 && status !== 401) || status === 503) {
      const refusal = RefusalBody.parse(await response.json().catch(() => null));
      if (refusal.data?.appCode)
        throw new TranscriptionRefusedError(refusal.data.appCode, refusal.message ?? 'Transcription refused.', status);
    }
    throw new TranscriptionFailedError('server', status);
  } catch (error) {
    if (error instanceof TranscriptionRefusedError || error instanceof TranscriptionFailedError) throw error;
    const reason = controller.signal.aborted ? 'timeout' : status === null ? 'network' : 'server';
    throw new TranscriptionFailedError(reason, status, { cause: error });
  } finally {
    clearTimeout(timeout);
  }
}
