import { z } from 'zod';

import { DateIso, DateOnlyIso } from '../common/date.js';
import { DEPARTMENTS, Department } from '../common/departments.js';
import { createSearchedSortedPagedQueryInput, createSortedPagedQueryResult } from '../common/pagination.js';
import { JobCode, QuoteCode } from '../common/public-code.js';
import { nullableTrimmedText, nullableTrimmedTextInput, requiredTrimmedText } from '../common/text.js';
import { UUID } from '../common/uuid.js';
import { JobDocument } from '../documents/document.js';
import { PartUnitOfMeasure } from '../parts/part.js';

export { formatJobCode, JobCode } from '../common/public-code.js';

// Unordered list of job stages. Use JOB_STAGE_PIPELINE for ordered list.
export const JOB_STAGES = DEPARTMENTS;

export type JobStageName = z.infer<typeof JobStageName>;
export const JobStageName = Department;

export type BayName = z.infer<typeof BayName>;
export const BayName = requiredTrimmedText('Bay name is required').brand<'BayName'>();

export type Bay = z.infer<typeof Bay>;
export const Bay = z.object({
  id: UUID,
  department: Department,
  name: BayName,
  scheduleOrigin: DateIso,
  createdAt: DateIso,
  updatedAt: DateIso,
});

export type OffDay = z.infer<typeof OffDay>;
export const OffDay = z
  .object({
    date: DateOnlyIso,
    label: nullableTrimmedText(),
  })
  .strict();

export type BayCalendarExceptionDirection = z.infer<typeof BayCalendarExceptionDirection>;
export const BayCalendarExceptionDirection = z.enum(['work', 'off']);

export type BayCalendarException = z.infer<typeof BayCalendarException>;
export const BayCalendarException = z
  .object({
    bayId: UUID,
    date: DateOnlyIso,
    direction: BayCalendarExceptionDirection,
    label: nullableTrimmedText(),
  })
  .strict();

export type ToggleOffDayInput = z.infer<typeof ToggleOffDayInput>;
export const ToggleOffDayInput = z
  .object({
    date: DateOnlyIso,
    isOffDay: z.boolean(),
    label: nullableTrimmedTextInput(),
  })
  .strict();

export type AddBayCalendarExceptionInput = z.infer<typeof AddBayCalendarExceptionInput>;
export const AddBayCalendarExceptionInput = z
  .object({
    bayId: UUID,
    date: DateOnlyIso,
    direction: BayCalendarExceptionDirection,
    label: nullableTrimmedTextInput(),
  })
  .strict();

export type RemoveBayCalendarExceptionInput = z.infer<typeof RemoveBayCalendarExceptionInput>;
export const RemoveBayCalendarExceptionInput = z
  .object({
    bayId: UUID,
    date: DateOnlyIso,
  })
  .strict();

export type SlotSequence = z.infer<typeof SlotSequence>;
export const SlotSequence = z.int().positive().refine(Number.isSafeInteger);

export type SlotDurationDays = z.infer<typeof SlotDurationDays>;
export const SlotDurationDays = z.int().positive().refine(Number.isSafeInteger);

export type JobSlotPlacement = z.infer<typeof JobSlotPlacement>;
export const JobSlotPlacement = z.enum(['before', 'after']);

const JobSlotBase = z.object({
  id: UUID,
  bayId: UUID,
  sequence: SlotSequence,
  durationDays: SlotDurationDays,
  createdAt: DateIso,
  updatedAt: DateIso,
});

export type WorkJobSlot = z.infer<typeof WorkJobSlot>;
export const WorkJobSlot = JobSlotBase.extend({
  kind: z.literal('work'),
  jobStageId: UUID,
  label: z.null(),
});

export type IdleJobSlot = z.infer<typeof IdleJobSlot>;
export const IdleJobSlot = JobSlotBase.extend({
  kind: z.literal('idle'),
  jobStageId: z.null(),
  label: nullableTrimmedText(),
});

export type JobSlot = z.infer<typeof JobSlot>;
export const JobSlot = z.discriminatedUnion('kind', [WorkJobSlot, IdleJobSlot]);

const ProjectedJobSlotBase = JobSlotBase.extend({
  startAt: DateIso,
  endAt: DateIso,
});

export type ProjectedWorkJobSlot = z.infer<typeof ProjectedWorkJobSlot>;
export const ProjectedWorkJobSlot = ProjectedJobSlotBase.extend({
  kind: z.literal('work'),
  jobCode: JobCode,
  jobId: UUID,
  jobStageId: UUID,
  label: z.null(),
});

