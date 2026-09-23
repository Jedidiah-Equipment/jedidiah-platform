import { type JobActionSubject, type JobActor, jobActionRefusal, judgeJobAction } from '@pkg/domain/contracting';
import type { JobActionName } from '@pkg/schema/contracting';
import { translatingConstraintViolations } from '../../errors/constraint-violations.js';
import type { RefusedJobAction } from '../jobs/job-errors.js';

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
    /** The Job Action a refusal refused, when a Job's status or ownership refused it. */
    readonly refused?: RefusedJobAction,
  ) {
    super(message);
    this.name = 'ReadingError';
  }
}
export const isReadingError = (error: unknown): error is ReadingError => error instanceof ReadingError;

/**
 * A Job Action refused as a Reading error, because the phone and the exceptions list report Reading
 * codes: an Invoiced Job keeps its own code for amendments, which the Job sheet names.
 */
export function assertReadingJobAction(
  action: Extract<JobActionName, 'capture' | 'amendReadings'>,
  job: JobActionSubject,
  actor: JobActor,
) {
  const verdict = judgeJobAction(action, job, actor);
  if (verdict.allowed) return;
  const code: ReadingErrorCode =
    verdict.reason === 'no-permission' || verdict.reason === 'not-your-job'
      ? 'reading.forbidden'
      : action === 'amendReadings' && job.status === 'invoiced'
        ? 'reading.job_invoiced'
        : 'reading.wrong_status';
  throw new ReadingError(code, jobActionRefusal(action, verdict.reason, job, actor), {
    action,
    reason: verdict.reason,
  });
}

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
