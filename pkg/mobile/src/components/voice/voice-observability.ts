import type { Business } from '@pkg/schema';
import { UploadFailedError, UploadRefusedError } from '@/lib/multipart-upload';
import { addBreadcrumb, captureEvent, captureSanitizedException } from '@/lib/observability';

/** One Voice Note sent for text: the purpose is the screen's label, never the words. `peakDb` is the loudest input. */
export type VoiceNoteAttempt = {
  business: Business;
  purpose: string;
  seconds: number;
  durationMs: number;
  peakDb: number | null;
  requestMs: number;
};

type VoiceNoteResult = {
  language: string | null;
  outcome: 'transcribed' | 'refused' | 'failed';
  code: string | null;
  status: number | null;
  failure: string | null;
};

function recordVoiceNote(properties: VoiceNoteAttempt & VoiceNoteResult): void {
  addBreadcrumb('microphone', 'voice note transcribed', properties);
  captureEvent('voice note transcribed', properties);
}

export function recordVoiceNoteTranscribed(attempt: VoiceNoteAttempt, language: string | null): void {
  recordVoiceNote({ ...attempt, language, outcome: 'transcribed', code: null, status: null, failure: null });
}

/** A refusal is the server's answer and only an event, unless the speech service is down; no answer is an exception. */
export function recordVoiceNoteFailed(attempt: VoiceNoteAttempt, error: unknown): void {
  if (error instanceof UploadRefusedError) {
    const properties = {
      ...attempt,
      language: null,
      outcome: 'refused' as const,
      code: error.data.appCode,
      status: error.status,
      failure: null,
    };
    recordVoiceNote(properties);
    if (error.status >= 500) captureSanitizedException(error, 'Voice note transcription refused', properties);
    return;
  }
  const failed = error instanceof UploadFailedError;
  const properties = {
    ...attempt,
    language: null,
    outcome: 'failed' as const,
    code: null,
    status: failed ? error.status : null,
    // Anything else was thrown before the upload, reading the recording off the phone.
    failure: failed ? error.reason : 'recording',
  };
  recordVoiceNote(properties);
  captureSanitizedException(error, 'Voice note transcription failed', properties);
}

/** The recorder threw while opening or closing the mic; the trail says how far the press got. */
export function recordVoiceRecorderFailed(error: unknown, stage: 'start' | 'stop'): void {
  captureSanitizedException(error, `Voice recorder failed to ${stage}`, { stage });
}
