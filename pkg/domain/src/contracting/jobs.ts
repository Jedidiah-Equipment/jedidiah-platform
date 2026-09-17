import type { UserAccessSummary } from '@pkg/schema';
import type { AssignmentState, JobStatus } from '@pkg/schema/contracting';
import { hasPermission } from '../auth/authorization.js';

export const formatJobNumber = (code: number) => `CJOB-${String(code).padStart(5, '0')}`;

/** The money-free field Jobs projection is for operators, not every role that can read management Jobs. */
export function fieldJobAccessMode(access: UserAccessSummary | null | undefined): 'all' | 'own' | null {
  if (
    access?.equipmentRole === 'super-admin' ||
    access?.contractingRole === 'contracting-admin' ||
    access?.contractingRole === 'contracting-manager'
  )
    return 'all';
  return hasPermission(access, 'contracting_job:read-own') ? 'own' : null;
}

export function looksFinished(job: { status: JobStatus }, states: readonly AssignmentState[]): boolean {
  return job.status === 'active' && states.includes('left') && !states.includes('on-site');
}
