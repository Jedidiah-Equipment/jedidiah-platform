import type { JobListInput } from '@pkg/schema';

// The booking dialog needs a full Job picker; schedule boards use the bounded summaries from listBays.
export const allJobsInput = {
  filters: {},
  page: 1,
  pageSize: 0,
  search: '',
  sortBy: 'createdAt',
  sortDirection: 'desc',
} satisfies JobListInput;
