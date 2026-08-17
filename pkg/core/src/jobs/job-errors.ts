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

/**
 * Deciding the machine's fate belongs to whoever is ending the sale. While a Quote still stands its
 * Job's Unit is the sale's to keep — cancelling frees the Quote to start a replacement Job on that
 * very Unit — so only a Stock Build, which has no sale behind it, may take its Unit with it.
 */
export class JobUnitRemovalDeniedError extends Error {
  readonly code = 'job.unit_removal_denied';
  readonly metadata: { id: string };

  constructor(id: string) {
    super(
      'This job has a quote behind it, so its machine belongs to the sale. Cancel the quote to decide what happens to the unit.',
    );
    this.name = 'JobUnitRemovalDeniedError';
    this.metadata = { id };
  }
}

/** A Stock Build was asked for against a Product or an Optional Assembly that cannot supply it. */
export class StockBuildDeniedError extends Error {
  readonly code = 'job.stock_build_denied';

  constructor(message: string) {
    super(message);
    this.name = 'StockBuildDeniedError';
  }
}

export class JobCancelledError extends Error {
  readonly code = 'job.cancelled';
  readonly metadata: { id: string };

  constructor(id: string) {
    super('Cancelled Job cannot be changed.');
    this.name = 'JobCancelledError';
    this.metadata = { id };
  }
}

/**
 * Only the direct cancel refuses this. Cancelling a Quote still cascades onto a completed Job — that
 * says the deal died, while cancelling the Job says the work will never happen, which a completion
 * date has already contradicted.
 */
export class JobAlreadyCompletedError extends Error {
  readonly code = 'job.already_completed';
  readonly metadata: { id: string };

  constructor(id: string) {
    super('Completed Job cannot be cancelled.');
    this.name = 'JobAlreadyCompletedError';
    this.metadata = { id };
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

/** A Bay was asked to be deleted while something still references it; disable it instead. */
export class JobBayInUseError extends Error {
  readonly code = 'job.bay_in_use';
  readonly metadata: { id: string };

  constructor(id: string, message: string) {
    super(message);
    this.name = 'JobBayInUseError';
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

export class JobCompletedOnInFutureError extends Error {
  readonly code = 'job.completed_on_in_future';
  readonly metadata: { completedOn: string; plantToday: string };

  constructor(completedOn: string, plantToday: string) {
    super('Completion date cannot be in the future.');
    this.name = 'JobCompletedOnInFutureError';
    this.metadata = { completedOn, plantToday };
  }
}

/**
 * Job Completion is the factory manager's word that the whole Job is finished, so it freezes the
 * department observations behind it. Corrections after that point are deliberately not a self-service
 * edit.
 */
export class JobDepartmentTimingLockedError extends Error {
  readonly code = 'job.department_timing_locked';
  readonly metadata: { id: string };

  constructor(id: string) {
    super('This job is completed, so its department timings can no longer be changed.');
    this.name = 'JobDepartmentTimingLockedError';
    this.metadata = { id };
  }
}

export class JobDepartmentTimingAlreadyStartedError extends Error {
  readonly code = 'job.department_timing_already_started';
  readonly metadata: { department: string; id: string };

  constructor(id: string, department: string) {
    super('This department has already been started on this job.');
    this.name = 'JobDepartmentTimingAlreadyStartedError';
    this.metadata = { department, id };
  }
}

export class JobDepartmentTimingNotStartedError extends Error {
  readonly code = 'job.department_timing_not_started';
  readonly metadata: { department: string; id: string };

  constructor(id: string, department: string) {
    super('This department has not been started on this job.');
    this.name = 'JobDepartmentTimingNotStartedError';
    this.metadata = { department, id };
  }
}

/**
 * A second done-stamp on a department already recorded as done. The correction path owns re-stamping,
 * so the ordinary verb refuses rather than silently rewriting the duration and who is credited.
 */
export class JobDepartmentTimingAlreadyCompletedError extends Error {
  readonly code = 'job.department_timing_already_completed';
  readonly metadata: { department: string; id: string };

  constructor(id: string, department: string) {
    super('This department is already recorded as done on this job. Edit the recorded times instead.');
    this.name = 'JobDepartmentTimingAlreadyCompletedError';
    this.metadata = { department, id };
  }
}

/** A correction that would leave the stamps or their crew in a shape the done-stamp never produces. */
export class JobDepartmentTimingInvalidError extends Error {
  readonly code = 'job.department_timing_invalid';

  constructor(message: string) {
    super(message);
    this.name = 'JobDepartmentTimingInvalidError';
  }
}

export type JobCoreError =
  | JobAlreadyCompletedError
  | JobBayAlreadyAssignedError
  | JobBayInUseError
  | JobBayNotFoundError
  | JobBayOperatorAssignmentDeniedError
  | JobBayOperatorAssignmentNotFoundError
  | JobBayOperatorNotFoundError
  | JobBayOperatorRoleDeniedError
  | JobCompletedOnInFutureError
  | JobCreateFromQuoteDeniedError
  | JobDepartmentTimingAlreadyCompletedError
  | JobDepartmentTimingAlreadyStartedError
  | JobDepartmentTimingInvalidError
  | JobDepartmentTimingLockedError
  | JobDepartmentTimingNotStartedError
  | JobCancelledError
  | JobNotFoundError
  | JobSlotBookingDeniedError
  | JobSlotNotFoundError
  | JobUnitRemovalDeniedError
  | StockBuildDeniedError;

export function isJobCoreError(error: unknown): error is JobCoreError {
  return (
    error instanceof JobAlreadyCompletedError ||
    error instanceof JobBayInUseError ||
    error instanceof JobBayNotFoundError ||
    error instanceof JobBayOperatorAssignmentDeniedError ||
    error instanceof JobBayOperatorAssignmentNotFoundError ||
    error instanceof JobBayOperatorNotFoundError ||
    error instanceof JobBayOperatorRoleDeniedError ||
    error instanceof JobBayAlreadyAssignedError ||
    error instanceof JobCompletedOnInFutureError ||
    error instanceof JobCreateFromQuoteDeniedError ||
    error instanceof JobDepartmentTimingAlreadyCompletedError ||
    error instanceof JobDepartmentTimingAlreadyStartedError ||
    error instanceof JobDepartmentTimingInvalidError ||
    error instanceof JobDepartmentTimingLockedError ||
    error instanceof JobDepartmentTimingNotStartedError ||
    error instanceof JobCancelledError ||
    error instanceof JobNotFoundError ||
    error instanceof JobSlotBookingDeniedError ||
    error instanceof JobSlotNotFoundError ||
    error instanceof JobUnitRemovalDeniedError ||
    error instanceof StockBuildDeniedError
  );
}
