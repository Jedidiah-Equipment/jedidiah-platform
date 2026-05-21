import type { JobStageStatus } from '@pkg/schema';

export const jobStageStatusLabels = {
  complete: 'Complete',
  'in-progress': 'In progress',
  pending: 'Pending',
} as const satisfies Record<JobStageStatus, string>;
