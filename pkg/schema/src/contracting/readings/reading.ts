import { z } from 'zod';
import { AuthId } from '../../auth/auth-id.js';
import { DateIso } from '../../common/date.js';
import { UUID } from '../../common/uuid.js';
import { CategoryColour, CategoryIconKey } from '../fleet/fleet.js';
import { readingCaptureRoles, readingMethods, readingRoles, readingVerifications } from './reading-enums.js';

export const ReadingValue = z.number().nonnegative().max(999999999.9).multipleOf(0.1);
export const ReadingReason = z.string().trim().min(1, 'A reason is required').max(2000);
export const ReadingComment = z.string().trim().min(1).max(2000);
export const ReadingCaptureInput = z
  .object({
    localId: UUID.optional(),
    expectedPreviousId: UUID.nullable().optional(),
    machineId: UUID,
    role: z.enum(readingCaptureRoles),
    value: ReadingValue,
    capturedAt: z.iso.datetime({ offset: true }),
    disputePrevious: z.boolean().default(false),
    comment: ReadingComment.nullable().optional(),
  })
  .strict();
export type ReadingCaptureInput = z.infer<typeof ReadingCaptureInput>;
type ReadingCaptureFields = z.input<typeof ReadingCaptureInput>;
export const readingCaptureFieldNames = ReadingCaptureInput.keyof().options;

/**
 * The multipart wire form of {@link ReadingCaptureInput}: every field travels as a string beside the
 * photo part. `readingCaptureMultipartFields` encodes and `ReadingCaptureMultipart` decodes, so the
 * mobile uploader and the API route share one definition of blank-means-null and how booleans and
 * numbers are spelled.
 */
export function readingCaptureMultipartFields(input: ReadingCaptureFields): [string, string][] {
  return readingCaptureFieldNames.flatMap((field) => {
    const value = input[field];
    return value === undefined ? [] : [[field, value === null ? '' : String(value)]];
  });
}
const blankAsNull = (value: unknown) => (value === '' ? null : value);
export const ReadingCaptureMultipart = z.preprocess((fields) => {
  if (typeof fields !== 'object' || fields === null) return fields;
  const record = { ...(fields as Record<string, unknown>) };
  if (typeof record.value === 'string' && record.value.trim() !== '') record.value = Number(record.value);
  if (record.disputePrevious === 'true') record.disputePrevious = true;
  if (record.disputePrevious === 'false') record.disputePrevious = false;
  record.expectedPreviousId = blankAsNull(record.expectedPreviousId);
  record.comment = blankAsNull(record.comment);
  if (record.expectedPreviousId === undefined) delete record.expectedPreviousId;
  if (record.comment === undefined) delete record.comment;
  return record;
}, ReadingCaptureInput);

export const ReadingAmendInput = z.object({ id: UUID, value: ReadingValue, reason: ReadingReason }).strict();
export type ReadingAmendInput = z.infer<typeof ReadingAmendInput>;
export const ReadingIdInput = z.object({ id: UUID });
export const ReadingMachineInput = z.object({ machineId: UUID });
export const MeterExtraction = z.object({ value: ReadingValue.nullable(), confidence: z.number().min(0).max(1) });
export type MeterExtraction = z.infer<typeof MeterExtraction>;

export const HourReading = z.object({
  id: UUID,
  machineId: UUID,
  sequence: z.number().int(),
  role: z.enum(readingRoles),
  value: ReadingValue,
  capturedAt: DateIso,
  capturedByUserId: AuthId,
  method: z.enum(readingMethods),
  comment: z.string().nullable(),
  photo: z
    .object({ byteSize: z.number(), contentType: z.string(), storageKey: z.string(), updatedAt: z.string() })
    .nullable(),
  aiHint: z.string().nullable(),
  aiValue: ReadingValue.nullable(),
  aiConfidence: z.number().min(0).max(1).nullable(),
  aiVerification: z.enum(readingVerifications),
  disputed: z.boolean(),
  disputeReason: z.string().nullable(),
  disputedPreviousId: UUID.nullable(),
  evidenceReviewedAt: DateIso.nullable(),
  amendedBy: AuthId.nullable(),
  amendedAt: DateIso.nullable(),
  amendmentReason: z.string().nullable(),
});
export type HourReading = z.infer<typeof HourReading>;
export const ReadingException = HourReading.extend({
  machineCode: z.string(),
  categoryIcon: CategoryIconKey,
  categoryColour: CategoryColour,
});
export type ReadingException = z.infer<typeof ReadingException>;

export const FieldReading = HourReading.pick({
  id: true,
  machineId: true,
  role: true,
  value: true,
  capturedAt: true,
  disputed: true,
}).extend({ photoBacked: z.boolean() });
export type FieldReading = z.infer<typeof FieldReading>;
