import { describe, expect, it } from 'vitest';

import {
  DerivedStageJobEvent,
  JobCode,
  JobDetail,
  JobEvent,
  JobEventDerivationStage,
  JobListFilters,
  JobStageRollup,
  JobStageStatusInput,
  JobStageSummary,
  JobSummary,
} from './job.js';

describe('JobCode', () => {
  it('formats DB integers as branded job codes', () => {
    expect(JobCode.parse(1)).toBe('JOB-00001');
    expect(JobCode.parse(100_000)).toBe('JOB-100000');
  });

  it('accepts canonical public job codes', () => {
    expect(JobCode.parse('JOB-00001')).toBe('JOB-00001');
    expect(JobCode.parse('JOB-100000')).toBe('JOB-100000');
  });

  it('rejects malformed public job codes', () => {
    for (const code of ['00001', 'JOB-1', 'job-00001']) {
      expect(() => JobCode.parse(code)).toThrow();
    }
  });

  it('rejects invalid DB integers', () => {
    for (const code of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => JobCode.parse(code)).toThrow();
    }
  });
});

describe('JobDetail', () => {
  it('validates visible and summary stage rollups', () => {
    const jobId = '00000000-0000-4000-8000-000000000001';

    expect(() =>
      JobDetail.parse({
        code: 'JOB-00001',
        createdAt: '2026-05-15T08:00:00.000Z',
        dueDate: null,
        id: jobId,
        lifecycleStatus: 'active',
        productId: '00000000-0000-4000-8000-000000000002',
        productModelCode: 'WL-100',
        productName: 'Wheel Loader',
        quoteCode: null,
        quoteId: null,
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
          {
            access: 'summary',
            completedAt: null,
            department: 'fabrication',
            id: '00000000-0000-4000-8000-000000000012',
            jobId,
            sequence: 2,
            stage: 'fabrication',
            startedAt: null,
            status: 'pending',
          },
          {
            access: 'summary',
            completedAt: null,
            department: 'assembly',
            id: '00000000-0000-4000-8000-000000000013',
            jobId,
            sequence: 3,
            stage: 'assembly',
            startedAt: null,
            status: 'pending',
          },
          {
            access: 'summary',
            completedAt: null,
            department: 'paint',
            id: '00000000-0000-4000-8000-000000000014',
            jobId,
            sequence: 4,
            stage: 'paint',
            startedAt: null,
            status: 'pending',
          },
          {
            access: 'summary',
            completedAt: null,
            department: 'dispatch',
            id: '00000000-0000-4000-8000-000000000015',
            jobId,
            sequence: 5,
            stage: 'dispatch',
            startedAt: null,
            status: 'pending',
          },
        ],
        updatedAt: '2026-05-15T08:00:00.000Z',
        workflowEvents: [],
      }),
    ).not.toThrow();
  });
});

describe('JobStageRollup', () => {
  it('parses visible and summary rollups', () => {
    const baseStage = {
      completedAt: null,
      department: 'fabrication',
      id: '00000000-0000-4000-8000-000000000011',
      jobId: '00000000-0000-4000-8000-000000000001',
      sequence: 2,
      stage: 'fabrication',
      startedAt: '2026-05-15T08:00:00.000Z',
      status: 'welding',
    } as const;

    expect(JobStageRollup.parse({ ...baseStage, access: 'visible' })).toMatchObject({
      access: 'visible',
      status: 'welding',
    });
    expect(JobStageRollup.parse({ ...baseStage, access: 'summary' })).toMatchObject({
      access: 'summary',
      startedAt: '2026-05-15T08:00:00.000Z',
    });
  });

  it('rejects the removed locked rollup', () => {
    expect(() =>
      JobStageRollup.parse({
        access: 'locked',
        department: 'fabrication',
        sequence: 2,
        stage: 'fabrication',
      }),
    ).toThrow();
  });
});

describe('JobStageSummary', () => {
  it('rejects statuses that do not belong to the stage', () => {
    expect(() =>
      JobStageSummary.parse({
        completedAt: null,
        department: 'procurement',
        id: '00000000-0000-4000-8000-000000000011',
        jobId: '00000000-0000-4000-8000-000000000001',
        sequence: 1,
        stage: 'procurement',
        startedAt: null,
        status: 'welding',
      }),
    ).toThrow();
  });
});

