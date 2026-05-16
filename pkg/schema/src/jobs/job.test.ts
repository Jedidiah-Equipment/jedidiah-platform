import { describe, expect, it } from 'vitest';

import { DerivedStageJobEvent, JobDetail, JobEvent, JobEventDerivationStage, JobStageStatusInput } from './job.js';

describe('JobDetail', () => {
  it('validates visible and locked stage rollups', () => {
    const jobId = '00000000-0000-4000-8000-000000000001';

    expect(() =>
      JobDetail.parse({
        code: 'JOB-00000000',
        createdAt: '2026-05-15T08:00:00.000Z',
        id: jobId,
        lifecycleStatus: 'active',
        productId: '00000000-0000-4000-8000-000000000002',
        productModelCode: 'WL-100',
        productName: 'Wheel Loader',
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
        updatedAt: '2026-05-15T08:00:00.000Z',
        workflowEvents: [],
      }),
    ).not.toThrow();
  });
});

describe('JobEvent', () => {
  it('validates stage workflow events by event type', () => {
    expect(
      JobEvent.parse({
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
