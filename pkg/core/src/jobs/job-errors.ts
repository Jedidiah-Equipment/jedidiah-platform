export class JobNotFoundError extends Error {
  readonly code = 'job.not_found';
  readonly metadata: { id: string };

  constructor(id: string) {
    super(`Job not found: ${id}`);
    this.name = 'JobNotFoundError';
    this.metadata = { id };
  }
}

export class JobCreateFromQuoteDeniedError extends Error {
  readonly code = 'job.create_from_quote_denied';

  constructor(message: string) {
    super(message);
    this.name = 'JobCreateFromQuoteDeniedError';
  }
}

export class JobBayNotFoundError extends Error {
  readonly code = 'job.bay_not_found';
  readonly metadata: { id: string };

  constructor(id: string) {
    super(`Job bay not found: ${id}`);
    this.name = 'JobBayNotFoundError';
    this.metadata = { id };
  }
}

export class JobBayOperatorNotFoundError extends Error {
  readonly code = 'job.bay_operator_not_found';
  readonly metadata: { id: string };

  constructor(id: string) {
    super(`Bay operator not found: ${id}`);
    this.name = 'JobBayOperatorNotFoundError';
    this.metadata = { id };
  }
}

export class JobBayOperatorRoleDeniedError extends Error {
  readonly code = 'job.bay_operator_role_denied';

  constructor() {
    super('Only Bay Operator users can be assigned to Bays.');
    this.name = 'JobBayOperatorRoleDeniedError';
  }
}

export class JobBayAlreadyAssignedError extends Error {
  readonly code = 'job.bay_already_assigned';

  constructor() {
    super('Bay already has a current operator.');
    this.name = 'JobBayAlreadyAssignedError';
  }
}

export class JobBayOperatorAssignmentDeniedError extends Error {
  readonly code = 'job.bay_operator_assignment_denied';

  constructor(message: string) {
    super(message);
    this.name = 'JobBayOperatorAssignmentDeniedError';
  }
}

export class JobBayOperatorAssignmentNotFoundError extends Error {
  readonly code = 'job.bay_operator_assignment_not_found';
  readonly metadata: { bayId: string };

  constructor(bayId: string) {
    super(`Bay has no current operator assignment: ${bayId}`);
    this.name = 'JobBayOperatorAssignmentNotFoundError';
    this.metadata = { bayId };
  }
}

export class JobSlotBookingDeniedError extends Error {
  readonly code = 'job.slot_booking_denied';

  constructor(message: string) {
    super(message);
    this.name = 'JobSlotBookingDeniedError';
  }
}

export class JobSlotNotFoundError extends Error {
  readonly code = 'job.slot_not_found';
  readonly metadata: { id: string };

  constructor(id: string) {
    super(`Job slot not found: ${id}`);
    this.name = 'JobSlotNotFoundError';
    this.metadata = { id };
  }
}

export type JobCoreError =
  | JobBayAlreadyAssignedError
  | JobBayNotFoundError
  | JobBayOperatorAssignmentDeniedError
  | JobBayOperatorAssignmentNotFoundError
  | JobBayOperatorNotFoundError
  | JobBayOperatorRoleDeniedError
  | JobCreateFromQuoteDeniedError
  | JobNotFoundError
  | JobSlotBookingDeniedError
  | JobSlotNotFoundError;

export function isJobCoreError(error: unknown): error is JobCoreError {
  return (
    error instanceof JobBayNotFoundError ||
    error instanceof JobBayOperatorAssignmentDeniedError ||
    error instanceof JobBayOperatorAssignmentNotFoundError ||
    error instanceof JobBayOperatorNotFoundError ||
    error instanceof JobBayOperatorRoleDeniedError ||
    error instanceof JobBayAlreadyAssignedError ||
    error instanceof JobCreateFromQuoteDeniedError ||
    error instanceof JobNotFoundError ||
    error instanceof JobSlotBookingDeniedError ||
    error instanceof JobSlotNotFoundError
  );
}
