import { z } from 'zod';

import { Department } from '../auth/authorization.js';
import { createPagedQueryResult, PagedQueryInput } from '../common/pagination.js';
import { SortDirection } from '../common/sort.js';
import { UUID } from '../common/uuid.js';

// Unordered list of job stages. Use JOB_STAGE_PIPELINE for ordered list.
export const JOB_STAGES = ['procurement', 'fabrication', 'assembly', 'paint', 'dispatch'] as const;

export type JobStageName = z.infer<typeof JobStageName>;
export const JobStageName = z.enum(JOB_STAGES);

export type JobLifecycleStatus = z.infer<typeof JobLifecycleStatus>;
export const JobLifecycleStatus = z.enum(['active', 'paused', 'complete', 'cancelled']);

export const JOB_LIST_STATUS_FILTERS = ['all', ...JobLifecycleStatus.options] as const;

export type JobListStatusFilter = z.infer<typeof JobListStatusFilter>;
export const JobListStatusFilter = z.union([JobLifecycleStatus, z.literal('all')]);

export const JOB_STAGE_STATUSES = {
  assembly: ['pending', 'in-progress', 'qc', 'complete'],
  dispatch: ['pending', 'ready', 'dispatched', 'complete'],
  fabrication: ['pending', 'cutting', 'welding', 'qc', 'complete'],
  paint: ['pending', 'prep', 'painting', 'curing', 'complete'],
  procurement: ['pending', 'ordering', 'partial', 'complete'],
} as const satisfies Record<JobStageName, readonly [string, ...string[]]>;

export type JobStageStatus = z.infer<typeof JobStageStatus>;
export const JobStageStatus = z.enum([
  ...JOB_STAGE_STATUSES.procurement,
  ...JOB_STAGE_STATUSES.fabrication,
  ...JOB_STAGE_STATUSES.assembly,
  ...JOB_STAGE_STATUSES.paint,
  ...JOB_STAGE_STATUSES.dispatch,
]);

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
  complete: StageTransitionPolicyResult,
  'set-status': StageTransitionPolicyResult,
  start: StageTransitionPolicyResult,
});

const JobStageBase = z.object({
  id: UUID,
  jobId: UUID,
  sequence: z.int().min(1).max(5),
  status: JobStageStatus.default('pending'),
  startedAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
});

const ProcurementJobStage = JobStageBase.extend({
  stage: z.literal('procurement'),
  status: z.enum(JOB_STAGE_STATUSES.procurement).default('pending'),
});
const FabricationJobStage = JobStageBase.extend({
  stage: z.literal('fabrication'),
  status: z.enum(JOB_STAGE_STATUSES.fabrication).default('pending'),
});
const PaintJobStage = JobStageBase.extend({
  stage: z.literal('paint'),
  status: z.enum(JOB_STAGE_STATUSES.paint).default('pending'),
});
const AssemblyJobStage = JobStageBase.extend({
  stage: z.literal('assembly'),
  status: z.enum(JOB_STAGE_STATUSES.assembly).default('pending'),
});
const DispatchJobStage = JobStageBase.extend({
  stage: z.literal('dispatch'),
  status: z.enum(JOB_STAGE_STATUSES.dispatch).default('pending'),
});

export type JobStage = z.infer<typeof JobStage>;
export const JobStage = z.discriminatedUnion('stage', [
  ProcurementJobStage,
  FabricationJobStage,
  PaintJobStage,
  AssemblyJobStage,
  DispatchJobStage,
]);

export type JobEventDerivationStage = z.infer<typeof JobEventDerivationStage>;
export const JobEventDerivationStage = z.object({
  completedAt: z.iso.datetime().nullable(),
  stage: JobStageName,
  startedAt: z.iso.datetime().nullable(),
  status: JobStageStatus,
});

const JobEventBase = z.object({
  id: UUID,
  jobId: UUID,
  stageId: UUID.nullable(),
  actorUserId: z.string().trim().min(1).nullable(),
  occurredAt: z.iso.datetime(),
});

const StageStartedJobEventPayload = z.object({
  stage: JobStageName,
  status: JobStageStatus,
  startedAt: z.iso.datetime(),
});

const StageStatusChangedJobEventPayload = z.object({
  stage: JobStageName,
  fromStatus: JobStageStatus,
  toStatus: JobStageStatus,
});

const StageCompletedJobEventPayload = z.object({
  stage: JobStageName,
  status: JobStageStatus,
  completedAt: z.iso.datetime(),
});

