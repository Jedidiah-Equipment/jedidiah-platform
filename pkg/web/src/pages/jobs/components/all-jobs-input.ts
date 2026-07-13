import type { JobListInput } from '@pkg/schema';

// The booking dialog needs a full Job picker plus schedule state for its active/unscheduled filters.
export const allJobsInput = {
  columnFilters: {},
  filters: {},
  include: { scheduleState: true },
  page: 1,
  pageSize: 0,
  search: '',
  sortBy: 'createdAt',
  sortDirection: 'desc',
} satisfies JobListInput;
