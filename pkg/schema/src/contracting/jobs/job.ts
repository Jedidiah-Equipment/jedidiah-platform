import { z } from 'zod';
import { AuthId } from '../../auth/auth-id.js';
import { DateIso, DateOnlyIso } from '../../common/date.js';
import { createCursorQueryResult, createSearchedSortedCursorQueryInput } from '../../common/pagination.js';
import { nullableTrimmedTextInput, nullableTrimmedTextInputOptional, requiredTrimmedText } from '../../common/text.js';
import { UUID } from '../../common/uuid.js';
import { CategoryColour, CategoryIconKey, FleetCode, FleetName } from '../fleet/fleet.js';
import { RateBasis } from '../rate-card/rate-card.js';
import { HourReading, ReadingValue } from '../readings/reading.js';
import { JobActions } from './job-actions.js';
import { assignmentStates, discountKinds, jobQueues, jobStatuses } from './job-enums.js';

export const Hours = z.number().nonnegative().max(999999999.9).multipleOf(0.1);
export const Litres = z.number().nonnegative().max(9999999999.99).multipleOf(0.01);
export const Quantity = z.number().positive().max(9999999999.99).multipleOf(0.01);
export const Money = z.number().nonnegative().max(9999999999.99).multipleOf(0.01);
export const JobDescription = nullableTrimmedTextInput();
export const JobNumber = z.string().regex(/^CJOB-\d{5,}$/, 'Enter a Job Number like CJOB-00037');

export const JobCreateInput = z
  .object({
    customerId: UUID,
    farmId: UUID,
    workTypeId: UUID,
    description: JobDescription,
    foremanUserId: AuthId.nullable().default(null),
  })
  .strict();
export type JobCreateInput = z.infer<typeof JobCreateInput>;

export const JobPatchInput = z
  .object({
    id: UUID,
    customerId: UUID.optional(),
    farmId: UUID.optional(),
    workTypeId: UUID.optional(),
    description: nullableTrimmedTextInputOptional(),
    foremanUserId: AuthId.nullable().optional(),
    notes: nullableTrimmedTextInputOptional(),
    startDate: DateOnlyIso.optional(),
    endDate: DateOnlyIso.optional(),
    dieselLitres: Litres.optional(),
  })
  .strict();
export type JobPatchInput = z.infer<typeof JobPatchInput>;

export const JobCancelInput = z
  .object({ id: UUID, reason: requiredTrimmedText('A cancellation reason is required') })
  .strict();
export type JobCancelInput = z.infer<typeof JobCancelInput>;

export const JobCompleteInput = z
  .object({
    id: UUID,
    startDate: DateOnlyIso,
    endDate: DateOnlyIso,
    dieselLitres: Litres,
    notes: JobDescription,
    removePlannedAssignmentIds: z.array(UUID).default([]),
  })
  .strict()
  .refine((value) => value.startDate <= value.endDate, {
    path: ['endDate'],
    message: 'End date is before start date',
  });
export type JobCompleteInput = z.infer<typeof JobCompleteInput>;

export const JobSortBy = z.enum(['jobNumber', 'invoicedAt']);
export const JobListInput = createSearchedSortedCursorQueryInput({
  shape: {
    queues: z.array(z.enum(jobQueues)).min(1),
    /** Keep only Jobs invoiced on or after this South African calendar day; a Job not yet invoiced drops out. */
    invoicedFrom: DateOnlyIso.optional(),
    /** Keep only Jobs invoiced on or before this South African calendar day; a Job not yet invoiced drops out. */
    invoicedTo: DateOnlyIso.optional(),
  },
  sortBy: JobSortBy.default('jobNumber'),
});
export type JobListInput = z.infer<typeof JobListInput>;
export const JobLookupInput = z.union([z.object({ id: UUID }).strict(), z.object({ code: JobNumber }).strict()]);
export type JobLookupInput = z.infer<typeof JobLookupInput>;
export const JobQueueCounts = z.record(z.enum(jobQueues), z.number().int().nonnegative());
export type JobQueueCounts = z.infer<typeof JobQueueCounts>;

export const AssignmentPlanInput = z
  .object({
    jobId: UUID,
    machineId: UUID,
    implementId: UUID.nullable().default(null),
    driverUserId: AuthId.nullable().optional(),
  })
  .strict();
export type AssignmentPlanInput = z.infer<typeof AssignmentPlanInput>;
export const AssignmentPatchInput = z
  .object({
    id: UUID,
    implementId: UUID.nullable().optional(),
    driverUserId: AuthId.nullable().optional(),
    travelIncluded: z.boolean().optional(),
  })
  .strict();
