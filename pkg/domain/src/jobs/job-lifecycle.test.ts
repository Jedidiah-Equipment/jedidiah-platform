import { describe, expect, it } from 'vitest';

import { formatJobLifecycleStatus, isJobCancelled, resolveJobLifecycleState } from './job-lifecycle.js';

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

describe('resolveJobLifecycleState', () => {
  it('reads a cancelled Job as cancelled alone, never also as in progress or completed', () => {
    expect(resolveJobLifecycleState({ cancelledAt: '2026-07-17T00:00:00.000Z', completedOn: null })).toEqual({
      kind: 'cancelled',
    });
    expect(resolveJobLifecycleState({ cancelledAt: '2026-07-17T00:00:00.000Z', completedOn: '2026-07-16' })).toEqual({
      kind: 'cancelled',
    });
  });

  it('separates a live Job by whether it has a Job Completion, handing back the date it completed on', () => {
    expect(resolveJobLifecycleState({ cancelledAt: null, completedOn: null })).toEqual({ kind: 'in-progress' });
    expect(resolveJobLifecycleState({ cancelledAt: null, completedOn: '2026-07-16' })).toEqual({
      completedOn: '2026-07-16',
      kind: 'completed',
    });
  });
});

describe('formatJobLifecycleStatus', () => {
  // The bug this exists to stop: a cancelled Job reading "In progress" and "Cancelled" at once.
  it('gives a cancelled Job one word, whatever else is stamped on it', () => {
    expect(formatJobLifecycleStatus({ cancelledAt: '2026-07-17T00:00:00.000Z', completedOn: null }, 'short')).toBe(
      'Cancelled',
    );
    expect(
      formatJobLifecycleStatus({ cancelledAt: '2026-07-17T00:00:00.000Z', completedOn: '2026-07-16' }, 'short'),
    ).toBe('Cancelled');
  });

  it('dates a completion in the format the surface asked for, and leaves an open Job in progress', () => {
    expect(formatJobLifecycleStatus({ cancelledAt: null, completedOn: '2026-07-16' }, 'd MMM yyyy')).toBe(
      'Completed 16 Jul 2026',
    );
    expect(formatJobLifecycleStatus({ cancelledAt: null, completedOn: null }, 'short')).toBe('In progress');
  });
});
