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
 * carrying a completion date drops out of both; `all` stays literally all. See CONTEXT.md, Job Completion.
 */
export function filterBookSlotJobs<TJob extends Pick<JobSummary, 'completedOn' | 'scheduleState'>>(
  jobs: readonly TJob[],
  filter: BookSlotJobFilter,
): readonly TJob[] {
  if (filter === 'all') {
    return jobs;
  }

  const openJobs = jobs.filter((job) => job.completedOn === null);

  if (filter === 'active') {
    return openJobs.filter(
      (job) => job.scheduleState !== null && job.scheduleState.total > 0 && !isJobScheduleComplete(job.scheduleState),
    );
  }

  return openJobs.filter((job) => job.scheduleState?.total === 0);
}