export type AssignmentPatchInput = z.infer<typeof AssignmentPatchInput>;
export const AssignmentIdInput = z.object({ id: UUID }).strict();
export const GapResolveInput = z
  .object({
    id: UUID,
    travelHours: Hours,
    unaccountedHours: Hours,
    reason: requiredTrimmedText('A reason is required'),
  })
  .strict();
export type GapResolveInput = z.infer<typeof GapResolveInput>;
export const MeasureSetInput = z.object({ assignmentId: UUID, measureTypeId: UUID, quantity: Quantity }).strict();
export type MeasureSetInput = z.infer<typeof MeasureSetInput>;
export const MeasureRemoveInput = z.object({ assignmentId: UUID, measureTypeId: UUID }).strict();
export type MeasureRemoveInput = z.infer<typeof MeasureRemoveInput>;
export const ChargeLineCreateInput = z
  .object({ jobId: UUID, description: requiredTrimmedText('A description is required') })
  .strict();
export type ChargeLineCreateInput = z.infer<typeof ChargeLineCreateInput>;
export const ChargeLinePatchInput = z
  .object({
    id: UUID,
    description: requiredTrimmedText('A description is required').optional(),
    amount: Money.nullable().optional(),
  })
  .strict();
export type ChargeLinePatchInput = z.infer<typeof ChargeLinePatchInput>;
export const ChargeLineIdInput = z.object({ id: UUID }).strict();

export const Measure = z.object({
  id: UUID,
  measureTypeId: UUID,
  measureTypeName: z.string(),
  quantity: Quantity,
});
export type Measure = z.infer<typeof Measure>;

export const ChargeLine = z.object({
  id: UUID,
  description: z.string(),
  amount: Money.nullable(),
  displayOrder: z.number().int(),
});
export type ChargeLine = z.infer<typeof ChargeLine>;

export const jobReadingAttentionKinds = [
  'disputed',
  'ai-pending',
  'ai-disagrees',
  'ai-low-confidence',
  'missing-photo',
] as const;
export type JobReadingAttentionKind = (typeof jobReadingAttentionKinds)[number];
/** The sign-off projection carries evidence without exposing photo storage metadata. */
export const JobReading = HourReading.pick({
  id: true,
  role: true,
  value: true,
  capturedAt: true,
  capturedByUserId: true,
  method: true,
  comment: true,
  aiValue: true,
  aiConfidence: true,
  aiVerification: true,
  aiHint: true,
  disputed: true,
  disputeReason: true,
  evidenceReviewedAt: true,
  amendedAt: true,
  amendmentReason: true,
}).extend({
  photoBacked: z.boolean(),
  capturedByName: z.string().nullable(),
  amendedByName: z.string().nullable(),
  /** Every attention kind on the reading, notices included; the domain assigns each its level. */
  attention: z.array(z.enum(jobReadingAttentionKinds)),
});
export type JobReading = z.infer<typeof JobReading>;

/** What names a Machine Assignment on every read: the Job sheet's Assignment and the phone's FieldStint. */
export const assignmentIdentityShape = {
  id: UUID,
  jobId: UUID,
  machineId: UUID,
  machineCode: FleetCode,
  categoryName: FleetName,
  categoryIcon: CategoryIconKey,
  categoryColour: CategoryColour,
  implementId: UUID.nullable(),
  implementCode: FleetCode.nullable(),
  driverUserId: AuthId.nullable(),
  driverName: z.string().nullable(),
  state: z.enum(assignmentStates),
  createdAt: DateIso,
};

export const StintPricing = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('no-charge') }),
  z.object({
    kind: z.literal('rate'),
    rateId: UUID,
    name: z.string(),
    basis: RateBasis,
    measureTypeId: UUID.nullable(),
    measureTypeName: z.string().nullable(),
    unitAmount: Money,
    billedQuantity: z.number().nonnegative(),
    measureMissing: z.boolean(),
    computedAmount: Money,
    finalAmount: Money,
    amountEdited: z.boolean(),
  }),
]);
export type StintPricing = z.infer<typeof StintPricing>;

/** The Machine's departure that opens an Assignment's Hour Gap, and the Job it left. */
export const PreviousDeparture = z.object({
  value: ReadingValue,
  capturedAt: DateIso,
  /** Null when this reader may not see that Job. */
  job: z
    .object({ jobNumber: JobNumber, status: z.enum(jobStatuses), customerName: z.string(), farmName: z.string() })
    .nullable(),
});
export type PreviousDeparture = z.infer<typeof PreviousDeparture>;

