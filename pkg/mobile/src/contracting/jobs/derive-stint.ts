import type { FieldJob, FieldStint } from '@pkg/schema/contracting';

export type StintView = FieldStint & { view: 'planned' | 'running' | 'left' };

export const deriveStint = (stint: FieldStint): StintView => ({
  ...stint,
  view: stint.state === 'on-site' ? 'running' : stint.state,
});

export const jobSummary = (job: FieldJob) => ({
  machines: job.stints.length,
  running: job.stints.filter((stint) => stint.state === 'on-site').length,
  status: job.status,
  hasArrived: job.status === 'active',
});
