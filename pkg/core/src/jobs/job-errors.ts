export class JobNotFoundError extends Error {
  readonly code = 'job.not_found';
  readonly metadata: { id: string };

  constructor(id: string) {
    super(`Job not found: ${id}`);
    this.name = 'JobNotFoundError';
    this.metadata = { id };
  }
}

export class JobDateEditDeniedError extends Error {
  readonly code = 'job.date_edit_denied';

  constructor(message: string) {
    super(message);
    this.name = 'JobDateEditDeniedError';
  }
}

export class JobDateEditInvalidError extends Error {
  readonly code = 'job.date_edit_invalid';

  constructor(message: string) {
    super(message);
    this.name = 'JobDateEditInvalidError';
  }
}

export class JobDateEditTargetNotFoundError extends Error {
  readonly code = 'job.date_edit_target_not_found';
  readonly metadata: { id: string };

  constructor(id: string) {
    super(`Job date edit target not found: ${id}`);
    this.name = 'JobDateEditTargetNotFoundError';
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

export class JobStatusUpdateDeniedError extends Error {
  readonly code = 'job.status_update_denied';

  constructor(message: string) {
    super(message);
    this.name = 'JobStatusUpdateDeniedError';
  }
}

export type JobCoreError =
  | JobDateEditDeniedError
  | JobDateEditInvalidError
  | JobDateEditTargetNotFoundError
  | JobNotFoundError
  | JobCreateFromQuoteDeniedError
  | JobStatusUpdateDeniedError;

export function isJobCoreError(error: unknown): error is JobCoreError {
  return (
    error instanceof JobDateEditDeniedError ||
    error instanceof JobDateEditInvalidError ||
    error instanceof JobDateEditTargetNotFoundError ||
    error instanceof JobNotFoundError ||
    error instanceof JobCreateFromQuoteDeniedError ||
    error instanceof JobStatusUpdateDeniedError
  );
}
