import { describe, expect, it } from 'vitest';

import { getJobStageStatusColorClassNames } from './job-stage-status-color.js';

describe('job stage status color helpers', () => {
  it('uses gray for pending', () => {
    expect(getJobStageStatusColorClassNames('dispatch', 'pending').icon).toBe('fill-gray-400 text-gray-400');
  });

  it('uses green for complete', () => {
    expect(getJobStageStatusColorClassNames('dispatch', 'complete').icon).toBe('fill-emerald-500 text-emerald-500');
  });

  it('uses orange, purple, then blue for in-between statuses', () => {
    expect(getJobStageStatusColorClassNames('paint', 'prep').icon).toBe('fill-orange-500 text-orange-500');
    expect(getJobStageStatusColorClassNames('paint', 'painting').icon).toBe('fill-purple-500 text-purple-500');
    expect(getJobStageStatusColorClassNames('paint', 'curing').icon).toBe('fill-blue-500 text-blue-500');
  });

  it('uses the status position within its stage workflow', () => {
    expect(getJobStageStatusColorClassNames('assembly', 'qc').icon).toBe('fill-purple-500 text-purple-500');
    expect(getJobStageStatusColorClassNames('fabrication', 'qc').icon).toBe('fill-blue-500 text-blue-500');
  });
});
