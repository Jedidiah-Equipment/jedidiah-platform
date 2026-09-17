import { describe, expect, test } from 'vitest';
import { attentionParent } from './attention-parent';

describe('attentionParent', () => {
  test('returns to the Job that opened attention', () => {
    expect(attentionParent({ from: 'job', jobId: 'job-1' })).toEqual({
      label: 'Job',
      href: '/contracting/jobs/job-1',
    });
  });

  test('returns to the originating catalog and defaults invalid origins to Machines', () => {
    expect(attentionParent({ from: 'jobs' })).toEqual({ label: 'Jobs', href: '/contracting/jobs' });
    expect(attentionParent({ from: 'machines' })).toEqual({ label: 'Machines', href: '/contracting/machines' });
    expect(attentionParent({ from: 'job' })).toEqual({ label: 'Machines', href: '/contracting/machines' });
  });
});
