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

export class JobStageNotFoundError extends Error {
  readonly code = 'job.stage_not_found';
  readonly metadata: { id: string };

  constructor(id: string) {
    super(`Job stage not found: ${id}`);
    this.name = 'JobStageNotFoundError';
    this.metadata = { id };
  }
}

export class JobSlotBookingDeniedError extends Error {
  readonly code = 'job.slot_booking_denied';

  constructor(message: string) {
    super(message);
    this.name = 'JobSlotBookingDeniedError';
  }
}

export type JobCoreError =
  | JobBayNotFoundError
  | JobCreateFromQuoteDeniedError
  | JobNotFoundError
  | JobSlotBookingDeniedError
  | JobStageNotFoundError;

export function isJobCoreError(error: unknown): error is JobCoreError {
  return (
    error instanceof JobBayNotFoundError ||
    error instanceof JobCreateFromQuoteDeniedError ||
    error instanceof JobNotFoundError ||
    error instanceof JobSlotBookingDeniedError ||
    error instanceof JobStageNotFoundError
  );
}
