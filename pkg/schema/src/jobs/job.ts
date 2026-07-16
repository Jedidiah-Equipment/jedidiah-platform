import { z } from 'zod';
import { AuthId } from '../auth/auth-id.js';
import { UserSummary } from '../auth/authorization.js';
import { DateIso, DateOnlyIso } from '../common/date.js';
import { Department } from '../common/departments.js';
import { createSearchedSortedPagedQueryInput, createSortedPagedQueryResult } from '../common/pagination.js';
import { JobCode, QuoteCode } from '../common/public-code.js';
import { nullableTrimmedText, nullableTrimmedTextInput, requiredTrimmedText } from '../common/text.js';
import { NullableThumbnailDataUrl } from '../common/thumbnail.js';
import { UUID } from '../common/uuid.js';
import { JobDocument } from '../documents/document.js';
import { PartUnitOfMeasure } from '../parts/part.js';
import { ProductBuildTimeDays } from '../products/product-shared.js';
import { QuoteKind, QuoteWorkTitle } from '../quotes/quote-shared.js';

export { formatJobCode, JobCode } from '../common/public-code.js';

export type BayName = z.infer<typeof BayName>;
export const BayName = requiredTrimmedText('Bay name is required').brand<'BayName'>();

export type BayOperator = z.infer<typeof BayOperator>;
export const BayOperator = UserSummary.pick({
  email: true,
  id: true,
  name: true,
  thumbnailDataUrl: true,
});

export type Bay = z.infer<typeof Bay>;
export const Bay = z.object({
  id: UUID,
  department: Department,
  name: BayName,
  currentOperator: BayOperator.nullable().default(null),
  /** Date-only Slot Projection anchor — a plant business date. */
  scheduleOrigin: DateOnlyIso,
  disabledAt: DateIso.nullable(),
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

export type ToggleOffDayResult = z.infer<typeof ToggleOffDayResult>;
export const ToggleOffDayResult = z.object({
  offDay: OffDay.nullable(),
});

export type AddBayCalendarExceptionInput = z.infer<typeof AddBayCalendarExceptionInput>;
export const AddBayCalendarExceptionInput = z
  .object({
    bayId: UUID,
    date: DateOnlyIso,
    direction: BayCalendarExceptionDirection,
    label: nullableTrimmedTextInput(),
  })
  .strict();

export type AddBayCalendarExceptionResult = z.infer<typeof AddBayCalendarExceptionResult>;
export const AddBayCalendarExceptionResult = z.object({
  exception: BayCalendarException,
});

export type RemoveBayCalendarExceptionInput = z.infer<typeof RemoveBayCalendarExceptionInput>;
export const RemoveBayCalendarExceptionInput = z
  .object({
    bayId: UUID,
    date: DateOnlyIso,
  })
  .strict();

export type RemoveBayCalendarExceptionResult = z.infer<typeof RemoveBayCalendarExceptionResult>;
export const RemoveBayCalendarExceptionResult = z.object({
  exception: BayCalendarException.nullable(),
});

export type SlotSequence = z.infer<typeof SlotSequence>;
export const SlotSequence = z.int().positive().refine(Number.isSafeInteger);

export type SlotDurationDays = z.infer<typeof SlotDurationDays>;
export const SlotDurationDays = z.int().positive().refine(Number.isSafeInteger);

export type JobSlotPlacement = z.infer<typeof JobSlotPlacement>;
export const JobSlotPlacement = z.enum(['before', 'after']);

export type JobSlotMoveDirection = z.infer<typeof JobSlotMoveDirection>;
export const JobSlotMoveDirection = z.enum(['left', 'right']);

export type JobSlotState = z.infer<typeof JobSlotState>;
export const JobSlotState = z.enum(['done', 'active', 'scheduled']);

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
  jobId: UUID,
  label: z.null(),
});

export type IdleJobSlot = z.infer<typeof IdleJobSlot>;
export const IdleJobSlot = JobSlotBase.extend({
  kind: z.literal('idle'),
  jobId: z.null(),
  label: nullableTrimmedText(),
});

export type JobSlot = z.infer<typeof JobSlot>;
export const JobSlot = z.discriminatedUnion('kind', [WorkJobSlot, IdleJobSlot]);

export type ProjectedJobSlotPreviewSplit = z.infer<typeof ProjectedJobSlotPreviewSplit>;
export const ProjectedJobSlotPreviewSplit = z
  .object({
    half: z.enum(['before', 'after']),
    sourceSlotId: z.string().trim().min(1),
  })
  .strict();

