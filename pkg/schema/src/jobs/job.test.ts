import { describe, expect, it } from 'vitest';

import {
  JOB_STAGES,
  JobCode,
  JobCreateFromQuoteInput,
  JobEvent,
  JobEventDerivationStage,
  JobListFilters,
  JobWorkState,
} from './job.js';

describe('JobCode', () => {
  it('formats DB integers as branded job codes', () => {
    expect(JobCode.parse(1)).toBe('JOB-00001');
    expect(JobCode.parse(100_000)).toBe('JOB-100000');
  });
});

describe('JOB_STAGES', () => {
  it('uses the station-overhaul departments', () => {
    expect(JOB_STAGES).toEqual(['procurement', 'supply', 'fabrication', 'paint', 'assembly']);
  });
});

describe('JobListFilters', () => {
  it('preserves default active filtering', () => {
    expect(JobListFilters.parse(undefined)).toEqual({
      lifecycleStatuses: ['active'],
    });
  });
});

describe('JobCreateFromQuoteInput', () => {
  it('accepts due start and end fields', () => {
    expect(
      JobCreateFromQuoteInput.parse({
        quoteId: '00000000-0000-4000-8000-000000000001',
        dueStart: '2026-08-01',
        dueEnd: '2026-08-15',
      }),
    ).toEqual({
      quoteId: '00000000-0000-4000-8000-000000000001',
      dueStart: '2026-08-01',
      dueEnd: '2026-08-15',
    });
  });
});

describe('JobEvent', () => {
  it('does not accept retired stage status change events', () => {
    expect(() =>
      JobEvent.parse({
        actorName: null,
        actorUserId: null,
        eventType: 'stage.status_changed',
        id: '00000000-0000-4000-8000-000000000001',
        jobId: '00000000-0000-4000-8000-000000000002',
        occurredAt: '2026-05-15T08:00:00.000Z',
        payload: {
          fromStatus: 'pending',
          stage: 'procurement',
          toStatus: 'active',
        },
        stageId: '00000000-0000-4000-8000-000000000003',
      }),
    ).toThrow();
  });
});

describe('JobEventDerivationStage', () => {
  it('uses actual date fields for derived state events', () => {
    expect(
      JobEventDerivationStage.parse({
        actualEnd: null,
        actualStart: '2026-05-15T08:00:00.000Z',
        stage: 'procurement',
      }),
    ).toEqual({
      actualEnd: null,
      actualStart: '2026-05-15T08:00:00.000Z',
      stage: 'procurement',
    });
  });
});

describe('JobWorkState', () => {
  it('only accepts derived stage states', () => {
    expect(JobWorkState.parse('complete')).toBe('complete');
    expect(() => JobWorkState.parse('welding')).toThrow();
  });
});
