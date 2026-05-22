import { z } from 'zod';

import { createPagedQueryResult, PagedQueryInput } from '../common/pagination.js';
import { JobCode, QuoteCode } from '../common/public-code.js';
import { SortDirection } from '../common/sort.js';
import { UUID } from '../common/uuid.js';
import { Station } from '../stations/station.js';

export { formatJobCode, JobCode } from '../common/public-code.js';

// Unordered list of job stages. Use JOB_STAGE_PIPELINE for ordered list.
export const JOB_STAGES = ['procurement', 'supply', 'fabrication', 'paint', 'assembly'] as const;

export type JobStageName = z.infer<typeof JobStageName>;
export const JobStageName = z.enum(JOB_STAGES);

export type JobWorkState = z.infer<typeof JobWorkState>;
export const JobWorkState = z.enum(['pending', 'in-progress', 'complete']);

export type JobLifecycleStatus = z.infer<typeof JobLifecycleStatus>;
export const JobLifecycleStatus = z.enum(['not-started', 'active', 'paused', 'complete', 'cancelled']);

const StationBookingDateFields = z.object({
  actualEnd: z.iso.datetime().nullable(),
  actualStart: z.iso.datetime().nullable(),
  plannedEnd: z.iso.date().nullable(),
  plannedStart: z.iso.date().nullable(),
});

export type ScheduleWindow = z.infer<typeof ScheduleWindow>;
export const ScheduleWindow = z.object({
  end: z.iso.datetime().nullable(),
  start: z.iso.datetime().nullable(),
});

const DerivedScheduleFields = z.object({
  actualWindow: ScheduleWindow,
  plannedWindow: ScheduleWindow,
});

const JobDueDateFields = z.object({
  dueDate: z.iso.date().nullable(),
});

export type StationBooking = z.infer<typeof StationBooking>;
export const StationBooking = StationBookingDateFields.extend({
  id: UUID,
  jobStageId: UUID,
  stationId: UUID,
  station: Station,
  state: JobWorkState,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
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
  ...DerivedScheduleFields.shape,
  stations: z.array(StationBooking),
});
const SupplyJobStageSummary = SupplyJobStage.extend({
  department: z.literal('supply'),
  ...DerivedScheduleFields.shape,
  stations: z.array(StationBooking),
});
const FabricationJobStageSummary = FabricationJobStage.extend({
  department: z.literal('fabrication'),
  ...DerivedScheduleFields.shape,
  stations: z.array(StationBooking),
});
const PaintJobStageSummary = PaintJobStage.extend({
  department: z.literal('paint'),
  ...DerivedScheduleFields.shape,
  stations: z.array(StationBooking),
});
const AssemblyJobStageSummary = AssemblyJobStage.extend({
  department: z.literal('assembly'),
  ...DerivedScheduleFields.shape,
  stations: z.array(StationBooking),
});

export type JobEventDerivationStage = z.infer<typeof JobEventDerivationStage>;
export const JobEventDerivationStage = z.object({
  actualEnd: z.iso.datetime().nullable(),
  actualStart: z.iso.datetime().nullable(),
  stage: JobStageName,
});

const JobEventBase = z.object({
  id: UUID,
  jobId: UUID,
  stageId: UUID.nullable(),
  actorUserId: z.string().trim().min(1).nullable(),
  actorName: z.string().trim().min(1).nullable(),
  occurredAt: z.iso.datetime(),
});

const StageStartedJobEventPayload = z.object({
  stage: JobStageName,
  actualStart: z.iso.datetime(),
});

const StageStoppedJobEventPayload = z.object({
  stage: JobStageName,
  actualEnd: z.iso.datetime(),
});

const StationTransitionJobEventPayload = z.object({
  actualEnd: z.iso.datetime().optional(),
  actualStart: z.iso.datetime().optional(),
  stage: JobStageName,
  stationBookingId: UUID,
  stationId: UUID,
  stationName: z.string().trim().min(1),
});

