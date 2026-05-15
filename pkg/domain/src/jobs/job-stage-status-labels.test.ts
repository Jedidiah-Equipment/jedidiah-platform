import { JOB_STAGE_STATUSES } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { jobStageStatusLabels } from './job-stage-status-labels.js';

describe('jobStageStatusLabels', () => {
  it('covers every job stage status', () => {
    const statuses = new Set(Object.values(JOB_STAGE_STATUSES).flat());

    expect(Object.keys(jobStageStatusLabels).sort()).toEqual([...statuses].sort());
  });

  it('keeps each status label displayable', () => {
    for (const label of Object.values(jobStageStatusLabels)) {
      expect(label).not.toHaveLength(0);
    }
  });
});
