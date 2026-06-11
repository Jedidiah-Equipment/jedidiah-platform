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
  /** Date-only Slot Projection anchor — a plant business date (ADR-0043). */
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

const ProjectedJobSlotBase = JobSlotBase.extend({
  startDate: DateOnlyIso,
  endDate: DateOnlyIso,
});

export type ProjectedWorkJobSlot = z.infer<typeof ProjectedWorkJobSlot>;
export const ProjectedWorkJobSlot = ProjectedJobSlotBase.extend({
  kind: z.literal('work'),
  jobCode: JobCode,
  jobId: UUID,
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

export type BaySchedule = z.infer<typeof BaySchedule>;
export const BaySchedule = Bay.extend({
  calendarExceptions: z.array(BayCalendarException),
  nextAvailableDate: DateOnlyIso,
  slots: z.array(ProjectedJobSlot),
});

export type BayListResult = z.infer<typeof BayListResult>;
export const BayListResult = z.object({
  items: z.array(BaySchedule),
  offDays: z.array(OffDay),
  /** Plant "today" as an Africa/Johannesburg business date, derived once at the server boundary. */
  today: DateOnlyIso,
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
    /** Insert-at-Date placement hint — resolved to a queue position at booking time, never stored (ADR-0042). */
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
  bays: z.array(BaySchedule),
});

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
  customerId: UUID,
  customerThumbnailDataUrl: NullableThumbnailDataUrl,
  productModelCode: z.string().trim().min(1),
  productName: z.string().trim().min(1),
  productThumbnailDataUrl: NullableThumbnailDataUrl,
  quoteCode: QuoteCode,
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
  schedule: z.array(JobDepartmentSchedule).length(5),
});

export type JobBaySeedInput = z.infer<typeof JobBaySeedInput>;
export const JobBaySeedInput = z
  .object({
    bayId: UUID,
    durationDays: SlotDurationDays,
  })
  .strict();
export type JobCreateInput = z.infer<typeof JobCreateInput>;
export const JobCreateInput = z
  .object({
    baySeeds: z.array(JobBaySeedInput).default([]),
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