const StageCompletedJobEventPayload = z.object({
  stage: JobStageName,
  status: JobWorkState,
  completedAt: z.iso.datetime(),
});

const JobLifecycleChangedEventPayload = z.object({
  fromLifecycleStatus: JobLifecycleStatus,
  toLifecycleStatus: JobLifecycleStatus,
});

export type JobDateEditEntityLevel = z.infer<typeof JobDateEditEntityLevel>;
export const JobDateEditEntityLevel = z.enum(['job', 'stage', 'station-booking']);

export type JobDateEditField = z.infer<typeof JobDateEditField>;
export const JobDateEditField = z.enum(['planned_start', 'planned_end', 'due_date', 'actual_start', 'actual_end']);

const DateOverriddenJobEventPayload = z.object({
  entityId: UUID,
  entityLevel: JobDateEditEntityLevel,
  field: JobDateEditField,
  newValue: z.union([z.iso.date(), z.iso.datetime()]).nullable(),
  oldValue: z.union([z.iso.date(), z.iso.datetime()]).nullable(),
});

const StageStartedJobEvent = JobEventBase.extend({
  eventType: z.literal('stage.started'),
  payload: StageStartedJobEventPayload,
});

const StageStoppedJobEvent = JobEventBase.extend({
  eventType: z.literal('stage.stopped'),
  payload: StageStoppedJobEventPayload,
});

const StageEndedJobEvent = JobEventBase.extend({
  eventType: z.literal('stage.ended'),
  payload: StageStoppedJobEventPayload,
});

const StationStartedJobEvent = JobEventBase.extend({
  eventType: z.literal('station.started'),
  payload: StationTransitionJobEventPayload.extend({
    actualStart: z.iso.datetime(),
  }),
});

const StationEndedJobEvent = JobEventBase.extend({
  eventType: z.literal('station.ended'),
  payload: StationTransitionJobEventPayload.extend({
    actualEnd: z.iso.datetime(),
  }),
});

const StageCompletedJobEvent = JobEventBase.extend({
  eventType: z.literal('stage.completed'),
  payload: StageCompletedJobEventPayload,
});

const JobPausedEvent = JobEventBase.extend({
  eventType: z.literal('job.paused'),
  payload: JobLifecycleChangedEventPayload,
});

const JobStartedEvent = JobEventBase.extend({
  eventType: z.literal('job.started'),
  payload: JobLifecycleChangedEventPayload,
});

const JobResumedEvent = JobEventBase.extend({
  eventType: z.literal('job.resumed'),
  payload: JobLifecycleChangedEventPayload,
});

const JobCancelledEvent = JobEventBase.extend({
  eventType: z.literal('job.cancelled'),
  payload: JobLifecycleChangedEventPayload,
});

const JobUncancelledEvent = JobEventBase.extend({
  eventType: z.literal('job.uncancelled'),
  payload: JobLifecycleChangedEventPayload,
});

const JobCompletedEvent = JobEventBase.extend({
  eventType: z.literal('job.completed'),
  payload: JobLifecycleChangedEventPayload,
});

const DateOverriddenEvent = JobEventBase.extend({
  eventType: z.literal('date.overridden'),
  payload: DateOverriddenJobEventPayload,
});

export type JobEvent = z.infer<typeof JobEvent>;
export const JobEvent = z.discriminatedUnion('eventType', [
  StageStartedJobEvent,
  StageStoppedJobEvent,
  StageEndedJobEvent,
  StationStartedJobEvent,
  StationEndedJobEvent,
  StageCompletedJobEvent,
  JobPausedEvent,
  JobStartedEvent,
  JobResumedEvent,
  JobCancelledEvent,
  JobUncancelledEvent,
  JobCompletedEvent,
  DateOverriddenEvent,
]);