export const Assignment = z.object({
  ...assignmentIdentityShape,
  arrival: JobReading.nullable(),
  departure: JobReading.nullable(),
  /** Null before arrival, and for a Machine's first arrival, which has no Hour Gap. */
  previousDeparture: PreviousDeparture.nullable(),
  travelIncluded: z.boolean(),
  workHours: Hours.nullable(),
  gapHours: Hours.nullable(),
  travelHours: Hours,
  unaccountedHours: Hours,
  billableHours: Hours.nullable(),
  gapFlag: z.boolean(),
  gapResolved: z.boolean(),
  gapReason: z.string().nullable(),
  measures: z.array(Measure),
  /** Null while the stint is un-priced, or when money is redacted for this reader. */
  pricing: StintPricing.nullable(),
});
export type Assignment = z.infer<typeof Assignment>;

/** What names a Job on every read: the queues' JobSummary and the phone's FieldJob. */
export const jobIdentityShape = {
  id: UUID,
  code: z.number().int().positive(),
  jobNumber: JobNumber,
  status: z.enum(jobStatuses),
  customerName: z.string(),
  farmName: z.string(),
  workTypeName: z.string(),
  description: z.string().nullable(),
  foremanUserId: AuthId.nullable(),
};

const jobSummaryShape = {
  ...jobIdentityShape,
  customerId: UUID,
  farmId: UUID,
  workTypeId: UUID,
  foremanName: z.string().nullable(),
  plannedStints: z.number().int().nonnegative(),
  onSiteStints: z.number().int().nonnegative(),
  leftStints: z.number().int().nonnegative(),
  looksFinished: z.boolean(),
  openGapFlags: z.number().int().nonnegative(),
  /** The Job's Machine Assignment attention that needs a look, counted at each level: notices never count. */
  assignmentAttention: z.object({ critical: z.number().int().nonnegative(), warning: z.number().int().nonnegative() }),
  startDate: DateOnlyIso.nullable(),
  endDate: DateOnlyIso.nullable(),
  pricedAt: DateIso.nullable(),
  pricedTotal: Money.nullable(),
  invoiceNumber: z.string().nullable(),
  invoicedAt: DateIso.nullable(),
  createdAt: DateIso,
  updatedAt: DateIso,
};
export const JobSummary = z.object(jobSummaryShape);
export type JobSummary = z.infer<typeof JobSummary>;
export const JobListResult = createCursorQueryResult(JobSummary);
export type JobListResult = z.infer<typeof JobListResult>;

export const PricingGate = z.object({
  ok: z.boolean(),
  unpricedStints: z.number().int().nonnegative(),
  chargeLinesWithoutAmount: z.number().int().nonnegative(),
  dieselUnpriced: z.boolean(),
});
export type PricingGate = z.infer<typeof PricingGate>;
/** Live while the Job is Completed; recomputed from the frozen snapshot once Priced. */
export const JobPricing = z.object({
  stintsTotal: Money,
  chargeLinesTotal: Money,
  subtotal: Money,
  discountAmount: Money,
  dieselAmount: Money,
  total: Money,
  gate: PricingGate,
});
export type JobPricing = z.infer<typeof JobPricing>;

export const JobDiesel = z.object({ unitPrice: Money, amount: Money, amountEdited: z.boolean() });
export type JobDiesel = z.infer<typeof JobDiesel>;
export const JobDiscount = z.object({ kind: z.enum(discountKinds), value: Money, amount: Money });
export type JobDiscount = z.infer<typeof JobDiscount>;

/** One Job read for no one in particular: what writes return and what core reasons over. */
export const JobFacts = z.object({
  ...jobSummaryShape,
  notes: z.string().nullable(),
  dieselLitres: Litres,
  /** Null until Diesel is priced, or when money is redacted. `dieselLitres` is not money and stays top-level. */
  diesel: JobDiesel.nullable(),
  discount: JobDiscount.nullable(),
  completedAt: DateIso.nullable(),
  invoicedByName: z.string().nullable(),
  cancellationReason: z.string().nullable(),
  reopenedAt: DateIso.nullable(),
  repricingNote: z.string().nullable(),
  pricing: JobPricing,
  assignments: z.array(Assignment),
  chargeLines: z.array(ChargeLine),
});
export type JobFacts = z.infer<typeof JobFacts>;

/** One Job as the person asking reads it: the facts, what they may do to it, and no money for a Foreman. */
export const JobDetail = JobFacts.extend({ pricing: JobPricing.nullable(), actions: JobActions });
export type JobDetail = z.infer<typeof JobDetail>;
