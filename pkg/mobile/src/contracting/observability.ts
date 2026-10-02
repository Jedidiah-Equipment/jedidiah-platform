import { addBreadcrumb, captureEvent } from '@/lib/observability';

/** Once per capture the server saves or refuses: `refused` is the refusal's app code, null when saved. */
export function recordReadingCaptured(properties: {
  role: 'spot' | 'arrival' | 'departure';
  hasPhoto: boolean;
  photoSource: 'camera' | 'gallery' | null;
  backdated: boolean;
  refused: string | null;
}): void {
  addBreadcrumb('contracting', 'reading captured', properties);
  captureEvent('reading captured', properties);
}

export function recordMachineAdded(jobId: string, machineId: string): void {
  captureEvent('machine added to job', { jobId, machineId });
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
