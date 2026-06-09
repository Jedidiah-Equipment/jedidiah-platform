import { DEPARTMENTS } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { JOB_DEPARTMENT_PIPELINE } from './job-department-pipeline.js';

describe('JOB_DEPARTMENT_PIPELINE', () => {
  it('keeps the production display order', () => {
    expect(JOB_DEPARTMENT_PIPELINE).toEqual([
      { sequence: 1, department: 'procurement' },
      { sequence: 2, department: 'supply' },
      { sequence: 3, department: 'fabrication' },
      { sequence: 4, department: 'paint' },
      { sequence: 5, department: 'assembly' },
    ]);
  });

  it('covers every valid department exactly once', () => {
    const pipelineDepartments = JOB_DEPARTMENT_PIPELINE.map(({ department }) => department);

    expect(new Set(pipelineDepartments)).toHaveProperty('size', DEPARTMENTS.length);
    expect([...pipelineDepartments].sort()).toEqual([...DEPARTMENTS].sort());
  });
});
