import { z } from 'zod';
import { AuthId } from '../../auth/auth-id.js';
import { DateIso } from '../../common/date.js';
import { CursorQueryInput, createCursorQueryResult } from '../../common/pagination.js';
import { UUID } from '../../common/uuid.js';
import { CategoryColour, CategoryIconKey } from '../fleet/fleet.js';
import { RefusedJobAction } from '../jobs/job-actions.js';
import { readingMethods, readingRoles, telematicsProviders } from './reading-enums.js';
import { ReadingValue } from './reading-value.js';

export { ReadingValue };
export const ReadingReason = z.string().trim().min(1, 'A reason is required').max(2000);
export const ReadingComment = z.string().trim().min(1).max(2000);
export const StintOverrides = z
  .object({ implementId: UUID.nullable().optional(), driverUserId: AuthId.nullable().optional() })
  .strict();
export const ReadingCaptureInput = z
  .object({
    localId: UUID.optional(),
    expectedPreviousId: UUID.nullable().optional(),
    machineId: UUID,
    role: z.enum(readingRoles),
    assignmentId: UUID.nullable().optional(),
    stintOverrides: StintOverrides.optional(),
    value: ReadingValue,
    capturedAt: z.iso.datetime({ offset: true }),
    disputePrevious: z.boolean().default(false),
    comment: ReadingComment.nullable().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasAssignment = !!value.assignmentId;
    const stintRole = value.role === 'arrival' || value.role === 'departure';
    if (stintRole && !hasAssignment)
      ctx.addIssue({ code: 'custom', path: ['assignmentId'], message: 'Choose the Machine Assignment.' });
    if (value.role !== 'arrival' && value.stintOverrides !== undefined)
      ctx.addIssue({ code: 'custom', path: ['stintOverrides'], message: 'Only an arrival can change a stint.' });
    if (!stintRole && hasAssignment)
      ctx.addIssue({
        code: 'custom',
        path: ['assignmentId'],
        message: 'Only arrival and departure readings use a Machine Assignment.',
      });
  });
export type ReadingCaptureInput = z.infer<typeof ReadingCaptureInput>;
export const ReadingAmendment = z
  .object({ id: UUID, value: ReadingValue, capturedAt: z.iso.datetime({ offset: true }) })
  .strict();
export type ReadingAmendment = z.infer<typeof ReadingAmendment>;
/** The most readings one amend carries: the set is judged and written under the Machine lock. */
export const READING_AMENDMENTS_MAX = 8;
/** One reason over a set, so the Job page (one reading) and a Dispute (several) amend by one rule. */
export const ReadingAmendInput = z
  .object({ amendments: ReadingAmendment.array().min(1).max(READING_AMENDMENTS_MAX), reason: ReadingReason })
  .strict();
export type ReadingAmendInput = z.infer<typeof ReadingAmendInput>;
export const ReadingMachineInput = z.object({ machineId: UUID });

export const HourReading = z.object({
  id: UUID,
  machineId: UUID,
  sequence: z.number().int(),
  role: z.enum(readingRoles),
  value: ReadingValue,
  capturedAt: DateIso,
  /** Acceptance: when the server saved it, which never moves. */
  createdAt: DateIso,
  /** Null for a Telematics Reading: nobody captured it. */
  capturedByUserId: AuthId.nullable(),
  method: z.enum(readingMethods),
  telematicsProvider: z.enum(telematicsProviders).nullable(),
  comment: z.string().nullable(),
  disputed: z.boolean(),
  disputeReason: z.string().nullable(),
  disputedPreviousId: UUID.nullable(),
  amendedBy: AuthId.nullable(),
  amendedAt: DateIso.nullable(),
  amendmentReason: z.string().nullable(),
});
export type HourReading = z.infer<typeof HourReading>;
/** The stint an arrival or departure bounds, as its two readings' Read Ats bound it. */
export const ReadingStint = z.object({
  assignmentId: UUID,
  jobId: UUID,
  jobNumber: z.string(),
  arrivedAt: DateIso.nullable(),
  departedAt: DateIso.nullable(),
});
export type ReadingStint = z.infer<typeof ReadingStint>;
export const DisputeReading = HourReading.extend({
  capturedByName: z.string().nullable(),
  /** Null for a spot reading. */
  stint: ReadingStint.nullable(),
});
export type DisputeReading = z.infer<typeof DisputeReading>;
/** A Dispute: a connected group of Disputed readings on one Machine, resolved at once. */
export const ReadingDispute = z.object({
  /** The first reading's id: stable while the group stands. */
  id: UUID,
  machineId: UUID,
  machineCode: z.string(),
  categoryIcon: CategoryIconKey,
  categoryColour: CategoryColour,
  /** In ledger order. */
  readings: DisputeReading.array().min(1),
  /** The Telematics Reading the group contradicts, shown read-only, or null for a human pair. */
  reported: HourReading.pick({ id: true, value: true, capturedAt: true, telematicsProvider: true }).nullable(),
  /** The loudest reason among the readings. */
  reason: z.string(),
});
export type ReadingDispute = z.infer<typeof ReadingDispute>;

/** The Machine's latest reading, the one a capture is judged against. */
export const LatestReading = HourReading.pick({
  id: true,
  role: true,
  value: true,
  capturedAt: true,
  telematicsProvider: true,
});
export type LatestReading = z.infer<typeof LatestReading>;

const SuggestingReport = z.object({
  value: ReadingValue,
  capturedAt: DateIso,
  telematicsProvider: z.enum(telematicsProviders),
});
/** When John Deere puts a refused capture's value, as the refusal carries it: the report it matched, or the two it fell between. */
export const ReadAtSuggestion = z.object({
  readAt: DateIso,
  floor: SuggestingReport,
  ceiling: SuggestingReport.nullable(),
});
export type ReadAtSuggestion = z.infer<typeof ReadAtSuggestion>;

/**
 * What a Reading refusal carries beside its sentence and `appCode`: the Job Action a Job refused, the Read At John
 * Deere puts a refused value at, and the reading an amendment of several was refused on.
 */
export const ReadingRefusal = z.object({
  refused: RefusedJobAction.optional(),
  suggestedReadAt: ReadAtSuggestion.optional(),
  readingId: UUID.optional(),
});
export type ReadingRefusal = z.infer<typeof ReadingRefusal>;

/** Each key read on its own, so one this client cannot read never costs it the others. */
const ReadingRefusalReader = z
  .object({
    refused: ReadingRefusal.shape.refused.catch(undefined),
    suggestedReadAt: ReadingRefusal.shape.suggestedReadAt.catch(undefined),
    readingId: ReadingRefusal.shape.readingId.catch(undefined),
  })
  .catch({});

/** A Reading refusal's context from whatever the transport carried; anything unreadable carries none. */
export const readingRefusalOf = (data: unknown): ReadingRefusal => ReadingRefusalReader.parse(data);

export const FieldReading = HourReading.pick({
  id: true,
  machineId: true,
  role: true,
  value: true,
  capturedAt: true,
  disputed: true,
  telematicsProvider: true,
}).extend({ capturedByName: z.string().nullable() });
export type FieldReading = z.infer<typeof FieldReading>;
/** One page of a Machine's Hour Readings, newest first, for the phone's Readings tab. */
export const FieldReadingPageInput = CursorQueryInput.extend({ machineId: UUID });
export type FieldReadingPageInput = z.infer<typeof FieldReadingPageInput>;
export const FieldReadingPage = createCursorQueryResult(FieldReading);
export type FieldReadingPage = z.infer<typeof FieldReadingPage>;
