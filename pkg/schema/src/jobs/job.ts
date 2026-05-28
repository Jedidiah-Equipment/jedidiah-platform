import { z } from 'zod';

import { DateIso } from '../common/date.js';
import { createPagedQueryResult, PagedQueryInput } from '../common/pagination.js';
import { JobCode, QuoteCode } from '../common/public-code.js';
import { SortDirection } from '../common/sort.js';
import { UUID } from '../common/uuid.js';

export { formatJobCode, JobCode } from '../common/public-code.js';

// Unordered list of job stages. Use JOB_STAGE_PIPELINE for ordered list.
export const JOB_STAGES = ['procurement', 'supply', 'fabrication', 'paint', 'assembly'] as const;

export type JobStageName = z.infer<typeof JobStageName>;
export const JobStageName = z.enum(JOB_STAGES);

export type JobWorkState = z.infer<typeof JobWorkState>;
export const JobWorkState = z.enum(['pending', 'in-progress', 'complete']);

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
  quoteId: UUID.nullable(),
  createdAt: DateIso,
  updatedAt: DateIso,
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
  stages: z.array(JobStageRollup).length(5),
});

export type JobCreateStageInput = z.infer<typeof JobCreateStageInput>;
export const JobCreateStageInput = z.object({
  stage: JobStageName,
});

export type JobCreateInput = z.infer<typeof JobCreateInput>;
export const JobCreateInput = z.object({
  productId: UUID,
  quoteId: UUID.nullable().optional(),
  stages: z.array(JobCreateStageInput).optional(),
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
