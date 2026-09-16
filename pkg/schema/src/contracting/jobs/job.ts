import { z } from 'zod';
import { AuthId } from '../../auth/auth-id.js';
import { DateIso, DateOnlyIso } from '../../common/date.js';
import { nullableTrimmedTextInput, nullableTrimmedTextInputOptional, requiredTrimmedText } from '../../common/text.js';
import { UUID } from '../../common/uuid.js';
import { FieldReading } from '../readings/reading.js';
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
  })
  .strict();
export type JobListInput = z.infer<typeof JobListInput>;
export const JobLookupInput = z.union([z.object({ id: UUID }).strict(), z.object({ code: JobNumber }).strict()]);
export type JobLookupInput = z.infer<typeof JobLookupInput>;
export const JobIdInput = z.object({ id: UUID }).strict();

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

export const Assignment = z.object({
  id: UUID,
  jobId: UUID,
  machineId: UUID,
  machineCode: z.string(),
  categoryName: z.string(),
  categoryIcon: z.string(),
  categoryColour: z.string(),
  implementId: UUID.nullable(),
  implementCode: z.string().nullable(),
  driverUserId: AuthId.nullable(),
  driverName: z.string().nullable(),
  state: z.enum(assignmentStates),
  arrival: FieldReading.nullable(),
  departure: FieldReading.nullable(),
  travelIncluded: z.boolean(),
  workHours: Hours.nullable(),
  gapHours: Hours.nullable(),
  travelHours: Hours,
  unaccountedHours: Hours,
  billableHours: Hours.nullable(),
  gapFlag: z.boolean(),
  gapResolved: z.boolean(),
  measures: z.array(Measure),
  rateId: UUID.nullable(),
  rateName: z.string().nullable(),
  rateBasis: z.string().nullable(),
  rateMeasureTypeId: UUID.nullable(),
  rateUnitAmount: Money.nullable(),
  computedAmount: Money.nullable(),
  finalAmount: Money.nullable(),
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
  createdAt: DateIso,
  updatedAt: DateIso,
};
export const JobSummary = z.object(jobSummaryShape);
export type JobSummary = z.infer<typeof JobSummary>;

export const JobDetail = z.object({
  ...jobSummaryShape,
  notes: z.string().nullable(),
  dieselLitres: Litres,
  dieselUnitPrice: Money.nullable(),
  dieselAmount: Money.nullable(),
  discountKind: z.enum(discountKinds).nullable(),
  discountValue: Money.nullable(),
  discountAmount: Money.nullable(),
  pricedSubtotal: Money.nullable(),
  pricedTotal: Money.nullable(),
  completedAt: DateIso.nullable(),
  pricedAt: DateIso.nullable(),
  invoiceNumber: z.string().nullable(),
  invoicedAt: DateIso.nullable(),
  cancellationReason: z.string().nullable(),
  assignments: z.array(Assignment),
  chargeLines: z.array(ChargeLine),
});
export type JobDetail = z.infer<typeof JobDetail>;