const JobLifecycleChangedEventPayload = z.object({
  fromLifecycleStatus: JobLifecycleStatus,
  toLifecycleStatus: JobLifecycleStatus,
});

const StageStartedJobEvent = JobEventBase.extend({
  eventType: z.literal('stage.started'),
  payload: StageStartedJobEventPayload,
});

const StageStatusChangedJobEvent = JobEventBase.extend({
  eventType: z.literal('stage.status_changed'),
  payload: StageStatusChangedJobEventPayload,
});

const StageCompletedJobEvent = JobEventBase.extend({
  eventType: z.literal('stage.completed'),
  payload: StageCompletedJobEventPayload,
});

const JobPausedEvent = JobEventBase.extend({
  eventType: z.literal('job.paused'),
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

const JobCompletedEvent = JobEventBase.extend({
  eventType: z.literal('job.completed'),
  payload: JobLifecycleChangedEventPayload,
});

export type JobEvent = z.infer<typeof JobEvent>;
export const JobEvent = z.discriminatedUnion('eventType', [
  StageStartedJobEvent,
  StageStatusChangedJobEvent,
  StageCompletedJobEvent,
  JobPausedEvent,
  JobResumedEvent,
  JobCancelledEvent,
  JobCompletedEvent,
]);

export type DerivedStageJobEvent = z.infer<typeof DerivedStageJobEvent>;
export const DerivedStageJobEvent = z.discriminatedUnion('eventType', [
  z.object({
    eventType: z.literal('stage.started'),
    payload: StageStartedJobEventPayload,
  }),
  z.object({
    eventType: z.literal('stage.status_changed'),
    payload: StageStatusChangedJobEventPayload,
  }),
  z.object({
    eventType: z.literal('stage.completed'),
    payload: StageCompletedJobEventPayload,
  }),
]);

export type LockedJobStage = z.infer<typeof LockedJobStage>;
export const LockedJobStage = z.object({
  access: z.literal('locked'),
  department: Department,
  sequence: z.int().min(1).max(5),
  stage: JobStageName,
});

export type VisibleJobStage = z.infer<typeof VisibleJobStage>;
export const VisibleJobStage = JobStageBase.extend({
  access: z.literal('visible'),
  department: Department,
  stage: JobStageName,
  transitionAvailability: StageTransitionAvailability.optional(),
});

export type JobStageRollup = z.infer<typeof JobStageRollup>;
export const JobStageRollup = z.discriminatedUnion('access', [VisibleJobStage, LockedJobStage]);

export type Job = z.infer<typeof Job>;
export const Job = z.object({
  id: UUID,
  productId: UUID,
  lifecycleStatus: JobLifecycleStatus.default('active'),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type JobSummary = z.infer<typeof JobSummary>;
export const JobSummary = Job.extend({
  productModelCode: z.string().trim().min(1),
  productName: z.string().trim().min(1),
});

export type JobSortBy = z.infer<typeof JobSortBy>;
export const JobSortBy = z.enum(['createdAt', 'id', 'lifecycleStatus']);

export type JobListFilters = z.infer<typeof JobListFilters>;
export const JobListFilters = z
  .object({
    lifecycleStatuses: z.array(JobLifecycleStatus),
  })
  .default({
    lifecycleStatuses: ['active'],
  });

export type JobDetail = z.infer<typeof JobDetail>;
export const JobDetail = JobSummary.extend({
  stages: z.array(JobStageRollup).length(5),
  workflowEvents: z.array(JobEvent),
});

export type JobCreateInput = z.infer<typeof JobCreateInput>;
export const JobCreateInput = z.object({
  productId: UUID,
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

export type JobStageStatusInput = z.infer<typeof JobStageStatusInput>;
export const JobStageStatusInput = z.discriminatedUnion('stage', [
  JobStageTransitionInput.extend({
    stage: z.literal('procurement'),
    status: z.enum(JOB_STAGE_STATUSES.procurement),
  }),
  JobStageTransitionInput.extend({
    stage: z.literal('fabrication'),
    status: z.enum(JOB_STAGE_STATUSES.fabrication),
  }),
  JobStageTransitionInput.extend({
    stage: z.literal('paint'),
    status: z.enum(JOB_STAGE_STATUSES.paint),
  }),
  JobStageTransitionInput.extend({
    stage: z.literal('assembly'),
    status: z.enum(JOB_STAGE_STATUSES.assembly),
  }),
  JobStageTransitionInput.extend({
    stage: z.literal('dispatch'),
    status: z.enum(JOB_STAGE_STATUSES.dispatch),
  }),
]);
