import { describe, expect, it } from 'vitest';

import { deriveStageJobEvent } from './job-event-derivation.js';

describe('deriveStageJobEvent', () => {
  it('maps start transitions to stage.started events', () => {
    expect(
      deriveStageJobEvent({
        after: {
          actualEnd: null,
          actualStart: '2026-05-15T08:00:00.000Z',
          stage: 'procurement',
        },
        before: {
          actualEnd: null,
          actualStart: null,
          stage: 'procurement',
        },
        transition: 'start',
      }),
    ).toEqual({
      eventType: 'stage.started',
      payload: {
        actualStart: '2026-05-15T08:00:00.000Z',
        stage: 'procurement',
      },
    });
  });

  it('maps stop transitions to stage.stopped events', () => {
    expect(
      deriveStageJobEvent({
        after: {
          actualEnd: '2026-05-15T09:00:00.000Z',
          actualStart: '2026-05-15T08:00:00.000Z',
          stage: 'procurement',
        },
        before: {
          actualEnd: null,
          actualStart: '2026-05-15T08:00:00.000Z',
          stage: 'procurement',
        },
        transition: 'stop',
      }),
    ).toEqual({
      eventType: 'stage.stopped',
      payload: {
        actualEnd: '2026-05-15T09:00:00.000Z',
        stage: 'procurement',
      },
    });
  });
});
