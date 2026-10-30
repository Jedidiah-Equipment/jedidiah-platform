import {
  FUTURE_READ_AT_REFUSAL,
  isFutureReadAt,
  readAtFromInput,
  readAtFromPicker,
  readAtInputValue,
} from '@pkg/domain/contracting';
import { type ReadingAmendment, ReadingValue } from '@pkg/schema/contracting';
import { z } from 'zod';
import { localDateTimeValue } from '@/components/form/utils/form-schema.js';

/** A corrected Read At as the picker holds it: required, and never in the future. */
export const CorrectedReadAt = localDateTimeValue
  .refine((value) => value !== '', 'Choose when the meter was read.')
  .refine((value) => {
    const readAt = readAtFromInput(value);
    return !readAt || !isFutureReadAt(readAt);
  }, FUTURE_READ_AT_REFUSAL);

/** One reading's corrected hours and Read At, as `ReadingCorrectionFields` holds them. */
export const ReadingCorrection = z.object({ value: ReadingValue, readAt: CorrectedReadAt });
export type ReadingCorrection = z.infer<typeof ReadingCorrection>;

/** A correction prefilled as the reading was recorded. */
export const recordedCorrection = (reading: { value: number; capturedAt: string }): ReadingCorrection => ({
  value: reading.value,
  readAt: readAtInputValue(new Date(reading.capturedAt)),
});

/**
 * One reading's correction as the amend posts it, from the Job page or a Dispute alike. The picker holds minutes, so
 * an untouched Read At keeps the recorded instant to the second.
 */
export function toAmendment(
  { id, value, readAt }: ReadingCorrection & { id: string },
  recorded: { capturedAt: string },
): ReadingAmendment {
  return {
    id,
    value,
    capturedAt: readAtFromPicker(readAt, new Date(recorded.capturedAt))?.toISOString() ?? recorded.capturedAt,
  };
}
