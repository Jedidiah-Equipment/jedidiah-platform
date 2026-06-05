import { describe, expect, it } from 'vitest';

import {
  BookJobSlotInput,
  BookJobSlotResult,
  formatProductSerialNumber,
  JOB_STAGES,
  Job,
  JobCode,
  JobDetail,
  JobListFilters,
  JobWorkState,
  ProjectedJobSlot,
} from './job.js';

describe('JobCode', () => {
  it('formats DB integers as branded job codes', () => {
    expect(JobCode.parse(1)).toBe('JOB-00001');
    expect(JobCode.parse(100_000)).toBe('JOB-100000');
  });
});

describe('formatProductSerialNumber', () => {
  it('combines product model code, two-digit year, and padded product sequence', () => {
    expect(formatProductSerialNumber({ prefix: 'SG1836', sequence: 9, year: 26 })).toBe('SG1836260009');
    expect(formatProductSerialNumber({ prefix: 'SG1836', sequence: 10_000, year: 27 })).toBe('SG18362710000');
  });
});

describe('Job', () => {
  it('carries the frozen product serial facts', () => {
    expect(
      Job.parse({
        code: 1,
        createdAt: '2026-06-01T00:00:00.000Z',
        id: '00000000-0000-4000-8000-000000000001',
        productId: '00000000-0000-4000-8000-000000000002',
        productSerialNumber: 'SG1836260009',
        productSerialPrefix: 'SG1836',
        productSerialSequence: 9,
        productSerialYear: 26,
        quoteId: '00000000-0000-4000-8000-000000000003',
        updatedAt: '2026-06-01T00:00:00.000Z',
        vinNumber: null,
      }),
    ).toMatchObject({
      code: 'JOB-00001',
      productSerialNumber: 'SG1836260009',
      productSerialPrefix: 'SG1836',
      productSerialSequence: 9,
      productSerialYear: 26,
      vinNumber: null,
    });
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

describe('JobDetail', () => {
  it('carries part units in the CFO projection', () => {
    expect(
      JobDetail.shape.cfo.parse([
        {
          assemblyName: 'Hydraulics',
          kind: 'standard',
          parts: [
            {
              partCode: 'HOSE-001',
              partId: '00000000-0000-4000-8000-000000000001',
              partName: 'Hydraulic Hose',
              quantity: 6000,
              unitOfMeasure: 'mm',
            },
          ],
        },
      ]),
    ).toEqual([
      {
        assemblyName: 'Hydraulics',
        kind: 'standard',
        parts: [
          {
            partCode: 'HOSE-001',
            partId: '00000000-0000-4000-8000-000000000001',
            partName: 'Hydraulic Hose',
            quantity: 6000,
            unitOfMeasure: 'mm',
          },
        ],
      },
    ]);
  });
});

describe('JobWorkState', () => {
  it('only accepts derived stage states', () => {
    expect(JobWorkState.parse('complete')).toBe('complete');
    expect(() => JobWorkState.parse('welding')).toThrow();
  });
});

describe('JobSlot schemas', () => {
  it('accepts booking inputs with positive minute durations', () => {
    expect(
      BookJobSlotInput.parse({
        bayId: '00000000-0000-4000-8000-000000000001',
        durationMinutes: 480,
        jobStageId: '00000000-0000-4000-8000-000000000002',
      }),
    ).toMatchObject({
      durationMinutes: 480,
    });
    expect(() =>
      BookJobSlotInput.parse({
        bayId: '00000000-0000-4000-8000-000000000001',
        durationMinutes: 0,
        jobStageId: '00000000-0000-4000-8000-000000000002',
      }),
    ).toThrow();
  });

  it('normalizes projected slot dates and job codes at the schema boundary', () => {
    expect(
      ProjectedJobSlot.parse({
        bayId: '00000000-0000-4000-8000-000000000001',
        createdAt: new Date('2026-06-05T00:00:00.000Z'),
        durationMinutes: 480,
        endAt: new Date('2026-06-05T08:00:00.000Z'),
        id: '00000000-0000-4000-8000-000000000003',
        jobCode: 12,
        jobId: '00000000-0000-4000-8000-000000000004',
        jobStageId: '00000000-0000-4000-8000-000000000002',
        sequence: 1,
        startAt: new Date('2026-06-05T00:00:00.000Z'),
        updatedAt: new Date('2026-06-05T00:00:00.000Z'),
      }),
    ).toMatchObject({
      endAt: '2026-06-05T08:00:00.000Z',
      jobCode: 'JOB-00012',
      startAt: '2026-06-05T00:00:00.000Z',
    });
  });

  it('returns the inserted slot from booking mutations without projection fields', () => {
    expect(
      BookJobSlotResult.parse({
        slot: {
          bayId: '00000000-0000-4000-8000-000000000001',
          createdAt: new Date('2026-06-05T00:00:00.000Z'),
          durationMinutes: 480,
          id: '00000000-0000-4000-8000-000000000003',
          jobStageId: '00000000-0000-4000-8000-000000000002',
          sequence: 1,
          updatedAt: new Date('2026-06-05T00:00:00.000Z'),
        },
      }),
    ).toMatchObject({
      slot: {
        createdAt: '2026-06-05T00:00:00.000Z',
        durationMinutes: 480,
        sequence: 1,
      },
    });
  });
});
