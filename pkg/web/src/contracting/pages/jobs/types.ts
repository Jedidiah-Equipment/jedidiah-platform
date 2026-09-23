import { hasJobCard, round1 } from '@pkg/domain/contracting';
import type { AppPermission } from '@pkg/schema';
import { DateOnlyIso, UUID } from '@pkg/schema';
import {
  closedJobStatuses,
  hasJobStatus,
  JobCompleteInput,
  type JobCreateInput,
  JobDescription,
  type JobDetail,
  type JobQueue,
  type JobQueueCounts,
  type JobStatus,
  jobQueues,
  Litres,
  openJobStatuses,
  signedOffJobStatuses,
  unpricedJobStatuses,
  workedJobStatuses,
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

export function complementGap(gapHours: number, travel: number) {
  const travelHours = round1(Math.max(0, Math.min(gapHours, travel)));
  return { travelHours, unaccountedHours: round1(Math.max(0, gapHours - travelHours)) };
}

export function jobCapabilities(job: JobDetail, can: (permission: AppPermission) => boolean) {
  const { status } = job;
  const is = (statuses: readonly JobStatus[]) => hasJobStatus(statuses, status);
  const readsJobMoney = hasJobCard(status) && (can('contracting_job:read') || can('contracting_job:read-priced'));
  return {
    editSetup: is(openJobStatuses) && can('contracting_job:update'),
    assign: is(openJobStatuses) && can('contracting_job:assign'),
    planStints: is(openJobStatuses) && can('contracting_job:assign'),
    signOff: status !== 'upcoming' && status !== 'cancelled' && can('contracting_job:update'),
    editMeasures: is(workedJobStatuses) && can('contracting_job:update'),
    editChargeLines: is(workedJobStatuses) && can('contracting_job:update'),
    patchTravel:
      is(unpricedJobStatuses) &&
      (can('contracting_job:assign') || (status === 'active' && can('contracting_assignment:update-own'))),
    editSignOffDetails: is(signedOffJobStatuses) && can('contracting_job:update'),
    editDieselLitres: status === 'completed' && can('contracting_job:update'),
    price: status === 'completed' && can('contracting_job:price'),
    seePricing: readsJobMoney,
    jobCard: readsJobMoney,
    stampInvoice: status === 'priced' && can('contracting_invoice:update'),
    resolveGaps: is(workedJobStatuses) && can('contracting_gap:resolve'),
    amendReadings: !is(closedJobStatuses) && can('contracting_reading:update'),
    complete: status === 'active' && can('contracting_job:complete'),
    cancel: is(unpricedJobStatuses) && can('contracting_job:cancel'),
  };
}

/** What the signed-in person may do to a Job in its current status. */
export type JobCapabilities = ReturnType<typeof jobCapabilities>;

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
