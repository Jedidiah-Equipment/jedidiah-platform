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

export class JobLifecycleTransitionDeniedError extends Error {
  readonly code = 'job.lifecycle_transition_denied';

  constructor(message: string) {
    super(message);
    this.name = 'JobLifecycleTransitionDeniedError';
  }
}

export class JobQuoteConversionDeniedError extends Error {
  readonly code = 'job.quote_conversion_denied';

  constructor(message: string) {
    super(message);
    this.name = 'JobQuoteConversionDeniedError';
  }
}

export type JobCoreError =
  | JobLifecycleTransitionDeniedError
  | JobNotFoundError
  | JobQuoteConversionDeniedError
  | JobStationBookingNotFoundError
  | JobStationBookingTransitionDeniedError
  | JobStageTransitionDeniedError;

export function isJobCoreError(error: unknown): error is JobCoreError {
  return (
    error instanceof JobLifecycleTransitionDeniedError ||
    error instanceof JobNotFoundError ||
    error instanceof JobQuoteConversionDeniedError ||
    error instanceof JobStationBookingNotFoundError ||
    error instanceof JobStationBookingTransitionDeniedError ||
    error instanceof JobStageTransitionDeniedError
  );
}
