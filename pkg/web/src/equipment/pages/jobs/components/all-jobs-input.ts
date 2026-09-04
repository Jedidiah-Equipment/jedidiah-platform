import type { JobListInput } from '@pkg/schema/equipment';

// The booking dialog needs a full Job picker plus schedule state for its active/unscheduled filters.
export const allJobsInput = {
  columnFilters: {},
  filters: {},
  include: { scheduleState: true },
  cursor: 0,
  limit: 0,
  search: '',
  sortBy: 'createdAt',
  sortDirection: 'desc',
} satisfies JobListInput;
