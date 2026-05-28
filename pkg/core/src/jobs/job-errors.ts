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

export type JobCoreError = JobNotFoundError | JobCreateFromQuoteDeniedError;

export function isJobCoreError(error: unknown): error is JobCoreError {
  return error instanceof JobNotFoundError || error instanceof JobCreateFromQuoteDeniedError;
}
