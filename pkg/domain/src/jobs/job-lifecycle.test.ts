import { describe, expect, it } from 'vitest';

import { isJobCancelled } from './job-lifecycle.js';

describe('isJobCancelled', () => {
  it('is true when cancelledAt is set, as a Date or an ISO string', () => {
    expect(isJobCancelled({ cancelledAt: new Date('2026-07-17T00:00:00.000Z') })).toBe(true);
    expect(isJobCancelled({ cancelledAt: '2026-07-17T00:00:00.000Z' })).toBe(true);
  });

  it('is false when the Job is live, missing, or its summary did not resolve', () => {
    expect(isJobCancelled({ cancelledAt: null })).toBe(false);
    expect(isJobCancelled(null)).toBe(false);
    expect(isJobCancelled(undefined)).toBe(false);
  });
});
