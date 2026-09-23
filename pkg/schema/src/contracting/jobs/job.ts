import { z } from 'zod';
import { AuthId } from '../../auth/auth-id.js';
import { DateIso, DateOnlyIso } from '../../common/date.js';
import { nullableTrimmedTextInput, nullableTrimmedTextInputOptional, requiredTrimmedText } from '../../common/text.js';
import { UUID } from '../../common/uuid.js';
import { CategoryColour, CategoryIconKey } from '../fleet/fleet.js';
import { RateBasis } from '../rate-card/rate-card.js';
import { HourReading } from '../readings/reading.js';
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

export const JobListInput = z
  .object({
    queue: z.enum(jobQueues),
    limit: z.number().int().positive().max(200).default(50),
    offset: z.number().int().nonnegative().default(0),
    /** First day of a month; filters the invoiced queue to Jobs stamped in that South African month. */
    invoicedInMonth: DateOnlyIso.optional(),
  })
  .strict();
export type JobListInput = z.infer<typeof JobListInput>;
export const JobLookupInput = z.union([z.object({ id: UUID }).strict(), z.object({ code: JobNumber }).strict()]);
export type JobLookupInput = z.infer<typeof JobLookupInput>;
export const JobIdInput = z.object({ id: UUID }).strict();
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
export const AssignmentAddInput = AssignmentPlanInput;
export type AssignmentAddInput = z.infer<typeof AssignmentAddInput>;
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
  needsALook: z.array(z.enum(jobReadingAttentionKinds)),
});
export type JobReading = z.infer<typeof JobReading>;

export const Assignment = z.object({
  id: UUID,
  jobId: UUID,
  machineId: UUID,
  machineCode: z.string(),
  categoryName: z.string(),
  categoryIcon: CategoryIconKey,
  categoryColour: CategoryColour,
  implementId: UUID.nullable(),
  implementCode: z.string().nullable(),
  driverUserId: AuthId.nullable(),
  driverName: z.string().nullable(),
  state: z.enum(assignmentStates),
  createdAt: DateIso,
  arrival: JobReading.nullable(),
  departure: JobReading.nullable(),
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
  rateId: UUID.nullable(),
  rateName: z.string().nullable(),
  rateBasis: RateBasis.nullable(),
  rateMeasureTypeId: UUID.nullable(),
  /** The measure Rate's unit, named even when the stint has no Measure of that type. */
  rateMeasureTypeName: z.string().nullable(),
  rateUnitAmount: Money.nullable(),
  computedAmount: Money.nullable(),
  finalAmount: Money.nullable(),
  /** The final amount differs from the computed one: a pricer typed it. */
  amountEdited: z.boolean(),
  /** A measure Rate is chosen but the stint has no Measure of its type, so it bills 0. */
  measureMissing: z.boolean(),
  /** Hours or Measure quantity the chosen Rate bills; null while the stint is un-priced. */
  billedQuantity: z.number().nonnegative().nullable(),
});
export type Assignment = z.infer<typeof Assignment>;

const jobSummaryShape = {
  id: UUID,
  code: z.number().int().positive(),
  jobNumber: JobNumber,
  customerId: UUID,
  customerName: z.string(),
  farmId: UUID,
  farmName: z.string(),
  workTypeId: UUID,
  workTypeName: z.string(),
  description: z.string().nullable(),
  foremanUserId: AuthId.nullable(),
  foremanName: z.string().nullable(),
  status: z.enum(jobStatuses),
  plannedStints: z.number().int().nonnegative(),
  onSiteStints: z.number().int().nonnegative(),
  leftStints: z.number().int().nonnegative(),
  looksFinished: z.boolean(),
  openGapFlags: z.number().int().nonnegative(),
  needsALook: z.number().int().nonnegative(),
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

export const JobDetail = z.object({
  ...jobSummaryShape,
  notes: z.string().nullable(),
  dieselLitres: Litres,
  dieselUnitPrice: Money.nullable(),
  dieselAmount: Money.nullable(),
  dieselAmountEdited: z.boolean(),
  discountKind: z.enum(discountKinds).nullable(),
  discountValue: Money.nullable(),
  discountAmount: Money.nullable(),
  pricedSubtotal: Money.nullable(),
  completedAt: DateIso.nullable(),
  invoicedByName: z.string().nullable(),
  cancellationReason: z.string().nullable(),
  reopenedAt: DateIso.nullable(),
  repricingNote: z.string().nullable(),
  pricing: JobPricing.nullable(),
  assignments: z.array(Assignment),
  chargeLines: z.array(ChargeLine),
});
export type JobDetail = z.infer<typeof JobDetail>;
