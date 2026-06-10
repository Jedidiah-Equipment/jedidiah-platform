import type { JobListInput } from '@pkg/schema';

// Shared by the schedule gantt and the booking dialog so their jobs
// queries hit the same cache entry.
export const allJobsInput = {
  filters: {},
  page: 1,
  pageSize: 0,
  search: '',
  sortBy: 'createdAt',
  sortDirection: 'desc',
} satisfies JobListInput;
