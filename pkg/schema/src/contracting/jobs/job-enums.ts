export const jobStatuses = ['upcoming', 'active', 'completed', 'priced', 'invoiced', 'cancelled'] as const;
export type JobStatus = (typeof jobStatuses)[number];
/** A Job from Completion onward: it has a Job Card. */
export const finishedJobStatuses = ['completed', 'priced', 'invoiced'] as const satisfies readonly JobStatus[];
export type FinishedJobStatus = (typeof finishedJobStatuses)[number];
/** No machine has left the plan behind yet: setup and Machine Assignments can still change. */
export const openJobStatuses = ['upcoming', 'active'] as const satisfies readonly JobStatus[];
/** Machines have arrived and pricing has not frozen the figures: Measures and Hour Gaps can still change. */
export const workedJobStatuses = ['active', 'completed'] as const satisfies readonly JobStatus[];
/** Neither priced nor cancelled: a Foreman still reads it, and it can still be cancelled. */
export const unpricedJobStatuses = ['upcoming', 'active', 'completed'] as const satisfies readonly JobStatus[];
/** Signed off but not invoiced: the sign-off details can still be corrected. */
export const signedOffJobStatuses = ['completed', 'priced'] as const satisfies readonly JobStatus[];
/** Nothing on the Job can change any more. */
export const closedJobStatuses = ['invoiced', 'cancelled'] as const satisfies readonly JobStatus[];
/** Whether a status belongs to one of the groups above. */
export const hasJobStatus = (statuses: readonly JobStatus[], status: JobStatus) => statuses.includes(status);

export const assignmentStates = ['planned', 'on-site', 'left'] as const;
export type AssignmentState = (typeof assignmentStates)[number];

export const discountKinds = ['amount', 'percent'] as const;
export type DiscountKind = (typeof discountKinds)[number];

export const jobQueues = [
  'upcoming',
  'active',
  'looks-finished',
  'awaiting-pricing',
  'awaiting-invoice',
  'invoiced',
  'cancelled',
] as const;
export type JobQueue = (typeof jobQueues)[number];
