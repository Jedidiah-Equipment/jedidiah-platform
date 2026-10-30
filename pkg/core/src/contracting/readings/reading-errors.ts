import {
  type CaptureConstraintRule,
  captureRefusals,
  type JobActionSubject,
  type JobActor,
  judgeJobAction,
  type ReadingAmendmentRefusal,
  readingCodeForJobRefusal,
} from '@pkg/domain/contracting';
import type { ReadingErrorCode, ReadingRefusal } from '@pkg/schema/contracting';
import { translatingConstraintViolations } from '../../errors/constraint-violations.js';

export class ReadingError extends Error {
  constructor(
    readonly code: ReadingErrorCode,
    message: string,
    /** What the refusal carries beside its sentence, as the readings family sends it. */
    readonly refusal: ReadingRefusal = {},
  ) {
    super(message);
    this.name = 'ReadingError';
  }
}
export const isReadingError = (error: unknown): error is ReadingError => error instanceof ReadingError;

export const readingNotFound = () => new ReadingError('reading.not_found', 'Hour Reading not found.');

/**
 * The amendment's Job Action refused as a Reading error, because the exceptions list reports Reading codes: an
 * Invoiced Job keeps its own code, which the Job sheet names. Capture's Job verdict is judged in `judgeCapture`.
 */
export function assertAmendReadings(job: JobActionSubject, actor: JobActor) {
  const verdict = judgeJobAction('amendReadings', job, actor);
  if (verdict.allowed) return;
  const jobCode = readingCodeForJobRefusal(verdict.reason);
  const code: ReadingErrorCode =
    jobCode === 'reading.wrong_status' && job.status === 'invoiced' ? 'reading.job_invoiced' : jobCode;
  throw new ReadingError(code, verdict.message, { refused: { action: 'amendReadings', reason: verdict.reason } });
}

const amendmentRefusalCodes: Record<Exclude<ReadingAmendmentRefusal, 'not_found'>, ReadingErrorCode> = {
  out_of_range: 'reading.invalid_amendment',
  contradicts_telematics: 'reading.invalid_amendment',
  out_of_order: 'reading.invalid_amendment',
  outruns_clock: 'reading.outruns_clock',
  future_read_at: 'reading.future_read_at',
};

/** An amendment the ledger refused, in Reading terms. */
export const amendmentRefused = ({
  reason,
  id,
  message,
}: {
  reason: ReadingAmendmentRefusal;
  id: string;
  message: string;
}) =>
  reason === 'not_found'
    ? readingNotFound()
    : new ReadingError(amendmentRefusalCodes[reason], message, { readingId: id });

/** A stint constraint's refusal as the Reading error the phone reports. */
const captureRefused = (rule: CaptureConstraintRule) =>
  new ReadingError(captureRefusals[rule].code, captureRefusals[rule].message);

/** Capture's reading of the stint constraints: the phone reports these, so they stay Reading errors. */
export const withCaptureConstraints = <T>(action: () => Promise<T>) =>
  translatingConstraintViolations(
    {
      unique: (constraint) => {
        if (constraint === 'machine_assignment_machine_on_site_unique') return captureRefused('machine-busy');
        if (constraint === 'machine_assignment_implement_on_site_unique') return captureRefused('implement-busy');
        return undefined;
      },
      foreignKey: (constraint) =>
        constraint === 'machine_assignment_driver_role'
          ? new ReadingError('reading.invalid_role', 'Select a person with the Contracting driver role.')
          : new ReadingError('reading.invalid_role', 'The selected Job, Implement, or Driver is no longer valid.'),
    },
    action,
  );
