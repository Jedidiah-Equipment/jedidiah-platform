import type { ReadingAmendmentRefusal } from '@pkg/domain/contracting';
import type { ReadingErrorCode, ReadingRefusal } from '@pkg/schema/contracting';

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

const amendmentRefusalCodes: Record<Exclude<ReadingAmendmentRefusal, 'not_found'>, ReadingErrorCode> = {
  out_of_range: 'reading.invalid_amendment',
  contradicts_telematics: 'reading.invalid_amendment',
  outruns_clock: 'reading.outruns_clock',
  future_read_at: 'reading.future_read_at',
  nothing_to_amend: 'reading.invalid_amendment',
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