const ProjectedJobSlotBase = JobSlotBase.extend({
  // Preview split halves carry synthetic ids like `<slot>:before`; mutation inputs still require UUIDs.
  id: z.string().trim().min(1),
  startDate: DateOnlyIso,
  endDate: DateOnlyIso,
  // Geometry reads the half-open [startDate, endDate) span; date labels read these instead.
  firstWorkDay: DateOnlyIso,
  lastWorkDay: DateOnlyIso,
  state: JobSlotState,
  previewSplit: ProjectedJobSlotPreviewSplit.optional(),
});

export type ProjectedWorkJobSlot = z.infer<typeof ProjectedWorkJobSlot>;
export const ProjectedWorkJobSlot = ProjectedJobSlotBase.extend({
  kind: z.literal('work'),
  jobCode: JobCode,
  jobId: UUID,
  jobUnfinished: z.boolean(),
  label: z.null(),
});

export type ProjectedIdleJobSlot = z.infer<typeof ProjectedIdleJobSlot>;
export const ProjectedIdleJobSlot = ProjectedJobSlotBase.extend({
  kind: z.literal('idle'),
  jobId: z.null(),
  label: nullableTrimmedText(),
});

export type ProjectedJobSlot = z.infer<typeof ProjectedJobSlot>;
export const ProjectedJobSlot = z.discriminatedUnion('kind', [ProjectedWorkJobSlot, ProjectedIdleJobSlot]);

export type ProjectedBayQueue = z.infer<typeof ProjectedBayQueue>;
export const ProjectedBayQueue = Bay.extend({
  calendarExceptions: z.array(BayCalendarException),
  nextAvailableDate: DateOnlyIso,
  slots: z.array(ProjectedJobSlot),
});

export type JobScheduleSlotDayBreakdown = z.infer<typeof JobScheduleSlotDayBreakdown>;
export const JobScheduleSlotDayBreakdown = z.object({
  closureDays: z.int().nonnegative(),
  overtimeDays: z.int().nonnegative(),
  workingDays: z.int().nonnegative(),
});

export type JobScheduleWorkSlot = z.infer<typeof JobScheduleWorkSlot>;
export const JobScheduleWorkSlot = ProjectedWorkJobSlot.extend({
  dayBreakdown: JobScheduleSlotDayBreakdown,
  operator: BayOperator.nullable(),
});

export type JobScheduleBayQueue = z.infer<typeof JobScheduleBayQueue>;
export const JobScheduleBayQueue = ProjectedBayQueue.omit({ slots: true }).extend({
  slots: z.array(JobScheduleWorkSlot),
});

export type JobBayListResult = z.infer<typeof JobBayListResult>;
export const JobBayListResult = z.object({
  items: z.array(Bay),
});

export type JobBayListFilters = z.infer<typeof JobBayListFilters>;
export const JobBayListFilters = z
  .object({
    isDisabled: z.boolean().optional(),
  })
  .default({});

export type JobBayListInput = z.infer<typeof JobBayListInput>;
export const JobBayListInput = z
  .object({
    filters: JobBayListFilters,
  })
  .default({
    filters: {},
  });

export type JobBayCreateInput = z.infer<typeof JobBayCreateInput>;
export const JobBayCreateInput = z
  .object({
    department: Department,
    name: BayName,
  })
  .strict();

export type JobBayCreateResult = z.infer<typeof JobBayCreateResult>;
export const JobBayCreateResult = z.object({
  bay: Bay,
});

export type JobBayRenameInput = z.infer<typeof JobBayRenameInput>;
export const JobBayRenameInput = z
  .object({
    id: UUID,
    name: BayName,
  })
  .strict();

export type JobBayRenameResult = z.infer<typeof JobBayRenameResult>;
export const JobBayRenameResult = z.object({
  bay: Bay,
});

export type JobBaySetDisabledInput = z.infer<typeof JobBaySetDisabledInput>;
export const JobBaySetDisabledInput = z
  .object({
    id: UUID,
    disabled: z.boolean(),
  })
  .strict();

export type JobBaySetDisabledResult = z.infer<typeof JobBaySetDisabledResult>;
export const JobBaySetDisabledResult = z.object({
  bay: Bay,
});

