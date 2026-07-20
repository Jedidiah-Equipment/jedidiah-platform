import { addDateOnlyDays, isJobCancelled } from '@pkg/domain';
import type { JobSummary, ProjectedBayQueue, UUID } from '@pkg/schema';

export type JobCalendarSlotChip = {
  bayName: string;
  cancelled: boolean;
  jobCode: string;
  jobId: UUID;
  slotId: UUID;
};

export function groupJobCalendarSlotsByDate(
  bays: readonly ProjectedBayQueue[],
  jobs: readonly JobSummary[],
): ReadonlyMap<string, JobCalendarSlotChip[]> {
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  const chipsByDate = new Map<string, JobCalendarSlotChip[]>();

  for (const bay of bays) {
    for (const slot of bay.slots) {
      if (slot.kind !== 'work') continue;

      const job = jobsById.get(slot.jobId);
      if (!job) continue;

      const chip = {
        bayName: bay.name,
        cancelled: isJobCancelled(job),
        jobCode: slot.jobCode,
        jobId: job.id,
        slotId: slot.id,
      } satisfies JobCalendarSlotChip;

      for (let date = slot.startDate; date < slot.endDate; date = addDateOnlyDays(date, 1)) {
        const chips = chipsByDate.get(date) ?? [];
        chips.push(chip);
        chipsByDate.set(date, chips);
      }
    }
  }

  return chipsByDate;
}
