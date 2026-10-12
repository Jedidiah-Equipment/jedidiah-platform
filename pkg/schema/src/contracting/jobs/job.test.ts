import { describe, expect, test } from 'vitest';
import { Assignment, JobListInput, JobNumber } from './job.js';

describe('Contracting Job inputs', () => {
  test('accepts padded Job Numbers after the five-digit range', () => {
    expect(JobNumber.parse('CJOB-00037')).toBe('CJOB-00037');
    expect(JobNumber.parse('CJOB-100000')).toBe('CJOB-100000');
    expect(JobNumber.safeParse('CJOB-37').success).toBe(false);
  });

  test('lists at least one queue and bounds its pages', () => {
    expect(JobListInput.parse({ queues: ['active'] })).toMatchObject({
      queues: ['active'],
      cursor: 0,
      sortBy: 'jobNumber',
      sortDirection: 'asc',
    });
    expect(JobListInput.safeParse({ queues: [] }).success).toBe(false);
    expect(JobListInput.safeParse({ queues: ['active'], limit: 101 }).success).toBe(false);
    // tRPC infinite queries send their paging direction alongside the input.
    expect(JobListInput.safeParse({ queues: ['active'], direction: 'forward' }).success).toBe(true);
  });
});

describe('Machine Assignment', () => {
  test("names a stint with the fleet's own code rules", () => {
    expect(Assignment.shape.machineCode.parse(' cat-1 ')).toBe('CAT-1');
  });
});
