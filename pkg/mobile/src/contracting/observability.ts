import { addBreadcrumb, captureEvent } from '@/lib/observability';

/** Once per capture the server saves or refuses: `refused` is the refusal's app code, null when saved. */
export function recordReadingCaptured(properties: {
  role: 'spot' | 'arrival' | 'departure';
  hasPhoto: boolean;
  refused: string | null;
}): void {
  addBreadcrumb('contracting', 'reading captured', properties);
  captureEvent('reading captured', properties);
}

export function recordMachineAdded(jobId: string, machineId: string): void {
  captureEvent('machine added to job', { jobId, machineId });
}
