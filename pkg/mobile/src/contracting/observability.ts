import type { CaptureWhen } from '@pkg/domain/contracting';
import type { BreakdownSubjectKind, BreakdownUrgency, ReadAtEstimate } from '@pkg/schema/contracting';
import { addBreadcrumb, captureEvent } from '@/lib/observability';
import { type MutationEventCatalog, type ObservabilityProperties, pickRecordIds } from '@/lib/observability-contract';

/** Once per spot capture the server saves or refuses: `refused` is the refusal's app code, null when saved. */
export function recordReadingCaptured(properties: {
  backdated: boolean;
  refused: string | null;
  when: CaptureWhen;
  estimateKind: ReadAtEstimate['kind'];
  dateEdited: boolean;
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
  'contractingNotes.add': {
    event: 'note added',
    properties: (variables) => pickRecordIds(variables, ['thread', 'id']),
  },
  'contractingActivity.setLastSeen': { event: 'activity seen', properties: () => ({}) },
  'contractingJobs.jobs.create': {
    event: 'job created',
    properties: (variables) => pickRecordIds(variables, ['customerId', 'farmId', 'workTypeId']),
  },
  // Directory names are free text, so only the parent id travels.
  'contractingDirectory.customers.create': { event: 'customer created', properties: () => ({}) },
  'contractingDirectory.farms.create': {
    event: 'farm created',
    properties: (variables) => pickRecordIds(variables, ['customerId']),
  },
  'contractingDirectory.workTypes.create': { event: 'work type created', properties: () => ({}) },
  'contractingJobs.assignments.add': {
    event: 'machine added to job',
    properties: (variables) => pickRecordIds(variables, ['jobId', 'machineId']),
  },
  'contractingJobs.assignments.captureHours': {
    event: 'job hours captured',
    properties: (variables) => pickRecordIds(variables, ['assignmentId']),
  },
  'contractingJobs.assignments.editHours': {
    event: 'job hours edited',
    properties: (variables) => pickRecordIds(variables, ['assignmentId']),
  },
  'contractingServices.open': {
    event: 'service booked',
    properties: (variables) => pickRecordIds(variables, ['machineId', 'primaryMechanicUserId']),
  },
  'contractingServices.patch': {
    event: 'service updated',
    properties: (variables) => pickRecordIds(variables, ['id', 'primaryMechanicUserId']),
  },
  'contractingServices.close': {
    event: 'service closed',
    properties: (variables) => pickRecordIds(variables, ['id', 'primaryMechanicUserId']),
  },
} satisfies MutationEventCatalog;

/** Field Note events carry counts and flags only: a note's words and photos never reach analytics. */
export function recordFieldNoteCreated(properties: { hasPhoto: boolean; photoCount: number; hasDescription: boolean }) {
  addBreadcrumb('contracting', 'field note created', properties);
  captureEvent('field note created', properties);
}

export function recordFieldNoteChanged(change: 'closed' | 'reopened' | 'deleted') {
  addBreadcrumb('contracting', `field note ${change}`);
  captureEvent(`field note ${change}`);
}
