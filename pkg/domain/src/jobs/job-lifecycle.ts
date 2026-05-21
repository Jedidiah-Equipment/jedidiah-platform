import type { JobLifecycleStatus } from '@pkg/schema';

export const jobLifecycleStatusLabels: Record<JobLifecycleStatus, string> = {
  active: 'Active',
  cancelled: 'Cancelled',
  complete: 'Complete',
  'not-started': 'Not started',
  paused: 'Paused',
};
