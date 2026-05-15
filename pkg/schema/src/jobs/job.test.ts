import { describe, expect, it } from 'vitest';

import { JobDetail, JobStageStatusInput } from './job.js';

describe('JobDetail', () => {
  it('validates visible and locked stage rollups', () => {
    const jobId = '00000000-0000-4000-8000-000000000001';

    expect(() =>
      JobDetail.parse({
        id: jobId,
        productId: '00000000-0000-4000-8000-000000000002',
        productModelCode: 'WL-100',
        productName: 'Wheel Loader',
        lifecycleStatus: 'active',
        createdAt: '2026-05-15T08:00:00.000Z',
        updatedAt: '2026-05-15T08:00:00.000Z',
        stages: [
          {
            access: 'visible',
            completedAt: null,
            department: 'procurement',
            id: '00000000-0000-4000-8000-000000000011',
            jobId,
            sequence: 1,
            stage: 'procurement',
            startedAt: null,
            status: 'pending',
          },
          { access: 'locked', department: 'fabrication', sequence: 2, stage: 'fabrication' },
          { access: 'locked', department: 'assembly', sequence: 3, stage: 'assembly' },
          { access: 'locked', department: 'paint', sequence: 4, stage: 'paint' },
          { access: 'locked', department: 'dispatch', sequence: 5, stage: 'dispatch' },
        ],
      }),
    ).not.toThrow();
  });
});

describe('JobStageStatusInput', () => {
  const jobId = '00000000-0000-4000-8000-000000000001';

  it('validates statuses against the owning stage', () => {
    expect(() =>
      JobStageStatusInput.parse({
        id: jobId,
        stage: 'fabrication',
        status: 'welding',
      }),
    ).not.toThrow();
  });

  it('rejects statuses from another stage', () => {
    expect(() =>
      JobStageStatusInput.parse({
        id: jobId,
        stage: 'fabrication',
        status: 'ordering',
      }),
    ).toThrow();
  });
});
