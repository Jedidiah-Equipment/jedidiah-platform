import { describe, expect, it } from 'vitest';

import {
  JOB_STAGES,
  JobCode,
  JobCreateFromQuoteInput,
  JobEventDerivationStage,
  JobListFilters,
  JobStageStatusInput,
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

describe('JobStageStatusInput', () => {
  it('only accepts derived stage states', () => {
    expect(
      JobStageStatusInput.parse({
        id: '00000000-0000-4000-8000-000000000001',
        stage: 'fabrication',
        status: 'complete',
      }),
    ).toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      stage: 'fabrication',
      status: 'complete',
    });
    expect(() =>
      JobStageStatusInput.parse({
        id: '00000000-0000-4000-8000-000000000001',
        stage: 'fabrication',
        status: 'welding',
      }),
    ).toThrow();
  });
});
