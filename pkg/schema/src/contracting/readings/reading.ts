import { z } from 'zod';
import { AuthId } from '../../auth/auth-id.js';
import { DateIso } from '../../common/date.js';
import { CursorQueryInput, createCursorQueryResult } from '../../common/pagination.js';
import { UUID } from '../../common/uuid.js';
import { readingMethods, telematicsProviders } from './reading-enums.js';
import { ReadingValue } from './reading-value.js';

export { ReadingValue };
export const ReadingReason = z.string().trim().min(1, 'A reason is required').max(2000);
export const ReadingComment = z.string().trim().min(1).max(2000);
/** A spot reading: one Machine's meter at a precise Read At. Job Hours are captured on the Machine Assignment. */
export const ReadingCaptureInput = z
  .object({
    localId: UUID.optional(),
    machineId: UUID,
    value: ReadingValue,
    capturedAt: z.iso.datetime({ offset: true }),
    comment: ReadingComment.nullable().optional(),
  })
  .strict();
export type ReadingCaptureInput = z.infer<typeof ReadingCaptureInput>;
export const ReadingAmendment = z
  .object({ id: UUID, value: ReadingValue, capturedAt: z.iso.datetime({ offset: true }) })
  .strict();
export type ReadingAmendment = z.infer<typeof ReadingAmendment>;
/** The most readings one amend carries: the set is judged and written under the Machine lock. */
export const READING_AMENDMENTS_MAX = 8;
/** One reason over a set of one Machine's spot readings. */
export const ReadingAmendInput = z
  .object({ amendments: ReadingAmendment.array().min(1).max(READING_AMENDMENTS_MAX), reason: ReadingReason })
  .strict();
export type ReadingAmendInput = z.infer<typeof ReadingAmendInput>;
export const ReadingMachineInput = z.object({ machineId: UUID });

export const HourReading = z.object({
  id: UUID,
  machineId: UUID,
  sequence: z.number().int(),
  value: ReadingValue,
  capturedAt: DateIso,
  /** Acceptance: when the server saved it, which never moves. */
  createdAt: DateIso,
  /** Null for a Telematics Reading: nobody captured it. */
  capturedByUserId: AuthId.nullable(),
  method: z.enum(readingMethods),
  telematicsProvider: z.enum(telematicsProviders).nullable(),
  comment: z.string().nullable(),
  amendedBy: AuthId.nullable(),
  amendedAt: DateIso.nullable(),
  amendmentReason: z.string().nullable(),
});
export type HourReading = z.infer<typeof HourReading>;
/** The Machine's latest reading, the one a capture is judged against. */
export const LatestReading = HourReading.pick({
  id: true,
  value: true,
  capturedAt: true,
  telematicsProvider: true,
});
export type LatestReading = z.infer<typeof LatestReading>;

/** What the spot capture form asks the ledger for: when `value` was on the Machine's meter. */
export const ReadAtEstimateInput = z.object({ machineId: UUID, value: ReadingValue }).strict();
export type ReadAtEstimateInput = z.infer<typeof ReadAtEstimateInput>;
const EstimateNeighbour = HourReading.pick({ value: true, capturedAt: true, telematicsProvider: true });
const EstimatedReadAt = {
  readAt: DateIso,
  floor: EstimateNeighbour,
  ceiling: EstimateNeighbour.nullable(),
  overAWeek: z.boolean(),
};
/**
 * When the ledger says a value was on the meter: nothing to go on, now, no date at all (with the sentence why), or a
 * moment between two readings, locked when John Deere reported both and a guess otherwise.
 */
export const ReadAtEstimate = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('now') }),
  z.object({ kind: z.literal('impossible'), sentence: z.string() }),
  z.object({ kind: z.literal('telematics'), ...EstimatedReadAt }),
  z.object({ kind: z.literal('human'), ...EstimatedReadAt }),
]);
export type ReadAtEstimate = z.infer<typeof ReadAtEstimate>;

/**
 * What a Reading refusal carries beside its sentence and `appCode`: the Read At the ledger puts a refused value at
 * (only ever a `telematics` or `human` estimate), and the reading an amendment of several was refused on.
 */
export const ReadingRefusal = z.object({
  suggestedReadAt: ReadAtEstimate.optional(),
  readingId: UUID.optional(),
});
export type ReadingRefusal = z.infer<typeof ReadingRefusal>;

/** Each key read on its own, so one this client cannot read never costs it the others. */
const ReadingRefusalReader = z
  .object({
    suggestedReadAt: ReadingRefusal.shape.suggestedReadAt.catch(undefined),
    readingId: ReadingRefusal.shape.readingId.catch(undefined),
  })
  .catch({});

/** A Reading refusal's context from whatever the transport carried; anything unreadable carries none. */
export const readingRefusalOf = (data: unknown): ReadingRefusal => ReadingRefusalReader.parse(data);

export const FieldReading = HourReading.pick({
  id: true,
  machineId: true,
  value: true,
  capturedAt: true,
  telematicsProvider: true,
}).extend({ capturedByName: z.string().nullable() });
export type FieldReading = z.infer<typeof FieldReading>;
/** One page of a Machine's Hour Readings, newest first, for the phone's Readings tab. */
export const FieldReadingPageInput = CursorQueryInput.extend({ machineId: UUID });
export type FieldReadingPageInput = z.infer<typeof FieldReadingPageInput>;
export const FieldReadingPage = createCursorQueryResult(FieldReading);
export type FieldReadingPage = z.infer<typeof FieldReadingPage>;
