export class JobNotFoundError extends Error {
  readonly code = 'job.not_found';
  readonly metadata: { id: string };

  constructor(id: string) {
    super(`Job not found: ${id}`);
    this.name = 'JobNotFoundError';
    this.metadata = { id };
  }
}

export class JobStageTransitionDeniedError extends Error {
  readonly code = 'job.stage_transition_denied';

  constructor(message: string) {
    super(message);
    this.name = 'JobStageTransitionDeniedError';
  }
}

export class JobStationBookingNotFoundError extends Error {
  readonly code = 'job.station_booking_not_found';
  readonly metadata: { id: string };

  constructor(id: string) {
    super(`Station booking not found: ${id}`);
    this.name = 'JobStationBookingNotFoundError';
    this.metadata = { id };
  }
}

export class JobStationBookingTransitionDeniedError extends Error {
  readonly code = 'job.station_booking_transition_denied';

  constructor(message: string) {
    super(message);
    this.name = 'JobStationBookingTransitionDeniedError';
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
  | JobStatusUpdateDeniedError
  | JobStationBookingNotFoundError
  | JobStationBookingTransitionDeniedError
  | JobStageTransitionDeniedError;

export function isJobCoreError(error: unknown): error is JobCoreError {
  return (
    error instanceof JobDateEditDeniedError ||
    error instanceof JobDateEditInvalidError ||
    error instanceof JobDateEditTargetNotFoundError ||
    error instanceof JobNotFoundError ||
    error instanceof JobCreateFromQuoteDeniedError ||
    error instanceof JobStatusUpdateDeniedError ||
    error instanceof JobStationBookingNotFoundError ||
    error instanceof JobStationBookingTransitionDeniedError ||
    error instanceof JobStageTransitionDeniedError
  );
}
