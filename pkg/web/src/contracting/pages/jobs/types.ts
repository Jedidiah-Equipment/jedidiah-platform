import { round1 } from '@pkg/domain/contracting';
import type { AppPermission } from '@pkg/schema';
import { DateOnlyIso, UUID } from '@pkg/schema';
import {
  type Assignment,
  JobCompleteInput,
  type JobCreateInput,
  JobDescription,
  type JobDetail,
  type JobQueue,
  type JobQueueCounts,
  jobQueues,
  Litres,
} from '@pkg/schema/contracting';
import { z } from 'zod';
import { emptyStringOr, requiredSelection } from '@/components/form/utils/form-schema.js';

export const JobCreateValues = z.object({
  customerId: requiredSelection(UUID, 'Choose a Customer'),
  farmId: requiredSelection(UUID, 'Choose a Farm'),
  workTypeId: requiredSelection(UUID, 'Choose a Work Type'),
  description: z.string(),
  foremanUserId: z.string(),
});
export type JobCreateValues = z.infer<typeof JobCreateValues>;

export function toJobCreateInput(values: JobCreateValues): JobCreateInput {
  return {
    customerId: values.customerId,
    farmId: values.farmId,
    workTypeId: values.workTypeId,
    description: JobDescription.parse(values.description.trim() || null),
    foremanUserId: values.foremanUserId || null,
  };
}

export const SignOffValues = z.object({
  startDate: emptyStringOr(DateOnlyIso),
  endDate: emptyStringOr(DateOnlyIso),
  dieselLitres: Litres,
  notes: z.string(),
});
export type SignOffValues = z.infer<typeof SignOffValues>;

export function toCompleteInput(jobId: string, values: SignOffValues, plannedIds: string[]): JobCompleteInput {
  return JobCompleteInput.parse({
    id: jobId,
    startDate: values.startDate,
    endDate: values.endDate,
    dieselLitres: values.dieselLitres,
    notes: values.notes.trim() || null,
    removePlannedAssignmentIds: plannedIds,
  });
}

export type StintRow =
  | { kind: 'stint'; stint: Assignment; firstOfMachine: boolean }
  | { kind: 'subtotal'; machineCode: string; workHours: number; travelHours: number; measures: Record<string, number> }
  | { kind: 'planned'; stint: Assignment };

export function plannedNeverArrived(assignments: readonly Assignment[]): Assignment[] {
  return assignments.filter((assignment) => assignment.state === 'planned');
}

export function groupStints(assignments: readonly Assignment[]): StintRow[] {
  const visited = new Map<string, Assignment[]>();
  const arrived = assignments.filter((assignment) => assignment.state !== 'planned');
  for (const stint of arrived) {
    const group = visited.get(stint.machineId) ?? [];
    group.push(stint);
    visited.set(stint.machineId, group);
  }
  const firstArrival = (group: Assignment[]) =>
    group.reduce((earliest, stint) => {
      const arrival = stint.arrival?.capturedAt ?? '';
      return earliest === '' || (arrival !== '' && arrival < earliest) ? arrival : earliest;
    }, '');
  const groups = [...visited.values()].sort(
    (left, right) =>
      firstArrival(left).localeCompare(firstArrival(right)) ||
      (left[0]?.createdAt ?? '').localeCompare(right[0]?.createdAt ?? ''),
  );
  const rows: StintRow[] = [];
  for (const group of groups) {
    group.sort(
      (left, right) =>
        (left.arrival?.capturedAt ?? '').localeCompare(right.arrival?.capturedAt ?? '') ||
        left.createdAt.localeCompare(right.createdAt),
    );
    for (const [index, stint] of group.entries()) rows.push({ kind: 'stint', stint, firstOfMachine: index === 0 });
    if (group.length > 1) {
      const measures: Record<string, number> = {};
      for (const stint of group)
        for (const measure of stint.measures)
          measures[measure.measureTypeName] =
            Math.round(((measures[measure.measureTypeName] ?? 0) + measure.quantity) * 100) / 100;
      rows.push({
        kind: 'subtotal',
        machineCode: group[0]?.machineCode ?? '',
        workHours: round1(group.reduce((total, stint) => total + (stint.workHours ?? 0), 0)),
        travelHours: round1(group.reduce((total, stint) => total + stint.travelHours, 0)),
        measures,
      });
    }
  }
  return [
    ...rows,
    ...plannedNeverArrived(assignments)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((stint) => ({ kind: 'planned' as const, stint })),
  ];
}

export function complementGap(gapHours: number, travel: number) {
  const travelHours = round1(Math.max(0, Math.min(gapHours, travel)));
  return { travelHours, unaccountedHours: round1(Math.max(0, gapHours - travelHours)) };
}

export function jobCapabilities(job: JobDetail, can: (permission: AppPermission) => boolean) {
  const open = job.status === 'upcoming' || job.status === 'active';
  return {
    editSetup: open && can('contracting_job:update'),
    assign: open && can('contracting_job:assign'),
    planStints: open && can('contracting_job:assign'),
    signOff: job.status !== 'upcoming' && job.status !== 'cancelled' && can('contracting_job:update'),
    editMeasures: (job.status === 'active' || job.status === 'completed') && can('contracting_job:update'),
    editChargeLines: (job.status === 'active' || job.status === 'completed') && can('contracting_job:update'),
    patchTravel:
      !['priced', 'invoiced', 'cancelled'].includes(job.status) &&
      (can('contracting_job:assign') || (job.status === 'active' && can('contracting_assignment:update-own'))),
    editSignOffDetails: (job.status === 'completed' || job.status === 'priced') && can('contracting_job:update'),
    editDieselLitres: job.status === 'completed' && can('contracting_job:update'),
    price: job.status === 'completed' && can('contracting_job:price'),
    seePricing: ['completed', 'priced', 'invoiced'].includes(job.status) && can('contracting_job:read'),
    resolveGaps: (job.status === 'active' || job.status === 'completed') && can('contracting_gap:resolve'),
    amendReadings: job.status !== 'invoiced' && job.status !== 'cancelled' && can('contracting_reading:update'),
    complete: job.status === 'active' && can('contracting_job:complete'),
    cancel: ['upcoming', 'active', 'completed'].includes(job.status) && can('contracting_job:cancel'),
  };
}

export const jobQueueLabels: Record<JobQueue, string> = {
  upcoming: 'Upcoming',
  active: 'Active',
  'looks-finished': 'Looks finished',
  'awaiting-pricing': 'Awaiting pricing',
  'awaiting-invoice': 'Awaiting invoice',
  invoiced: 'Invoiced',
  cancelled: 'Cancelled',
};

export function queueTabLabel(queue: JobQueue, counts: JobQueueCounts | undefined) {
  return `${jobQueueLabels[queue]} (${counts?.[queue] ?? 0})`;
}

export const jobQueueOptions = jobQueues.map((queue) => ({ value: queue, label: jobQueueLabels[queue] }));
