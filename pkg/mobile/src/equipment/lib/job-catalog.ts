import type { StatusBadgeColor } from '@pkg/domain';
import type { JobListInput, JobSummary } from '@pkg/schema/equipment';

import { createLiteralGuard } from '@/lib/use-persisted-state';

export type JobCompletionFilter = 'exclude-complete' | 'include-complete';
export type JobCatalogSort = 'code' | 'schedule';

export const isJobCompletionFilter = createLiteralGuard(['exclude-complete', 'include-complete']);
export const isJobCatalogSort = createLiteralGuard(['code', 'schedule']);

export function getJobCatalogListPresentation(
  completion: JobCompletionFilter,
  sort: JobCatalogSort,
): Pick<JobListInput, 'filters' | 'include' | 'sortBy' | 'sortDirection'> {
  return {
    filters: completion === 'exclude-complete' ? { incompleteOnly: true } : {},
    include: { scheduleState: true },
    sortBy: sort === 'code' ? 'code' : 'scheduledSlots',
    sortDirection: 'asc',
  };
}

export type JobSchedulePresentation = {
  count: number | null;
  label: 'Active' | 'Done' | 'Not scheduled' | 'Scheduled';
  tone: StatusBadgeColor;
};

/** Mirrors the web Job List's Work-Slot buckets; stored Job completion is presented separately. */
export function getJobSchedulePresentation(job: JobSummary): JobSchedulePresentation[] {
  const schedule = job.scheduleState;

  if (!schedule) return [];
  if (schedule.total === 0) return [{ count: null, label: 'Not scheduled', tone: 'orange' }];

  const presentations: JobSchedulePresentation[] = [
    { count: schedule.done, label: 'Done', tone: 'gray' },
    { count: schedule.active, label: 'Active', tone: 'blue' },
    { count: schedule.scheduled, label: 'Scheduled', tone: 'green' },
  ];

  return presentations.filter((item) => item.count !== null && item.count > 0);
}
