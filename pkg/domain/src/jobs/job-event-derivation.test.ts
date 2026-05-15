import { describe, expect, it } from 'vitest';

import { deriveStageJobEvent } from './job-event-derivation.js';

describe('deriveStageJobEvent', () => {
  it('maps start transitions to stage.started events', () => {
    expect(
      deriveStageJobEvent({
        after: {
          completedAt: null,
          stage: 'procurement',
          startedAt: '2026-05-15T08:00:00.000Z',
          status: 'pending',
        },
        before: {
          completedAt: null,
          stage: 'procurement',
          startedAt: null,
          status: 'pending',
        },
        transition: 'start',
      }),
    ).toEqual({
      eventType: 'stage.started',
      payload: {
        stage: 'procurement',
        startedAt: '2026-05-15T08:00:00.000Z',
        status: 'pending',
      },
    });
  });

  it('maps status transitions to stage.status_changed events', () => {
    expect(
      deriveStageJobEvent({
        after: {
          completedAt: null,
          stage: 'procurement',
          startedAt: '2026-05-15T08:00:00.000Z',
          status: 'ordering',
        },
        before: {
          completedAt: null,
          stage: 'procurement',
          startedAt: '2026-05-15T08:00:00.000Z',
          status: 'pending',
        },
        transition: 'set-status',
      }),
    ).toEqual({
      eventType: 'stage.status_changed',
      payload: {
        fromStatus: 'pending',
        stage: 'procurement',
        toStatus: 'ordering',
      },
    });
  });

  it('maps complete transitions to stage.completed events', () => {
    expect(
      deriveStageJobEvent({
        after: {
          completedAt: '2026-05-15T09:00:00.000Z',
          stage: 'procurement',
          startedAt: '2026-05-15T08:00:00.000Z',
          status: 'complete',
        },
        before: {
          completedAt: null,
          stage: 'procurement',
          startedAt: '2026-05-15T08:00:00.000Z',
          status: 'ordering',
        },
        transition: 'complete',
      }),
    ).toEqual({
      eventType: 'stage.completed',
      payload: {
        completedAt: '2026-05-15T09:00:00.000Z',
        stage: 'procurement',
        status: 'complete',
      },
    });
  });
});
