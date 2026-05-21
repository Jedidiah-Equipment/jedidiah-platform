import type { JobStageName } from '@pkg/schema';

export type JobStagePipelineStep = {
  sequence: number;
  stage: JobStageName;
};

// This order is the production workflow, not just the set of valid job stages.
// If JOB_STAGES changes, update this pipeline intentionally and keep the test coverage in sync.
export const JOB_STAGE_PIPELINE = [
  { sequence: 1, stage: 'procurement' },
  { sequence: 2, stage: 'supply' },
  { sequence: 3, stage: 'fabrication' },
  { sequence: 4, stage: 'paint' },
  { sequence: 5, stage: 'assembly' },
] as const satisfies readonly JobStagePipelineStep[];

export const FINAL_JOB_STAGE = getFinalJobStage(JOB_STAGE_PIPELINE);

function getFinalJobStage(pipeline: readonly JobStagePipelineStep[]): JobStageName {
  const finalStep = pipeline[pipeline.length - 1];
  if (!finalStep) {
    throw new Error('Job stage pipeline must include a final stage.');
  }

  return finalStep.stage;
}