export type ProjectedIdleJobSlot = z.infer<typeof ProjectedIdleJobSlot>;
export const ProjectedIdleJobSlot = ProjectedJobSlotBase.extend({
  kind: z.literal('idle'),
  jobStageId: z.null(),
  label: nullableTrimmedText(),
});

export type ProjectedJobSlot = z.infer<typeof ProjectedJobSlot>;
export const ProjectedJobSlot = z.discriminatedUnion('kind', [ProjectedWorkJobSlot, ProjectedIdleJobSlot]);

export type BaySchedule = z.infer<typeof BaySchedule>;
export const BaySchedule = Bay.extend({
  nextAvailableAt: DateIso,
  slots: z.array(ProjectedJobSlot),
});

export type BayListResult = z.infer<typeof BayListResult>;
export const BayListResult = z.object({
  items: z.array(BaySchedule),
});

export type BookJobSlotInput = z.infer<typeof BookJobSlotInput>;
export const BookJobSlotInput = z
  .object({
    bayId: UUID,
    jobStageId: UUID,
    durationDays: SlotDurationDays,
  })
  .strict();

export type BookJobSlotResult = z.infer<typeof BookJobSlotResult>;
export const BookJobSlotResult = z.object({
  slot: JobSlot,
});

export type ResizeJobSlotInput = z.infer<typeof ResizeJobSlotInput>;
export const ResizeJobSlotInput = z
  .object({
    slotId: UUID,
    durationDays: SlotDurationDays,
  })
  .strict();

export type ResizeJobSlotResult = z.infer<typeof ResizeJobSlotResult>;
export const ResizeJobSlotResult = z.object({
  slot: JobSlot,
});

export type RemoveJobSlotInput = z.infer<typeof RemoveJobSlotInput>;
export const RemoveJobSlotInput = z
  .object({
    slotId: UUID,
  })
  .strict();

export type RemoveJobSlotResult = z.infer<typeof RemoveJobSlotResult>;
export const RemoveJobSlotResult = z.object({
  slot: JobSlot,
});

export type AddIdleJobSlotInput = z.infer<typeof AddIdleJobSlotInput>;
export const AddIdleJobSlotInput = z
  .object({
    targetSlotId: UUID,
    placement: JobSlotPlacement,
    durationDays: SlotDurationDays,
    label: nullableTrimmedText().optional(),
  })
  .strict();

export type AddIdleJobSlotResult = z.infer<typeof AddIdleJobSlotResult>;
export const AddIdleJobSlotResult = z.object({
  slot: JobSlot,
});

export type JobWorkState = z.infer<typeof JobWorkState>;
export const JobWorkState = z.enum(['pending', 'in-progress', 'complete']);

export type ProductSerialPrefix = z.infer<typeof ProductSerialPrefix>;
export const ProductSerialPrefix = requiredTrimmedText('Product serial prefix is required');

export type ProductSerialYear = z.infer<typeof ProductSerialYear>;
export const ProductSerialYear = z.int().min(0).max(99);

export type ProductSerialSequence = z.infer<typeof ProductSerialSequence>;
export const ProductSerialSequence = z.int().positive().refine(Number.isSafeInteger);

const ProductSerialNumberString = requiredTrimmedText(
  'Product serial number is required',
).brand<'ProductSerialNumber'>();

export type ProductSerialNumber = z.infer<typeof ProductSerialNumber>;
export const ProductSerialNumber = ProductSerialNumberString;

export type JobVinNumber = z.infer<typeof JobVinNumber>;
export const JobVinNumber = nullableTrimmedText();

export function formatProductSerialNumber({
  prefix,
  sequence,
  year,
}: {
  prefix: ProductSerialPrefix;
  sequence: ProductSerialSequence;
  year: ProductSerialYear;
}): ProductSerialNumber {
  return ProductSerialNumber.parse(
    `${prefix}${year.toString().padStart(2, '0')}${sequence.toString().padStart(4, '0')}`,
  );
}

export type ScheduleWindow = z.infer<typeof ScheduleWindow>;
export const ScheduleWindow = z.object({
  end: DateIso.nullable(),
  start: DateIso.nullable(),
});

const JobStageBase = z.object({
  id: UUID,
  jobId: UUID,
  sequence: z.int().min(1).max(5),
  state: JobWorkState,
});

const ProcurementJobStage = JobStageBase.extend({
  stage: z.literal('procurement'),
});
const SupplyJobStage = JobStageBase.extend({
  stage: z.literal('supply'),
});
const FabricationJobStage = JobStageBase.extend({
  stage: z.literal('fabrication'),
});
const PaintJobStage = JobStageBase.extend({
  stage: z.literal('paint'),
});
const AssemblyJobStage = JobStageBase.extend({
  stage: z.literal('assembly'),
});

