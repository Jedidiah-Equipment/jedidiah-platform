import { describe, expect, it } from 'vitest';

import { JOB_STAGES, JobCode, JobListFilters, JobWorkState } from './job.js';

describe('JobCode', () => {
  it('formats DB integers as branded job codes', () => {
    expect(JobCode.parse(1)).toBe('JOB-00001');
    expect(JobCode.parse(100_000)).toBe('JOB-100000');
  });
});

describe('JOB_STAGES', () => {
  it('uses production departments', () => {
    expect(JOB_STAGES).toEqual(['procurement', 'supply', 'fabrication', 'paint', 'assembly']);
  });
});

describe('JobListFilters', () => {
  it('defaults to no job list filters', () => {
    expect(JobListFilters.parse(undefined)).toEqual({});
  });

  it('allows other filters without status filters', () => {
    expect(JobListFilters.parse({ jobId: '00000000-0000-4000-8000-000000000001' })).toEqual({
      jobId: '00000000-0000-4000-8000-000000000001',
    });
  });
});

describe('JobWorkState', () => {
  it('only accepts derived stage states', () => {
    expect(JobWorkState.parse('complete')).toBe('complete');
    expect(() => JobWorkState.parse('welding')).toThrow();
  });
});
