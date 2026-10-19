export type JobCloseOutErrorCode =
  | 'inventory.job_already_closed_out'
  | 'inventory.job_closed_out'
  | 'inventory.job_not_completed';

export class JobCloseOutError extends Error {
  constructor(
    readonly code: JobCloseOutErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'JobCloseOutError';
  }
}

export const isJobCloseOutError = (error: unknown): error is JobCloseOutError => error instanceof JobCloseOutError;

/** A Job's stock life can only end after the Job itself has: close-out needs a Job Completion. */
export const jobNotCompleted = () =>
  new JobCloseOutError('inventory.job_not_completed', 'Only a completed Job can be closed out.');

/** Closing out is once-only; reopening is not a v1 concept, so a second close is a mistake. */
export const jobAlreadyClosedOut = () =>
  new JobCloseOutError('inventory.job_already_closed_out', 'This Job has already been closed out.');

/**
 * Close-out asserted that this Job's stock life is over. A fresh draw would make that a lie and
 * would never be prompted for again — the Job cannot re-enter the close-out queue. Returns stay
 * open: recovered stock must always reach the ledger.
 */
export const jobClosedOut = () =>
  new JobCloseOutError('inventory.job_closed_out', 'This Job has been closed out and can no longer draw stock.');
