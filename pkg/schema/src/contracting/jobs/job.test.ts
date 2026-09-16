import { describe, expect, test } from 'vitest';
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
