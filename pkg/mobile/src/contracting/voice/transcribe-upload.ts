import { TRANSCRIBE_PATH, TRANSCRIBE_TIMEOUT_MS } from '@pkg/domain/contracting';
import { Transcription } from '@pkg/schema/contracting';
import { z } from 'zod';
import { authedFetch } from '@/lib/authed-fetch';
import { audioPart } from './audio-part';

const RefusalBody = z
  .object({ message: z.string().optional(), data: z.object({ appCode: z.string().optional() }).nullish() })
  .catch({});

/** The server answered with its own reason, such as no speech service or nothing heard. */
export class TranscriptionRefusedError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TranscriptionRefusedError';
  }
}

/** One recording in, its text out. A refusal throws {@link TranscriptionRefusedError}; anything else a plain Error. */
export async function transcribeRecording(uri: string, purpose: string): Promise<Transcription> {
  const body = new FormData();
  body.append('purpose', purpose);
  body.append('audio', await audioPart(uri), 'voice-note.m4a');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS);
  try {
    const response = await authedFetch(TRANSCRIBE_PATH, { method: 'POST', body, signal: controller.signal });
    if (response.ok) return Transcription.parse(await response.json());
    if ((response.status >= 400 && response.status < 500 && response.status !== 401) || response.status === 503) {
      const refusal = RefusalBody.parse(await response.json().catch(() => null));
      if (refusal.data?.appCode)
        throw new TranscriptionRefusedError(refusal.data.appCode, refusal.message ?? 'Transcription refused.');
    }
    throw new Error('Transcription failed');
  } finally {
    clearTimeout(timeout);
  }
}
