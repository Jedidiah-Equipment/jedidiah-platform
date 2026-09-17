import { describe, expect, test } from 'vitest';
import { FieldJob } from './field.js';
import { JobListInput, JobNumber } from './job.js';

describe('Contracting Job inputs', () => {
  test('accepts padded Job Numbers after the five-digit range', () => {
    expect(JobNumber.parse('CJOB-00037')).toBe('CJOB-00037');
    expect(JobNumber.parse('CJOB-100000')).toBe('CJOB-100000');
    expect(JobNumber.safeParse('CJOB-37').success).toBe(false);
  });

  test('defaults and bounds queue pagination', () => {
    expect(JobListInput.parse({ queue: 'active' })).toEqual({ queue: 'active', limit: 50, offset: 0 });
    expect(JobListInput.safeParse({ queue: 'active', limit: 201 }).success).toBe(false);
  });
});

describe('field Job projection', () => {
  test('strips every management and money field from the phone shape', () => {
    const job = FieldJob.parse({
      id: '5f1c2d3e-0001-4a00-8000-000000000001',
      code: 41,
      jobNumber: 'CJOB-00041',
      status: 'active',
      customerName: 'Scott',
      farmName: 'Scott Farm',
      workTypeName: 'Dam building',
      description: null,
      foremanUserId: 'foreman-1',
      stints: [],
      dieselLitres: 500,
      pricedTotal: 100_000,
    });

    expect(job).toEqual({
      id: '5f1c2d3e-0001-4a00-8000-000000000001',
      code: 41,
      jobNumber: 'CJOB-00041',
      status: 'active',
      customerName: 'Scott',
      farmName: 'Scott Farm',
      workTypeName: 'Dam building',
      description: null,
      foremanUserId: 'foreman-1',
      stints: [],
    });
  });
});
