import type { AssignmentState, JobStatus } from '@pkg/schema/contracting';

export const formatJobNumber = (code: number) => `CJOB-${String(code).padStart(5, '0')}`;

export function looksFinished(job: { status: JobStatus }, states: readonly AssignmentState[]): boolean {
  return job.status === 'active' && states.includes('left') && !states.includes('on-site');
}
