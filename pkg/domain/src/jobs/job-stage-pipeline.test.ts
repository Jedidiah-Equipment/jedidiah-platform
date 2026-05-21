import { JOB_STAGES } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { JOB_STAGE_PIPELINE } from './job-stage-pipeline.js';

describe('JOB_STAGE_PIPELINE', () => {
  it('keeps the production workflow in order', () => {
    expect(JOB_STAGE_PIPELINE).toEqual([
      { sequence: 1, stage: 'procurement' },
      { sequence: 2, stage: 'supply' },
      { sequence: 3, stage: 'fabrication' },
      { sequence: 4, stage: 'paint' },
      { sequence: 5, stage: 'assembly' },
    ]);
  });

  it('covers every valid job stage exactly once', () => {
    const pipelineStages = JOB_STAGE_PIPELINE.map(({ stage }) => stage);

    expect(new Set(pipelineStages)).toHaveProperty('size', JOB_STAGES.length);
    expect([...pipelineStages].sort()).toEqual([...JOB_STAGES].sort());
  });
});
