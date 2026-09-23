import { translatingConstraintViolations } from '../../errors/constraint-violations.js';

export type ReadingErrorCode =
  | 'reading.not_found'
  | 'reading.retired_machine'
  | 'reading.capture_id_conflict'
  | 'reading.previous_changed'
  | 'reading.below_latest'
  | 'reading.baseline_exists'
  | 'reading.invalid_amendment'
  | 'reading.forbidden'
  | 'reading.wrong_status'
  | 'reading.invalid_role'
  | 'reading.machine_on_site'
  | 'reading.implement_on_site'
  | 'reading.no_photo'
  | 'reading.verification_failed'
  | 'reading.job_invoiced';
export class ReadingError extends Error {
  constructor(
    readonly code: ReadingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ReadingError';
  }
}
export const isReadingError = (error: unknown): error is ReadingError => error instanceof ReadingError;

/** Capture's reading of the stint constraints: the phone reports these, so they stay Reading errors. */
export const withCaptureConstraints = <T>(action: () => Promise<T>) =>
  translatingConstraintViolations(
    {
      unique: (constraint) => {
        if (constraint === 'machine_assignment_machine_on_site_unique')
          return new ReadingError(
            'reading.machine_on_site',
            'This Machine is still on site on another Job — capture its departure there first.',
          );
        if (constraint === 'machine_assignment_implement_on_site_unique')
          return new ReadingError(
            'reading.implement_on_site',
            'This Implement is still on site on another Job — capture its departure there first.',
          );
        return undefined;
      },
      foreignKey: (constraint) =>
        constraint === 'machine_assignment_driver_role'
          ? new ReadingError('reading.invalid_role', 'Select a person with the Contracting driver role.')
          : new ReadingError('reading.invalid_role', 'The selected Job, Implement, or Driver is no longer valid.'),
    },
    action,
  );
