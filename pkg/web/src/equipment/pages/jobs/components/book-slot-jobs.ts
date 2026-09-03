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
 * The Jobs the picker offers under each filter. `active` retires a Job on schedule completeness alone,
 * so it agrees with the Board; `unscheduled` has no schedule signal to retire one, so it reads the
 * stored completion date instead. See CONTEXT.md, Job Completion.
 */
export function filterBookSlotJobs<TJob extends Pick<JobSummary, 'completedOn' | 'scheduleState'>>(
  jobs: readonly TJob[],
  filter: BookSlotJobFilter,
): readonly TJob[] {
  if (filter === 'all') {
    return jobs;
  }

  if (filter === 'active') {
    return jobs.filter(
      (job) => job.scheduleState !== null && job.scheduleState.total > 0 && !isJobScheduleComplete(job.scheduleState),
    );
  }

  return jobs.filter((job) => job.completedOn === null && job.scheduleState?.total === 0);
}