export type DerivedStageJobEvent = z.infer<typeof DerivedStageJobEvent>;
export const DerivedStageJobEvent = z.discriminatedUnion('eventType', [
  z.object({
    eventType: z.literal('stage.started'),
    payload: StageStartedJobEventPayload,
  }),
  z.object({
    eventType: z.literal('stage.stopped'),
    payload: StageStoppedJobEventPayload,
  }),
]);

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
  ...JobDueDateFields.shape,
  productId: UUID,
  quoteId: UUID.nullable(),
  isPaused: z.boolean(),
  isCancelled: z.boolean(),
  lifecycleStatus: JobLifecycleStatus,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type JobSummary = z.infer<typeof JobSummary>;
export const JobSummary = Job.extend({
  customerCompanyName: z.string().trim().min(1).nullable(),
  ...DerivedScheduleFields.shape,
  productModelCode: z.string().trim().min(1),
  productName: z.string().trim().min(1),
  quoteCode: QuoteCode.nullable(),
  stages: z.array(JobStageSummary).length(5),
});

export type JobSortBy = z.infer<typeof JobSortBy>;
export const JobSortBy = z.enum(['code', 'createdAt', 'dueDate', 'id']);

export type JobListFilters = z.infer<typeof JobListFilters>;
export const JobListFilters = z
  .object({
    jobId: UUID.optional(),
  })
  .default({});

export type JobDetail = z.infer<typeof JobDetail>;
export const JobDetail = JobSummary.extend({
  stages: z.array(JobStageRollup).length(5),
  workflowEvents: z.array(JobEvent),
});

export type JobSharedStationBooking = z.infer<typeof JobSharedStationBooking>;
export const JobSharedStationBooking = StationBookingDateFields.pick({
  actualEnd: true,
  actualStart: true,
  plannedEnd: true,
  plannedStart: true,
}).extend({
  id: UUID,
  jobStageId: UUID,
  stage: JobStageName,
  stationId: UUID,
  stationName: z.string().trim().min(1),
});

export type JobSharedStationBookingJob = z.infer<typeof JobSharedStationBookingJob>;
export const JobSharedStationBookingJob = z.object({
  bookings: z.array(JobSharedStationBooking).min(1),
  customerCompanyName: z.string().trim().min(1).nullable(),
  jobCode: JobCode,
  jobId: UUID,
  lifecycleStatus: JobLifecycleStatus,
  productModelCode: z.string().trim().min(1),
  productName: z.string().trim().min(1),
  quoteCode: QuoteCode.nullable(),
});

export type JobSharedStationBookingsResult = z.infer<typeof JobSharedStationBookingsResult>;
export const JobSharedStationBookingsResult = z.object({
  jobs: z.array(JobSharedStationBookingJob),
});

export type JobCreateStationBookingInput = z.infer<typeof JobCreateStationBookingInput>;
export const JobCreateStationBookingInput = z.object({
  plannedEnd: z.iso.date().nullable().optional(),
  plannedStart: z.iso.date().nullable().optional(),
  stationId: UUID,
});

export type JobCreateStageInput = z.infer<typeof JobCreateStageInput>;
export const JobCreateStageInput = z.object({
  stage: JobStageName,
  stationBookings: z.array(JobCreateStationBookingInput).default([]),
});

