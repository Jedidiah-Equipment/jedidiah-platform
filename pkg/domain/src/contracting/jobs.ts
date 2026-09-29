import type { UserAccessSummary } from '@pkg/schema';
import {
  type AssignmentState,
  finishedJobStatuses,
  type JobQueue,
  type JobStatus,
  jobStatuses,
  unpricedJobStatuses,
} from '@pkg/schema/contracting';
import { hasPermission } from '../auth/authorization.js';
import {
  type BadgeColorClassNames,
  cancelledBadgeColorClassNames,
  statusBadgeColorClassNames,
} from '../theme/status-badge.js';

const JOB_NUMBER_PREFIX = 'CJOB-';

export const formatJobNumber = (code: number) => `${JOB_NUMBER_PREFIX}${String(code).padStart(5, '0')}`;

/** The Job code inside a Job Number such as CJOB-00037. */
export const parseJobNumber = (jobNumber: string) => Number(jobNumber.slice(JOB_NUMBER_PREFIX.length));

/** Contracting management works every Job; everyone else works only the Jobs they are Foreman on. */
export function isContractingManagement(
  access: Pick<UserAccessSummary, 'equipmentRole' | 'contractingRole'> | null | undefined,
) {
  return (
    access?.equipmentRole === 'super-admin' ||
    access?.contractingRole === 'contracting-admin' ||
    access?.contractingRole === 'contracting-manager'
  );
}

/** The money-free field Jobs projection is for operators, not every role that can read management Jobs. */
export function fieldJobAccessMode(access: UserAccessSummary | null | undefined): 'all' | 'own' | null {
  if (isContractingManagement(access)) return 'all';
  return hasPermission(access, 'contracting_job:read-own') ? 'own' : null;
}

/** Every Job, a Foreman's own Jobs without money, or Invoicing's Completed-onward Jobs. */
export type JobReadMode = 'all' | 'own' | 'priced';

export function jobReadMode(access: UserAccessSummary | null | undefined): JobReadMode | null {
  if (hasPermission(access, 'contracting_job:read')) return 'all';
  if (hasPermission(access, 'contracting_job:read-own')) return 'own';
  if (hasPermission(access, 'contracting_job:read-priced')) return 'priced';
  return null;
}

/** The statuses each read mode sees; listing a queue outside them is refused, and its count is zero. */
export const jobReadStatuses: Record<JobReadMode, readonly JobStatus[]> = {
  all: jobStatuses,
  own: unpricedJobStatuses,
  priced: finishedJobStatuses,
};

/** Foremen read their Jobs without money, so they neither see amounts nor open Job Cards. */
export const jobReadSeesMoney = (mode: JobReadMode) => mode !== 'own';

export function looksFinished(job: { status: JobStatus }, states: readonly AssignmentState[]): boolean {
  return job.status === 'active' && states.includes('left') && !states.includes('on-site');
}

export const jobStatusLabels: Record<JobStatus, string> = {
  upcoming: 'Upcoming',
  active: 'Active',
  completed: 'Completed',
  priced: 'Priced',
  invoiced: 'Invoiced',
  cancelled: 'Cancelled',
};

/** Tailwind classes split so native surfaces can put the text colour on the Text element. */
export const jobStatusColorClassNames: Record<JobStatus, BadgeColorClassNames> = {
  upcoming: statusBadgeColorClassNames.gray,
  active: statusBadgeColorClassNames.blue,
  completed: statusBadgeColorClassNames.teal,
  priced: statusBadgeColorClassNames.purple,
  invoiced: statusBadgeColorClassNames.green,
  cancelled: cancelledBadgeColorClassNames,
};

/** Queue filters describe workflow stages, which may differ from the Job's persisted status. */
export const jobQueueColorClassNames = {
  upcoming: statusBadgeColorClassNames.gray,
  active: statusBadgeColorClassNames.blue,
  'looks-finished': statusBadgeColorClassNames.orange,
  'awaiting-pricing': statusBadgeColorClassNames.teal,
  'awaiting-invoice': statusBadgeColorClassNames.purple,
  invoiced: statusBadgeColorClassNames.green,
  cancelled: cancelledBadgeColorClassNames,
} satisfies Record<JobQueue, BadgeColorClassNames & { dot: string }>;

/** A Job needing review uses the same warning tint across its list surfaces. */
export const jobAttentionColorClassNames = statusBadgeColorClassNames.orange;

/** Standalone warning icons use the theme warning colour instead of the chip's pale text. */
export const jobAttentionIconColorClassName = 'text-warning';

/** Machine Assignment badges share the same status palette on web and mobile. */
export const assignmentStateColorClassNames: Record<AssignmentState, BadgeColorClassNames> = {
  planned: statusBadgeColorClassNames.gray,
  'on-site': statusBadgeColorClassNames.blue,
  left: statusBadgeColorClassNames.green,
};
