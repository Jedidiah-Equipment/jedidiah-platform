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

export const JOB_LIST_STATUS_FILTERS = ['all', ...JobLifecycleStatus.options] as const;

export type JobListStatusFilter = z.infer<typeof JobListStatusFilter>;
export const JobListStatusFilter = z.union([JobLifecycleStatus, z.literal('all')]);

export type StageTransitionPolicyResult = z.infer<typeof StageTransitionPolicyResult>;
export const StageTransitionPolicyResult = z.discriminatedUnion('allowed', [
  z.object({
    allowed: z.literal(true),
    reason: z.null(),
  }),
  z.object({
    allowed: z.literal(false),
    reason: z.string().trim().min(1),
  }),
]);

export type StageTransitionAvailability = z.infer<typeof StageTransitionAvailability>;
export const StageTransitionAvailability = z.object({
  start: StageTransitionPolicyResult,
  stop: StageTransitionPolicyResult,
});

const DateFields = z.object({
  actualEnd: z.iso.datetime().nullable(),
  actualEndSetManually: z.boolean(),
  actualStart: z.iso.datetime().nullable(),
  actualStartSetManually: z.boolean(),
  dueEnd: z.iso.date().nullable(),
  dueEndSetManually: z.boolean(),
  dueStart: z.iso.date().nullable(),
  dueStartSetManually: z.boolean(),
});

export type StationBooking = z.infer<typeof StationBooking>;
export const StationBooking = DateFields.extend({
  id: UUID,
  jobStageId: UUID,
  stationId: UUID,
  station: Station,
  state: JobWorkState,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

const JobStageBase = DateFields.extend({
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
  stations: z.array(StationBooking),
});
const SupplyJobStageSummary = SupplyJobStage.extend({
  department: z.literal('supply'),
  stations: z.array(StationBooking),
});
const FabricationJobStageSummary = FabricationJobStage.extend({
  department: z.literal('fabrication'),
  stations: z.array(StationBooking),
});
const PaintJobStageSummary = PaintJobStage.extend({
  department: z.literal('paint'),
  stations: z.array(StationBooking),
});
const AssemblyJobStageSummary = AssemblyJobStage.extend({
  department: z.literal('assembly'),
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
export const JobDateEditField = z.enum(['due_start', 'due_end', 'actual_start', 'actual_end']);

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
  ProcurementJobStageSummary.extend({
    access: z.literal('visible'),
    transitionAvailability: StageTransitionAvailability.optional(),
  }),
  SupplyJobStageSummary.extend({
    access: z.literal('visible'),
    transitionAvailability: StageTransitionAvailability.optional(),
  }),
  FabricationJobStageSummary.extend({
    access: z.literal('visible'),
    transitionAvailability: StageTransitionAvailability.optional(),
  }),
  PaintJobStageSummary.extend({
    access: z.literal('visible'),
    transitionAvailability: StageTransitionAvailability.optional(),
  }),
  AssemblyJobStageSummary.extend({
    access: z.literal('visible'),
    transitionAvailability: StageTransitionAvailability.optional(),
  }),
]);

export type JobStageRollup = z.infer<typeof JobStageRollup>;
export const JobStageRollup = z.union([VisibleJobStage, SummaryJobStage]);

export type Job = z.infer<typeof Job>;
export const Job = DateFields.extend({
  id: UUID,
  code: JobCode,
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
  productModelCode: z.string().trim().min(1),
  productName: z.string().trim().min(1),
  quoteCode: QuoteCode.nullable(),
  stages: z.array(JobStageSummary).length(5),
});

export type JobSortBy = z.infer<typeof JobSortBy>;
export const JobSortBy = z.enum(['actualEnd', 'code', 'createdAt', 'dueEnd', 'id', 'lifecycleStatus']);

export type JobListFilters = z.infer<typeof JobListFilters>;
export const JobListFilters = z
  .object({
    jobId: UUID.optional(),
    lifecycleStatuses: z.array(JobLifecycleStatus).default(['active']),
  })
  .default({
    lifecycleStatuses: ['active'],
  });

export type JobDetail = z.infer<typeof JobDetail>;
export const JobDetail = JobSummary.extend({
  stages: z.array(JobStageRollup).length(5),
  workflowEvents: z.array(JobEvent),
});

export type JobSharedStationBooking = z.infer<typeof JobSharedStationBooking>;
export const JobSharedStationBooking = DateFields.pick({
  actualEnd: true,
  actualStart: true,
  dueEnd: true,
  dueStart: true,
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
  dueEnd: z.iso.date().nullable().optional(),
  dueEndSetManually: z.boolean().optional(),
  dueStart: z.iso.date().nullable().optional(),
  dueStartSetManually: z.boolean().optional(),
  stationId: UUID,
});

export type JobCreateStageInput = z.infer<typeof JobCreateStageInput>;
export const JobCreateStageInput = z.object({
  dueEnd: z.iso.date().nullable().optional(),
  dueEndSetManually: z.boolean().optional(),
  dueStart: z.iso.date().nullable().optional(),
  dueStartSetManually: z.boolean().optional(),
  stage: JobStageName,
  stationBookings: z.array(JobCreateStationBookingInput).default([]),
});

export type JobCreateInput = z.infer<typeof JobCreateInput>;
export const JobCreateInput = z
  .object({
    dueEnd: z.iso.date().nullable().optional(),
    dueEndSetManually: z.boolean().optional(),
    dueStart: z.iso.date().nullable().optional(),
    dueStartSetManually: z.boolean().optional(),
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

export type JobStageTransitionInput = z.infer<typeof JobStageTransitionInput>;
export const JobStageTransitionInput = z.object({
  id: UUID,
  stage: JobStageName,
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
    if (input.value === null) return;

    const parser = input.field.startsWith('due_') ? z.iso.date() : z.iso.datetime();
    const result = parser.safeParse(input.value);
    if (!result.success) {
      context.addIssue({
        code: 'custom',
        path: ['value'],
        message: input.field.startsWith('due_')
          ? 'Due-date edits require a date value.'
          : 'Actual-date edits require a datetime value.',
      });
    }
  });
