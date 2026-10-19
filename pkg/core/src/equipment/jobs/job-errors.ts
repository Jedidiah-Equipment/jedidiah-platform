export type JobErrorCode =
  | 'job.already_completed'
  | 'job.bay_already_assigned'
  | 'job.bay_in_use'
  | 'job.bay_not_found'
  | 'job.bay_operator_assignment_denied'
  | 'job.bay_operator_assignment_not_found'
  | 'job.bay_operator_not_found'
  | 'job.bay_operator_role_denied'
  | 'job.cancelled'
  | 'job.completed_on_in_future'
  | 'job.create_from_quote_denied'
  | 'job.department_timing_already_completed'
  | 'job.department_timing_already_started'
  | 'job.department_timing_invalid'
  | 'job.department_timing_locked'
  | 'job.department_timing_not_started'
  | 'job.not_found'
  | 'job.slot_booking_denied'
  | 'job.slot_not_found'
  // A Stock Build was asked for against a Product or an Optional Assembly that cannot supply it.
  | 'job.stock_build_denied'
  | 'job.unit_removal_denied';

export class JobError extends Error {
  constructor(
    readonly code: JobErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'JobError';
  }
}

export const isJobError = (error: unknown): error is JobError => error instanceof JobError;
export const jobNotFound = (id: string) => new JobError('job.not_found', `Job not found: ${id}`);
export const jobCancelled = () => new JobError('job.cancelled', 'Cancelled Job cannot be changed.');
export const jobBayNotFound = (id: string) => new JobError('job.bay_not_found', `Job bay not found: ${id}`);
export const jobBayOperatorNotFound = (id: string) =>
  new JobError('job.bay_operator_not_found', `Bay operator not found: ${id}`);
export const jobBayOperatorRoleDenied = () =>
  new JobError('job.bay_operator_role_denied', 'Only Bay Operator users can be assigned to Bays.');
export const jobBayAlreadyAssigned = () =>
  new JobError('job.bay_already_assigned', 'Bay already has a current operator.');
export const jobBayOperatorAssignmentNotFound = (bayId: string) =>
  new JobError('job.bay_operator_assignment_not_found', `Bay has no current operator assignment: ${bayId}`);
export const jobSlotNotFound = (id: string) => new JobError('job.slot_not_found', `Job slot not found: ${id}`);
export const jobCompletedOnInFuture = () =>
  new JobError('job.completed_on_in_future', 'Completion date cannot be in the future.');

/**
 * Deciding the machine's fate belongs to whoever is ending the sale. While a Quote still stands its
 * Job's Unit is the sale's to keep — cancelling frees the Quote to start a replacement Job on that
 * very Unit — so only a Stock Build, which has no sale behind it, may take its Unit with it.
 */
export const jobUnitRemovalDenied = () =>
  new JobError(
    'job.unit_removal_denied',
    'This job has a quote behind it, so its machine belongs to the sale. Cancel the quote to decide what happens to the unit.',
  );

/**
 * Only the direct cancel refuses this. Cancelling a Quote still cascades onto a completed Job — that
 * says the deal died, while cancelling the Job says the work will never happen, which a completion
 * date has already contradicted.
 */
export const jobAlreadyCompleted = () => new JobError('job.already_completed', 'Completed Job cannot be cancelled.');

/**
 * Job Completion is the factory manager's word that the whole Job is finished, so it freezes the
 * department observations behind it. Corrections after that point are deliberately not a self-service
 * edit.
 */
export const jobDepartmentTimingLocked = () =>
  new JobError(
    'job.department_timing_locked',
    'This job is completed, so its department timings can no longer be changed.',
  );
export const jobDepartmentTimingAlreadyStarted = () =>
  new JobError('job.department_timing_already_started', 'This department has already been started on this job.');
export const jobDepartmentTimingNotStarted = () =>
  new JobError('job.department_timing_not_started', 'This department has not been started on this job.');

/**
 * A second done-stamp on a department already recorded as done. The correction path owns re-stamping,
 * so the ordinary verb refuses rather than silently rewriting the duration and who is credited.
 */
export const jobDepartmentTimingAlreadyCompleted = () =>
  new JobError(
    'job.department_timing_already_completed',
    'This department is already recorded as done on this job. Edit the recorded times instead.',
  );
