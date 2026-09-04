import { DEPARTMENTS } from '@pkg/schema/equipment';
import { describe, expect, it } from 'vitest';

import { JOB_DEPARTMENT_PIPELINE } from './job-department-pipeline.js';

describe('JOB_DEPARTMENT_PIPELINE', () => {
  it('keeps the production display order', () => {
    expect(JOB_DEPARTMENT_PIPELINE).toEqual([
      { sequence: 1, department: 'fabrication' },
      { sequence: 2, department: 'procurement' },
      { sequence: 3, department: 'supply' },
      { sequence: 4, department: 'paint' },
      { sequence: 5, department: 'assembly' },
      { sequence: 6, department: 'workshop' },
    ]);
  });

  it('matches the canonical Department order exactly', () => {
    const pipelineDepartments = JOB_DEPARTMENT_PIPELINE.map(({ department }) => department);

    expect(pipelineDepartments).toEqual(DEPARTMENTS);
  });
});