export type JobStage = z.infer<typeof JobStage>;
export const JobStage = z.discriminatedUnion('stage', [
  ProcurementJobStage,
  SupplyJobStage,
  FabricationJobStage,
  PaintJobStage,
  AssemblyJobStage,
]);

const ProcurementJobStageSummary = ProcurementJobStage.extend({
  department: z.literal('procurement'),
});
const SupplyJobStageSummary = SupplyJobStage.extend({
  department: z.literal('supply'),
});
const FabricationJobStageSummary = FabricationJobStage.extend({
  department: z.literal('fabrication'),
});
const PaintJobStageSummary = PaintJobStage.extend({
  department: z.literal('paint'),
});
const AssemblyJobStageSummary = AssemblyJobStage.extend({
  department: z.literal('assembly'),
});

export type JobStageSummary = z.infer<typeof JobStageSummary>;
export const JobStageSummary = z.discriminatedUnion('stage', [
  ProcurementJobStageSummary,
  SupplyJobStageSummary,
  FabricationJobStageSummary,
  PaintJobStageSummary,
  AssemblyJobStageSummary,
]);

export type SummaryJobStage = z.infer<typeof SummaryJobStage>;
export const SummaryJobStage = z.discriminatedUnion('stage', [
  ProcurementJobStageSummary.extend({ access: z.literal('summary') }),
  SupplyJobStageSummary.extend({ access: z.literal('summary') }),
  FabricationJobStageSummary.extend({ access: z.literal('summary') }),
  PaintJobStageSummary.extend({ access: z.literal('summary') }),
  AssemblyJobStageSummary.extend({ access: z.literal('summary') }),
]);

export type VisibleJobStage = z.infer<typeof VisibleJobStage>;
export const VisibleJobStage = z.discriminatedUnion('stage', [
  ProcurementJobStageSummary.extend({ access: z.literal('visible') }),
  SupplyJobStageSummary.extend({ access: z.literal('visible') }),
  FabricationJobStageSummary.extend({ access: z.literal('visible') }),
  PaintJobStageSummary.extend({ access: z.literal('visible') }),
  AssemblyJobStageSummary.extend({ access: z.literal('visible') }),
]);

export type JobStageRollup = z.infer<typeof JobStageRollup>;
export const JobStageRollup = z.union([VisibleJobStage, SummaryJobStage]);

export type Job = z.infer<typeof Job>;
export const Job = z.object({
  id: UUID,
  code: JobCode,
  productId: UUID,
  // productSerialNumber is the full frozen serial; prefix, sequence, and year store its component parts.
  productSerialNumber: ProductSerialNumber,
  productSerialPrefix: ProductSerialPrefix,
  productSerialSequence: ProductSerialSequence,
  productSerialYear: ProductSerialYear,
  quoteId: UUID,
  vinNumber: JobVinNumber,
  createdAt: DateIso,
  updatedAt: DateIso,
});

export type JobSummary = z.infer<typeof JobSummary>;
export const JobSummary = Job.extend({
  customerCompanyName: z.string().trim().min(1).nullable(),
  productModelCode: z.string().trim().min(1),
  productName: z.string().trim().min(1),
  quoteCode: QuoteCode,
  stages: z.array(JobStageSummary).length(5),
});

export type JobSortBy = z.infer<typeof JobSortBy>;
export const JobSortBy = z.enum(['code', 'createdAt', 'id']);

export type JobListFilters = z.infer<typeof JobListFilters>;
export const JobListFilters = z
  .object({
    createdAtStart: DateIso.optional(),
    jobId: UUID.optional(),
  })
  .default({});

export type JobDetail = z.infer<typeof JobDetail>;
export const JobDetail = JobSummary.extend({
  cfo: z.array(
    z.object({
      assemblyName: z.string().trim().min(1),
      kind: z.enum(['standard', 'optional']),
      parts: z.array(
        z.object({
          partCode: z.string().trim().min(1),
          partId: UUID,
          partName: z.string().trim().min(1),
          quantity: z.int().min(1),
          unitOfMeasure: PartUnitOfMeasure,
        }),
      ),
    }),
  ),
  documents: z.array(JobDocument),
  stages: z.array(JobStageRollup).length(5),
});

export type JobCreateInput = z.infer<typeof JobCreateInput>;
export const JobCreateInput = z
  .object({
    quoteId: UUID,
  })
  .strict();

export type JobListInput = z.infer<typeof JobListInput>;
export const JobListInput = createSearchedSortedPagedQueryInput({
  shape: {
    filters: JobListFilters,
  },
  sortBy: JobSortBy.default('createdAt'),
});

export type JobListResult = z.infer<typeof JobListResult>;
export const JobListResult = createSortedPagedQueryResult(JobSummary, JobSortBy);
