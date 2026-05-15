import type { JobStageName } from '@pkg/schema';

export type JobStagePipelineStep = {
  sequence: number;
  stage: JobStageName;
};

// This order is the production workflow, not just the set of valid job stages.
// If JOB_STAGES changes, update this pipeline intentionally and keep the test coverage in sync.
export const JOB_STAGE_PIPELINE = [
  { sequence: 1, stage: 'procurement' },
  { sequence: 2, stage: 'fabrication' },
  { sequence: 3, stage: 'assembly' },
  { sequence: 4, stage: 'paint' },
  { sequence: 5, stage: 'dispatch' },
] as const satisfies readonly JobStagePipelineStep[];
