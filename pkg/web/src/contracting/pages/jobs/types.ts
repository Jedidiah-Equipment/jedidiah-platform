import { hasJobCard, jobActionRefusal, round1 } from '@pkg/domain/contracting';
import type { UserAccessSummary } from '@pkg/schema';
import { DateOnlyIso, UUID } from '@pkg/schema';
import {
  type JobActionName,
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

export function complementGap(gapHours: number, travel: number) {
  const travelHours = round1(Math.max(0, Math.min(gapHours, travel)));
  return { travelHours, unaccountedHours: round1(Math.max(0, gapHours - travelHours)) };
}

/**
 * The Job sheet's reading of the Job Actions the server served for the signed-in person. It derives
 * nothing from status or permissions itself: a control renders when its verdict allows it, hides when
 * the person lacks the permission, and otherwise shows disabled with the server's own refusal.
 */
export function jobSheet(job: JobDetail, access: UserAccessSummary | null | undefined) {
  const verdict = (action: JobActionName) => job.actions[action];
  const holds = (action: JobActionName) => {
    const judged = verdict(action);
    return judged.allowed || judged.reason !== 'no-permission';
  };
  return {
    can: (action: JobActionName) => verdict(action).allowed,
    /** The person holds the action's permission; only the Job's state or ownership can still refuse it. */
    holds,
    refusal: (action: JobActionName) => {
      const judged = verdict(action);
      return judged.allowed || !access ? undefined : jobActionRefusal(action, judged.reason, job, access);
    },
    /** Money reaches only the readers the server sends it to, once there is a Job Card to price. */
    seesMoney: hasJobCard(job.status) && job.pricing !== null,
    showsSignOff: job.status !== 'upcoming' && job.status !== 'cancelled' && holds('editSignOffDetails'),
  };
}

/** What the signed-in person may do on the Job sheet, read from the served Job Actions. */
export type JobSheet = ReturnType<typeof jobSheet>;

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
