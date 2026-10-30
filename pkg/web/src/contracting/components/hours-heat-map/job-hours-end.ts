import { getPlantDateNow } from '@pkg/domain';
import { effectiveJobDates } from '@pkg/domain/contracting';
import type { DateOnlyIso } from '@pkg/schema';

/**
 * The plant date a Job's heat map should end on: the Job's effective End date, so a finished Job shows the weeks it
 * was worked rather than the weeks since. Undefined before any Machine has arrived, which ends the map today.
 */
export function jobHoursEnd(job: {
  startDate: DateOnlyIso | null;
  endDate: DateOnlyIso | null;
  assignments: readonly { arrival: { at: string } | null; departure: { at: string } | null }[];
}): DateOnlyIso | undefined {
  return effectiveJobDates(job, job.assignments, getPlantDateNow())?.endDate;
}
