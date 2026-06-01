import { describe, expect, it } from 'vitest';

import { formatProductSerialNumber, JOB_STAGES, Job, JobCode, JobDetail, JobListFilters, JobWorkState } from './job.js';

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
      }),
    ).toMatchObject({
      code: 'JOB-00001',
      productSerialNumber: 'SG1836260009',
      productSerialPrefix: 'SG1836',
      productSerialSequence: 9,
      productSerialYear: 26,
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
