import { z } from 'zod';

import { Department } from '../auth/authorization.js';
import { UUID } from '../common/uuid.js';

// Unordered list of job stages. Use JOB_STAGE_PIPELINE for ordered list.
export const JOB_STAGES = ['procurement', 'fabrication', 'assembly', 'paint', 'dispatch'] as const;

export type JobStageName = z.infer<typeof JobStageName>;
export const JobStageName = z.enum(JOB_STAGES);

export type JobLifecycleStatus = z.infer<typeof JobLifecycleStatus>;
export const JobLifecycleStatus = z.enum(['active', 'paused', 'complete', 'cancelled']);

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

export type JobDetail = z.infer<typeof JobDetail>;
export const JobDetail = JobSummary.extend({
  stages: z.array(JobStageRollup).length(5),
});

export type JobCreateInput = z.infer<typeof JobCreateInput>;
export const JobCreateInput = z.object({
  productId: UUID,
});

export type JobListInput = z.infer<typeof JobListInput>;
export const JobListInput = z.object({});

export type JobListResult = z.infer<typeof JobListResult>;
export const JobListResult = z.object({
  jobs: z.array(JobSummary),
});

export type JobStageTransitionInput = z.infer<typeof JobStageTransitionInput>;
export const JobStageTransitionInput = z.object({
  id: UUID,
  stage: JobStageName,
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
