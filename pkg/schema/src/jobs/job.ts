import { z } from 'zod';

import { DateIso, DateOnlyIso } from '../common/date.js';
import { createPagedQueryResult, PagedQueryInput } from '../common/pagination.js';
import { JobCode, QuoteCode } from '../common/public-code.js';
import { SortDirection } from '../common/sort.js';
import { UUID } from '../common/uuid.js';
import { Station, StationName } from '../stations/station.js';

export { formatJobCode, JobCode } from '../common/public-code.js';

// Unordered list of job stages. Use JOB_STAGE_PIPELINE for ordered list.
export const JOB_STAGES = ['procurement', 'supply', 'fabrication', 'paint', 'assembly'] as const;

export type JobStageName = z.infer<typeof JobStageName>;
export const JobStageName = z.enum(JOB_STAGES);

export type JobWorkState = z.infer<typeof JobWorkState>;
export const JobWorkState = z.enum(['pending', 'in-progress', 'complete']);

export type JobStatus = z.infer<typeof JobStatus>;
export const JobStatus = z.enum(['pending', 'active', 'paused', 'complete', 'cancelled']);

const StationBookingDateFields = z.object({
  actualEnd: DateIso.nullable(),
  actualStart: DateIso.nullable(),
  plannedEnd: DateOnlyIso.nullable(),
  plannedStart: DateOnlyIso.nullable(),
});

export type ScheduleWindow = z.infer<typeof ScheduleWindow>;
export const ScheduleWindow = z.object({
  end: DateIso.nullable(),
  start: DateIso.nullable(),
});

const DerivedScheduleFields = z.object({
  actualWindow: ScheduleWindow,
  plannedWindow: ScheduleWindow,
});

export type StationBooking = z.infer<typeof StationBooking>;
export const StationBooking = StationBookingDateFields.extend({
  id: UUID,
  jobStageId: UUID,
  stationId: UUID,
  station: Station,
  state: JobWorkState,
  createdAt: DateIso,
  updatedAt: DateIso,
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
  actualEnd: DateIso.nullable(),
  actualStart: DateIso.nullable(),
  stage: JobStageName,
});

const JobEventBase = z.object({
  id: UUID,
  jobId: UUID,
  stageId: UUID.nullable(),
  actorUserId: z.string().trim().min(1).nullable(),
  actorName: z.string().trim().min(1).nullable(),
  occurredAt: DateIso,
});

const StageStartedJobEventPayload = z.object({
  stage: JobStageName,
  actualStart: DateIso,
});

const StageStoppedJobEventPayload = z.object({
  stage: JobStageName,
  actualEnd: DateIso,
});

const StationTransitionJobEventPayload = z.object({
  actualEnd: DateIso.optional(),
  actualStart: DateIso.optional(),
  stage: JobStageName,
  stationBookingId: UUID,
  stationId: UUID,
  stationName: z.string().trim().min(1),
});

const StageCompletedJobEventPayload = z.object({
  stage: JobStageName,
  status: JobWorkState,
  completedAt: DateIso,
});

const JobStartedEventPayload = z.object({
  actualStart: DateIso.optional(),
});

const JobCompletedEventPayload = z.object({
  actualEnd: DateIso.optional(),
});

const JobStatusChangedEventPayload = z.object({
  from: JobStatus,
  to: JobStatus,
});

export type JobDateEditEntityLevel = z.infer<typeof JobDateEditEntityLevel>;
export const JobDateEditEntityLevel = z.enum(['job', 'stage', 'station-booking']);

export type JobDateEditField = z.infer<typeof JobDateEditField>;
export const JobDateEditField = z.enum(['planned_start', 'planned_end', 'due_date', 'actual_start', 'actual_end']);

const DateOverriddenJobEventPayload = z.object({
  entityId: UUID,
  entityLevel: JobDateEditEntityLevel,
  field: JobDateEditField,
  newValue: z.union([DateOnlyIso, DateIso]).nullable(),
  oldValue: z.union([DateOnlyIso, DateIso]).nullable(),
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
    actualStart: DateIso,
  }),
});

const StationEndedJobEvent = JobEventBase.extend({
  eventType: z.literal('station.ended'),
  payload: StationTransitionJobEventPayload.extend({
    actualEnd: DateIso,
  }),
});

const StageCompletedJobEvent = JobEventBase.extend({
  eventType: z.literal('stage.completed'),
  payload: StageCompletedJobEventPayload,
});

const JobStartedEvent = JobEventBase.extend({
  eventType: z.literal('job.started'),
  payload: JobStartedEventPayload.extend({
    actualStart: DateIso,
  }),
});

const JobCompletedEvent = JobEventBase.extend({
  eventType: z.literal('job.completed'),
  payload: JobCompletedEventPayload.extend({
    actualEnd: DateIso,
  }),
});

const JobStatusChangedEvent = JobEventBase.extend({
  eventType: z.literal('job.status-changed'),
  payload: JobStatusChangedEventPayload,
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
  JobStartedEvent,
  JobCompletedEvent,
  JobStatusChangedEvent,
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
  dueDate: DateOnlyIso.nullable(),
  productId: UUID,
  quoteId: UUID.nullable(),
  createdAt: DateIso,
  updatedAt: DateIso,
  status: JobStatus,
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
export const JobSortBy = z.enum(['code', 'createdAt', 'dueDate', 'id', 'status']);

export type JobListFilters = z.infer<typeof JobListFilters>;
export const JobListFilters = z
  .object({
    createdAtStart: DateIso.optional(),
    jobId: UUID.optional(),
    statuses: z.array(JobStatus).default([]),
  })
  .default({
    statuses: [],
  });

export type JobDetail = z.infer<typeof JobDetail>;
export const JobDetail = JobSummary.extend({
  stages: z.array(JobStageRollup).length(5),
  workflowEvents: z.array(JobEvent),
});

export type JobCreateStationBookingInput = z.infer<typeof JobCreateStationBookingInput>;
export const JobCreateStationBookingInput = z.object({
  plannedEnd: DateOnlyIso.nullable().optional(),
  plannedStart: DateOnlyIso.nullable().optional(),
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
    dueDate: DateOnlyIso.nullable().optional(),
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

export type JobStationBookingTransitionInput = z.infer<typeof JobStationBookingTransitionInput>;
export const JobStationBookingTransitionInput = z.object({
  id: UUID,
});

export type JobSetStatusInput = z.infer<typeof JobSetStatusInput>;
export const JobSetStatusInput = z.object({
  id: UUID,
  status: JobStatus,
});

export type JobDueDateEditInput = z.infer<typeof JobDueDateEditInput>;
export const JobDueDateEditInput = z.object({
  jobId: UUID,
  dueDate: DateOnlyIso.nullable(),
});

export type StationDateEditInput = z.infer<typeof StationDateEditInput>;
export const StationDateEditInput = z.discriminatedUnion('field', [
  z.object({
    jobId: UUID,
    stationName: StationName,
    field: z.enum(['planned_start', 'planned_end']),
    value: DateOnlyIso.nullable(),
  }),
  z.object({
    jobId: UUID,
    stationName: StationName,
    field: z.enum(['actual_start', 'actual_end']),
    value: DateIso.nullable(),
  }),
]);
