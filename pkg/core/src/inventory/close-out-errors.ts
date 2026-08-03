/** A Job's stock life can only end after the Job itself has: close-out needs a Job Completion. */
export class JobNotCompletedError extends Error {
  readonly code = 'inventory.job_not_completed';
  readonly metadata: { jobId: string };

  constructor(jobId: string) {
    super('Only a completed Job can be closed out.');
    this.name = 'JobNotCompletedError';
    this.metadata = { jobId };
  }
}

/** Closing out is once-only; reopening is not a v1 concept, so a second close is a mistake. */
export class JobAlreadyClosedOutError extends Error {
  readonly code = 'inventory.job_already_closed_out';
  readonly metadata: { jobId: string };

  constructor(jobId: string) {
    super('This Job has already been closed out.');
    this.name = 'JobAlreadyClosedOutError';
    this.metadata = { jobId };
  }
}

/**
 * Close-out asserted that this Job's stock life is over. A fresh draw would make that a lie and
 * would never be prompted for again — the Job cannot re-enter the close-out queue. Returns stay
 * open: recovered stock must always reach the ledger.
 */
export class JobClosedOutError extends Error {
  readonly code = 'inventory.job_closed_out';
  readonly metadata: { jobId: string };

  constructor(jobId: string) {
    super('This Job has been closed out and can no longer draw stock.');
    this.name = 'JobClosedOutError';
    this.metadata = { jobId };
  }
}

export type JobCloseOutError = JobAlreadyClosedOutError | JobClosedOutError | JobNotCompletedError;

export function isJobCloseOutError(error: unknown): error is JobCloseOutError {
  return (
    error instanceof JobAlreadyClosedOutError ||
    error instanceof JobClosedOutError ||
    error instanceof JobNotCompletedError
  );
}