export type JobBayAssignOperatorInput = z.infer<typeof JobBayAssignOperatorInput>;
export const JobBayAssignOperatorInput = z
  .object({
    bayId: UUID,
    operatorUserId: AuthId,
  })
  .strict();

export type JobBayAssignOperatorResult = z.infer<typeof JobBayAssignOperatorResult>;
export const JobBayAssignOperatorResult = z.object({
  bay: Bay,
});

export type JobBayUnassignOperatorInput = z.infer<typeof JobBayUnassignOperatorInput>;
export const JobBayUnassignOperatorInput = z
  .object({
    bayId: UUID,
  })
  .strict();

export type JobBayUnassignOperatorResult = z.infer<typeof JobBayUnassignOperatorResult>;
export const JobBayUnassignOperatorResult = z.object({
  bay: Bay,
});

export type JobBayOperatorAssignmentHistoryInput = z.infer<typeof JobBayOperatorAssignmentHistoryInput>;
export const JobBayOperatorAssignmentHistoryInput = z
  .object({
    bayId: UUID,
  })
  .strict();

export type JobBayOperatorAssignmentHistoryItem = z.infer<typeof JobBayOperatorAssignmentHistoryItem>;
export const JobBayOperatorAssignmentHistoryItem = z.object({
  id: UUID,
  operator: BayOperator,
  assignedAt: DateIso,
  unassignedAt: DateIso.nullable(),
});

export type JobBayOperatorAssignmentHistoryResult = z.infer<typeof JobBayOperatorAssignmentHistoryResult>;
export const JobBayOperatorAssignmentHistoryResult = z.object({
  items: z.array(JobBayOperatorAssignmentHistoryItem),
});

export type BayOperatorListResult = z.infer<typeof BayOperatorListResult>;
export const BayOperatorListResult = z.object({
  operators: z.array(BayOperator),
});

