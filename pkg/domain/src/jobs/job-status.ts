import type { JobStatus } from '@pkg/schema';

export const jobStatusLabels: Record<JobStatus, string> = {
  active: 'Active',
  cancelled: 'Cancelled',
  complete: 'Complete',
  pending: 'Pending',
  paused: 'Paused',
};