describe('JobSummary', () => {
  const jobId = '00000000-0000-4000-8000-000000000001';

  it('requires exactly five stage summaries', () => {
    const summary = {
      code: 'JOB-00001',
      createdAt: '2026-05-15T08:00:00.000Z',
      dueDate: null,
      id: jobId,
      lifecycleStatus: 'active',
      productId: '00000000-0000-4000-8000-000000000002',
      productModelCode: 'WL-100',
      productName: 'Wheel Loader',
      quoteCode: null,
      quoteId: null,
      stages: ['procurement', 'fabrication', 'assembly', 'paint', 'dispatch'].map((stage, index) => ({
        completedAt: null,
        department: stage,
        id: `00000000-0000-4000-8000-00000000001${index}`,
        jobId,
        sequence: index + 1,
        stage,
        startedAt: null,
        status: 'pending',
      })),
      updatedAt: '2026-05-15T08:00:00.000Z',
    };

    expect(JobSummary.parse(summary).stages).toHaveLength(5);
    expect(() => JobSummary.parse({ ...summary, stages: summary.stages.slice(0, 4) })).toThrow();
  });
});

describe('JobListFilters', () => {
  it('accepts an optional job id filter while preserving default active filtering', () => {
    expect(JobListFilters.parse(undefined)).toEqual({
      lifecycleStatuses: ['active'],
    });
    expect(
      JobListFilters.parse({
        jobId: '00000000-0000-4000-8000-000000000001',
      }),
    ).toEqual({
      jobId: '00000000-0000-4000-8000-000000000001',
      lifecycleStatuses: ['active'],
    });
    expect(
      JobListFilters.parse({
        jobId: '00000000-0000-4000-8000-000000000001',
        lifecycleStatuses: [],
      }),
    ).toEqual({
      jobId: '00000000-0000-4000-8000-000000000001',
      lifecycleStatuses: [],
    });
  });
});

describe('JobEvent', () => {
  it('validates stage workflow events by event type', () => {
    expect(
      JobEvent.parse({
        actorName: 'Test User',
        actorUserId: 'test-user-id',
        eventType: 'stage.status_changed',
        id: '00000000-0000-4000-8000-000000000001',
        jobId: '00000000-0000-4000-8000-000000000002',
        occurredAt: '2026-05-15T08:00:00.000Z',
        payload: {
          fromStatus: 'pending',
          stage: 'procurement',
          toStatus: 'ordering',
        },
        stageId: '00000000-0000-4000-8000-000000000003',
      }),
    ).toMatchObject({
      actorName: 'Test User',
      eventType: 'stage.status_changed',
      payload: {
        fromStatus: 'pending',
        toStatus: 'ordering',
      },
    });
  });

  it('rejects payloads that do not match the event type', () => {
    expect(() =>
      JobEvent.parse({
        actorName: 'Test User',
        actorUserId: 'test-user-id',
        eventType: 'stage.completed',
        id: '00000000-0000-4000-8000-000000000001',
        jobId: '00000000-0000-4000-8000-000000000002',
        occurredAt: '2026-05-15T08:00:00.000Z',
        payload: {
          fromStatus: 'pending',
          stage: 'procurement',
          toStatus: 'ordering',
        },
        stageId: '00000000-0000-4000-8000-000000000003',
      }),
    ).toThrow();
  });

  it('validates job lifecycle workflow events', () => {
    expect(
      JobEvent.parse({
        actorName: null,
        actorUserId: 'test-user-id',
        eventType: 'job.paused',
        id: '00000000-0000-4000-8000-000000000001',
        jobId: '00000000-0000-4000-8000-000000000002',
        occurredAt: '2026-05-15T08:00:00.000Z',
        payload: {
          fromLifecycleStatus: 'active',
          toLifecycleStatus: 'paused',
        },
        stageId: null,
      }),
    ).toMatchObject({
      eventType: 'job.paused',
      payload: {
        fromLifecycleStatus: 'active',
        toLifecycleStatus: 'paused',
      },
      stageId: null,
    });
  });
});

describe('JobEventDerivationStage', () => {
  it('uses ISO strings for derivation dates', () => {
    expect(
      JobEventDerivationStage.parse({
        completedAt: null,
        stage: 'procurement',
        startedAt: '2026-05-15T08:00:00.000Z',
        status: 'pending',
      }),
    ).toEqual({
      completedAt: null,
      stage: 'procurement',
      startedAt: '2026-05-15T08:00:00.000Z',
      status: 'pending',
    });
  });

  it('rejects Date objects at the schema boundary', () => {
    expect(() =>
      JobEventDerivationStage.parse({
        completedAt: null,
        stage: 'procurement',
        startedAt: new Date('2026-05-15T08:00:00.000Z'),
        status: 'pending',
      }),
    ).toThrow();
  });
});

describe('DerivedStageJobEvent', () => {
  it('validates derived stage event payloads', () => {
    expect(
      DerivedStageJobEvent.parse({
        eventType: 'stage.completed',
        payload: {
          completedAt: '2026-05-15T09:00:00.000Z',
          stage: 'procurement',
          status: 'complete',
        },
      }),
    ).toMatchObject({
      eventType: 'stage.completed',
      payload: {
        completedAt: '2026-05-15T09:00:00.000Z',
      },
    });
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
