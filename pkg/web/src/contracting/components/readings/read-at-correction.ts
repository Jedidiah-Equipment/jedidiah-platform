import { FUTURE_READ_AT_REFUSAL, isFutureReadAt, readAtFromInput, readAtInputValue } from '@pkg/domain/contracting';
import { localDateTimeValue } from '@/components/form/utils/form-schema.js';

/** A corrected Read At as the picker holds it: required, and never in the future. */
export const CorrectedReadAt = localDateTimeValue
  .refine((value) => value !== '', 'Choose when the meter was read.')
  .refine((value) => {
    const readAt = readAtFromInput(value);
    return !readAt || !isFutureReadAt(readAt);
  }, FUTURE_READ_AT_REFUSAL);

/** The picker's value for a recorded Read At, which is how the correction field starts. */
export const recordedReadAtValue = (capturedAt: string) => readAtInputValue(new Date(capturedAt));

/** The Read At an amendment posts. The picker holds minutes, so an untouched one keeps the recorded instant to the second. */
export const correctedCapturedAt = (readAt: string, recorded: string) =>
  readAt === recordedReadAtValue(recorded) ? recorded : (readAtFromInput(readAt)?.toISOString() ?? recorded);
