import type { JobStageStatus } from '@pkg/schema';

export const jobStageStatusLabels = {
  complete: 'Complete',
  curing: 'Curing',
  cutting: 'Cutting',
  dispatched: 'Dispatched',
  'in-progress': 'In progress',
  ordering: 'Ordering',
  painting: 'Painting',
  partial: 'Partial',
  pending: 'Pending',
  prep: 'Prep',
  qc: 'QC',
  ready: 'Ready',
  welding: 'Welding',
} as const satisfies Record<JobStageStatus, string>;
