export const jobStatuses = ['upcoming', 'active', 'completed', 'priced', 'invoiced', 'cancelled'] as const;
export type JobStatus = (typeof jobStatuses)[number];

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
