import type { ReadingRole } from '@pkg/schema/contracting';
import { addBreadcrumb, captureEvent } from '@/lib/observability';
import { type MutationEventCatalog, pickRecordIds } from '@/lib/observability-contract';
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

/** Contracting's tRPC mutations that are events; the shared mutation cache emits each once on success. */
export const CONTRACTING_MUTATION_EVENTS = {
  'contractingJobs.assignments.add': {
    event: 'machine added to job',
    properties: (variables) => pickRecordIds(variables, ['jobId', 'machineId']),
  },
  'contractingTranscriptions.saved': {
    event: 'transcription saved',
    properties: (variables) => pickRecordIds(variables, ['id']),
  },
} satisfies MutationEventCatalog;

/** Once per Voice Note sent for text: the purpose is the screen's label, never the words. */
export function recordVoiceNoteTranscribed(properties: {
  purpose: string;
  language: string | null;
  seconds: number;
  outcome: 'transcribed' | 'refused' | 'failed';
}): void {
  addBreadcrumb('contracting', 'voice note transcribed', properties);
  captureEvent('voice note transcribed', properties);
}

/** Field Note events carry counts and flags only: a note's words and photos never leave the phone. */
export function recordFieldNoteCreated(properties: { hasPhoto: boolean; photoCount: number; hasDescription: boolean }) {
  addBreadcrumb('contracting', 'field note created', properties);
  captureEvent('field note created', properties);
}

export function recordFieldNoteChanged(change: 'closed' | 'reopened' | 'deleted') {
  addBreadcrumb('contracting', `field note ${change}`);
  captureEvent(`field note ${change}`);
}