export type BookJobSlotInput = z.infer<typeof BookJobSlotInput>;
export const BookJobSlotInput = z
  .object({
    bayId: UUID,
    jobId: UUID,
    durationDays: SlotDurationDays,
    /** Insert-at-Date placement hint — resolved to a queue position at booking time, never stored. */
    startDate: DateOnlyIso.optional(),
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

export type MoveJobSlotInput = z.infer<typeof MoveJobSlotInput>;
export const MoveJobSlotInput = z
  .object({
    slotId: UUID,
    direction: JobSlotMoveDirection,
  })
  .strict();

export type MoveJobSlotResult = z.infer<typeof MoveJobSlotResult>;
export const MoveJobSlotResult = z.object({
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

export type JobDescription = z.infer<typeof JobDescription>;
export const JobDescription = nullableTrimmedText();

export type JobInvoiceNumber = z.infer<typeof JobInvoiceNumber>;
export const JobInvoiceNumber = nullableTrimmedText();

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

export type JobDepartmentSchedule = z.infer<typeof JobDepartmentSchedule>;
export const JobDepartmentSchedule = z.object({
  department: Department,
  bays: z.array(ProjectedBayQueue),
});

export type JobDetailDepartmentSchedule = z.infer<typeof JobDetailDepartmentSchedule>;
export const JobDetailDepartmentSchedule = JobDepartmentSchedule.omit({ bays: true }).extend({
  bays: z.array(JobScheduleBayQueue),
});

export type Job = z.infer<typeof Job>;
export const Job = z.object({
  id: UUID,
  code: JobCode,
  productId: UUID.nullable(),
  // productSerialNumber is the full frozen serial; prefix, sequence, and year store its component parts.
  productSerialNumber: ProductSerialNumber.nullable(),
  productSerialPrefix: ProductSerialPrefix.nullable(),
  productSerialSequence: ProductSerialSequence.nullable(),
  productSerialYear: ProductSerialYear.nullable(),
  quoteId: UUID,
  invoiceNumber: JobInvoiceNumber,
  vinNumber: JobVinNumber,
  description: JobDescription,
  createdAt: DateIso,
  updatedAt: DateIso,
});

/**
 * A Job's Work Slots bucketed by their lifecycle state against plant "today". A Job spans one
 * Slot per Bay, so it can hold several states at once; `total` is the Slot count and `total === 0`
 * marks a Job that is not scheduled anywhere. Also carries the Job's projected schedule window as
 * label dates — `firstWorkDay` is the earliest Slot's first working day and `lastWorkDay` the latest
 * Slot's last working day, both `null` when the Job has no Work Slot. Present only when a list read
 * opts in via `JobListInput.include.scheduleState`; `null` otherwise so callers that do not filter
 * or display schedule state avoid the projection cost.
 */
export type JobScheduleState = z.infer<typeof JobScheduleState>;
export const JobScheduleState = z.object({
  done: z.int().nonnegative(),
  active: z.int().nonnegative(),
  scheduled: z.int().nonnegative(),
  total: z.int().nonnegative(),
  firstWorkDay: DateOnlyIso.nullable(),
  lastWorkDay: DateOnlyIso.nullable(),
});

export type JobSummary = z.infer<typeof JobSummary>;
export const JobSummary = Job.extend({
  customerCompanyName: z.string().trim().min(1).nullable(),
  customerId: UUID,
  customerThumbnailDataUrl: NullableThumbnailDataUrl,
  productBuildTimeDays: ProductBuildTimeDays.nullable(),
  productModelCode: z.string().trim().min(1).nullable(),
  productName: z.string().trim().min(1).nullable(),
  productThumbnailDataUrl: NullableThumbnailDataUrl,
  quoteCode: QuoteCode,
  quoteKind: QuoteKind,
  scheduleState: JobScheduleState.nullable().default(null),
  workTitle: QuoteWorkTitle.nullable(),
});

export type BoardListResult = z.infer<typeof BoardListResult>;
export type BoardListInput = z.infer<typeof BoardListInput>;
export const BoardListInput = z
  .object({
    from: DateOnlyIso.optional(),
  })
  .strict()
  .default({});

export const BoardListResult = z.object({
  items: z.array(ProjectedBayQueue),
  /**
   * Quote/product/customer detail for every Job referenced by a Work Slot, deduplicated so a Job that
   * spans multiple Bays carries its display facts once. Lets clients label the board without a separate
   * unpaged `jobs.list` read.
   */
  jobs: z.array(JobSummary),
  offDays: z.array(OffDay),
  /** Plant "today" as an Africa/Johannesburg business date, derived once at the server boundary. */
  today: DateOnlyIso,
});

export type BoardPreviewSeedInput = z.infer<typeof BoardPreviewSeedInput>;
export const BoardPreviewSeedInput = z
  .object({
    bayId: UUID,
    durationDays: SlotDurationDays,
    /** Insert-at-Date placement hint; callers omit empty or invalid raw form values to preview an append. */
    startDate: DateOnlyIso.optional(),
  })
  .strict();

export type BoardPreviewInput = z.infer<typeof BoardPreviewInput>;
export const BoardPreviewInput = z
  .object({
    from: DateOnlyIso.optional(),
    seeds: z.array(BoardPreviewSeedInput),
  })
  .strict();

export type BoardPlacementType = z.infer<typeof BoardPlacementType>;
export const BoardPlacementType = z.enum(['append', 'insert-before', 'split']);

export type BoardGhostTarget = z.infer<typeof BoardGhostTarget>;
export const BoardGhostTarget = z
  .object({
    id: z.string().trim().min(1),
    seedIndex: z.int().nonnegative(),
  })
  .strict();

export type BoardGhost = z.infer<typeof BoardGhost>;
export const BoardGhost = z
  .object({
    id: z.string().trim().min(1),
    bayId: UUID,
    durationDays: SlotDurationDays,
    endDate: DateOnlyIso,
    firstWorkDay: DateOnlyIso,
    lastWorkDay: DateOnlyIso,
    placementType: BoardPlacementType,
    seedIndex: z.int().nonnegative(),
    startDate: DateOnlyIso,
  })
  .strict();

export type BoardPlacement = z.infer<typeof BoardPlacement>;
export const BoardPlacement = z.union([
  z
    .object({
      type: z.literal('append'),
      startDate: DateOnlyIso,
      idleGapDays: z.int().nonnegative().refine(Number.isSafeInteger),
    })
    .strict(),
  // `type` alone cannot separate the two insert-before variants, so they carry an explicit
  // `targetKind` discriminant; consumers read it instead of sniffing for a target key.
  z
    .object({
      type: z.literal('insert-before'),
      targetKind: z.literal('slot'),
      startDate: DateOnlyIso,
      targetSlot: ProjectedJobSlot,
    })
    .strict(),
  z
    .object({
      type: z.literal('insert-before'),
      targetKind: z.literal('ghost'),
      startDate: DateOnlyIso,
      targetGhost: BoardGhostTarget,
    })
    .strict(),
  // A split always targets a real Slot; a pick inside a preview ghost degrades to insert-before, so
  // there is no `split` + `targetGhost` shape.
  z
    .object({
      type: z.literal('split'),
      startDate: DateOnlyIso,
      targetSlot: ProjectedJobSlot,
      beforeDays: SlotDurationDays,
      afterDays: SlotDurationDays,
    })
    .strict(),
]);

export type BoardPreviewResult = z.infer<typeof BoardPreviewResult>;
export const BoardPreviewResult = z.object({
  bays: z.array(ProjectedBayQueue),
  ghosts: z.array(BoardGhost),
  placements: z.array(BoardPlacement),
});

export type JobSortBy = z.infer<typeof JobSortBy>;
export const JobSortBy = z.enum(['code', 'createdAt', 'id', 'productSerialNumber', 'scheduledSlots']);

export type JobCustomerOptionSortBy = z.infer<typeof JobCustomerOptionSortBy>;
export const JobCustomerOptionSortBy = z.enum(['companyName', 'id']);

export type JobCustomerOption = z.infer<typeof JobCustomerOption>;
export const JobCustomerOption = z.object({
  companyName: z.string().trim().min(1),
  id: UUID,
});

export type JobCustomerOptionListInput = z.infer<typeof JobCustomerOptionListInput>;
export const JobCustomerOptionListInput = createSearchedSortedPagedQueryInput({
  shape: {},
  sortBy: JobCustomerOptionSortBy.default('companyName'),
});

export type JobCustomerOptionListResult = z.infer<typeof JobCustomerOptionListResult>;
export const JobCustomerOptionListResult = createSortedPagedQueryResult(JobCustomerOption, JobCustomerOptionSortBy);

export type JobColumnFilters = z.infer<typeof JobColumnFilters>;
export const JobColumnFilters = z
  .object({
    code: z.string().trim().optional(),
    customerId: UUID.optional(),
    invoiceNumber: z.string().trim().optional(),
    productSerialNumber: z.string().trim().optional(),
  })
  .default({});

export type JobListFilters = z.infer<typeof JobListFilters>;
export const JobListFilters = z
  .object({
    createdAtStart: DateIso.optional(),
    invoicedOnly: z.boolean().optional(),
    jobId: UUID.optional(),
  })
  .default({});

export type JobQuoteLineItem = z.infer<typeof JobQuoteLineItem>;
export const JobQuoteLineItem = z.object({
  id: UUID,
  name: requiredTrimmedText('Line item name is required'),
});

/** Opt-in list extras that carry a projection cost. */
export type JobListInclude = z.infer<typeof JobListInclude>;
export const JobListInclude = z.object({
  scheduleState: z.boolean().optional(),
});

export type JobDetail = z.infer<typeof JobDetail>;
export const JobDetail = JobSummary.extend({
  lineItems: z.array(JobQuoteLineItem),
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
  schedule: z.array(JobDetailDepartmentSchedule).length(5),
});

export type JobBaySeedInput = z.infer<typeof JobBaySeedInput>;
export const JobBaySeedInput = z
  .object({
    bayId: UUID,
    durationDays: SlotDurationDays,
    /** Insert-at-Date placement hint for the seeded Slot — resolved at booking time, never stored. */
    startDate: DateOnlyIso.optional(),
  })
  .strict();
export type JobCreateInput = z.infer<typeof JobCreateInput>;
export const JobCreateInput = z
  .object({
    baySeeds: z.array(JobBaySeedInput).default([]),
    quoteId: UUID,
  })
  .strict();

export type JobUpdateInput = z.infer<typeof JobUpdateInput>;
export const JobUpdateInput = z
  .object({
    id: UUID,
    description: nullableTrimmedTextInput(),
    invoiceNumber: nullableTrimmedTextInput(),
    vinNumber: nullableTrimmedTextInput(),
  })
  .strict();

export type JobUpdateResult = z.infer<typeof JobUpdateResult>;
export const JobUpdateResult = z.object({
  job: Job,
});

export type JobListInput = z.infer<typeof JobListInput>;
export const JobListInput = createSearchedSortedPagedQueryInput({
  shape: {
    columnFilters: JobColumnFilters,
    filters: JobListFilters,
    include: JobListInclude.optional(),
  },
  sortBy: JobSortBy.default('createdAt'),
});

export type JobListResult = z.infer<typeof JobListResult>;
export const JobListResult = createSortedPagedQueryResult(JobSummary, JobSortBy);