export type JobCreateInput = z.infer<typeof JobCreateInput>;
export const JobCreateInput = z
  .object({
    dueDate: z.iso.date().nullable().optional(),
    productId: UUID,
    quoteId: UUID.nullable().optional(),
    stages: z.array(JobCreateStageInput).optional(),
  })
  .superRefine((value, context) => {
    if (!value.stages) return;

    const seenStages = new Map<JobStageName, number>();
    value.stages.forEach((stage, index) => {
      const previousIndex = seenStages.get(stage.stage);
      if (previousIndex !== undefined) {
        context.addIssue({
          code: 'custom',
          path: ['stages', index, 'stage'],
          message: 'Job stage can only be included once',
        });
        context.addIssue({
          code: 'custom',
          path: ['stages', previousIndex, 'stage'],
          message: 'Job stage can only be included once',
        });
      }
      seenStages.set(stage.stage, index);

      const seenStationIds = new Map<string, number>();
      stage.stationBookings.forEach((booking, bookingIndex) => {
        const previousBookingIndex = seenStationIds.get(booking.stationId);
        if (previousBookingIndex !== undefined) {
          context.addIssue({
            code: 'custom',
            path: ['stages', index, 'stationBookings', bookingIndex, 'stationId'],
            message: 'Station can only be booked once per stage',
          });
          context.addIssue({
            code: 'custom',
            path: ['stages', index, 'stationBookings', previousBookingIndex, 'stationId'],
            message: 'Station can only be booked once per stage',
          });
        }
        seenStationIds.set(booking.stationId, bookingIndex);
      });
    });

    for (const stage of JOB_STAGES) {
      if (!seenStages.has(stage)) {
        context.addIssue({
          code: 'custom',
          path: ['stages'],
          message: 'Job create stages must include every production stage',
        });
        return;
      }
    }
  });

export type JobListInput = z.infer<typeof JobListInput>;
export const JobListInput = PagedQueryInput.extend({
  filters: JobListFilters,
  search: z.string().trim().default(''),
  sortBy: JobSortBy.default('createdAt'),
  sortDirection: SortDirection.default('asc'),
});

export type JobListResult = z.infer<typeof JobListResult>;
export const JobListResult = createPagedQueryResult(JobSummary).extend({
  sortBy: JobSortBy,
  sortDirection: SortDirection,
});

export type JobLifecycleTransitionInput = z.infer<typeof JobLifecycleTransitionInput>;
export const JobLifecycleTransitionInput = z.object({
  id: UUID,
});

export type JobSharedStationBookingsInput = z.infer<typeof JobSharedStationBookingsInput>;
export const JobSharedStationBookingsInput = z.object({
  jobId: UUID,
});

export type JobStationBookingTransitionInput = z.infer<typeof JobStationBookingTransitionInput>;
export const JobStationBookingTransitionInput = z.object({
  id: UUID,
});

export type JobDateEditInput = z.infer<typeof JobDateEditInput>;
export const JobDateEditInput = z
  .object({
    entityId: UUID,
    entityLevel: JobDateEditEntityLevel,
    field: JobDateEditField,
    value: z.union([z.iso.date(), z.iso.datetime()]).nullable(),
  })
  .superRefine((input, context) => {
    if (input.field === 'due_date' && input.entityLevel !== 'job') {
      context.addIssue({
        code: 'custom',
        path: ['field'],
        message: 'Job Due Date can only be edited on a Job.',
      });
    }
    if (input.entityLevel === 'job' && input.field !== 'due_date') {
      context.addIssue({
        code: 'custom',
        path: ['field'],
        message: 'Only Job Due Date can be edited on a Job.',
      });
    }
    if (input.entityLevel === 'stage') {
      context.addIssue({
        code: 'custom',
        path: ['entityLevel'],
        message: 'Stage dates are derived from Station Bookings.',
      });
    }
    if (input.entityLevel === 'station-booking' && input.field === 'due_date') {
      context.addIssue({
        code: 'custom',
        path: ['field'],
        message: 'Job Due Date can only be edited on a Job.',
      });
    }

    if (input.value === null) return;

    const isDateOnlyField =
      input.field === 'planned_start' || input.field === 'planned_end' || input.field === 'due_date';
    const parser = isDateOnlyField ? z.iso.date() : z.iso.datetime();
    const result = parser.safeParse(input.value);
    if (!result.success) {
      context.addIssue({
        code: 'custom',
        path: ['value'],
        message: isDateOnlyField
          ? 'Schedule date edits require a date value.'
          : 'Actual-date edits require a datetime value.',
      });
    }
  });
