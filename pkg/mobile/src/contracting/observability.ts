import type { BreakdownSubjectKind, BreakdownUrgency, ReadingRole } from '@pkg/schema/contracting';
import { UploadFailedError, UploadRefusedError } from '@/lib/multipart-upload';
import { addBreadcrumb, captureEvent, captureSanitizedException } from '@/lib/observability';
import { type MutationEventCatalog, type ObservabilityProperties, pickRecordIds } from '@/lib/observability-contract';
import type { PhotoSource } from '@/lib/photo-picker';

/** Once per capture the server saves or refuses: `refused` is the refusal's app code, null when saved. */
export function recordReadingCaptured(properties: {
  role: Exclude<ReadingRole, 'baseline'>;
  hasPhoto: boolean;
  photoSource: PhotoSource | null;
  backdated: boolean;
  refused: string | null;
}): void {
  addBreadcrumb('contracting', 'reading captured', properties);
  captureEvent('reading captured', properties);
}

/** Once per Breakdown the server accepts: counts and flags only, never the description or the coordinates. */
export function recordBreakdownReported(properties: {
  urgency: BreakdownUrgency;
  subjectKind: BreakdownSubjectKind;
  photoCount: number;
  hasGps: boolean;
  hasJob: boolean;
}): void {
  addBreadcrumb('contracting', 'breakdown reported', properties);
  captureEvent('breakdown reported', properties);
}

const breakdownUrgency = (variables: unknown): ObservabilityProperties => {
  const urgency = (variables as { urgency?: unknown } | null)?.urgency;
  return urgency === 'code-red' || urgency === 'code-green' ? { urgency } : {};
};

/** Contracting's tRPC mutations that are events; the shared mutation cache emits each once on success. */
export const CONTRACTING_MUTATION_EVENTS = {
  'contractingBreakdowns.patch': {
    event: 'breakdown updated',
    properties: (variables) => ({ ...pickRecordIds(variables, ['id']), ...breakdownUrgency(variables) }),
  },
  'contractingBreakdowns.assignMechanic': {
    event: 'mechanic assigned',
    properties: (variables) => pickRecordIds(variables, ['id', 'mechanicUserId']),
  },
  'contractingBreakdowns.start': {
    event: 'breakdown started',
    properties: (variables) => pickRecordIds(variables, ['id']),
  },
  'contractingBreakdowns.solve': {
    event: 'breakdown solved',
    properties: (variables) => pickRecordIds(variables, ['id']),
  },
  'contractingBreakdowns.removePhoto': {
    event: 'breakdown photo removed',
    properties: (variables) => pickRecordIds(variables, ['id', 'photoId']),
  },
  'contractingBreakdowns.notes.add': {
    event: 'breakdown note added',
    properties: (variables) => pickRecordIds(variables, ['breakdownId']),
  },
  'contractingJobs.assignments.add': {
    event: 'machine added to job',
    properties: (variables) => pickRecordIds(variables, ['jobId', 'machineId']),
  },
  'contractingTranscriptions.saved': {
    event: 'transcription saved',
    properties: (variables) => pickRecordIds(variables, ['id']),
  },
} satisfies MutationEventCatalog;

/** One Voice Note sent for text: the purpose is the screen's label, never the words. `peakDb` is the loudest input. */
export type VoiceNoteAttempt = {
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
  addBreadcrumb('contracting', 'voice note transcribed', properties);
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

/** Field Note events carry counts and flags only: a note's words and photos never reach analytics. */
export function recordFieldNoteCreated(properties: { hasPhoto: boolean; photoCount: number; hasDescription: boolean }) {
  addBreadcrumb('contracting', 'field note created', properties);
  captureEvent('field note created', properties);
}

export function recordFieldNoteChanged(change: 'closed' | 'reopened' | 'deleted') {
  addBreadcrumb('contracting', `field note ${change}`);
  captureEvent(`field note ${change}`);
}
