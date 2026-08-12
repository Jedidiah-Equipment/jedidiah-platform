import { isJobScheduleComplete } from '@pkg/domain';
import type { JobSummary } from '@pkg/schema';

type BookSlotJob = Pick<JobSummary, 'productBuildTimeDays' | 'scheduleState'>;
export type BookSlotJobFilter = 'active' | 'all' | 'unscheduled';

export function getDefaultSlotDurationDays(job: BookSlotJob): number {
  if (job.scheduleState?.total === 0) {
    return job.productBuildTimeDays ?? 1;
  }

  return 1;
}

/**
 * The Jobs the picker offers under each filter. `active` and `unscheduled` are working lists, so a Job
 * with a stored `completedOn` drops out of both — for an unscheduled Job that stamp is the only thing
 * that ever retires it, since it has no Work Slot for the completion sweep to read and would otherwise
 * sit in the list forever (#1178). `all` stays literally all, so a Job completed by mistake can still
 * be found and booked.
 */
export function filterBookSlotJobs<TJob extends Pick<JobSummary, 'completedOn' | 'scheduleState'>>(
  jobs: readonly TJob[],
  filter: BookSlotJobFilter,
): readonly TJob[] {
  if (filter === 'all') {
    return jobs;
  }

  const open = jobs.filter((job) => job.completedOn === null);

  if (filter === 'active') {
    return open.filter(
      (job) => job.scheduleState !== null && job.scheduleState.total > 0 && !isJobScheduleComplete(job.scheduleState),
    );
  }

  return open.filter((job) => job.scheduleState?.total === 0);
}
