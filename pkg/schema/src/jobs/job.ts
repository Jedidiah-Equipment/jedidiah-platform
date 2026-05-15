import { z } from 'zod';

import { Department } from '../auth/authorization.js';
import { UUID } from '../common/uuid.js';

export const JOB_STAGES = ['procurement', 'fabrication', 'paint', 'assembly', 'dispatch'] as const;

export type JobStageName = z.infer<typeof JobStageName>;
export const JobStageName = z.enum(JOB_STAGES);

export type JobLifecycleStatus = z.infer<typeof JobLifecycleStatus>;
export const JobLifecycleStatus = z.enum(['active', 'paused', 'complete', 'cancelled']);

export type JobStageStatus = z.infer<typeof JobStageStatus>;
export const JobStageStatus = z.literal('pending');

const JobStageBase = z.object({
  id: UUID,
  jobId: UUID,
  sequence: z.int().min(1).max(5),
  status: JobStageStatus.default('pending'),
  startedAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
});

const ProcurementJobStage = JobStageBase.extend({ stage: z.literal('procurement') });
const FabricationJobStage = JobStageBase.extend({ stage: z.literal('fabrication') });
const PaintJobStage = JobStageBase.extend({ stage: z.literal('paint') });
const AssemblyJobStage = JobStageBase.extend({ stage: z.literal('assembly') });
const DispatchJobStage = JobStageBase.extend({ stage: z.literal('dispatch') });

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
